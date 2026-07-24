import React, { useEffect, useMemo, useState } from 'react';
import { StoreEquipment, Products } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

function buildColumns(t) {
  return [
    { key: 'store', label: t('se_col_store') },
    { key: 'fridgeNo', label: t('se_col_fridgeNo') },
    { key: 'picoNo', label: t('se_col_picoNo') }
  ];
}

export default function StoreEquipmentView({ readOnly = false }) {
  const { t } = useLanguage();
  const COLUMNS = buildColumns(t);
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'card'
  const [cardIndex, setCardIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('store');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    Promise.all([StoreEquipment.list(), Products.list()])
      .then(([se, prods]) => { setRecords(se); setProducts(prods); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }, []);

  // Οι επιλογές του dropdown "Κατάστημα" προέρχονται από το πεδίο "Ενεργό Σε Κατάστημα"
  // των Προϊόντων — όχι από σταθερή λίστα, ώστε να ταιριάζουν πάντα με ό,τι υπάρχει εκεί.
  const storeOptions = useMemo(() => {
    const set = new Set();
    products.forEach((p) => (p.activeStores || []).forEach((s) => s && set.add(s)));
    return Array.from(set).sort();
  }, [products]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filtered = useMemo(() => {
    let rows = records;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) =>
        (r.store || '').toLowerCase().includes(q) ||
        (r.fridgeNo || '').toLowerCase().includes(q) ||
        (r.picoNo || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...rows].sort((a, b) => {
      const av = (a[sortKey] || '').toString().toLowerCase();
      const bv = (b[sortKey] || '').toString().toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [records, search, sortKey, sortDir]);

  useEffect(() => {
    if (cardIndex >= filtered.length) setCardIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length]);

  async function handleCreate() {
    try {
      const record = await StoreEquipment.create({ store: storeOptions[0] || '', fridgeNo: '', picoNo: '' });
      setRecords((prev) => [...prev, record]);
      setViewMode('card');
      setTimeout(() => setCardIndex(filtered.length), 0);
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function handleFieldChange(id, field, value) {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    const current = records.find((r) => r.id === id);
    if (!current) return;
    try {
      await StoreEquipment.update(id, { ...current, [field]: value });
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function handleDelete(id) {
    try {
      await StoreEquipment.remove(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  const current = filtered[cardIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{t('title_store_equipment')}</strong>
        <div style={{ display: 'flex', gap: 4, background: '#f1f3f5', borderRadius: 8, padding: 3 }}>
          <button
            onClick={() => setViewMode('table')}
            style={{ border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#16233f' : '#6b7684' }}
          >
            {t('common_table')}
          </button>
          <button
            onClick={() => setViewMode('card')}
            style={{ border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: viewMode === 'card' ? '#fff' : 'transparent', color: viewMode === 'card' ? '#16233f' : '#6b7684' }}
          >
            {t('common_card')}
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common_filter_placeholder')}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13, width: 200 }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#fdecea', color: '#c0392b', border: '1px solid #f3c1bb', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} style={{ border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}
        {loading ? (
          <p style={{ color: '#97a2b0' }}>{t('d_loading')}</p>
        ) : viewMode === 'table' ? (
          <>
            {filtered.length === 0 ? (
              <p style={{ color: '#97a2b0' }}>{t('se_no_records')}</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        title={t('common_sort_hint')}
                        style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        {col.label}
                        {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                    {!readOnly && <th style={{ padding: '10px 12px' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '6px 12px' }}>
                        {readOnly ? (r.store || '—') : (
                          <select
                            value={r.store || ''}
                            onChange={(e) => handleFieldChange(r.id, 'store', e.target.value)}
                            style={{ width: '100%', border: '1px solid #e1e5ea', borderRadius: 6, padding: '5px 6px', fontSize: 13 }}
                          >
                            <option value="">{t('common_select_placeholder')}</option>
                            {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '6px 12px' }}>
                        {readOnly ? (r.fridgeNo || '—') : (
                          <input
                            value={r.fridgeNo || ''}
                            onChange={(e) => handleFieldChange(r.id, 'fridgeNo', e.target.value)}
                            style={{ width: '100%', border: '1px solid #e1e5ea', borderRadius: 6, padding: '5px 6px', fontSize: 13 }}
                          />
                        )}
                      </td>
                      <td style={{ padding: '6px 12px' }}>
                        {readOnly ? (r.picoNo || '—') : (
                          <input
                            value={r.picoNo || ''}
                            onChange={(e) => handleFieldChange(r.id, 'picoNo', e.target.value)}
                            style={{ width: '100%', border: '1px solid #e1e5ea', borderRadius: 6, padding: '5px 6px', fontSize: 13 }}
                          />
                        )}
                      </td>
                      {!readOnly && (
                        <td style={{ padding: '6px 12px' }}>
                          <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => handleDelete(r.id)}>{t('common_delete')}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!readOnly && (
              <button className="btn-primary" style={{ marginTop: 14 }} onClick={handleCreate}>{t('common_new')}</button>
            )}
          </>
        ) : (
          <div style={{ maxWidth: 420, margin: '0 auto' }}>
            {filtered.length === 0 ? (
              <p style={{ color: '#97a2b0' }}>{t('se_no_records')}</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <button
                    onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
                    disabled={cardIndex === 0}
                    style={{ border: '1px solid #d7dce2', background: '#fff', borderRadius: 6, padding: '6px 12px', cursor: cardIndex === 0 ? 'default' : 'pointer', opacity: cardIndex === 0 ? 0.4 : 1 }}
                  >‹</button>
                  <span style={{ fontSize: 12.5, color: '#6b7684' }}>{cardIndex + 1} / {filtered.length}</span>
                  <button
                    onClick={() => setCardIndex((i) => Math.min(filtered.length - 1, i + 1))}
                    disabled={cardIndex === filtered.length - 1}
                    style={{ border: '1px solid #d7dce2', background: '#fff', borderRadius: 6, padding: '6px 12px', cursor: cardIndex === filtered.length - 1 ? 'default' : 'pointer', opacity: cardIndex === filtered.length - 1 ? 0.4 : 1 }}
                  >›</button>
                </div>
                {current && (
                  <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 20 }}>
                    <div className="field" style={{ marginBottom: 14 }}>
                      <label>{t('se_col_store')}</label>
                      <select
                        disabled={readOnly}
                        value={current.store || ''}
                        onChange={(e) => handleFieldChange(current.id, 'store', e.target.value)}
                      >
                        <option value="">{t('common_select_placeholder')}</option>
                        {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 14 }}>
                      <label>{t('se_col_fridgeNo')}</label>
                      <input
                        disabled={readOnly}
                        value={current.fridgeNo || ''}
                        onChange={(e) => handleFieldChange(current.id, 'fridgeNo', e.target.value)}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 18 }}>
                      <label>{t('se_col_picoNo')}</label>
                      <input
                        disabled={readOnly}
                        value={current.picoNo || ''}
                        onChange={(e) => handleFieldChange(current.id, 'picoNo', e.target.value)}
                      />
                    </div>
                    {!readOnly && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-primary" onClick={handleCreate}>{t('common_new')}</button>
                        <button className="btn-danger" onClick={() => handleDelete(current.id)}>{t('common_delete')}</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
