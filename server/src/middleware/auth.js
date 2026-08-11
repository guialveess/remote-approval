'use strict';

/**
 * Factory that returns an Express middleware enforcing
 * `Authorization: Bearer <secret>` where the secret is read from
 * the given environment variable name at request time.
 *
 * Reading the env var at request time (not at startup) means you can
 * rotate secrets without a restart in environments that support hot-reloading
 * of env vars (e.g. Railway secret injection via restart is fine too).
 *
 * @param {string} envVar  Name of the environment variable holding the secret
 * @returns {import('express').RequestHandler}
 */
function createAuthMiddleware(envVar) {
  return function authMiddleware(req, res, next) {
    const expectedSecret = process.env[envVar];

    if (!expectedSecret) {
      console.error(`[auth] Environment variable ${envVar} is not set`);
      return res.status(500).json({ error: 'Server misconfiguration: auth secret not set' });
    }

    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header must use Bearer scheme' });
    }

    const providedSecret = authHeader.slice('Bearer '.length);

    // Constant-time comparison to prevent timing attacks
    if (!safeCompare(providedSecret, expectedSecret)) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    next();
  };
}

/**
 * Timing-safe string comparison.
 * Falls back to a simple XOR loop if `crypto` is unavailable (shouldn't happen on Node 18+).
 */
function safeCompare(a, b) {
  try {
    const { timingSafeEqual } = require('crypto');
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch (_) {
    // Fallback (should never be reached on Node 18+)
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
      mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
  }
}

module.exports = { createAuthMiddleware };
