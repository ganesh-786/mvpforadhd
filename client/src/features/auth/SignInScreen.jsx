import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

/* Email magic-link sign-in — the interim auth entry point until Phase 3 adds
   "Sign in with Google" (which will also grant the Calendar/Tasks/Classroom
   consent this app eventually needs). */
export default function SignInScreen() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send sign-in link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EFF3F0', fontFamily: "'Inter',sans-serif", padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360, background: '#FFFFFF', borderRadius: 18, boxShadow: '0 2px 10px rgba(42,51,48,0.06), 0 1px 2px rgba(42,51,48,0.04)', padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 22, color: '#2A3330', marginBottom: 4 }}>TaskFlow</div>
          <div style={{ fontSize: 14, color: '#7C8C85' }}>Sign in with your email to save your preferences and plan.</div>
        </div>
        {sent ? (
          <div style={{ fontSize: 14, color: '#2C5A4C', background: '#DCEBE3', borderRadius: 12, padding: 14 }}>
            Check {email} for a sign-in link.
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ border: '1px solid #D7E2DC', borderRadius: 12, padding: '12px 14px', fontSize: 14.5, color: '#2A3330' }}
            />
            {error && <div style={{ fontSize: 13, color: '#C0392B' }}>{error}</div>}
            <button
              type="submit"
              disabled={busy}
              style={{ background: '#3D7A68', color: '#fff', border: 'none', borderRadius: 12, padding: 13, fontWeight: 600, fontSize: 14.5, cursor: 'pointer', minHeight: 44 }}
            >
              {busy ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
