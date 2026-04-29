import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { verifyStudentWithBackend } from './api';
import Login from './pages/auth/LoginPage';
import Home from './Home';
import TeacherDashboard from './pages/teacher/TeacherDashboardPage';
import LoadingScreen from './components/common/LoadingScreen';

function App() {
  const [studentData, setStudentData]   = useState(null);
  const [authError, setAuthError]       = useState('');
  const [isVerifying, setIsVerifying]   = useState(false);
  // ── NEW: true until we've confirmed whether a session exists or not ────────
  const [isInitializing, setIsInitializing] = useState(true);

  const isVerifiedRef  = useRef(false);
  const pendingErrorRef = useRef('');

  // ── Shared verify logic ───────────────────────────────────────────────────

  async function verifySession(currentSession) {
    if (!currentSession) return;
    if (isVerifiedRef.current) return;

    pendingErrorRef.current = '';
    setAuthError('');
    setIsVerifying(true);

    try {
      const googleEmail = currentSession.user.email;
      const data = await verifyStudentWithBackend(googleEmail);
      isVerifiedRef.current = true;
      setStudentData(data);
    } catch (error) {
      console.error('Verification failed:', error);

      const msg = error.message || '';
      const isUnauthorized =
        msg.includes('403') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('not on the class') ||
        msg.toLowerCase().includes('forbidden') ||
        msg.toLowerCase().includes('access denied');

      const errorToShow = isUnauthorized
        ? 'Unauthorized: Your Google account is not on the Class Allowlist. Please contact your professor.'
        : msg || 'An unexpected error occurred. Please try again.';

      pendingErrorRef.current = errorToShow;
      isVerifiedRef.current = false;

      await supabase.auth.signOut();
      setStudentData(null);
      setAuthError(errorToShow);
    } finally {
      setIsVerifying(false);
    }
  }

  // ── On mount: check for an existing session immediately ──────────────────
  // This prevents the login flash on page refresh when a valid session exists.

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        verifySession(session).finally(() => setIsInitializing(false));
      } else {
        setIsInitializing(false);
      }
    });
  }, []);

  // ── Auth state changes (sign in / sign out events) ────────────────────────

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {

      if (event === 'SIGNED_IN' && currentSession) {
        // Skip if we already verified this session in the getSession() call above
        if (isVerifiedRef.current) return;
        await verifySession(currentSession);
      }

      if (event === 'SIGNED_OUT') {
        isVerifiedRef.current = false;
        setStudentData(null);

        if (pendingErrorRef.current) {
          setAuthError(pendingErrorRef.current);
        } else {
          setAuthError('');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Show loading screen while checking initial session OR verifying ────────

  if (isInitializing || isVerifying) {
    return (
      <LoadingScreen
        title={isInitializing ? 'Loading...' : 'Verifying Credentials...'}
        subtitle={isInitializing ? 'Restoring your session' : 'Syncing with Google Services'}
      />
    );
  }

  return (
    <div className="app-container">
      {studentData ? (
        studentData.role === 'TEACHER' ? (
          <TeacherDashboard user={studentData} />
        ) : (
          <Home studentData={studentData} />
        )
      ) : (
        <Login authError={authError} />
      )}
    </div>
  );
}

export default App;