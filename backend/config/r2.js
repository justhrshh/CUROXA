/**
 * Cloudflare R2 Client Configuration
 * Implements lazy client initialization, multi-bucket resolution,
 * and backwards-compatible S3Client delegation.
 */

const { S3Client } = require('@aws-sdk/client-s3');

let cachedClient = null;

/**
 * Checks whether R2 configuration environment variables are present and non-empty.
 * @returns {boolean}
 */
function isR2Configured() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  return Boolean(
    accountId &&
    accessKeyId &&
    secretAccessKey &&
    accountId.trim().length > 0 &&
    accessKeyId.trim().length > 0 &&
    secretAccessKey.trim().length > 0 &&
    !accountId.includes('your_') &&
    !accessKeyId.includes('your_')
  );
}

/**
 * Lazily retrieves or instantiates the AWS S3Client configured for Cloudflare R2.
 * @returns {S3Client}
 */
function getR2Client() {
  if (cachedClient) {
    return cachedClient;
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!isR2Configured()) {
    const error = new Error('Cloudflare R2 is unconfigured: missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY.');
    error.code = 'R2_CONFIG_MISSING';
    throw error;
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return cachedClient;
}

/**
 * Resets the cached S3Client instance (primarily for tests).
 */
function resetR2Client() {
  cachedClient = null;
}

/**
 * Resolves the public bucket name.
 * @returns {string}
 */
function getR2PublicBucket() {
  return process.env.R2_BUCKET_PUBLIC || process.env.R2_BUCKET_NAME || 'quroxa-public-assets';
}

/**
 * Resolves the private bucket name.
 * @returns {string}
 */
function getR2PrivateBucket() {
  return process.env.R2_BUCKET_PRIVATE || 'quroxa-private-vault';
}

/**
 * Resolves the public CDN/domain URL.
 * @returns {string}
 */
function getR2PublicDomain() {
  if (process.env.R2_PUBLIC_DOMAIN && process.env.R2_PUBLIC_DOMAIN.trim().length > 0) {
    return process.env.R2_PUBLIC_DOMAIN.replace(/\/+$/, '');
  }
  const accountId = process.env.R2_ACCOUNT_ID;
  return accountId ? `https://pub-${accountId}.r2.dev` : '';
}

/**
 * Backwards-compatible proxy delegating `.send()` and exposing helper methods.
 */
const r2Proxy = {
  send: (command, options) => {
    const client = getR2Client();
    return client.send(command, options);
  },
  getR2Client,
  isR2Configured,
  getR2PublicBucket,
  getR2PrivateBucket,
  getR2PublicDomain,
  resetR2Client
};

module.exports = r2Proxy;
