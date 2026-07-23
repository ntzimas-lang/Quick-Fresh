import React, { useEffect, useState } from 'react';
import { Products, Contacts, Entries } from '../api.js';

const CONTACT_STATUS_COLORS = {
  'Έκλεισε': '#27ae60',
  'Ενδιαφέρεται': '#e0a500',
  'Δεν Ενδιαφέρεται': '#c0392b',
  '': '#c7cdd6'
};

function daysDiff(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr + 'T00:00:00');
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
}

function cardStyle() {
  return { background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 16 };
}
function cardTitleStyle() {
  return { fontSize: 12, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 };
}

export default function DashboardView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    Promise.all([
      Products.list().then(setProducts),
      Contacts.list().then(setContacts),
      Entries.list().then(setEntries)
    ])
      .then(() => setLoading(false))
      .catch((err) => { setError(err.message || 'Σφάλμα φόρτωσης'); setLoading(false); });
  }, []);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>Πίνακας Ελέγχου</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>

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
        </div>
      </div>
    </div>
  );
}
