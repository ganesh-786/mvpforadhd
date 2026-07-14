import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { listTasks } from '../lib/googleTasks.js';
import { listCourseworkDueSoon } from '../lib/googleClassroom.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

export const googleImportRouter = Router();

const perIpLimiter = createRateLimiter({ limit: 10 });

const TASK_DEFAULT_MINUTES = 15;
const COURSEWORK_DEFAULT_MINUTES = 30;

function priorityForDueDate(dueIso) {
  if (!dueIso) return 'medium';
  const daysUntil = (new Date(dueIso) - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil <= 2) return 'high';
  if (daysUntil <= 5) return 'medium';
  return 'low';
}

function mapChunkRowToApi(c) {
  return {
    id: c.id,
    title: c.title,
    estimatedMinutes: c.estimated_minutes,
    energyLevel: c.energy_level,
    priority: c.priority,
    rationale: c.rationale,
    status: c.status,
    source: c.source,
    dueBy: c.due_by,
  };
}

/**
 * Pulls in incomplete Google Tasks and near-due Classroom coursework as
 * task_chunks (source = 'google_tasks' | 'google_classroom'), so the
 * deterministic scheduler (scheduler.js) can place them alongside
 * brain-dump chunks using the same uniform shape. Idempotent: already-
 * ingested items (matched by external_ref) are skipped, not duplicated.
 * Each source is fetched independently — one failing (e.g. scope not
 * granted) doesn't block ingesting the other.
 */
googleImportRouter.post('/google/ingest', perIpLimiter, requireAuth, async (req, res) => {
  const db = getSupabaseAdmin();

  const [tasksResult, courseworkResult] = await Promise.allSettled([
    listTasks(req.userId),
    listCourseworkDueSoon(req.userId),
  ]);

  const { data: existing } = await db
    .from('task_chunks')
    .select('external_ref')
    .eq('user_id', req.userId)
    .in('source', ['google_tasks', 'google_classroom'])
    .neq('status', 'removed');

  const existingTaskIds = new Set((existing || []).map((r) => r.external_ref?.googleTaskId).filter(Boolean));
  const existingCourseworkIds = new Set((existing || []).map((r) => r.external_ref?.courseworkId).filter(Boolean));

  const rows = [];

  if (tasksResult.status === 'fulfilled') {
    for (const t of tasksResult.value) {
      if (existingTaskIds.has(t.googleTaskId)) continue;
      rows.push({
        user_id: req.userId,
        title: t.title,
        estimated_minutes: TASK_DEFAULT_MINUTES,
        energy_level: 'low',
        priority: priorityForDueDate(t.due),
        rationale: 'Imported from Google Tasks',
        status: 'proposed',
        source: 'google_tasks',
        due_by: t.due,
        external_ref: { googleTaskId: t.googleTaskId },
      });
    }
  }

  if (courseworkResult.status === 'fulfilled') {
    for (const cw of courseworkResult.value) {
      if (existingCourseworkIds.has(cw.courseworkId)) continue;
      rows.push({
        user_id: req.userId,
        title: `${cw.title} (${cw.courseName})`,
        estimated_minutes: COURSEWORK_DEFAULT_MINUTES,
        energy_level: 'high',
        priority: priorityForDueDate(cw.dueDate),
        rationale: `Due ${new Date(cw.dueDate).toLocaleDateString()}`,
        status: 'proposed',
        source: 'google_classroom',
        due_by: cw.dueDate,
        external_ref: { courseId: cw.courseId, courseworkId: cw.courseworkId },
      });
    }
  }

  let inserted = [];
  if (rows.length > 0) {
    const { data, error } = await db.from('task_chunks').insert(rows).select();
    if (error) {
      res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Could not save imported items.' } });
      return;
    }
    inserted = data;
  }

  res.json({
    chunks: inserted.map(mapChunkRowToApi),
    errors: {
      tasks: tasksResult.status === 'rejected' ? (tasksResult.reason?.code || 'UPSTREAM_ERROR') : null,
      classroom: courseworkResult.status === 'rejected' ? (courseworkResult.reason?.code || 'UPSTREAM_ERROR') : null,
    },
  });
});
