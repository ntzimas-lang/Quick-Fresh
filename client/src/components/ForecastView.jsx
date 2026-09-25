import React, { useEffect, useMemo, useState } from 'react';
import { Products, SalesProducts } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

// Πρόβλεψη Αποθέματος — "σε πόσες μέρες θα ξεμείνεις από το X προϊόν" βάσει της
// πραγματικής ταχύτητας πώλησης (τεμ/ημέρα) του πιο πρόσφατου Sales Analysis Report
// ανά κατάστημα, συγκρίνοντας με το Max Stock (πόσα τεμάχια χωράει το μηχάνημα όταν
// αναπληρωθεί πλήρως) που είναι ήδη καταχωρημένο στο κάθε προϊόν (Προϊόντα → Cost).
//
// ΣΗΜΑΝΤΙΚΟ περιορισμός: η εφαρμογή ΔΕΝ έχει live μέτρηση πραγματικού αποθέματος μέσα
// στο μηχάνημα αυτή τη στιγμή — άρα η "μέρα εξάντλησης" υποθέτει ότι το μηχάνημα ήταν
// γεμάτο στο Max Stock την τελευταία φορά που αναπληρώθηκε και μετράει από εκεί με
// σταθερό ρυθμό. Είναι μια ΕΚΤΙΜΗΣΗ βάσει ιστορικού ρυθμού, όχι πραγματικό τρέχον απόθεμα.
function extractPeriodRange(label) {
  const matches = [...String(label || '').matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (!matches.length) return null;
  const first = matches[0];
  const last = matches[matches.length - 1];
  const start = new Date(`${first[3]}-${first[2]}-${first[1]}`);
  const end = new Date(`${last[3]}-${last[2]}-${last[1]}`);
  return { start, end };
}

function daysBetweenInclusive(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export default function ForecastView() {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [salesProducts, setSalesProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('days');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    setLoading(true);
    Promise.all([Products.list(), SalesProducts.list()])
      .then(([p, sp]) => { setProducts(p); setSalesProducts(sp); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }, []);

  const rows = useMemo(() => {
    if (!products.length || !salesProducts.length) return [];

    // Μόνο το πιο πρόσφατο upload (batch) ανά κατάστημα — τα Sales Analysis Reports
    // είναι σωρευτικά, οπότε παλιότερα batches θα διπλομετρούσαν την ίδια περίοδο.
    const latestBatchByStore = {};
    salesProducts.forEach((p) => {
      const cur = latestBatchByStore[p.store];
      if (!cur || new Date(p.uploadedAt) > new Date(cur)) latestBatchByStore[p.store] = p.uploadedAt;
    });
    const currentSales = salesProducts.filter((p) => p.uploadedAt === latestBatchByStore[p.store]);

    // Ομαδοποίηση ανά κατάστημα + itemCode: μέρες "ενεργές" (μέσα στο period του
    // report όπου sold>0) και σύνολο πωλήσεων, για να βγει ρυθμός τεμ/ημέρα.
    const groups = {}; // key = store|itemCode -> { store, itemCode, name, activeDays:Set, sold }
    currentSales.forEach((p) => {
      if (!(p.sold > 0) || !p.itemCode) return;
      const range = extractPeriodRange(p.periodLabel);
      if (!range) return;
      const key = `${p.store}|${p.itemCode}`;
      if (!groups[key]) groups[key] = { store: p.store, itemCode: p.itemCode, name: p.productName || '', activeDays: new Set(), sold: 0 };
      groups[key].sold += p.sold || 0;
      groups[key].name = groups[key].name || p.productName || '';
      const cursor = new Date(range.start);
      while (cursor <= range.end) {
        groups[key].activeDays.add(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    const productByItemCode = {};
    products.forEach((pr) => {
      if (pr.itemCode) productByItemCode[pr.itemCode.trim()] = pr;
    });

    const out = [];
    Object.values(groups).forEach((g) => {
      const activeDays = g.activeDays.size;
      const rate = activeDays ? g.sold / activeDays : 0;
      if (!(rate > 0)) return;
      const product = productByItemCode[(g.itemCode || '').trim()];
      const maxStock = product && Number.isFinite(Number(product.maxStock)) && Number(product.maxStock) > 0 ? Number(product.maxStock) : null;
      const minStock = product && Number.isFinite(Number(product.minStock)) ? Number(product.minStock) : null;
      if (maxStock === null) return; // χωρίς Max Stock δεν μπορούμε να εκτιμήσουμε μέρες
      const usable = minStock !== null && minStock >= 0 && minStock < maxStock ? maxStock - minStock : maxStock;
      const days = usable / rate;
      out.push({
        key: `${g.store}|${g.itemCode}`,
        store: g.store,
        itemCode: g.itemCode,
        name: (product && (product.descriptionErp || product.descriptionGr)) || g.name || '—',
        rate,
        maxStock,
        minStock,
        days
      });
    });
    return out;
  }, [products, salesProducts]);

  const storeOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.store).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'el')), [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (storeFilter !== 'all') list = list.filter((r) => r.store === storeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.itemCode.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.store.toLowerCase().includes(q));
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rows, storeFilter, search, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function urgencyColor(days) {
    if (days <= 3) return '#c0392b';
    if (days <= 7) return '#c98a1f';
    return '#2f8f8a';
  }

  const columns = [
    { key: 'itemCode', label: t('fc_col_itemCode') },
    { key: 'name', label: t('fc_col_name') },
    { key: 'store', label: t('fc_col_store') },
    { key: 'rate', label: t('fc_col_rate') },
    { key: 'maxStock', label: t('fc_col_maxStock') },
    { key: 'minStock', label: t('fc_col_minStock') },
    { key: 'days', label: t('fc_col_days') }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{t('nav_forecast')}</strong>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('fc_search_placeholder')}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13, width: 220 }}
        />
        <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13 }}>
          <option value="all">{t('r_all_stores')}</option>
          {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        <p style={{ color: '#6b7684', fontSize: 12.5, margin: '0 0 14px' }}>{t('fc_hint')}</p>
        {loading ? (
          <p style={{ color: '#97a2b0' }}>{t('d_loading')}</p>
        ) : error ? (
          <p style={{ color: '#c0392b' }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#97a2b0' }}>{t('fc_no_results')}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    title={t('common_sort_hint')}
                    style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  >
                    {col.label}
                    {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.key} style={{ borderTop: '1px solid #eef1f4' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.itemCode}</td>
                  <td style={{ padding: '10px 12px', color: '#3a4353' }}>{r.name}</td>
                  <td style={{ padding: '10px 12px' }}>{r.store}</td>
                  <td style={{ padding: '10px 12px' }}>{r.rate.toFixed(1)}</td>
                  <td style={{ padding: '10px 12px' }}>{r.maxStock}</td>
                  <td style={{ padding: '10px 12px' }}>{r.minStock ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: urgencyColor(r.days) }}>
                    {r.days < 1 ? '<1' : Math.round(r.days)} {t('fc_days_abbr')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
