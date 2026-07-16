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
    <div className="br-login-page">
      <form onSubmit={handleSubmit} className="br-form-card br-login-card">
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '48px', height: '48px', background: 'linear-gradient(135deg, #1a56a0, #0f3460)', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '22px' }}>🏍️</span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1a56a0' }}>Banjara Ride</h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>Sign in to your account</p>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase' }}>Email</label>
            <input
              type="email" name="email" autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)}
              style={{ padding: '11px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', width: '100%', marginTop: '6px' }}
              required
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase' }}>Password</label>
            <input
              type="password" name="password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              style={{ padding: '11px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', width: '100%', marginTop: '6px' }}
              required
            />
          </div>
          <button type="submit" disabled={loading}
            style={{ background: 'linear-gradient(135deg, #1a56a0, #0f3460)', color: 'white', border: 'none', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '15px', opacity: loading ? 0.7 : 1, marginTop: '4px', boxShadow: '0 4px 14px rgba(26,86,160,0.35)' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  );
}
