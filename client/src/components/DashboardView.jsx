import React, { useEffect, useState } from 'react';
import { Products, Contacts, Entries, History, Profiles } from '../api.js';

const CONTACT_STATUS_COLORS = {
  'Έκλεισε': '#27ae60',
  'Ενδιαφέρεται': '#e0a500',
  'Δεν Ενδιαφέρεται': '#c0392b',
  '': '#c7cdd6'
};

const ROLE_LABELS = { super_user: 'Super User', viewer: 'Viewer', driver: 'Οδηγός' };
const ROLE_COLORS = { super_user: '#2f8f8a', viewer: '#6b7684', driver: '#c98a1f' };

const HIST_ACTION_LABELS = { INSERT: 'Δημιουργία', UPDATE: 'Ενημέρωση', DELETE: 'Διαγραφή' };
const HIST_ACTION_COLORS = { INSERT: '#2f8f8a', UPDATE: '#c98a1f', DELETE: '#c0392b' };
const HIST_TABLE_LABELS = { products: 'Προϊόν', contacts: 'Επαφή', product_entries: 'Καταχώρηση' };

function daysDiff(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr + 'T00:00:00');
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function cardStyle() {
  return { background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 16 };
}
function cardTitleStyle() {
  return { fontSize: 12, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 };
}

export default function DashboardView({ isSuperUser = false }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [history, setHistory] = useState([]);
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    const tasks = [
      Products.list().then(setProducts),
      Contacts.list().then(setContacts),
      Entries.list().then(setEntries),
      History.list(10).then(setHistory)
    ];
    if (isSuperUser) tasks.push(Profiles.list().then(setProfiles));
    Promise.all(tasks)
      .then(() => setLoading(false))
      .catch((err) => { setError(err.message || 'Σφάλμα φόρτωσης'); setLoading(false); });
  }, [isSuperUser]);

  if (loading) {
    return <div style={{ padding: 20, color: '#97a2b0' }}>Φόρτωση...</div>;
  }
  if (error) {
    return <div style={{ padding: 20, color: '#c0392b' }}>{error}</div>;
  }

  const entos = products.filter((p) => (p.status || 'ΕΝΤΟΣ') !== 'ΕΚΤΟΣ').length;
  const ektos = products.length - entos;

  const expiredCount = entries.filter((e) => daysDiff(e.expiryDate) < 0).length;
  const expiringSoonCount = entries.filter((e) => {
    const d = daysDiff(e.expiryDate);
    return d >= 0 && d <= 7;
  }).length;

  const statusGroups = {};
  contacts.forEach((c) => {
    const key = c.status || '';
    statusGroups[key] = (statusGroups[key] || 0) + 1;
  });
  const statusOrder = ['Έκλεισε', 'Ενδιαφέρεται', 'Δεν Ενδιαφέρεται', ''];

  const roleGroups = { super_user: 0, viewer: 0, driver: 0 };
  profiles.forEach((p) => { roleGroups[p.role] = (roleGroups[p.role] || 0) + 1; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>Πίνακας Ελέγχου</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>

          <div style={cardStyle()}>
            <div style={cardTitleStyle()}>Προϊόντα</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#27ae60' }}>{entos}</div>
                <div style={{ fontSize: 11.5, color: '#6b7684' }}>ΕΝΤΟΣ</div>
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#c0392b' }}>{ektos}</div>
                <div style={{ fontSize: 11.5, color: '#6b7684' }}>ΕΚΤΟΣ</div>
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#16233f' }}>{products.length}</div>
                <div style={{ fontSize: 11.5, color: '#6b7684' }}>Σύνολο</div>
              </div>
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={cardTitleStyle()}>Ληγμένα</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#c0392b' }}>{expiredCount}</div>
                <div style={{ fontSize: 11.5, color: '#6b7684' }}>Έχουν λήξει</div>
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#c98a1f' }}>{expiringSoonCount}</div>
                <div style={{ fontSize: 11.5, color: '#6b7684' }}>Λήγουν ≤ 7 ημέρες</div>
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#16233f' }}>{entries.length}</div>
                <div style={{ fontSize: 11.5, color: '#6b7684' }}>Σύνολο καταχωρήσεων</div>
              </div>
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={cardTitleStyle()}>Επαφές ανά Status</div>
            {contacts.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#97a2b0', margin: 0 }}>Καμία επαφή.</p>
            ) : (
              statusOrder.map((key) => {
                const count = statusGroups[key] || 0;
                if (count === 0) return null;
                return (
                  <div key={key || 'none'} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: CONTACT_STATUS_COLORS[key] || '#c7cdd6', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, flex: 1 }}>{key || 'Χωρίς status'}</span>
                    <strong style={{ fontSize: 13 }}>{count}</strong>
                  </div>
                );
              })
            )}
          </div>

          {isSuperUser && (
            <div style={cardStyle()}>
              <div style={cardTitleStyle()}>Χρήστες ανά ρόλο</div>
              {Object.keys(ROLE_LABELS).map((role) => (
                <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: ROLE_COLORS[role], flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flex: 1 }}>{ROLE_LABELS[role]}</span>
                  <strong style={{ fontSize: 13 }}>{roleGroups[role] || 0}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={cardStyle()}>
          <div style={cardTitleStyle()}>Πρόσφατη δραστηριότητα</div>
          {history.length === 0 ? (
            <p style={{ fontSize: 12.5, color: '#97a2b0', margin: 0 }}>Δεν υπάρχει ιστορικό ακόμα.</p>
          ) : (
            history.map((e) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f3f5', fontSize: 13 }}>
                <span style={{ color: '#fff', background: HIST_ACTION_COLORS[e.action] || '#999', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  {HIST_ACTION_LABELS[e.action] || e.action}
                </span>
                <span style={{ color: '#6b7684', flexShrink: 0 }}>{HIST_TABLE_LABELS[e.table_name] || e.table_name}</span>
                <span style={{ flex: 1, color: '#3a4353' }}>{e.user_email || '—'}</span>
                <span style={{ color: '#97a2b0', fontSize: 12, flexShrink: 0 }}>{formatDateTime(e.changed_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
