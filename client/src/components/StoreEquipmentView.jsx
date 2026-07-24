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

// Κλειδί ομαδοποίησης "σχεδόν ίδιων" ονομάτων καταστήματος: αγνοεί κενά στην αρχή/τέλος,
// πολλαπλά κενά, κεφαλαία/πεζά και τόνους — ώστε "Κοτσοβολος" / "Κοτσόβολος " / "ΚΟΤΣΟΒΟΛΟΣ"
// να αναγνωρίζονται ως το ίδιο κατάστημα.
function normalizeStoreKey(s) {
  return (s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
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

  // Αυτή η σελίδα ΕΙΝΑΙ η κεντρική/έγκυρη λίστα καταστημάτων — οι προτάσεις (datalist)
  // προέρχονται από τις ίδιες τις εγγραφές εδώ, μαζί με ό,τι υπάρχει ήδη στα Προϊόντα
  // (ώστε τίποτα να μη "χαθεί" από τη λίστα πριν γίνει η συγχώνευση διπλότυπων).
  const storeOptions = useMemo(() => {
    const set = new Set();
    records.forEach((r) => { const clean = (r.store || '').trim(); if (clean) set.add(clean); });
    products.forEach((p) => (p.activeStores || []).forEach((s) => {
      const clean = (s || '').trim();
      if (clean) set.add(clean);
    }));
    return Array.from(set).sort();
  }, [records, products]);

  // Ανίχνευση "σχεδόν ίδιων" ονομάτων καταστήματος μέσα στο Ενεργό Σε Κατάστημα των Προϊόντων
  // (π.χ. κενό, κεφαλαία/πεζά, τόνος) — για το εργαλείο αυτόματης συγχώνευσης παρακάτω.
  const duplicateGroups = useMemo(() => {
    const byKey = {};
    products.forEach((p) => {
      (p.activeStores || []).forEach((raw) => {
        const clean = (raw || '').trim();
        if (!clean) return;
        const key = normalizeStoreKey(clean);
        if (!byKey[key]) byKey[key] = {};
        byKey[key][clean] = (byKey[key][clean] || 0) + 1;
      });
    });
    const groups = [];
    Object.values(byKey).forEach((variantCounts) => {
      const variants = Object.entries(variantCounts).map(([name, count]) => ({ name, count }));
      if (variants.length > 1) {
        variants.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        groups.push({ variants, canonical: variants[0].name });
      }
    });
    return groups;
  }, [products]);

  const [merging, setMerging] = useState(false);

  async function mergeGroup(group) {
    setMerging(true);
    setError('');
    const canonical = group.canonical;
    const otherNames = group.variants.map((v) => v.name).filter((n) => n !== canonical);
    try {
      const affected = products.filter((p) => (p.activeStores || []).some((s) => otherNames.includes((s || '').trim())));
      const updated = await Promise.all(affected.map((p) => {
        const nextActive = Array.from(new Set((p.activeStores || []).map((s) => {
          const clean = (s || '').trim();
          return otherNames.includes(clean) ? canonical : clean;
        })));
        return Products.update(p.id, { ...p, activeStores: nextActive });
      }));
      setProducts((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));
      if (!records.some((r) => (r.store || '').trim() === canonical)) {
        const rec = await StoreEquipment.create({ store: canonical, fridgeNo: '', picoNo: '' });
        setRecords((prev) => [...prev, rec]);
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setMerging(false);
    }
  }

  async function mergeAllGroups() {
    for (const group of duplicateGroups) {
      // eslint-disable-next-line no-await-in-loop
      await mergeGroup(group);
    }
  }

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

  // Το νέο (κενό) κατάστημα μπορεί να μην καταλήξει στο τέλος της λίστας μετά την ταξινόμηση
  // (π.χ. ένα κενό όνομα ταξινομείται πρώτο) — γι' αυτό ψάχνουμε το πραγματικό του index
  // στο filtered ΑΦΟΥ ενημερωθεί, αντί να μαντεύουμε τη θέση του εκ των προτέρων.
  const [pendingFocusId, setPendingFocusId] = useState(null);
  useEffect(() => {
    if (pendingFocusId == null) return;
    const idx = filtered.findIndex((r) => r.id === pendingFocusId);
    if (idx >= 0) {
      setCardIndex(idx);
      setPendingFocusId(null);
    }
  }, [filtered, pendingFocusId]);

  async function handleCreate() {
    try {
      const record = await StoreEquipment.create({ store: '', fridgeNo: '', picoNo: '' });
      setRecords((prev) => [...prev, record]);
      setSearch(''); // αλλιώς το νέο (άδειο) κατάστημα μπορεί να φιλτραριστεί εκτός λίστας
      setViewMode('card');
      setPendingFocusId(record.id);
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
      <datalist id="qf-store-datalist">
        {storeOptions.map((s) => <option key={s} value={s} />)}
      </datalist>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#fdecea', color: '#c0392b', border: '1px solid #f3c1bb', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} style={{ border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}
        {!readOnly && duplicateGroups.length > 0 && (
          <div style={{ background: '#fff8e8', border: '1px solid #eddca6', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <strong style={{ fontSize: 13, color: '#8a6116' }}>{t('se_merge_title')}</strong>
              {duplicateGroups.length > 1 && (
                <button className="btn-primary" disabled={merging} onClick={mergeAllGroups} style={{ padding: '5px 12px', fontSize: 12 }}>
                  {t('se_merge_apply_all')}
                </button>
              )}
            </div>
            <p style={{ fontSize: 12, color: '#8a6116', margin: '0 0 12px' }}>{t('se_merge_desc')}</p>
            {duplicateGroups.map((group) => (
              <div key={group.canonical} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #f0e3bb' }}>
                <div style={{ fontSize: 13 }}>
                  {group.variants.map((v, i) => (
                    <span key={v.name}>
                      {i > 0 && ' / '}
                      <span style={{ fontWeight: v.name === group.canonical ? 700 : 400 }}>{v.name}</span>
                      <span style={{ color: '#97a2b0', fontSize: 11 }}> ({v.count})</span>
                    </span>
                  ))}
                  <span style={{ color: '#6b7684', fontSize: 12 }}> → <strong>{group.canonical}</strong></span>
                </div>
                <button className="btn-primary" disabled={merging} onClick={() => mergeGroup(group)} style={{ padding: '5px 12px', fontSize: 12 }}>
                  {t('se_merge_button')}
                </button>
              </div>
            ))}
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
                          <input
                            list="qf-store-datalist"
                            value={r.store || ''}
                            placeholder={t('se_store_input_placeholder')}
                            onChange={(e) => handleFieldChange(r.id, 'store', e.target.value)}
                            onBlur={(e) => handleFieldChange(r.id, 'store', e.target.value.trim())}
                            style={{ width: '100%', border: '1px solid #e1e5ea', borderRadius: 6, padding: '5px 6px', fontSize: 13 }}
                          />
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
                      <input
                        list="qf-store-datalist"
                        disabled={readOnly}
                        value={current.store || ''}
                        placeholder={t('se_store_input_placeholder')}
                        onChange={(e) => handleFieldChange(current.id, 'store', e.target.value)}
                        onBlur={(e) => handleFieldChange(current.id, 'store', e.target.value.trim())}
                      />
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
