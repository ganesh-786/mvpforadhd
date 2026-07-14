import { AppError } from './errors.js';

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export { AppError };

/**
 * Transcribes one audio segment via Groq's OpenAI-compatible Whisper endpoint.
 * Uses plain fetch + FormData (both native in Node >=18) instead of an SDK,
 * so the request shape is fully explicit and not tied to an SDK version.
 * @param {Buffer} buffer - raw audio bytes (webm/opus, wav, or ogg)
 * @param {string} filename - filename hint so Groq can infer the container format
 * @param {string} model - defaults to whisper-large-v3-turbo
 */
export async function transcribeSegment(buffer, filename, model = 'whisper-large-v3-turbo') {
  if (!process.env.GROQ_API_KEY) {
    throw new AppError('UPSTREAM_ERROR', 'GROQ_API_KEY is not configured on the server.', 500);
  }

  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  form.append('model', model);
  form.append('response_format', 'json');

  const started = Date.now();
  let res;
  try {
    res = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form,
    });
  } catch {
    throw new AppError('UPSTREAM_ERROR', 'Could not reach Groq.', 502);
  }

  if (res.status === 429) {
    throw new AppError('RATE_LIMITED', 'Groq rate limit reached, try again shortly.', 429);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AppError('UPSTREAM_ERROR', detail || `Groq responded with ${res.status}.`, 502);
  }

  const data = await res.json();
  return { text: (data.text || '').trim(), durationMs: Date.now() - started };
}
