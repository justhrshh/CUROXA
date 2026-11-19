/**
 * Centralized Storage Service
 * Unified abstraction orchestrating file validation, PII-free key generation,
 * SHA-256 integrity checksums, and tenant-scoped driver routing.
 */

const crypto = require('crypto');
const { validateFile, sanitizeExtension } = require('./fileValidator');
const R2Driver = require('./r2Driver');
const LocalDriver = require('./localDriver');
const r2Config = require('../../config/r2');

class StorageService {
  constructor(options = {}) {
    this.driverType = options.driver || process.env.STORAGE_DRIVER || 'local';
    this.r2Driver = options.r2Driver || new R2Driver();
    this.localDriver = options.localDriver || new LocalDriver();
  }

  /**
   * Resolve the active storage driver based on configuration and availability.
   * @returns {R2Driver|LocalDriver}
   */
  getDriver() {
    if (this.driverType === 'r2') {
      return this.r2Driver;
    }
    return this.localDriver;
  }

  /**
   * Computes a cryptographic SHA-256 checksum for the provided buffer.
   * @param {Buffer} buffer
   * @returns {string} Hexadecimal SHA-256 digest
   */
  calculateChecksum(buffer) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('Checksum calculation requires a valid Buffer.');
    }
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Sanitizes a string component for object keys (e.g. tenantId, category)
   * @param {string} input
   * @param {string} fallback
   * @returns {string}
   */
  _sanitizeKeyComponent(input, fallback = 'general') {
    if (!input || typeof input !== 'string') return fallback;
    const sanitized = input.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_');
    return sanitized || fallback;
  }

  /**
   * Generates a strictly PII-free, tenant-scoped object key.
   * NEVER incorporates patient names, phones, UHIDs, or unscrubbed original filenames.
   * @param {Object} params
   * @param {string} params.tenantId
   * @param {string} params.category
   * @param {string} params.sanitizedExt
   * @param {boolean} params.isPrivate
   * @returns {string} Object key (e.g. tenants/tenant_1/prescriptions/uuid.jpg)
   */
  generateObjectKey({ tenantId, category, sanitizedExt, isPrivate }) {
    const cleanTenant = this._sanitizeKeyComponent(tenantId, 'default');
    const cleanCategory = this._sanitizeKeyComponent(category, 'documents');
    const fileId = crypto.randomUUID();
    const ext = sanitizedExt.startsWith('.') ? sanitizedExt : `.${sanitizedExt}`;

    if (isPrivate) {
      return `tenants/${cleanTenant}/${cleanCategory}/${fileId}${ext}`;
    }
    return `public/${cleanTenant}/${cleanCategory}/${fileId}${ext}`;
  }

  /**
   * Validates a file against allowed types, size limits, and binary signatures.
   * @param {Object} options
   * @returns {Object} Validation result
   */
  validateFile(options) {
    return validateFile(options);
  }

  /**
   * Upload a public asset (e.g. hospital branding, logo, public badge).
   * @param {Object} options
   * @param {string} options.tenantId
   * @param {string} options.category
   * @param {Buffer} options.buffer
   * @param {string} options.mimetype
   * @param {string} [options.originalName]
   * @param {Object} [options.metadata]
   * @returns {Promise<Object>}
   */
  async uploadPublic({ tenantId, category = 'public', buffer, mimetype, originalName, metadata = {} }) {
    const validation = validateFile({ buffer, mimetype, originalName });
    const checksum = this.calculateChecksum(buffer);
    const key = this.generateObjectKey({
      tenantId,
      category,
      sanitizedExt: validation.sanitizedExt,
      isPrivate: false
    });

    const driver = this.getDriver();
    const uploadResult = await driver.uploadPublic({
      key,
      buffer,
      contentType: validation.detectedMimeType,
      metadata: {
        ...metadata,
        checksum,
        tenantId: this._sanitizeKeyComponent(tenantId, 'default')
      }
    });

    return {
      ...uploadResult,
      checksum,
      detectedMimeType: validation.detectedMimeType
    };
  }

  /**
   * Upload a confidential medical asset (e.g. prescription, diagnostic report, lab result).
   * ENFORCES FAIL-CLOSED SECURITY: Never falls back to public storage.
   * @param {Object} options
   * @param {string} options.tenantId
   * @param {string} options.category
   * @param {Buffer} options.buffer
   * @param {string} options.mimetype
   * @param {string} [options.originalName]
   * @param {Object} [options.metadata]
   * @returns {Promise<Object>}
   */
  async uploadPrivate({ tenantId, category = 'prescriptions', buffer, mimetype, originalName, metadata = {} }) {
    const validation = validateFile({ buffer, mimetype, originalName });
    const checksum = this.calculateChecksum(buffer);
    const key = this.generateObjectKey({
      tenantId,
      category,
      sanitizedExt: validation.sanitizedExt,
      isPrivate: true
    });

    const driver = this.getDriver();

    try {
      const uploadResult = await driver.uploadPrivate({
        key,
        buffer,
        contentType: validation.detectedMimeType,
        metadata: {
          ...metadata,
          checksum,
          tenantId: this._sanitizeKeyComponent(tenantId, 'default')
        }
      });

      return {
        ...uploadResult,
        checksum,
        detectedMimeType: validation.detectedMimeType
      };
    } catch (error) {
      // Re-throw to enforce fail-closed guarantee. Do NOT fall back to public.
      const failClosedError = new Error(`Private upload failed securely for tenant '${tenantId}', category '${category}': ${error.message}`);
      failClosedError.code = error.code || 'PRIVATE_STORAGE_ERROR';
      throw failClosedError;
    }
  }

  /**
   * Delete an object by key.
   * @param {Object} options
   * @param {string} options.key
   * @param {boolean} [options.isPrivate]
   * @returns {Promise<Object>}
   */
  async deleteObject({ key, isPrivate = false }) {
    if (!key || typeof key !== 'string') {
      throw new Error('Valid storage key is required for deletion.');
    }
    const driver = this.getDriver();
    return await driver.deleteObject({ key, isPrivate });
  }

  /**
   * Get metadata for an object.
   * @param {Object} options
   * @param {string} options.key
   * @param {boolean} [options.isPrivate]
   * @returns {Promise<Object>}
   */
  async getObjectMetadata({ key, isPrivate = false }) {
    if (!key || typeof key !== 'string') {
      throw new Error('Valid storage key is required for metadata retrieval.');
    }
    const driver = this.getDriver();
    return await driver.getObjectMetadata({ key, isPrivate });
  }

  /**
   * Generate a time-limited presigned URL for downloading a private object.
   * @param {Object} options
   * @param {string} options.key
   * @param {boolean} [options.isPrivate]
   * @param {number} [options.expiresInSeconds]
   * @returns {Promise<string>}
   */
  async createPresignedDownloadUrl({ key, isPrivate = true, expiresInSeconds = 900 }) {
    if (!key || typeof key !== 'string') {
      throw new Error('Valid storage key is required to create a presigned download URL.');
    }
    const driver = this.getDriver();
    return await driver.getSignedDownloadUrl({ key, isPrivate, expiresInSeconds });
  }

  /**
   * Generate a time-limited presigned URL for direct secure client uploads.
   * @param {Object} options
   * @param {string} options.key
   * @param {boolean} [options.isPrivate]
   * @param {number} [options.expiresInSeconds]
   * @param {string} [options.contentType]
   * @returns {Promise<string>}
   */
  async createPresignedUploadUrl({ key, isPrivate = true, expiresInSeconds = 900, contentType = '' }) {
    if (!key || typeof key !== 'string') {
      throw new Error('Valid storage key is required to create a presigned upload URL.');
    }
    const driver = this.getDriver();
    return await driver.getSignedUploadUrl({ key, isPrivate, expiresInSeconds, contentType });
  }

  /**
   * Downloads an object's raw buffer directly from storage.
   * Used for backend document generation (PDFKit), integrity checksums, and streaming.
   * @param {Object} options
   * @param {string} options.key
   * @param {boolean} [options.isPrivate]
   * @returns {Promise<{ buffer: Buffer, contentType?: string, contentLength: number }>}
   */
  async downloadBuffer({ key, isPrivate = true }) {
    if (!key || typeof key !== 'string') {
      throw new Error('Valid storage key is required for downloadBuffer.');
    }
    const driver = this.getDriver();
    return await driver.downloadBuffer({ key, isPrivate });
  }
}

// Export singleton instance initialized with default environment driver
const defaultStorageService = new StorageService();

module.exports = {
  StorageService,
  storageService: defaultStorageService
};
