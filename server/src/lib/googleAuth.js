import { google } from 'googleapis';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { encryptToken, decryptToken } from './tokenCrypto.js';
import { AppError } from './errors.js';

function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
}

/** Called once, right after Supabase's Google sign-in, to persist the refresh token server-side. */
export async function storeGoogleRefreshToken(userId, refreshToken, scope) {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('google_tokens')
    .upsert({
      user_id: userId,
      refresh_token_encrypted: encryptToken(refreshToken),
      scope,
    });
  if (error) throw error;
}

export async function hasGoogleToken(userId) {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from('google_tokens')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Returns a googleapis OAuth2 client authorized for this user's calendar
 * access, built from the encrypted refresh token stored at connect-time.
 * On invalid_grant (revoked/expired), deletes the stale row and throws a
 * typed error the client recognizes as "reconnect Google".
 */
export async function getAuthorizedClient(userId) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('google_tokens')
    .select('refresh_token_encrypted')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new AppError('GOOGLE_REAUTH_REQUIRED', 'Connect your Google account to continue.', 401);
  }

  const refreshToken = decryptToken(data.refresh_token_encrypted);
  const client = buildOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  try {
    await client.getAccessToken();
  } catch (err) {
    if (err?.response?.data?.error === 'invalid_grant' || err?.message?.includes('invalid_grant')) {
      await db.from('google_tokens').delete().eq('user_id', userId);
      throw new AppError('GOOGLE_REAUTH_REQUIRED', 'Your Google connection expired — reconnect to continue.', 401);
    }
    throw err;
  }

  return client;
}
