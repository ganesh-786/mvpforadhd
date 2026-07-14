import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../../lib/apiClient.js';
import { useAuth } from '../auth/AuthContext.jsx';

export function useGoogleConnection() {
  const { connectGoogle } = useAuth();
  const [connected, setConnected] = useState(null); // null = still loading

  const reload = useCallback(async () => {
    try {
      const data = await authFetch('/api/auth/google-status');
      setConnected(data.connected);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { connected, loading: connected === null, connectGoogle, reload };
}
