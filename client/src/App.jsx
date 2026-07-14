import { useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/AuthContext.jsx';
import SignInScreen from './features/auth/SignInScreen.jsx';
import OnboardingScreen from './features/preferences/OnboardingScreen.jsx';
import SettingsScreen from './features/preferences/SettingsScreen.jsx';
import { usePreferences } from './features/preferences/usePreferences.js';
import TaskFlowApp from './TaskFlowApp.jsx';

function Shell({ children }) {
  const scrollRef = useRef(null);
  return (
    <div
      ref={scrollRef}
      className="tf-viewport"
      style={{
        width: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: '#EFF3F0',
      }}
    >
      {typeof children === 'function' ? children(scrollRef) : children}
    </div>
  );
}

/* Gates on: authenticated, then (once authenticated) has a saved
   user_preferences row — first-run users are routed to /onboarding before
   anything else in the app is usable. */
function RequireOnboarded({ children }) {
  const { preferences, loading } = usePreferences();
  if (loading) return null;
  if (!preferences.exists) return <Navigate to="/onboarding" replace />;
  return children;
}

function AuthedRoutes() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingScreen />} />
      <Route path="/settings" element={<Shell><SettingsScreen /></Shell>} />
      <Route
        path="/"
        element={
          <RequireOnboarded>
            <Shell>{(scrollRef) => <TaskFlowApp scrollRef={scrollRef} />}</Shell>
          </RequireOnboarded>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <SignInScreen />;
  return <AuthedRoutes />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
