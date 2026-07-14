import { useNavigate } from 'react-router-dom';
import PreferencesForm from './PreferencesForm.jsx';
import { usePreferences } from './usePreferences.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useGoogleConnection } from '../google/useGoogleConnection.js';

export default function SettingsScreen() {
  const { preferences, loading, save } = usePreferences();
  const { signOut } = useAuth();
  const { connected, loading: googleLoading, connectGoogle } = useGoogleConnection();
  const navigate = useNavigate();

  if (loading) return null;

  return (
    <div style={{ minHeight: '100%', width: '100%', display: 'flex', justifyContent: 'center', background: '#EFF3F0', fontFamily: "'Inter',sans-serif", padding: '32px 24px 60px' }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#7C8C85', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '6px 4px' }}
        >
          ← Back
        </button>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 22, color: '#2A3330' }}>Settings</div>

        <div style={{ background: '#FFFFFF', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #EFF3F0' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#2A3330' }}>Google Calendar</div>
            <div style={{ fontSize: 12.5, color: '#7C8C85', marginTop: 2 }}>
              {googleLoading ? 'Checking…' : connected ? 'Connected — your plan syncs to your calendar.' : 'Not connected yet.'}
            </div>
          </div>
          {!googleLoading && !connected && (
            <button
              type="button"
              onClick={connectGoogle}
              style={{ background: '#3D7A68', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', minHeight: 44, flex: 'none' }}
            >
              Connect
            </button>
          )}
        </div>

        <PreferencesForm initial={preferences} onSave={save} saveLabel="Save changes" />
        <button
          type="button"
          onClick={signOut}
          style={{ background: 'transparent', border: '1px solid #D7E2DC', color: '#7C8C85', borderRadius: 12, padding: 12, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', minHeight: 44 }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
