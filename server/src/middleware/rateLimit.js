import rateLimit from 'express-rate-limit';

/**
 * Shared per-IP rate limiter factory — same shape as the one already used
 * in transcribe.js/chunk.js, extracted so every route gets an independent
 * counter without copy-pasting the handler each time. Since these routes
 * sit behind requireAuth, this mainly guards against a buggy client retry
 * loop or a leaked session token being used to hammer Google/Supabase, not
 * anonymous abuse (transcribe.js's limiter is stricter for that reason).
 */
export function createRateLimiter({ windowMs = 60 * 1000, limit = 60 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } });
    },
  });
}
