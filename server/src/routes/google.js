import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { getFreeBusy, createEvent, updateEvent, deleteEvent } from '../lib/googleCalendar.js';
import { AppError } from '../lib/errors.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

export const googleRouter = Router();

const perIpLimiter = createRateLimiter({ limit: 30 });

googleRouter.get('/google/freebusy', perIpLimiter, requireAuth, async (req, res, next) => {
  try {
    const timeMin = req.query.timeMin || new Date().toISOString();
    const timeMax = req.query.timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const busy = await getFreeBusy(req.userId, timeMin, timeMax);
    res.json({ busy });
  } catch (err) {
    next(err);
  }
});

/**
 * Creates a Google Calendar event for one already-scheduled chunk and
 * records the chunk<->event mapping in calendar_sync in the same request —
 * this is what the real "Add to calendar" button calls.
 */
googleRouter.post('/google/calendar/events', perIpLimiter, requireAuth, async (req, res, next) => {
  try {
    const { chunkId } = req.body || {};
    if (!chunkId) throw new AppError('BAD_REQUEST', 'chunkId is required.', 400);

    const db = getSupabaseAdmin();
    const { data: chunk, error: chunkError } = await db
      .from('task_chunks')
      .select('id, title, rationale, scheduled_start, scheduled_end')
      .eq('id', chunkId)
      .eq('user_id', req.userId)
      .single();
    if (chunkError) throw chunkError;
    if (!chunk.scheduled_start || !chunk.scheduled_end) {
      throw new AppError('BAD_REQUEST', 'Chunk has no scheduled time yet — call /api/schedule first.', 400);
    }

    const event = await createEvent(req.userId, {
      title: chunk.title,
      description: chunk.rationale,
      startIso: chunk.scheduled_start,
      endIso: chunk.scheduled_end,
    });

    const [{ error: syncError }] = await Promise.all([
      db.from('calendar_sync').upsert({
        chunk_id: chunk.id,
        user_id: req.userId,
        google_event_id: event.id,
        sync_status: 'synced',
      }),
      db.from('task_chunks').update({ status: 'confirmed' }).eq('id', chunk.id).eq('user_id', req.userId),
    ]);
    if (syncError) throw syncError;

    res.json({ chunkId: chunk.id, googleEventId: event.id, htmlLink: event.htmlLink });
  } catch (err) {
    next(err);
  }
});

googleRouter.patch('/google/calendar/events/:chunkId', perIpLimiter, requireAuth, async (req, res, next) => {
  try {
    const { chunkId } = req.params;
    const db = getSupabaseAdmin();
    const { data: sync, error: syncError } = await db
      .from('calendar_sync')
      .select('google_event_id')
      .eq('chunk_id', chunkId)
      .eq('user_id', req.userId)
      .single();
    if (syncError) throw syncError;

    const { title, startIso, endIso } = req.body || {};
    await updateEvent(req.userId, sync.google_event_id, { title, startIso, endIso });

    await db.from('calendar_sync').update({ last_synced_at: new Date().toISOString(), sync_status: 'synced' }).eq('chunk_id', chunkId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

googleRouter.delete('/google/calendar/events/:chunkId', perIpLimiter, requireAuth, async (req, res, next) => {
  try {
    const { chunkId } = req.params;
    const db = getSupabaseAdmin();
    const { data: sync, error: syncError } = await db
      .from('calendar_sync')
      .select('google_event_id')
      .eq('chunk_id', chunkId)
      .eq('user_id', req.userId)
      .maybeSingle();
    if (syncError) throw syncError;

    if (sync) {
      await deleteEvent(req.userId, sync.google_event_id);
      await db.from('calendar_sync').delete().eq('chunk_id', chunkId).eq('user_id', req.userId);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
