import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

/**
 * Verifies the Supabase session JWT sent as `Authorization: Bearer <token>`
 * and attaches req.userId. Every route that touches per-user data (Google
 * routes, preferences, chunks) sits behind this.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Missing bearer token.');
    return;
  }

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data?.user) {
      sendError(res, 401, 'UNAUTHENTICATED', 'Invalid or expired session.');
      return;
    }
    req.userId = data.user.id;
    next();
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'UPSTREAM_ERROR', 'Could not verify session.');
  }
}
