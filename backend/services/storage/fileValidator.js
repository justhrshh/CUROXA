/**
 * File Validator for Storage Services
 * Enforces MIME type verification, magic-byte binary signatures,
 * size boundaries, and filename sanitization.
 */

const path = require('path');

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024; // 25MB
const DEFAULT_MAX_SIZE = 15 * 1024 * 1024; // 15MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
]);

/**
 * Detect MIME type using magic byte file signatures
 * @param {Buffer} buffer
 * @returns {string|null}
 */
function detectMimeTypeFromMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // PDF: 25 50 44 46 (%PDF)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  // WebP: 'RIFF' at 0..3 and 'WEBP' at 8..11
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // XLSX (Office Open XML ZIP): 50 4B 03 04
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4B &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  // Plain text / CSV: check for valid printable ASCII/UTF-8 without binary nulls
  if (isTextBuffer(buffer)) {
    return 'text/csv';
  }

  return null;
}

/**
 * Check if buffer contains readable text without binary control bytes
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isTextBuffer(buffer) {
  const checkLength = Math.min(buffer.length, 512);
  for (let i = 0; i < checkLength; i++) {
    const byte = buffer[i];
    if (byte === 0x00) return false; // Null byte indicates binary
  }
  return true;
}

/**
 * Sanitize filename to prevent directory traversal and remove potential PII/unsafe characters
 * @param {string} originalName
 * @returns {string} Safe file extension including dot, or sanitized base
 */
function sanitizeExtension(originalName) {
  if (!originalName || typeof originalName !== 'string') return '.bin';
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  if (!ext || ext === '.') return '.bin';
  return ext;
}

/**
 * Validate a file buffer against size, declared MIME type, and magic bytes
 * @param {Object} options
 * @param {Buffer} options.buffer
 * @param {string} options.mimetype
 * @param {string} [options.originalName]
 * @param {number} [options.maxSize]
 * @param {string[]} [options.allowedTypes]
 * @returns {{ valid: boolean, detectedMimeType: string, sanitizedExt: string }}
 */
function validateFile({ buffer, mimetype, originalName, maxSize, allowedTypes }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    const error = new Error('File buffer is empty or invalid.');
    error.code = 'INVALID_FILE_BUFFER';
    throw error;
  }

  if (buffer.length === 0) {
    const error = new Error('File is empty (0 bytes).');
    error.code = 'FILE_EMPTY';
    throw error;
  }

  // Size limit check
  const effectiveMaxSize = maxSize || (
    mimetype && mimetype.startsWith('image/') ? MAX_IMAGE_SIZE :
    mimetype === 'application/pdf' ? MAX_DOCUMENT_SIZE :
    DEFAULT_MAX_SIZE
  );

  if (buffer.length > effectiveMaxSize) {
    const error = new Error(`File size (${buffer.length} bytes) exceeds allowed limit of ${effectiveMaxSize} bytes.`);
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }

  // Allowed types check
  const allowedSet = allowedTypes ? new Set(allowedTypes) : ALLOWED_MIME_TYPES;
  const normalizedMime = (mimetype || '').toLowerCase().trim();

  if (normalizedMime && !allowedSet.has(normalizedMime)) {
    const error = new Error(`MIME type '${normalizedMime}' is not allowed.`);
    error.code = 'MIME_TYPE_DISALLOWED';
    throw error;
  }

  // Magic byte signature detection
  const detectedMimeType = detectMimeTypeFromMagicBytes(buffer);

  if (!detectedMimeType) {
    const error = new Error('File binary signature could not be verified.');
    error.code = 'INVALID_FILE_SIGNATURE';
    throw error;
  }

  // If MIME was declared, ensure magic bytes match or are compatible
  if (normalizedMime && normalizedMime !== detectedMimeType) {
    // Special case for CSV/text which might be declared as text/plain
    const isCsvOrText = (normalizedMime === 'text/plain' || normalizedMime === 'text/csv') && detectedMimeType === 'text/csv';
    if (!isCsvOrText) {
      const error = new Error(`MIME type mismatch: declared '${normalizedMime}', but detected binary signature '${detectedMimeType}'.`);
      error.code = 'MIME_TYPE_MISMATCH';
      throw error;
    }
  }

  const sanitizedExt = sanitizeExtension(originalName);

  return {
    valid: true,
    detectedMimeType,
    sanitizedExt
  };
}

module.exports = {
  validateFile,
  detectMimeTypeFromMagicBytes,
  sanitizeExtension,
  ALLOWED_MIME_TYPES,
  MAX_IMAGE_SIZE,
  MAX_DOCUMENT_SIZE,
  DEFAULT_MAX_SIZE
};
