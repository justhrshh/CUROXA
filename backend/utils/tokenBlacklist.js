const crypto = require('crypto');

/**
 * In-Memory Token Revocation Blacklist for QUROXA Patient & Staff Sessions.
 *
 * Provides immediate, O(1) revocation of short-lived JWT access tokens upon:
 * 1. Global Logout
 * 2. Hospital Leave / Switch
 * 3. Administrative session termination
 *
 * Since access tokens are strictly short-lived (30 minutes), blacklist entries
 * are automatically pruned once their natural JWT exp timestamp is reached.
 * Memory footprint is minimal (typically < 1MB for thousands of concurrent sessions).
 */

class TokenBlacklist {
  constructor() {
    // Map: tokenIdentifier (jti or sha256 hash) -> expiresAtMs (number)
    this.blacklist = new Map();

    // Prune expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.prune();
    }, 5 * 60 * 1000);

    // Unref timer so it doesn't prevent Node process exit in tests
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Hashes a token string for safe, compact storage.
   */
  hashToken(tokenStr) {
    if (!tokenStr || typeof tokenStr !== 'string') return '';
    const clean = tokenStr.replace(/^Bearer\s+/i, '').trim();
    return crypto.createHash('sha256').update(clean).digest('hex');
  }

  /**
   * Immediately revokes an access token until its natural expiration.
   *
   * @param {string} tokenStr - Raw JWT string
   * @param {string} [jti] - Optional JWT ID
   * @param {number} [expSeconds] - Token exp claim (in seconds)
   */
  revoke(tokenStr, jti = null, expSeconds = null) {
    const nowMs = Date.now();
    // Default TTL: 35 minutes if exp claim not provided (matches 30m access token + 5m clock skew)
    const expiresAtMs = expSeconds ? (expSeconds * 1000) : (nowMs + 35 * 60 * 1000);

    if (jti && typeof jti === 'string') {
      this.blacklist.set(`jti:${jti.trim()}`, expiresAtMs);
    }

    if (tokenStr && typeof tokenStr === 'string') {
      const hash = this.hashToken(tokenStr);
      if (hash) {
        this.blacklist.set(`hash:${hash}`, expiresAtMs);
      }
    }
  }

  /**
   * Checks whether a token or JTI has been revoked.
   *
   * @param {string} [tokenStr]
   * @param {string} [jti]
   * @returns {boolean}
   */
  isRevoked(tokenStr, jti = null) {
    const nowMs = Date.now();

    if (jti && typeof jti === 'string') {
      const exp = this.blacklist.get(`jti:${jti.trim()}`);
      if (exp) {
        if (nowMs < exp) return true;
        this.blacklist.delete(`jti:${jti.trim()}`);
      }
    }

    if (tokenStr && typeof tokenStr === 'string') {
      const hash = this.hashToken(tokenStr);
      if (hash) {
        const exp = this.blacklist.get(`hash:${hash}`);
        if (exp) {
          if (nowMs < exp) return true;
          this.blacklist.delete(`hash:${hash}`);
        }
      }
    }

    return false;
  }

  /**
   * Prunes expired entries from memory.
   */
  prune() {
    const nowMs = Date.now();
    for (const [key, exp] of this.blacklist.entries()) {
      if (nowMs >= exp) {
        this.blacklist.delete(key);
      }
    }
  }

  /**
   * Clears all blacklist entries (used for testing).
   */
  clear() {
    this.blacklist.clear();
  }

  /**
   * Returns current count of blacklisted tokens.
   */
  size() {
    return this.blacklist.size;
  }
}

const tokenBlacklistInstance = new TokenBlacklist();

module.exports = tokenBlacklistInstance;
