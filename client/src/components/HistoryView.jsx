import React, { useEffect, useState } from 'react';
import { History } from '../api.js';

const ACTION_LABELS = { INSERT: 'Δημιουργία', UPDATE: 'Ενημέρωση', DELETE: 'Διαγραφή' };
const ACTION_COLORS = { INSERT: '#2f8f8a', UPDATE: '#c98a1f', DELETE: '#c0392b' };
const TABLE_LABELS = { products: 'Προϊόν', contacts: 'Επαφή' };

function itemLabel(tableName, data) {
  if (!data) return '—';
  if (tableName === 'products') {
    return [data.itemCode, data.descriptionErp || data.descriptionGr].filter(Boolean).join(' — ') || data.id || '—';
  }
  if (tableName === 'contacts') {
    return data.company || data.id || '—';
  }
  return data.id || '—';
}

function changedFields(oldData, newData) {
  if (!oldData || !newData) return [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  keys.delete('id');
  const changed = [];
  keys.forEach((k) => {
    if (JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])) changed.push(k);
  });
  return changed;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function HistoryView() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    History.list()
      .then((rows) => { setEntries(rows); setLoading(false); })
      .catch((err) => { setError(err.message || 'Σφάλμα φόρτωσης'); setLoading(false); });
  }, []);

  const filtered = tableFilter === 'all' ? entries : entries.filter((e) => e.table_name === tableFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>Ιστορικό Αλλαγών</strong>
        <select
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13 }}
        >
          <option value="all">Όλα</option>
          <option value="products">Προϊόντα</option>
          <option value="contacts">Επαφές</option>
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        {loading ? (
          <p style={{ color: '#97a2b0' }}>Φόρτωση...</p>
        ) : error ? (
          <p style={{ color: '#c0392b' }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#97a2b0' }}>Δεν υπάρχουν καταχωρήσεις ιστορικού.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                <th style={{ padding: '10px 12px' }}>Ημερομηνία</th>
                <th style={{ padding: '10px 12px' }}>Χρήστης</th>
                <th style={{ padding: '10px 12px' }}>Ενέργεια</th>
                <th style={{ padding: '10px 12px' }}>Τύπος</th>
                <th style={{ padding: '10px 12px' }}>Στοιχείο</th>
                <th style={{ padding: '10px 12px' }}>Αλλαγές</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const changed = e.action === 'UPDATE' ? changedFields(e.old_data, e.new_data) : [];
                const label = itemLabel(e.table_name, e.new_data || e.old_data);
                return (
                  <tr key={e.id} style={{ borderTop: '1px solid #eef1f4' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#6b7684' }}>{formatDate(e.changed_at)}</td>
                    <td style={{ padding: '10px 12px' }}>{e.user_email || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ color: '#fff', background: ACTION_COLORS[e.action] || '#999', padding: '3px 9px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>
                        {ACTION_LABELS[e.action] || e.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{TABLE_LABELS[e.table_name] || e.table_name}</td>
                    <td style={{ padding: '10px 12px' }}>{label}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7684' }}>
                      {e.action === 'INSERT' ? 'Νέα καταχώρηση' : e.action === 'DELETE' ? 'Αφαιρέθηκε' : changed.length ? changed.join(', ') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
