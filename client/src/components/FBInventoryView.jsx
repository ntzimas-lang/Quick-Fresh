import React, { useEffect, useMemo, useState } from 'react';
import { FBInventory, Products, Entries, Destructions, SalesProducts } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const MONTH_LABELS_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(key, lang) {
  const [y, m] = key.split('-');
  const labels = lang === 'en' ? MONTH_LABELS_EN : MONTH_LABELS_EL;
  return `${labels[Number(m) - 1]} ${y}`;
}

function fmtEuro(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// Ίδιο μοτίβο ανάλυσης περιόδου/καταμερισμού (proration) ανά ημερολογιακό μήνα με το
// DashboardView.jsx ("Κέρδος ανά Μήνα") — ώστε τα δύο σημεία της εφαρμογής να συμφωνούν.
// Το Sales Analysis Report δίνει ΕΝΑ σύνολο ανά προϊόν για όλη την περίοδο εξαγωγής (π.χ.
// "01/05/2026 – 25/07/2026") — καταμερίζουμε το netRevenue αναλογικά στους μήνες που
// καλύπτει η περίοδος, με βάση το πλήθος ημερών που πέφτουν σε κάθε μήνα.
function extractPeriodRange(label) {
  const matches = [...String(label || '').matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (!matches.length) return null;
  const first = matches[0];
  const last = matches[matches.length - 1];
  const start = new Date(`${first[3]}-${first[2]}-${first[1]}T00:00:00`);
  const end = new Date(`${last[3]}-${last[2]}-${last[1]}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;
  return { start, end };
}

function daysBetweenInclusive(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

// Παράγει τα τελευταία N μηνιαία κλειδιά (yyyy-mm), το πιο πρόσφατο πρώτο.
function lastMonthKeys(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export default function FBInventoryView({ readOnly = false, active = true }) {
  const { t, lang } = useLanguage();
  const [hasActivated, setHasActivated] = useState(active);
  useEffect(() => { if (active) setHasActivated(true); }, [active]);

  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [destructions, setDestructions] = useState([]);
  const [salesProducts, setSalesProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [showOlder, setShowOlder] = useState(false);
  const [drafts, setDrafts] = useState({}); // rowId -> { openingValue, closingValue } (κείμενο ενώ γράφει ο χρήστης)

  useEffect(() => {
    if (!hasActivated) return;
    Promise.all([FBInventory.list(), Products.list(), Entries.list(), Destructions.list(), SalesProducts.list()])
      .then(([fb, prods, ent, destr, sp]) => {
        setRecords(fb);
        setProducts(prods);
        setEntries(ent);
        setDestructions(destr);
        setSalesProducts(sp);
        setLoading(false);
      })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }, [hasActivated]);

  // Ίδια πηγή αλήθειας για ονόματα καταστημάτων με το StoreEquipmentView.jsx — η λίστα
  // "Κατάστημα" των Προϊόντων → Cost tab.
  const storeOptions = useMemo(() => {
    const set = new Set();
    products.forEach((p) => (p.stores || []).forEach((s) => {
      const clean = (s && s.name ? s.name : '').trim();
      if (clean) set.add(clean);
    }));
    return Array.from(set).sort();
  }, [products]);

  useEffect(() => {
    if (!selectedStore && storeOptions.length > 0) setSelectedStore(storeOptions[0]);
  }, [storeOptions]);

  // ΠΤΚ (κόστος) ανά κωδικό προϊόντος (itemCode) — για να μετατρέψουμε ποσότητες
  // (Παραλαβές/Καταστροφές) σε αξία €.
  const ptkByItemCode = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const code = (p.itemCode || '').trim();
      if (code) map.set(code, Number(p.cost?.ptk) || 0);
    });
    return map;
  }, [products]);

  // --- Παραλαβές (€) ανά μήνα, για το επιλεγμένο κατάστημα -------------------------
  const receiptsByMonth = useMemo(() => {
    const out = {};
    entries.forEach((e) => {
      if ((e.store || '').trim() !== selectedStore) return;
      if (!e.createdAt) return;
      const mk = String(e.createdAt).slice(0, 7);
      const code = (e.productItemCode || '').trim();
      const ptk = ptkByItemCode.get(code) || 0;
      const qty = Number(e.quantity) || 0;
      out[mk] = (out[mk] || 0) + qty * ptk;
    });
    return out;
  }, [entries, selectedStore, ptkByItemCode]);

  // --- Καταστροφές (€) ανά μήνα, για το επιλεγμένο κατάστημα ------------------------
  // Χρησιμοποιούμε το πεδίο "date" (επιλέξιμη ημ. καταστροφής), όχι το createdAt.
  const destructionsByMonth = useMemo(() => {
    const out = {};
    destructions.forEach((d) => {
      if ((d.store || '').trim() !== selectedStore) return;
      const dateStr = d.date || (d.createdAt ? String(d.createdAt).slice(0, 10) : '');
      if (!dateStr) return;
      const mk = dateStr.slice(0, 7);
      const code = (d.productItemCode || '').trim();
      const ptk = ptkByItemCode.get(code) || 0;
      const qty = Number(d.quantity) || 0;
      out[mk] = (out[mk] || 0) + qty * ptk;
    });
    return out;
  }, [destructions, selectedStore, ptkByItemCode]);

  // --- Πωλήσεις (καθαρός τζίρος, €) ανά μήνα, για το επιλεγμένο κατάστημα -----------
  // Κρατάμε μόνο την πιο πρόσφατη ανεβασμένη παρτίδα (batch) ανά κατάστημα — τα Sales
  // Analysis Reports είναι συνήθως σωρευτικά, οπότε παλιότερα batches θα διπλομετρούσαν
  // επικαλυπτόμενες περιόδους. Ίδια λογική με το DashboardView.jsx.
  const salesRevenueByMonth = useMemo(() => {
    const out = {};
    const storeRows = salesProducts.filter((p) => (p.store || '').trim() === selectedStore);
    let latestUploadedAt = null;
    storeRows.forEach((p) => {
      if (!latestUploadedAt || new Date(p.uploadedAt) > new Date(latestUploadedAt)) latestUploadedAt = p.uploadedAt;
    });
    const currentRows = storeRows.filter((p) => p.uploadedAt === latestUploadedAt);
    currentRows.forEach((p) => {
      const range = extractPeriodRange(p.periodLabel);
      if (!range) return;
      const { start, end } = range;
      const totalDays = daysBetweenInclusive(start, end);
      if (totalDays <= 0) return;
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const lastMonthStart = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor <= lastMonthStart) {
        const monthStart = cursor;
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const overlapStart = start > monthStart ? start : monthStart;
        const overlapEnd = end < monthEnd ? end : monthEnd;
        if (overlapStart <= overlapEnd) {
          const overlapDays = daysBetweenInclusive(overlapStart, overlapEnd);
          const weight = overlapDays / totalDays;
          const revenue = (p.netRevenue || 0) * weight;
          const mk = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
          out[mk] = (out[mk] || 0) + revenue;
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    });
    return out;
  }, [salesProducts, selectedStore]);

  // records για το επιλεγμένο κατάστημα, ανά μήνα (Απογραφή Έναρξης/Λήξης χειροκίνητα)
  const recordsByMonth = useMemo(() => {
    const map = {};
    records.forEach((r) => {
      if ((r.store || '').trim() !== selectedStore) return;
      map[r.monthKey] = r;
    });
    return map;
  }, [records, selectedStore]);

  // Μήνες προς εμφάνιση: τελευταίοι 12 ∪ οποιοσδήποτε μήνας έχει ήδη δεδομένα (απογραφή,
  // παραλαβές, καταστροφές, πωλήσεις) για το κατάστημα — ώστε να μη χαθεί τίποτα παλιότερο.
  const monthKeys = useMemo(() => {
    const set = new Set(lastMonthKeys(showOlder ? 24 : 12));
    Object.keys(recordsByMonth).forEach((mk) => set.add(mk));
    Object.keys(receiptsByMonth).forEach((mk) => set.add(mk));
    Object.keys(destructionsByMonth).forEach((mk) => set.add(mk));
    Object.keys(salesRevenueByMonth).forEach((mk) => set.add(mk));
    return Array.from(set).sort().reverse();
  }, [recordsByMonth, receiptsByMonth, destructionsByMonth, salesRevenueByMonth, showOlder]);

  function getDraft(rowId, field, fallback) {
    if (drafts[rowId] && drafts[rowId][field] !== undefined) return drafts[rowId][field];
    return fallback === null || fallback === undefined ? '' : String(fallback).replace('.', ',');
  }

  function setDraft(rowId, field, value) {
    setDrafts((d) => ({ ...d, [rowId]: { ...(d[rowId] || {}), [field]: value } }));
  }

  async function saveField(monthKey, field, rawValue) {
    const cleaned = String(rawValue).replace(',', '.').trim();
    const num = cleaned === '' ? null : Number(cleaned);
    const rowId = `${monthKey}|${selectedStore}`;
    const existing = recordsByMonth[monthKey];
    const body = {
      store: selectedStore,
      monthKey,
      openingValue: existing ? existing.openingValue : null,
      closingValue: existing ? existing.closingValue : null,
      [field]: num
    };
    try {
      const saved = await FBInventory.upsert(body);
      setRecords((prev) => {
        const others = prev.filter((r) => r.id !== rowId);
        return [...others, saved];
      });
      setDrafts((d) => { const next = { ...d }; delete next[rowId]; return next; });
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  if (loading) {
    return <div className="page"><h2>{t('title_fb_inventory')}</h2><p style={{ color: '#97a2b0', fontSize: 13 }}>...</p></div>;
  }

  return (
    <div className="page">
      <h2>{t('title_fb_inventory')}</h2>
      <p style={{ fontSize: 12.5, color: '#6b7684', maxWidth: 820, marginBottom: 16 }}>{t('fb_intro_hint')}</p>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#16233f' }}>{t('fb_store_select_label')}</label>
        <select
          value={selectedStore}
          onChange={(e) => setSelectedStore(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d7dce3', fontSize: 13, minWidth: 260 }}
        >
          {storeOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {!selectedStore ? (
        <p style={{ color: '#97a2b0', fontSize: 13 }}>{t('fb_no_store_selected')}</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: '#f4f6f8', textAlign: 'left' }}>
                  <th style={thStyle}>{t('fb_col_month')}</th>
                  <th style={thStyle}>{t('fb_col_opening')}</th>
                  <th style={thStyle}>{t('fb_col_receipts')}</th>
                  <th style={thStyle}>{t('fb_col_destructions')}</th>
                  <th style={thStyle}>{t('fb_col_sales')}</th>
                  <th style={thStyle}>{t('fb_col_closing')}</th>
                  <th style={thStyle}>{t('fb_col_cost_of_sales')}</th>
                  <th style={thStyle}>{t('fb_col_fc_pct')}</th>
                </tr>
              </thead>
              <tbody>
                {monthKeys.map((mk) => {
                  const rec = recordsByMonth[mk];
                  const rowId = `${mk}|${selectedStore}`;
                  const opening = rec && rec.openingValue !== null && rec.openingValue !== undefined ? Number(rec.openingValue) : null;
                  const closing = rec && rec.closingValue !== null && rec.closingValue !== undefined ? Number(rec.closingValue) : null;
                  const receipts = receiptsByMonth[mk] || 0;
                  const destr = destructionsByMonth[mk] || 0;
                  const revenue = salesRevenueByMonth[mk] || 0;
                  const canCompute = opening !== null && closing !== null;
                  // Κόστος Πωλήσεων = Απογραφή Έναρξης + Παραλαβές − Καταστροφές − Απογραφή Λήξης
                  const costOfSales = canCompute ? opening + receipts - destr - closing : null;
                  const fcPct = canCompute && revenue > 0 ? (costOfSales / revenue) * 100 : null;
                  return (
                    <tr key={mk} style={{ borderTop: '1px solid #eef0f3' }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#16233f' }}>{monthLabel(mk, lang)}</td>
                      <td style={tdStyle}>
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={readOnly}
                          placeholder={t('fb_opening_placeholder')}
                          value={getDraft(rowId, 'openingValue', opening)}
                          onChange={(e) => setDraft(rowId, 'openingValue', e.target.value)}
                          onBlur={(e) => saveField(mk, 'openingValue', e.target.value)}
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>{fmtEuro(receipts)}</td>
                      <td style={tdStyle}>{fmtEuro(destr)}</td>
                      <td style={tdStyle}>
                        {fmtEuro(revenue)}
                        {revenue === 0 && <div style={{ fontSize: 10, color: '#c0392b', marginTop: 2 }}>{t('fb_no_sales_hint')}</div>}
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={readOnly}
                          placeholder={t('fb_closing_placeholder')}
                          value={getDraft(rowId, 'closingValue', closing)}
                          onChange={(e) => setDraft(rowId, 'closingValue', e.target.value)}
                          onBlur={(e) => saveField(mk, 'closingValue', e.target.value)}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{costOfSales !== null ? fmtEuro(costOfSales) : '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: fcPct !== null ? (fcPct <= 35 ? '#27ae60' : fcPct <= 45 ? '#e0a500' : '#c0392b') : '#97a2b0' }}>
                        {fcPct !== null ? fcPct.toFixed(1) + '%' : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!showOlder && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowOlder(true)}>{t('fb_show_older_months')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: '10px 12px', fontSize: 11.5, color: '#6b7684', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' };
const tdStyle = { padding: '8px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const inputStyle = { width: 110, padding: '6px 8px', borderRadius: 6, border: '1px solid #d7dce3', fontSize: 12.5 };
