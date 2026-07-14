import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { storeGoogleRefreshToken, hasGoogleToken } from '../lib/googleAuth.js';
import { AppError } from '../lib/errors.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

const perIpLimiter = createRateLimiter({ limit: 30 });

/**
 * Called once by the client right after Supabase's Google sign-in
 * (`signInWithOAuth` with access_type: 'offline', prompt: 'consent'), while
 * the transient provider_refresh_token is still available in the session.
 * Supabase itself doesn't persist or refresh this token — we do, encrypted.
 */
authRouter.post('/auth/store-google-token', perIpLimiter, requireAuth, async (req, res, next) => {
  try {
    const { refreshToken, scope } = req.body || {};
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new AppError('BAD_REQUEST', 'No refresh token provided.', 400);
    }
    await storeGoogleRefreshToken(req.userId, refreshToken, scope || '');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/auth/google-status', perIpLimiter, requireAuth, async (req, res, next) => {
  try {
    res.json({ connected: await hasGoogleToken(req.userId) });
  } catch (err) {
    next(err);
  }
});
