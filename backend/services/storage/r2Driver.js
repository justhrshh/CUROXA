/**
 * Cloudflare R2 Driver (S3 Compatible API via AWS SDK v3)
 * Handles encrypted object storage operations across separated public and private buckets.
 */

const {
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const r2Config = require('../../config/r2');

class R2Driver {
  constructor(clientOverride = null) {
    this.clientOverride = clientOverride;
  }

  _getClient() {
    return this.clientOverride || r2Config.getR2Client();
  }

  _getBucket(isPrivate) {
    return isPrivate ? r2Config.getR2PrivateBucket() : r2Config.getR2PublicBucket();
  }

  async uploadPublic({ key, buffer, contentType, metadata = {} }) {
    const client = this._getClient();
    const bucket = this._getBucket(false);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata
    });

    const response = await client.send(command);
    const domain = r2Config.getR2PublicDomain();
    const url = domain ? `${domain}/${key}` : '';

    return {
      key,
      url,
      bucket,
      eTag: response.ETag,
      size: buffer.length,
      contentType,
      isPrivate: false
    };
  }

  async uploadPrivate({ key, buffer, contentType, metadata = {} }) {
    try {
      const client = this._getClient();
      const bucket = this._getBucket(true);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: metadata
      });

      const response = await client.send(command);

      return {
        key,
        bucket,
        eTag: response.ETag,
        size: buffer.length,
        contentType,
        isPrivate: true
      };
    } catch (error) {
      // Enforce fail-closed guarantee: private uploads MUST never fall back to public
      const failClosedError = new Error(`Private upload failed securely for object '${key}': ${error.message}`);
      failClosedError.code = error.code || 'PRIVATE_UPLOAD_FAILED';
      failClosedError.originalError = error;
      throw failClosedError;
    }
  }

  async deleteObject({ key, isPrivate = false }) {
    const client = this._getClient();
    const bucket = this._getBucket(isPrivate);

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    });

    await client.send(command);
    return { key, deleted: true, bucket };
  }

  async getObjectMetadata({ key, isPrivate = false }) {
    const client = this._getClient();
    const bucket = this._getBucket(isPrivate);

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await client.send(command);
    return {
      key,
      bucket,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified,
      eTag: response.ETag,
      metadata: response.Metadata,
      isPrivate
    };
  }

  async getSignedDownloadUrl({ key, isPrivate = false, expiresInSeconds = 900 }) {
    const client = this._getClient();
    const bucket = this._getBucket(isPrivate);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  async getSignedUploadUrl({ key, isPrivate = false, expiresInSeconds = 900, contentType = '' }) {
    const client = this._getClient();
    const bucket = this._getBucket(isPrivate);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || undefined
    });

    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  async downloadBuffer({ key, isPrivate = false }) {
    const client = this._getClient();
    const bucket = this._getBucket(isPrivate);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return {
      buffer,
      key,
      bucket,
      contentType: response.ContentType,
      contentLength: response.ContentLength || buffer.length,
      eTag: response.ETag,
      metadata: response.Metadata,
      isPrivate
    };
  }
}

module.exports = R2Driver;
