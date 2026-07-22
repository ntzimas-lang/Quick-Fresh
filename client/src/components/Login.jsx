import React, { useState } from 'react';
import { Auth } from '../api.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await Auth.signIn(email.trim(), password);
    } catch (err) {
      setError('Λάθος email ή κωδικός.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f4f6f8' }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.08)', width: 320 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#2f8f8a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>QF</div>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#16233f' }}>Quick &amp; Fresh</div>
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Κωδικός</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p style={{ color: '#c0392b', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Σύνδεση...' : 'Σύνδεση'}
        </button>
      </form>
    </div>
  );
}
