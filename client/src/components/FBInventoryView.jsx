import React, { useEffect, useMemo, useState } from 'react';
import { FBInventory, Products, Entries, Destructions, SalesProducts, SalesDaily } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const MONTH_LABELS_EL = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const MONTH_LABELS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

export default function FBInventoryView({ readOnly = false, active = true }) {
  const { t, lang } = useLanguage();
  const [hasActivated, setHasActivated] = useState(active);
  useEffect(() => { if (active) setHasActivated(true); }, [active]);

  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [destructions, setDestructions] = useState([]);
  const [salesProducts, setSalesProducts] = useState([]);
  const [salesDaily, setSalesDaily] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Το modal "Απογραφή" (Έναρξης ή Λήξης) για συγκεκριμένο μήνα — κανονική απογραφή ανά
  // προϊόν (ποσότητα), όχι ένα χειροκίνητο ποσό σε €. { monthKey, type: 'opening'|'closing' }
  const [countModal, setCountModal] = useState(null);
  const [countQuantities, setCountQuantities] = useState({}); // itemCode -> κείμενο ποσότητας
  const [countSearch, setCountSearch] = useState('');
  const [savingCount, setSavingCount] = useState(false);

  // Εναλλακτικός τρόπος καταχώρησης Απογραφής: ένα χειροκίνητο ΣΥΝΟΛΙΚΟ ποσό σε €, αντί για
  // ανάλυση ανά προϊόν. amountEditing = { monthKey, type } όταν είναι ενεργό το inline πεδίο.
  const [amountEditing, setAmountEditing] = useState(null);
  const [amountDrafts, setAmountDrafts] = useState({}); // `${monthKey}|${type}` -> κείμενο ποσού

  useEffect(() => {
    if (!hasActivated) return;
    Promise.all([FBInventory.list(), Products.list(), Entries.list(), Destructions.list(), SalesProducts.list(), SalesDaily.list()])
      .then(([fb, prods, ent, destr, sp, sd]) => {
        setRecords(fb);
        setProducts(prods);
        setEntries(ent);
        setDestructions(destr);
        setSalesProducts(sp);
        setSalesDaily(sd);
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
  // (Απογραφή/Παραλαβές/Καταστροφές) σε αξία €.
  const ptkByItemCode = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const code = (p.itemCode || '').trim();
      if (code) map.set(code, Number(p.cost?.ptk) || 0);
    });
    return map;
  }, [products]);

  function countsValue(counts) {
    if (!Array.isArray(counts) || !counts.length) return 0;
    return counts.reduce((sum, c) => sum + (Number(c.quantity) || 0) * (ptkByItemCode.get((c.itemCode || '').trim()) || 0), 0);
  }

  // Η Απογραφή Έναρξης/Λήξης έχει 2 δυνατούς τρόπους καταχώρησης — 'counts' (ανά προϊόν,
  // αυτόματος υπολογισμός αξίας) ή 'amount' (ένα χειροκίνητο ποσό σε €). Επιστρέφει ποιος
  // από τους δύο είναι ο "ενεργός" γι' αυτή τη γραμμή/στήλη, και την τρέχουσα αξία σε €.
  function getInventoryValue(rec, type) {
    if (!rec) return { mode: null, value: null };
    const storedMode = type === 'opening' ? rec.openingMode : rec.closingMode;
    const counts = type === 'opening' ? rec.openingCounts : rec.closingCounts;
    const amount = type === 'opening' ? rec.openingValue : rec.closingValue;
    const hasCounts = Array.isArray(counts) && counts.length > 0;
    const hasAmount = amount !== null && amount !== undefined;
    const mode = storedMode === 'amount' || storedMode === 'counts' ? storedMode : (hasCounts ? 'counts' : (hasAmount ? 'amount' : null));
    if (mode === 'amount') return { mode: 'amount', value: hasAmount ? Number(amount) : null };
    if (mode === 'counts') return { mode: 'counts', value: hasCounts ? countsValue(counts) : null };
    return { mode: null, value: null };
  }

  // Προϊόντα του επιλεγμένου καταστήματος (Cost tab → Κατάστημα) — αυτά εμφανίζονται στο
  // modal Απογραφής. Αν δεν έχει οριστεί κανένα προϊόν σε αυτό το κατάστημα ακόμα, δείχνουμε
  // όλα τα προϊόντα (fallback), ώστε το εργαλείο να μη μένει ποτέ άδειο.
  const productsForStore = useMemo(() => {
    const matched = products.filter((p) => (p.stores || []).some((s) => (s && s.name ? s.name.trim() : '') === selectedStore));
    const base = matched.length > 0 ? matched : products;
    return [...base].sort((a, b) => (a.descriptionGr || '').localeCompare(b.descriptionGr || '', 'el'));
  }, [products, selectedStore]);

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

  // --- Πωλήσεις (καθαρός τζίρος, €) ανά μήνα — 2 πηγές, προτεραιότητα στην ΑΚΡΙΒΗ -------
  // 1) sales_daily ("Ημερήσιες Πωλήσεις"): ΠΡΑΓΜΑΤΙΚΟ άθροισμα ανά ημέρα (ένα upload =
  //    ένα πραγματικό σύνολο για τη συγκεκριμένη ημέρα) — ακριβές, αλλά μόνο για τις
  //    ημέρες που όντως έχουν ανέβει. Ίδια πηγή/λογική με το "Στοιχεία ανά Μήνα" (Καθαρές
  //    Πωλήσεις) του Πίνακα Ελέγχου, ώστε τα δύο σημεία να ΣΥΜΦΩΝΟΥΝ.
  // 2) sales_products ("Sales Analysis Report"): δίνει ΕΝΑ σωρευτικό σύνολο για ολόκληρη
  //    την περίοδο εξαγωγής (π.χ. πολλούς μήνες μαζί) — το καταμερίζουμε αναλογικά ανά
  //    ημέρα (proration), οπότε είναι μια ΕΚΤΙΜΗΣΗ, όχι πραγματικό ανά-μήνα ποσό. Την
  //    χρησιμοποιούμε ΜΟΝΟ σαν fallback, για μήνες που δεν έχουν καθόλου δεδομένα
  //    sales_daily — για να μη μείνει ποτέ ένας μήνας εντελώς κενός.
  const salesDailyRevenueByMonth = useMemo(() => {
    const out = {};
    salesDaily.forEach((r) => {
      if ((r.store || '').trim() !== selectedStore) return;
      if (!r.date) return;
      const mk = String(r.date).slice(0, 7);
      out[mk] = (out[mk] || 0) + (Number(r.netSales) || 0);
    });
    return out;
  }, [salesDaily, selectedStore]);

  const salesRevenueEstimateByMonth = useMemo(() => {
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

  // Συνδυασμός των δύο πηγών: προτεραιότητα στο ΑΚΡΙΒΕΣ sales_daily· fallback στην
  // ΕΚΤΙΜΗΣΗ (proration) μόνο για μήνες που δεν έχουν καθόλου daily δεδομένα.
  function getSalesForMonth(mk) {
    const exact = salesDailyRevenueByMonth[mk];
    if (exact !== undefined) return { revenue: exact, isEstimate: false };
    return { revenue: salesRevenueEstimateByMonth[mk] || 0, isEstimate: true };
  }

  // records για το επιλεγμένο κατάστημα, ανά μήνα (Απογραφή Έναρξης/Λήξης)
  const recordsByMonth = useMemo(() => {
    const map = {};
    records.forEach((r) => {
      if ((r.store || '').trim() !== selectedStore) return;
      map[r.monthKey] = r;
    });
    return map;
  }, [records, selectedStore]);

  // --- Καταστροφές (€) ανά μήνα — ΧΕΙΡΟΚΙΝΗΤΕΣ καταχωρήσεις μέσα από το F&B (π.χ. σπάσιμο,
  // αλλοίωση κ.λπ. που δεν πέρασαν από το κανονικό σκανάρισμα προϊόντος στις Καταστροφές).
  // Προστίθενται ΠΑΝΩ στις αυτόματες Καταστροφές παραπάνω, δεν τις αντικαθιστούν.
  const manualDestructionsByMonth = useMemo(() => {
    const out = {};
    Object.entries(recordsByMonth).forEach(([mk, rec]) => {
      const v = countsValue(rec.manualDestructionsCounts);
      if (v) out[mk] = v;
    });
    return out;
  }, [recordsByMonth, ptkByItemCode]);

  // Έτη προς επιλογή: τρέχον έτος ± 1 ∪ οποιοδήποτε έτος έχει ήδη δεδομένα (απογραφή,
  // παραλαβές, καταστροφές, πωλήσεις) για το κατάστημα — ώστε να μη λείπει ποτέ ένα έτος
  // που όντως έχει καταχωρήσεις, ακόμα κι αν είναι παλιότερο.
  const availableYears = useMemo(() => {
    const set = new Set();
    const nowYear = new Date().getFullYear();
    set.add(nowYear - 1);
    set.add(nowYear);
    set.add(nowYear + 1);
    const addYearsFrom = (obj) => Object.keys(obj).forEach((mk) => set.add(Number(mk.slice(0, 4))));
    addYearsFrom(recordsByMonth);
    addYearsFrom(receiptsByMonth);
    addYearsFrom(destructionsByMonth);
    addYearsFrom(salesRevenueEstimateByMonth);
    addYearsFrom(salesDailyRevenueByMonth);
    return Array.from(set).sort((a, b) => b - a);
  }, [recordsByMonth, receiptsByMonth, destructionsByMonth, salesRevenueEstimateByMonth, salesDailyRevenueByMonth]);

  // Μήνες προς εμφάνιση: ΟΛΟΙ οι 12 μήνες του επιλεγμένου έτους, με τη σωστή ημερολογιακή
  // σειρά (Ιανουάριος → Δεκέμβριος).
  const monthKeys = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`);
  }, [selectedYear]);

  function openCountModal(monthKey, type) {
    const rec = recordsByMonth[monthKey];
    const existing = (rec && (
      type === 'opening' ? rec.openingCounts :
      type === 'closing' ? rec.closingCounts :
      rec.manualDestructionsCounts
    )) || [];
    const seed = {};
    existing.forEach((c) => { seed[(c.itemCode || '').trim()] = String(c.quantity).replace('.', ','); });
    setCountQuantities(seed);
    setCountSearch('');
    setCountModal({ monthKey, type });
  }

  function closeCountModal() {
    setCountModal(null);
    setCountQuantities({});
    setCountSearch('');
  }

  const countModalTotal = useMemo(() => {
    if (!countModal) return 0;
    let total = 0;
    Object.entries(countQuantities).forEach(([code, qtyStr]) => {
      const qty = Number(String(qtyStr).replace(',', '.')) || 0;
      if (!qty) return;
      total += qty * (ptkByItemCode.get(code) || 0);
    });
    return total;
  }, [countQuantities, ptkByItemCode, countModal]);

  async function saveCountModal() {
    if (!countModal) return;
    const { monthKey, type } = countModal;
    const counts = Object.entries(countQuantities)
      .map(([itemCode, qtyStr]) => ({ itemCode, quantity: Number(String(qtyStr).replace(',', '.')) || 0 }))
      .filter((c) => c.quantity !== 0);
    const rowId = `${monthKey}|${selectedStore}`;
    const existing = recordsByMonth[monthKey];
    const body = {
      store: selectedStore,
      monthKey,
      openingMode: existing ? existing.openingMode : null,
      openingCounts: existing ? existing.openingCounts : [],
      openingValue: existing ? existing.openingValue : null,
      closingMode: existing ? existing.closingMode : null,
      closingCounts: existing ? existing.closingCounts : [],
      closingValue: existing ? existing.closingValue : null,
      manualDestructionsCounts: existing ? existing.manualDestructionsCounts : []
    };
    if (type === 'destructions') {
      body.manualDestructionsCounts = counts;
    } else {
      body[type === 'opening' ? 'openingMode' : 'closingMode'] = 'counts';
      body[type === 'opening' ? 'openingCounts' : 'closingCounts'] = counts;
    }
    setSavingCount(true);
    try {
      const saved = await FBInventory.upsert(body);
      setRecords((prev) => {
        const others = prev.filter((r) => r.id !== rowId);
        return [...others, saved];
      });
      closeCountModal();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSavingCount(false);
    }
  }

  // --- Εναλλακτικός τρόπος: χειροκίνητο ΣΥΝΟΛΙΚΟ ποσό σε € (αντί για ανά προϊόν) ---
  function getAmountDraft(monthKey, type, fallback) {
    const key = `${monthKey}|${type}`;
    if (amountDrafts[key] !== undefined) return amountDrafts[key];
    return fallback === null || fallback === undefined ? '' : String(fallback).replace('.', ',');
  }
  function setAmountDraft(monthKey, type, value) {
    const key = `${monthKey}|${type}`;
    setAmountDrafts((d) => ({ ...d, [key]: value }));
  }

  async function saveAmount(monthKey, type, rawValue) {
    const cleaned = String(rawValue).replace(',', '.').trim();
    const num = cleaned === '' ? null : Number(cleaned);
    const rowId = `${monthKey}|${selectedStore}`;
    const existing = recordsByMonth[monthKey];
    const body = {
      store: selectedStore,
      monthKey,
      openingMode: existing ? existing.openingMode : null,
      openingCounts: existing ? existing.openingCounts : [],
      openingValue: existing ? existing.openingValue : null,
      closingMode: existing ? existing.closingMode : null,
      closingCounts: existing ? existing.closingCounts : [],
      closingValue: existing ? existing.closingValue : null,
      manualDestructionsCounts: existing ? existing.manualDestructionsCounts : [],
      [type === 'opening' ? 'openingMode' : 'closingMode']: 'amount',
      [type === 'opening' ? 'openingValue' : 'closingValue']: num
    };
    try {
      const saved = await FBInventory.upsert(body);
      setRecords((prev) => {
        const others = prev.filter((r) => r.id !== rowId);
        return [...others, saved];
      });
      const key = `${monthKey}|${type}`;
      setAmountDrafts((d) => { const next = { ...d }; delete next[key]; return next; });
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  // Ενιαίο rendering για τα κελιά Απογραφής Έναρξης/Λήξης — δείχνει την τρέχουσα αξία
  // (όποιος τρόπος καταχώρησης είναι ενεργός) και δύο μικρά κουμπιά για να διαλέξεις/
  // αλλάξεις τρόπο ανά πάσα στιγμή: 📋 (ανά προϊόν) ή € (ένα συνολικό ποσό).
  function renderInventoryCell(mk, type) {
    const rec = recordsByMonth[mk];
    const { mode, value } = getInventoryValue(rec, type);
    const isEditingAmount = amountEditing && amountEditing.monthKey === mk && amountEditing.type === type;
    const existingAmount = rec ? (type === 'opening' ? rec.openingValue : rec.closingValue) : null;

    if (isEditingAmount) {
      return (
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          disabled={readOnly}
          placeholder={t('fb_amount_placeholder')}
          value={getAmountDraft(mk, type, existingAmount)}
          onChange={(e) => setAmountDraft(mk, type, e.target.value)}
          onBlur={(e) => { saveAmount(mk, type, e.target.value); setAmountEditing(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #d7dce3', fontSize: 12.5, textAlign: 'center' }}
        />
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <div style={{ fontWeight: 600, color: value !== null ? '#16233f' : '#97a2b0' }}>{value !== null ? fmtEuro(value) : '—'}</div>
        {mode && <div style={{ fontSize: 9, color: '#97a2b0' }}>{mode === 'counts' ? t('fb_mode_counts_label') : t('fb_mode_amount_label')}</div>}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" onClick={() => openCountModal(mk, type)} title={t('fb_count_button_edit')} style={smallModeButtonStyle}>📋</button>
            <button type="button" onClick={() => setAmountEditing({ monthKey: mk, type })} title={t('fb_amount_button_edit')} style={smallModeButtonStyle}>€</button>
          </div>
        )}
      </div>
    );
  }

  const countModalProducts = useMemo(() => {
    if (!countModal) return [];
    const q = countSearch.trim().toLowerCase();
    if (!q) return productsForStore;
    return productsForStore.filter((p) =>
      (p.descriptionGr || '').toLowerCase().includes(q) ||
      (p.itemCode || '').toLowerCase().includes(q) ||
      (p.categoryGr || '').toLowerCase().includes(q)
    );
  }, [countModal, countSearch, productsForStore]);

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
        <label style={{ fontSize: 13, fontWeight: 600, color: '#16233f', marginLeft: 10 }}>{t('fb_year_select_label')}</label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d7dce3', fontSize: 13, minWidth: 110 }}
        >
          {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {!selectedStore ? (
        <p style={{ color: '#97a2b0', fontSize: 13 }}>{t('fb_no_store_selected')}</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, overflow: 'hidden' }}>
          {/* Μία ΓΡΑΜΜΗ ανά μήνα (κάθετα, πιο πρόσφατος πρώτος) — πιο φυσικό για ανάγνωση
              παρά μήνες σε στήλες. */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: '#f4f6f8', textAlign: 'left' }}>
                  <th style={thStyle}>{t('fb_col_month')}</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>{t('fb_col_opening')}</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>{t('fb_col_receipts')}</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>{t('fb_col_destructions')}</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>{t('fb_col_sales')}</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>{t('fb_col_closing')}</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>{t('fb_col_cost_of_sales')}</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>{t('fb_col_fc_pct')}</th>
                </tr>
              </thead>
              <tbody>
                {monthKeys.map((mk) => {
                  const rec = recordsByMonth[mk];
                  const openingInfo = getInventoryValue(rec, 'opening');
                  const closingInfo = getInventoryValue(rec, 'closing');
                  const canCompute = openingInfo.value !== null && closingInfo.value !== null;
                  const receipts = receiptsByMonth[mk] || 0;
                  const destrAuto = destructionsByMonth[mk] || 0;
                  const destrManual = manualDestructionsByMonth[mk] || 0;
                  const destr = destrAuto + destrManual;
                  const { revenue, isEstimate } = getSalesForMonth(mk);
                  const costOfSales = canCompute ? (openingInfo.value || 0) + receipts - destr - (closingInfo.value || 0) : null;
                  const fcPct = canCompute && revenue > 0 ? (costOfSales / revenue) * 100 : null;
                  return (
                    <tr key={mk} style={{ borderTop: '1px solid #eef0f3' }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#16233f' }}>{monthLabel(mk, lang)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{renderInventoryCell(mk, 'opening')}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{fmtEuro(receipts)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <div>{fmtEuro(destr)}</div>
                          {destrManual > 0 && (
                            <div style={{ fontSize: 9, color: '#97a2b0' }}>{t('fb_destructions_manual_included_label')} {fmtEuro(destrManual)}</div>
                          )}
                          {!readOnly && (
                            <button type="button" onClick={() => openCountModal(mk, 'destructions')} title={t('fb_destructions_manual_button')} style={smallModeButtonStyle}>📋 +</button>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {fmtEuro(revenue)}
                        {revenue === 0 && <div style={{ fontSize: 9.5, color: '#c0392b', marginTop: 2 }}>{t('fb_no_sales_hint')}</div>}
                        {revenue !== 0 && isEstimate && <div style={{ fontSize: 9.5, color: '#e0a500', marginTop: 2 }}>{t('fb_sales_estimate_hint')}</div>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{renderInventoryCell(mk, 'closing')}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{costOfSales !== null ? fmtEuro(costOfSales) : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: fcPct !== null ? (fcPct <= 35 ? '#27ae60' : fcPct <= 45 ? '#e0a500' : '#c0392b') : '#97a2b0' }}>
                        {fcPct !== null ? fcPct.toFixed(1) + '%' : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- Modal Απογραφής (κανονική απογραφή ανά προϊόν) --- */}
      {countModal && (
        <div style={overlayStyle} onClick={closeCountModal}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#16233f' }}>
                {countModal.type === 'opening' ? t('fb_col_opening') : countModal.type === 'closing' ? t('fb_col_closing') : t('fb_col_destructions')} — {selectedStore} — {monthLabel(countModal.monthKey, lang)}
              </h3>
              <button type="button" onClick={closeCountModal} style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#97a2b0' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: '#97a2b0', margin: '0 0 10px' }}>{countModal.type === 'destructions' ? t('fb_destructions_count_hint') : t('fb_count_hint')}</p>
            <input
              type="text"
              placeholder={t('fb_count_search_placeholder')}
              value={countSearch}
              onChange={(e) => setCountSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #d7dce3', fontSize: 13, marginBottom: 10 }}
            />
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eef0f3', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#f4f6f8', textAlign: 'left', position: 'sticky', top: 0 }}>
                    <th style={{ ...thStyle, padding: '8px 10px' }}>{t('fb_count_col_code')}</th>
                    <th style={{ ...thStyle, padding: '8px 10px' }}>{t('fb_count_col_desc')}</th>
                    <th style={{ ...thStyle, padding: '8px 10px', textAlign: 'right' }}>{t('fb_count_col_ptk')}</th>
                    <th style={{ ...thStyle, padding: '8px 10px', textAlign: 'center' }}>{t('fb_count_col_qty')}</th>
                    <th style={{ ...thStyle, padding: '8px 10px', textAlign: 'right' }}>{t('fb_count_col_value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {countModalProducts.map((p) => {
                    const code = (p.itemCode || '').trim();
                    const ptk = Number(p.cost?.ptk) || 0;
                    const qtyStr = countQuantities[code] !== undefined ? countQuantities[code] : '';
                    const qty = Number(String(qtyStr).replace(',', '.')) || 0;
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid #f4f6f8' }}>
                        <td style={{ padding: '6px 10px', color: '#6b7684' }}>{code || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{p.descriptionGr || '—'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#6b7684' }}>{fmtEuro(ptk)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={qtyStr}
                            onChange={(e) => setCountQuantities((d) => ({ ...d, [code]: e.target.value }))}
                            style={{ width: 70, padding: '5px 6px', borderRadius: 6, border: '1px solid #d7dce3', fontSize: 12.5, textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{qty ? fmtEuro(qty * ptk) : '—'}</td>
                      </tr>
                    );
                  })}
                  {countModalProducts.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#97a2b0' }}>{t('fb_count_no_products_hint')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #eef0f3' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16233f' }}>{t('fb_count_total_label')}: {fmtEuro(countModalTotal)}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-secondary" onClick={closeCountModal} disabled={savingCount}>{t('fb_count_cancel')}</button>
                <button type="button" className="btn-primary" onClick={saveCountModal} disabled={savingCount}>
                  {savingCount ? '...' : t('fb_count_save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: '10px 12px', fontSize: 11.5, color: '#6b7684', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' };
const tdStyle = { padding: '8px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const stickyColStyle = { position: 'sticky', left: 0, boxShadow: '1px 0 0 #eef0f3' };
const countButtonStyle = { border: '1px solid #d7dce3', background: '#f9fafb', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600, color: '#16233f', whiteSpace: 'nowrap' };
const smallModeButtonStyle = { border: '1px solid #d7dce3', background: '#f9fafb', borderRadius: 5, padding: '2px 6px', fontSize: 11, cursor: 'pointer', color: '#6b7684', lineHeight: 1.4 };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 };
const modalStyle = { background: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
