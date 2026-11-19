/**
 * Local Filesystem Driver for Storage Services
 * Used for local development, offline automated tests, and isolated environments.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class LocalDriver {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(__dirname, '../../uploads/storage');
    this.publicDir = path.join(this.baseDir, 'public');
    this.privateDir = path.join(this.baseDir, 'private');
    this.secret = options.secret || process.env.JWT_SECRET || 'local_storage_secret_key';

    this._ensureDirs();
  }

  _ensureDirs() {
    if (!fs.existsSync(this.publicDir)) {
      fs.mkdirSync(this.publicDir, { recursive: true });
    }
    if (!fs.existsSync(this.privateDir)) {
      fs.mkdirSync(this.privateDir, { recursive: true });
    }
  }

  _resolvePath(key, isPrivate) {
    const targetDir = isPrivate ? this.privateDir : this.publicDir;
    const safeKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolved = path.resolve(targetDir, safeKey);

    // Guard against directory traversal
    if (!resolved.startsWith(targetDir)) {
      const err = new Error('Invalid storage key: directory traversal attempted.');
      err.code = 'INVALID_STORAGE_KEY';
      throw err;
    }
    return resolved;
  }

  async uploadPublic({ key, buffer, contentType, metadata = {} }) {
    const filePath = this._resolvePath(key, false);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);

    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    return {
      key,
      url: `/uploads/storage/public/${key}`,
      bucket: 'local-public',
      eTag: `"${hash}"`,
      size: buffer.length,
      contentType,
      metadata,
      isPrivate: false
    };
  }

  async uploadPrivate({ key, buffer, contentType, metadata = {} }) {
    const filePath = this._resolvePath(key, true);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);

    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    return {
      key,
      bucket: 'local-private',
      eTag: `"${hash}"`,
      size: buffer.length,
      contentType,
      metadata,
      isPrivate: true
    };
  }

  async deleteObject({ key, isPrivate = false }) {
    const filePath = this._resolvePath(key, isPrivate);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { key, deleted: true };
    }
    return { key, deleted: false };
  }

  async getObjectMetadata({ key, isPrivate = false }) {
    const filePath = this._resolvePath(key, isPrivate);
    if (!fs.existsSync(filePath)) {
      const err = new Error(`Object '${key}' not found in local storage.`);
      err.code = 'NoSuchKey';
      throw err;
    }

    const stats = fs.statSync(filePath);
    return {
      key,
      contentLength: stats.size,
      lastModified: stats.mtime,
      isPrivate
    };
  }

  async getSignedDownloadUrl({ key, isPrivate = false, expiresInSeconds = 900 }) {
    const filePath = this._resolvePath(key, isPrivate);
    if (!fs.existsSync(filePath)) {
      const err = new Error(`Object '${key}' not found.`);
      err.code = 'NoSuchKey';
      throw err;
    }

    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${key}:${isPrivate}:${expires}`;
    const signature = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');

    return `/api/storage/local-download?key=${encodeURIComponent(key)}&isPrivate=${isPrivate}&expires=${expires}&signature=${signature}`;
  }

  async getSignedUploadUrl({ key, isPrivate = false, expiresInSeconds = 900, contentType = '' }) {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `upload:${key}:${isPrivate}:${contentType}:${expires}`;
    const signature = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');

    return `/api/storage/local-upload?key=${encodeURIComponent(key)}&isPrivate=${isPrivate}&expires=${expires}&signature=${signature}`;
  }

  async downloadBuffer({ key, isPrivate = false }) {
    const filePath = this._resolvePath(key, isPrivate);
    if (!fs.existsSync(filePath)) {
      const err = new Error(`Object '${key}' not found.`);
      err.code = 'NoSuchKey';
      throw err;
    }

    const buffer = fs.readFileSync(filePath);
    return {
      buffer,
      key,
      contentLength: buffer.length,
      isPrivate
    };
  }
}

module.exports = LocalDriver;
