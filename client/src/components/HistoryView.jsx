import React, { useEffect, useState } from 'react';
import { History } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const ACTION_COLORS = { INSERT: '#2f8f8a', UPDATE: '#c98a1f', DELETE: '#c0392b' };
function buildActionLabels(t) {
  return { INSERT: t('h_action_insert'), UPDATE: t('h_action_update'), DELETE: t('h_action_delete') };
}
function buildTableLabels(t) {
  return { products: t('h_table_products'), contacts: t('h_table_contacts'), product_entries: t('h_table_entries') };
}

function itemLabel(tableName, data) {
  if (!data) return '—';
  if (tableName === 'products') {
    return [data.itemCode, data.descriptionErp || data.descriptionGr].filter(Boolean).join(' — ') || data.id || '—';
  }
  if (tableName === 'contacts') {
    return data.company || data.id || '—';
  }
  if (tableName === 'product_entries') {
    return [data.productItemCode, data.store].filter(Boolean).join(' @ ') || data.id || '—';
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
  const { t } = useLanguage();
  const ACTION_LABELS = buildActionLabels(t);
  const TABLE_LABELS = buildTableLabels(t);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    History.list()
      .then((rows) => { setEntries(rows); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }, []);

  const filtered = tableFilter === 'all' ? entries : entries.filter((e) => e.table_name === tableFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_history')}</strong>
        <select
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13 }}
        >
          <option value="all">{t('h_filter_all')}</option>
          <option value="products">{t('h_filter_products')}</option>
          <option value="contacts">{t('h_filter_contacts')}</option>
          <option value="product_entries">{t('h_filter_entries')}</option>
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        {loading ? (
          <p style={{ color: '#97a2b0' }}>{t('d_loading')}</p>
        ) : error ? (
          <p style={{ color: '#c0392b' }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#97a2b0' }}>{t('h_no_results')}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                <th style={{ padding: '10px 12px' }}>{t('h_col_date')}</th>
                <th style={{ padding: '10px 12px' }}>{t('h_col_user')}</th>
                <th style={{ padding: '10px 12px' }}>{t('h_col_action')}</th>
                <th style={{ padding: '10px 12px' }}>{t('h_col_type')}</th>
                <th style={{ padding: '10px 12px' }}>{t('h_col_item')}</th>
                <th style={{ padding: '10px 12px' }}>{t('h_col_changes')}</th>
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
                      {e.action === 'INSERT' ? t('h_new_entry') : e.action === 'DELETE' ? t('h_removed') : changed.length ? changed.join(', ') : '—'}
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
