import { createClient } from '@supabase/supabase-js';

let client = null;

/**
 * Server-only Supabase client using the service role key — bypasses RLS.
 * Used for: verifying user JWTs and any background work (Google token
 * storage, future cron ingestion) that must act across users. Never send
 * this key to the browser.
 */
export function getSupabaseAdmin() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server.');
  }

  client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
