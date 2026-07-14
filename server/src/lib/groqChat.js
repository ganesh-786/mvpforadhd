import { AppError } from './errors.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CHAT_MODEL = 'llama-3.3-70b-versatile';
const MAX_CHUNKS = 8;

const CHUNK_SCHEMA = {
  type: 'object',
  properties: {
    chunks: {
      type: 'array',
      maxItems: MAX_CHUNKS,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          estimatedMinutes: { type: 'integer' },
          energyLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          rationale: { type: 'string' },
        },
        required: ['title', 'estimatedMinutes', 'energyLevel', 'priority', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['chunks'],
  additionalProperties: false,
};

function buildSystemPrompt(focusSessionMinutes) {
  return `You help people with ADHD turn a messy spoken brain-dump into a short list of small, concrete, immediately-actionable task chunks.

Hard rules:
- No chunk's estimatedMinutes may exceed ${focusSessionMinutes} (the user's stated focus-session length). If a task is bigger than that, split it into multiple smaller chunks instead of proposing one long one.
- Titles must be concrete, single-action, and start with a verb (e.g. "Call dentist to schedule cleaning", not "Handle dentist stuff" or "Dentist").
- Never propose more than ${MAX_CHUNKS} chunks total. If the brain-dump has more distinct items than that, keep the most important/time-sensitive ones and drop the rest rather than cramming.
- energyLevel reflects how much mental effort/activation the chunk needs (low = easy/routine, high = demanding/creative), independent of duration.
- priority reflects urgency/importance as implied by the transcript (deadlines, "need to", "have to" > "should" > "maybe").
- rationale is one short sentence explaining the sizing or sequencing choice, written directly to the user ("Quick call, good for warming up").

Example:
Input: "I need to pack for the trip and call the dentist and finish my history essay"
Output chunks:
- { "title": "Call dentist to schedule appointment", "estimatedMinutes": 10, "energyLevel": "low", "priority": "medium", "rationale": "Quick, low-friction — good to get out of the way first" }
- { "title": "Pack toiletries and chargers for the trip", "estimatedMinutes": 15, "energyLevel": "low", "priority": "high", "rationale": "Physical, low-focus task" }
- { "title": "Pack clothes for the trip", "estimatedMinutes": 20, "energyLevel": "low", "priority": "high", "rationale": "Same physical task, split so it stays under the focus limit" }
- { "title": "Draft history essay introduction", "estimatedMinutes": 25, "energyLevel": "high", "priority": "high", "rationale": "Needs real focus — tackle when fresh, in one sitting" }

Respond with ONLY a JSON object matching the given schema — no prose, no markdown fences.`;
}

async function callGroqChat(messages) {
  if (!process.env.GROQ_API_KEY) {
    throw new AppError('UPSTREAM_ERROR', 'GROQ_API_KEY is not configured on the server.', 500);
  }

  let res;
  try {
    res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        temperature: 0.4,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'task_chunks', schema: CHUNK_SCHEMA },
        },
      }),
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
  return data.choices?.[0]?.message?.content || '';
}

function validateChunks(raw, focusSessionMinutes) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.chunks)) return null;

  const chunks = parsed.chunks
    .filter((c) =>
      c &&
      typeof c.title === 'string' && c.title.trim() &&
      Number.isInteger(c.estimatedMinutes) && c.estimatedMinutes > 0 && c.estimatedMinutes <= focusSessionMinutes &&
      ['low', 'medium', 'high'].includes(c.energyLevel) &&
      ['low', 'medium', 'high'].includes(c.priority) &&
      typeof c.rationale === 'string')
    .slice(0, MAX_CHUNKS)
    .map((c) => ({
      title: c.title.trim(),
      estimatedMinutes: c.estimatedMinutes,
      energyLevel: c.energyLevel,
      priority: c.priority,
      rationale: c.rationale.trim(),
    }));

  return chunks.length > 0 ? chunks : null;
}

/**
 * Turns a raw brain-dump transcript into small, ADHD-appropriately-sized
 * task chunks via Groq's chat completions endpoint (same key/account as
 * Whisper transcription, different model/endpoint).
 * @param {string} transcript
 * @param {{ focusSessionMinutes: number }} preferences
 */
export async function chunkTranscript(transcript, preferences) {
  const focusSessionMinutes = preferences?.focusSessionMinutes || 25;
  const started = Date.now();

  const messages = [
    { role: 'system', content: buildSystemPrompt(focusSessionMinutes) },
    { role: 'user', content: transcript },
  ];

  let raw = await callGroqChat(messages);
  let chunks = validateChunks(raw, focusSessionMinutes);

  if (!chunks) {
    // One retry: tell the model its last response didn't validate, ask again.
    raw = await callGroqChat([
      ...messages,
      { role: 'assistant', content: raw },
      { role: 'user', content: `That response was invalid or did not respect the ${focusSessionMinutes}-minute limit. Return ONLY a JSON object matching the schema, with every chunk's estimatedMinutes at or under ${focusSessionMinutes}.` },
    ]);
    chunks = validateChunks(raw, focusSessionMinutes);
  }

  if (!chunks) {
    throw new AppError('CHUNKING_FAILED', 'Could not understand that — try rephrasing.', 502);
  }

  return { chunks, durationMs: Date.now() - started };
}
