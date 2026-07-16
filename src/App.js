import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './pages/Login';
import BookingSheet from './pages/BookingSheet';
import VehicleMaster from './pages/VehicleMaster';

function App() {
  const [authStatus, setAuthStatus] = useState('loading');
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [activePage, setActivePage] = useState('bookings');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthStatus(session ? 'signedIn' : 'signedOut');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthStatus(newSession ? 'signedIn' : 'signedOut');
      if (!newSession) { setProfile(null); setProfileError(''); setActivePage('bookings'); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authStatus !== 'signedIn' || !session) return;
    let cancelled = false;
    supabase.from('profiles').select('*, centres(name)').eq('id', session.user.id).single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setProfileError('No profile is configured for this account. Contact the admin.');
          setProfile(null);
        } else {
          setProfile(data);
          setProfileError('');
        }
      });
    return () => { cancelled = true; };
  }, [authStatus, session]);

  if (authStatus === 'loading') return null;
  if (authStatus === 'signedOut') return <Login />;
  if (profileError) return (
    <div className="br-page" style={{ textAlign: 'center', marginTop: '80px' }}>
      <p style={{ color: '#991b1b' }}>{profileError}</p>
      <button onClick={() => supabase.auth.signOut()} style={{ marginTop: '16px', padding: '8px 20px', cursor: 'pointer' }}>Log out</button>
    </div>
  );
  if (!profile) return null;
  if (activePage === 'vehicles' && profile.role === 'super_admin') {
    return <VehicleMaster profile={profile} setActivePage={setActivePage} />;
  }
  return <BookingSheet session={session} profile={profile} setActivePage={setActivePage} />;
}

export default App;
