import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { getFreeBusy } from '../lib/googleCalendar.js';
import { findSlotsForChunks } from '../lib/scheduler.js';
import { AppError } from '../lib/errors.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

export const scheduleRouter = Router();

const perIpLimiter = createRateLimiter({ limit: 20 });
const SEARCH_HORIZON_DAYS = 7;

/**
 * Takes a set of proposed chunk ids, finds real free slots against the
 * user's Google Calendar + stated working hours/energy pattern, and writes
 * scheduled_start/end back onto task_chunks. Deliberately separate from
 * /api/chunk — interval placement is a deterministic algorithm (scheduler.js),
 * not something delegated to the LLM.
 */
scheduleRouter.post('/schedule', perIpLimiter, requireAuth, async (req, res, next) => {
  try {
    const chunkIds = req.body?.chunkIds;
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) {
      throw new AppError('BAD_REQUEST', 'chunkIds must be a non-empty array.', 400);
    }

    const db = getSupabaseAdmin();

    const [{ data: chunks, error: chunksError }, { data: prefs, error: prefsError }] = await Promise.all([
      db.from('task_chunks').select('id, estimated_minutes, energy_level, priority, due_by').eq('user_id', req.userId).in('id', chunkIds),
      db.from('user_preferences').select('working_hours, energy_pattern').eq('user_id', req.userId).maybeSingle(),
    ]);
    if (chunksError) throw chunksError;
    if (prefsError) throw prefsError;
    if (!chunks || chunks.length === 0) {
      throw new AppError('NOT_FOUND', 'No matching chunks found.', 404);
    }

    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + SEARCH_HORIZON_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const busyIntervals = await getFreeBusy(req.userId, timeMin, timeMax);

    const placements = findSlotsForChunks(
      chunks.map((c) => ({ id: c.id, estimatedMinutes: c.estimated_minutes, energyLevel: c.energy_level, priority: c.priority, dueBy: c.due_by })),
      { busyIntervals, workingHours: prefs?.working_hours || {}, energyPattern: prefs?.energy_pattern || {} },
    );

    await Promise.all(placements.map((p) =>
      db.from('task_chunks')
        .update(p.scheduled
          ? { scheduled_start: p.startIso, scheduled_end: p.endIso }
          : { status: 'proposed' })
        .eq('id', p.id)
        .eq('user_id', req.userId)));

    const { data: updated, error: reloadError } = await db
      .from('task_chunks')
      .select('id, title, estimated_minutes, energy_level, priority, rationale, status, scheduled_start, scheduled_end, source, due_by')
      .in('id', chunkIds)
      .eq('user_id', req.userId);
    if (reloadError) throw reloadError;

    res.json({
      chunks: updated.map((c) => ({
        id: c.id,
        title: c.title,
        estimatedMinutes: c.estimated_minutes,
        energyLevel: c.energy_level,
        priority: c.priority,
        rationale: c.rationale,
        status: c.status,
        scheduledStart: c.scheduled_start,
        scheduledEnd: c.scheduled_end,
        source: c.source,
        dueBy: c.due_by,
      })),
    });
  } catch (err) {
    next(err);
  }
});
