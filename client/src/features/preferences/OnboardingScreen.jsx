import { useNavigate } from 'react-router-dom';
import PreferencesForm from './PreferencesForm.jsx';
import { usePreferences } from './usePreferences.js';

export default function OnboardingScreen() {
  const { preferences, loading, save } = usePreferences();
  const navigate = useNavigate();

  if (loading) return null;

  const onSave = async (payload) => {
    await save(payload);
    navigate('/', { replace: true });
  };

  return (
    <div style={{ minHeight: '100%', width: '100%', display: 'flex', justifyContent: 'center', background: '#EFF3F0', fontFamily: "'Inter',sans-serif", padding: '32px 24px' }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 24, color: '#2A3330', marginBottom: 6 }}>Let's set you up</div>
          <div style={{ fontSize: 14.5, color: '#7C8C85' }}>A few quick preferences so your plan actually fits how you work.</div>
        </div>
        <PreferencesForm initial={preferences} onSave={onSave} saveLabel="Start using TaskFlow" />
      </div>
    </div>
  );
}
