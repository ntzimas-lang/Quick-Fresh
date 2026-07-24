import React, { useEffect, useState } from 'react';
import { Profiles, supabase } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

function buildRoleLabels(t) {
  return { super_user: t('role_super_user'), viewer: t('role_viewer'), driver: t('role_driver') };
}
const ROLE_COLORS = { super_user: '#2f8f8a', viewer: '#6b7684', driver: '#c98a1f' };
const ROLE_OPTIONS = ['viewer', 'driver', 'super_user'];

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function UsersView() {
  const { t } = useLanguage();
  const ROLE_LABELS = buildRoleLabels(t);
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
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }

  async function handleRoleChange(id, role) {
    setSavingId(id);
    try {
      const updated = await Profiles.updateRole(id, role);
      setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      alert(t('u_role_update_error_prefix') + ' ' + (err.message || err));
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
          <p style={{ color: '#97a2b0' }}>{t('d_loading')}</p>
        ) : error ? (
          <p style={{ color: '#c0392b' }}>{error}</p>
        ) : profiles.length === 0 ? (
          <p style={{ color: '#97a2b0' }}>{t('u_no_users')}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                <th style={{ padding: '10px 12px' }}>{t('u_col_email')}</th>
                <th style={{ padding: '10px 12px' }}>{t('u_col_role')}</th>
                <th style={{ padding: '10px 12px' }}>{t('u_col_created')}</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid #eef1f4' }}>
                  <td style={{ padding: '10px 12px' }}>
                    {p.email}{p.id === myId ? <span style={{ color: '#97a2b0', fontSize: 11.5 }}>{t('u_you_suffix')}</span> : null}
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
          {t('u_supabase_hint')}
        </p>
      </div>
    </div>
  );
}
