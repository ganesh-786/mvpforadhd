import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

export const preferencesRouter = Router();

const DEFAULT_PREFERENCES = {
  focus_session_minutes: 25,
  working_hours: {},
  energy_pattern: {},
};

function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

preferencesRouter.get('/preferences', requireAuth, async (req, res) => {
  const { data, error } = await getSupabaseAdmin()
    .from('user_preferences')
    .select('focus_session_minutes, working_hours, energy_pattern')
    .eq('user_id', req.userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    sendError(res, 500, 'UPSTREAM_ERROR', 'Could not load preferences.');
    return;
  }

  res.json({ ...(data || DEFAULT_PREFERENCES), exists: Boolean(data) });
});

preferencesRouter.put('/preferences', requireAuth, async (req, res) => {
  const { focusSessionMinutes, workingHours, energyPattern } = req.body || {};

  if (!Number.isInteger(focusSessionMinutes) || focusSessionMinutes < 5 || focusSessionMinutes > 240) {
    sendError(res, 400, 'BAD_REQUEST', 'focusSessionMinutes must be an integer between 5 and 240.');
    return;
  }
  if (typeof workingHours !== 'object' || workingHours === null) {
    sendError(res, 400, 'BAD_REQUEST', 'workingHours must be an object.');
    return;
  }
  if (typeof energyPattern !== 'object' || energyPattern === null) {
    sendError(res, 400, 'BAD_REQUEST', 'energyPattern must be an object.');
    return;
  }

  const { data, error } = await getSupabaseAdmin()
    .from('user_preferences')
    .upsert({
      user_id: req.userId,
      focus_session_minutes: focusSessionMinutes,
      working_hours: workingHours,
      energy_pattern: energyPattern,
    })
    .select('focus_session_minutes, working_hours, energy_pattern')
    .single();

  if (error) {
    console.error(error);
    sendError(res, 500, 'UPSTREAM_ERROR', 'Could not save preferences.');
    return;
  }

  res.json(data);
});
