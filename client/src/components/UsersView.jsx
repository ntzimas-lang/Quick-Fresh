import React, { useEffect, useState } from 'react';
import { Profiles, supabase } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const ROLE_LABELS = { super_user: 'Super User', viewer: 'Viewer', driver: 'Οδηγός' };
const ROLE_COLORS = { super_user: '#2f8f8a', viewer: '#6b7684', driver: '#c98a1f' };
const ROLE_OPTIONS = ['viewer', 'driver', 'super_user'];

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function UsersView() {
  const { t } = useLanguage();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [myId, setMyId] = useState(null);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    load();
    supabase.auth.getUser().then(({ data }) => setMyId(data?.user?.id || null));
  }, []);

  function load() {
    setLoading(true);
    Profiles.list()
      .then((rows) => { setProfiles(rows); setLoading(false); })
      .catch((err) => { setError(err.message || 'Σφάλμα φόρτωσης'); setLoading(false); });
  }

  async function handleRoleChange(id, role) {
    setSavingId(id);
    try {
      const updated = await Profiles.updateRole(id, role);
      setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      alert('Σφάλμα ενημέρωσης ρόλου: ' + (err.message || err));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_users')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        {loading ? (
          <p style={{ color: '#97a2b0' }}>Φόρτωση...</p>
        ) : error ? (
          <p style={{ color: '#c0392b' }}>{error}</p>
        ) : profiles.length === 0 ? (
          <p style={{ color: '#97a2b0' }}>Δεν βρέθηκαν χρήστες.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                <th style={{ padding: '10px 12px' }}>Email</th>
                <th style={{ padding: '10px 12px' }}>Ρόλος</th>
                <th style={{ padding: '10px 12px' }}>Εγγραφή</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid #eef1f4' }}>
                  <td style={{ padding: '10px 12px' }}>
                    {p.email}{p.id === myId ? <span style={{ color: '#97a2b0', fontSize: 11.5 }}> (εσύ)</span> : null}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select
                      value={p.role}
                      disabled={savingId === p.id}
                      onChange={(e) => handleRoleChange(p.id, e.target.value)}
                      style={{
                        background: ROLE_COLORS[p.role] || '#999', color: '#fff', fontWeight: 600,
                        border: 'none', borderRadius: 10, padding: '4px 10px', fontSize: 12
                      }}
                    >
                      {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6b7684' }}>{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 12, color: '#97a2b0', marginTop: 14 }}>
          Για να προσθέσεις νέο χρήστη ή να διαγράψεις κάποιον, πήγαινε στο Supabase → Authentication → Users.
        </p>
      </div>
    </div>
  );
}
