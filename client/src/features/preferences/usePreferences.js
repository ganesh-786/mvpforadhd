import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../../lib/apiClient.js';

const DEFAULTS = { focus_session_minutes: 25, working_hours: {}, energy_pattern: {}, exists: false };

export function usePreferences() {
  const [preferences, setPreferences] = useState(null); // null = still loading
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const data = await authFetch('/api/preferences');
      setPreferences(data);
    } catch (err) {
      setError(err.message);
      setPreferences(DEFAULTS);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async ({ focusSessionMinutes, workingHours, energyPattern }) => {
    const data = await authFetch('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify({ focusSessionMinutes, workingHours, energyPattern }),
    });
    setPreferences(data);
    return data;
  }, []);

  return { preferences, loading: preferences === null, error, save, reload };
}
