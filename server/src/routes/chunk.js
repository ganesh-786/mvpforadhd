import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { chunkTranscript } from '../lib/groqChat.js';
import { AppError } from '../lib/errors.js';
import { checkAndConsumeQuota } from '../lib/quotaGuard.js';

export const chunkRouter = Router();

async function loadPreferences(userId) {
  const { data } = await getSupabaseAdmin()
    .from('user_preferences')
    .select('focus_session_minutes')
    .eq('user_id', userId)
    .maybeSingle();
  return { focusSessionMinutes: data?.focus_session_minutes || 25 };
}

chunkRouter.post('/chunk', requireAuth, async (req, res, next) => {
  try {
    const transcript = (req.body?.transcript || '').trim();
    if (!transcript) {
      throw new AppError('BAD_REQUEST', 'No transcript provided.', 400);
    }

    const quota = checkAndConsumeQuota('chunk');
    if (!quota.allowed) {
      throw new AppError('RATE_LIMITED', 'Daily chunking quota reached, try again tomorrow.', 429);
    }

    const preferences = await loadPreferences(req.userId);
    const result = await chunkTranscript(transcript, preferences);

    const db = getSupabaseAdmin();
    const { data: task, error: taskError } = await db
      .from('tasks')
      .insert({ user_id: req.userId, source_transcript: transcript })
      .select('id')
      .single();
    if (taskError) throw taskError;

    const rows = result.chunks.map((c) => ({
      task_id: task.id,
      user_id: req.userId,
      title: c.title,
      estimated_minutes: c.estimatedMinutes,
      energy_level: c.energyLevel,
      priority: c.priority,
      rationale: c.rationale,
    }));
    const { data: savedChunks, error: chunksError } = await db
      .from('task_chunks')
      .insert(rows)
      .select('id, title, estimated_minutes, energy_level, priority, rationale, status');
    if (chunksError) throw chunksError;

    res.json({
      taskId: task.id,
      chunks: savedChunks.map((c) => ({
        id: c.id,
        title: c.title,
        estimatedMinutes: c.estimated_minutes,
        energyLevel: c.energy_level,
        priority: c.priority,
        rationale: c.rationale,
        status: c.status,
      })),
      durationMs: result.durationMs,
    });
  } catch (err) {
    next(err);
  }
});
