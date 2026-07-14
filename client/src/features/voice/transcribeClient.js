export class TranscribeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Sends one audio segment to the backend proxy for transcription.
 * @param {Blob} blob
 * @returns {Promise<{ text: string, durationMs: number }>}
 */
export async function transcribeSegment(blob) {
  const form = new FormData();
  form.append('audio', blob, `segment-${Date.now()}.webm`);

  let res;
  try {
    res = await fetch('/api/transcribe', { method: 'POST', body: form });
  } catch {
    throw new TranscribeError('SERVER_UNREACHABLE', 'Could not reach the transcription server.');
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // fall through to generic error below
  }

  if (!res.ok) {
    const code = payload?.error?.code || 'UPSTREAM_ERROR';
    const message = payload?.error?.message || `Transcription failed (${res.status}).`;
    throw new TranscribeError(code, message);
  }

  return payload;
}
