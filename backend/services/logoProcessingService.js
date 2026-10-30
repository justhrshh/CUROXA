const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const r2 = require('../config/r2');

/**
 * Base Abstract Provider for Background Removal
 */
class BackgroundRemovalProvider {
  /**
   * @param {Buffer} imageBuffer 
   * @param {Object} options 
   * @returns {Promise<Buffer>} transparent PNG buffer
   */
  async removeBackground(imageBuffer, options = {}) {
    throw new Error('removeBackground must be implemented by provider');
  }
}

/**
 * Remove.bg API Provider implementation
 */
class RemoveBgProvider extends BackgroundRemovalProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey || process.env.REMOVE_BG_API_KEY;
    this.endpoint = 'https://api.remove.bg/v1.0/removebg';
    this.timeoutMs = 25000;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0 && this.apiKey !== 'your_remove_bg_api_key');
  }

  async removeBackground(imageBuffer, options = {}) {
    if (!this.isConfigured()) {
      const err = new Error('REMOVE_BG_API_KEY is not configured on server.');
      err.code = 'PROVIDER_NOT_CONFIGURED';
      throw err;
    }

    const form = new FormData();
    form.append('image_file', imageBuffer, {
      filename: options.filename || 'logo.png',
      contentType: options.contentType || 'image/png'
    });
    form.append('size', 'auto');
    form.append('format', 'png');

    try {
      const response = await axios.post(this.endpoint, form, {
        headers: {
          ...form.getHeaders(),
          'X-Api-Key': this.apiKey.trim()
        },
        responseType: 'arraybuffer',
        timeout: this.timeoutMs,
        maxContentLength: 15 * 1024 * 1024,
        maxBodyLength: 15 * 1024 * 1024
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('Empty response received from background removal provider.');
      }

      return Buffer.from(response.data);
    } catch (err) {
      if (err.response) {
        let errorMsg = 'Remove.bg API error';
        try {
          const rawErr = Buffer.isBuffer(err.response.data) ? err.response.data.toString('utf-8') : err.response.data;
          const parsed = typeof rawErr === 'string' ? JSON.parse(rawErr) : rawErr;
          if (parsed?.errors?.[0]?.title) {
            errorMsg = parsed.errors[0].title + (parsed.errors[0].detail ? `: ${parsed.errors[0].detail}` : '');
          }
        } catch (_) {}

        const status = err.response.status;
        const providerErr = new Error(`Remove.bg Error (${status}): ${errorMsg}`);
        providerErr.statusCode = status;
        if (status === 402 || status === 429) {
          providerErr.code = 'QUOTA_EXHAUSTED';
        } else if (status === 400 || status === 403) {
          providerErr.code = 'AUTH_OR_REQUEST_ERROR';
        } else {
          providerErr.code = 'PROVIDER_HTTP_ERROR';
        }
        throw providerErr;
      }

      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        const timeoutErr = new Error('Background removal request timed out.');
        timeoutErr.code = 'TIMEOUT';
        throw timeoutErr;
      }

      throw err;
    }
  }
}

/**
 * Extensible Self-Hosted rembg Provider (Ready for future local rembg python/docker service)
 */
class RembgLocalProvider extends BackgroundRemovalProvider {
  constructor(serviceUrl) {
    super();
    this.serviceUrl = serviceUrl || process.env.REMBG_SERVICE_URL;
  }

  isConfigured() {
    return Boolean(this.serviceUrl && this.serviceUrl.trim().length > 0);
  }

  async removeBackground(imageBuffer, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Local rembg service URL is not configured.');
    }
    const form = new FormData();
    form.append('file', imageBuffer, {
      filename: options.filename || 'logo.png',
      contentType: options.contentType || 'image/png'
    });

    const response = await axios.post(`${this.serviceUrl}/api/remove`, form, {
      headers: form.getHeaders(),
      responseType: 'arraybuffer',
      timeout: 30000
    });

    return Buffer.from(response.data);
  }
}

/**
 * Provider Resolver Factory
 */
function getActiveProvider() {
  if (process.env.REMBG_SERVICE_URL) {
    return new RembgLocalProvider(process.env.REMBG_SERVICE_URL);
  }
  return new RemoveBgProvider(process.env.REMOVE_BG_API_KEY);
}

/**
 * Storage Helper: Uploads buffer to Cloudflare R2 or local /uploads/logos
 */
async function saveImageToStorage({ buffer, filename, contentType, subfolder = 'logos' }) {
  const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1E6)}`;
  const finalFilename = `${uniquePrefix}-${cleanName}`;
  const key = `${subfolder}/${finalFilename}`;

  const isR2Configured = Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_ACCESS_KEY_ID !== 'your_r2_access_key' &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_SECRET_ACCESS_KEY !== 'your_r2_secret_access_key'
  );

  if (isR2Configured) {
    try {
      const bucketName = process.env.R2_BUCKET_NAME || 'medicore-uploads';
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });
      await r2.send(command);
      const publicDomain = process.env.R2_PUBLIC_DOMAIN || `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev`;
      return `${publicDomain}/${key}`;
    } catch (r2Err) {
      console.warn('[STORAGE] Cloudflare R2 upload failed, falling back to local storage:', r2Err.message);
    }
  }

  // Local filesystem fallback
  const uploadDir = path.join(__dirname, '..', 'uploads', subfolder);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const localFilePath = path.join(uploadDir, finalFilename);
  fs.writeFileSync(localFilePath, buffer);
  return `/uploads/${subfolder}/${finalFilename}`;
}

/**
 * Centralized Logo Processing Service
 */
class LogoProcessingService {
  /**
   * Validates image format, size and dimensions
   */
  async validateImage(buffer, originalMime) {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (!buffer || buffer.length === 0) {
      throw new Error('No image data provided.');
    }
    if (buffer.length > MAX_SIZE) {
      throw new Error('Image file exceeds maximum allowed size of 10 MB.');
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (originalMime && !allowedMimes.includes(originalMime.toLowerCase())) {
      throw new Error(`Unsupported image format (${originalMime}). Please upload PNG, JPG, WebP, or SVG.`);
    }

    try {
      const metadata = await sharp(buffer).metadata();
      if (!metadata || !metadata.width || !metadata.height) {
        throw new Error('Invalid or unreadable image file.');
      }
      if (metadata.width > 5000 || metadata.height > 5000) {
        throw new Error('Image dimensions exceed maximum supported resolution (5000x5000 px).');
      }
      if (metadata.width < 10 || metadata.height < 10) {
        throw new Error('Image dimensions are too small (minimum 10x10 px).');
      }
      return metadata;
    } catch (err) {
      throw new Error(`Corrupted or unreadable image file: ${err.message}`);
    }
  }

  /**
   * Detects if image already has transparent/translucent pixels
   */
  async detectExistingTransparency(buffer, metadata) {
    if (metadata.format === 'svg') {
      return true;
    }

    if (!metadata.hasAlpha) {
      return false;
    }

    try {
      const stats = await sharp(buffer).stats();
      // In Sharp stats, if hasAlpha is true, the last channel (index 3 for RGBA) contains alpha stats
      const alphaChannel = stats.channels[3] || stats.channels[stats.channels.length - 1];
      if (alphaChannel && typeof alphaChannel.min === 'number') {
        // If minimum alpha < 250, there is transparent or semi-transparent background already
        return alphaChannel.min < 250;
      }
      return false;
    } catch (err) {
      console.warn('[LOGO_PROCESSING] Could not compute alpha stats:', err.message);
      return Boolean(metadata.hasAlpha);
    }
  }

  /**
   * Processes an uploaded clinic logo:
   * 1. Validates image integrity and limits.
   * 2. Detects existing transparency to avoid unnecessary API calls.
   * 3. Removes background using provider if needed.
   * 4. Converts final output to optimized transparent PNG preserving complete artwork & aspect ratio.
   * 5. Saves original and processed images to storage.
   * 6. Returns storage URLs, dimensions, and processing status.
   *
   * @param {Object} params
   * @param {Buffer} params.buffer - Uploaded file buffer
   * @param {string} params.originalname - Original uploaded file name
   * @param {string} params.mimetype - Uploaded file MIME type
   * @param {string} [params.hospitalId] - Optional hospital identifier for tracking
   * @returns {Promise<{
   *   logoUrl: string,
   *   originalLogoUrl: string,
   *   processingStatus: 'processed' | 'transparent_original' | 'fallback',
   *   fallbackReason?: string,
   *   width: number,
   *   height: number,
   *   aspectRatio: number,
   *   filename: string
   * }>}
   */
  async processAndStoreLogo({ buffer, originalname = 'logo.png', mimetype = 'image/png', hospitalId = 'default' }) {
    // 1. Validation
    const metadata = await this.validateImage(buffer, mimetype);
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    const aspectRatio = parseFloat((originalWidth / originalHeight).toFixed(4));

    // Save untouched original logo to storage first
    const originalExt = path.extname(originalname) || `.${metadata.format || 'png'}`;
    const baseCleanName = path.basename(originalname, originalExt).replace(/[^a-zA-Z0-9_-]/g, '_');
    const originalStorageName = `${hospitalId}_original_${baseCleanName}${originalExt}`;
    const originalLogoUrl = await saveImageToStorage({
      buffer,
      filename: originalStorageName,
      contentType: mimetype,
      subfolder: 'logos/original'
    });

    let processedPngBuffer = null;
    let processingStatus = 'processed';
    let fallbackReason = null;

    // 2. Check if already transparent
    const alreadyTransparent = await this.detectExistingTransparency(buffer, metadata);
    if (alreadyTransparent) {
      try {
        // Convert to crisp, optimized transparent PNG preserving exact artwork and proportions
        processedPngBuffer = await sharp(buffer)
          .png({ compressionLevel: 9, adaptiveFiltering: true, quality: 100 })
          .toBuffer();
        processingStatus = 'transparent_original';
      } catch (err) {
        console.warn('[LOGO_PROCESSING] Error normalizing transparent image:', err.message);
        processedPngBuffer = buffer;
        processingStatus = 'transparent_original';
      }
    } else {
      // 3. Remove background via Provider
      const provider = getActiveProvider();
      try {
        const rawBgRemoved = await provider.removeBackground(buffer, {
          filename: originalname,
          contentType: mimetype
        });

        // Ensure processed result is crisp PNG preserving transparency and natural dimensions
        processedPngBuffer = await sharp(rawBgRemoved)
          .png({ compressionLevel: 9, adaptiveFiltering: true })
          .toBuffer();
        processingStatus = 'processed';
      } catch (providerErr) {
        console.warn(`[LOGO_PROCESSING] Automatic background removal failed for hospital ${hospitalId}:`, providerErr.message);
        fallbackReason = providerErr.message || 'Background removal service temporarily unavailable';
        processingStatus = 'fallback';

        // Fallback: Preserve original image converted cleanly to PNG without cropping or distortion
        try {
          processedPngBuffer = await sharp(buffer)
            .png({ quality: 95 })
            .toBuffer();
        } catch (_) {
          processedPngBuffer = buffer;
        }
      }
    }

    // Inspect processed image dimensions
    let finalWidth = originalWidth;
    let finalHeight = originalHeight;
    let finalAspectRatio = aspectRatio;
    try {
      const processedMeta = await sharp(processedPngBuffer).metadata();
      finalWidth = processedMeta.width || originalWidth;
      finalHeight = processedMeta.height || originalHeight;
      finalAspectRatio = parseFloat((finalWidth / finalHeight).toFixed(4));
    } catch (_) {}

    // 4. Save processed transparent PNG to storage
    const processedStorageName = `${hospitalId}_transparent_${baseCleanName}.png`;
    const logoUrl = await saveImageToStorage({
      buffer: processedPngBuffer,
      filename: processedStorageName,
      contentType: 'image/png',
      subfolder: 'logos/transparent'
    });

    return {
      logoUrl,
      originalLogoUrl,
      processingStatus,
      fallbackReason,
      width: finalWidth,
      height: finalHeight,
      aspectRatio: finalAspectRatio,
      filename: processedStorageName
    };
  }
}

const logoProcessingService = new LogoProcessingService();

module.exports = {
  logoProcessingService,
  LogoProcessingService,
  BackgroundRemovalProvider,
  RemoveBgProvider,
  RembgLocalProvider,
  saveImageToStorage
};
