const DAILY_QUOTA_LIMIT = Number(process.env.DAILY_QUOTA_LIMIT || 1800);

const buckets = new Map(); // bucket name -> { count, resetAt }

function nextUtcMidnight() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.getTime();
}

function getBucket(name) {
  let bucket = buckets.get(name);
  if (!bucket || Date.now() >= bucket.resetAt) {
    bucket = { count: 0, resetAt: nextUtcMidnight() };
    buckets.set(name, bucket);
  }
  return bucket;
}

/**
 * In-memory, per-process, per-bucket daily quota guard against the shared
 * Groq key. Whisper transcriptions and chat completions are separate Groq
 * rate pools, so each gets its own counter/bucket (e.g. 'transcribe',
 * 'chunk') rather than sharing one global count. Resets on server restart —
 * acceptable for local/small-scale use, not a substitute for persistent
 * tracking at higher scale (see README's Upstash Redis recommendation).
 */
export function checkAndConsumeQuota(bucket = 'default') {
  const b = getBucket(bucket);
  if (b.count >= DAILY_QUOTA_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  b.count += 1;
  return { allowed: true, remaining: DAILY_QUOTA_LIMIT - b.count };
}
