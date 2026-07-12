import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError('Login failed: ' + error.message);
  }

  return (
    <div className="br-page br-login-page">
      <form onSubmit={handleSubmit} className="br-form-card br-login-card">
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1a56a0', marginBottom: '4px' }}>Banjara Ride</h1>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>Sign in to continue</p>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>Email</label>
            <input
              type="email" name="email" autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)}
              style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '100%' }}
              required
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>Password</label>
            <input
              type="password" name="password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '100%' }}
              required
            />
          </div>
          <button type="submit" disabled={loading}
            style={{ background: '#1a56a0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  );
}
