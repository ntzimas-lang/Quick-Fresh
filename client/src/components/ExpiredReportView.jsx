import React, { useEffect, useMemo, useState } from 'react';
import { Entries, Products, Destructions, SalesProducts } from '../api.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEJAVU_SANS_BASE64 } from '../dejavu-font.js';
import { useLanguage } from '../LanguageContext.jsx';

function daysDiff(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr + 'T00:00:00');
  const diffMs = expiry.getTime() - today.getTime();
  return Math.round(diffMs / 86400000);
}

function diffLabel(diff, t, lang) {
  if (diff < 0) {
    const days = Math.abs(diff);
    if (lang === 'en') return `Expired ${days} day${days === 1 ? '' : 's'} ago`;
    return `Έληξε πριν ${days} ${days === 1 ? 'ημέρα' : 'ημέρες'}`;
  }
  if (diff === 0) return t('r_diff_today');
  if (lang === 'en') return `in ${diff} day${diff === 1 ? '' : 's'}`;
  return `σε ${diff} ${diff === 1 ? 'ημέρα' : 'ημέρες'}`;
}

function diffColor(diff) {
  if (diff <= 0) return '#c0392b';
  if (diff <= 7) return '#c98a1f';
  return '#2f8f8a';
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const REPORT_COLUMNS = [
  { key: 'itemCode', labelKey: 'r_col_itemCode' },
  { key: 'description', labelKey: 'r_col_description' },
  { key: 'store', labelKey: 'r_col_store' },
  { key: 'quantity', labelKey: 'r_col_quantity' },
  { key: 'expiry', labelKey: 'r_col_expiry' },
  { key: 'diff', labelKey: 'r_col_diff' },
  { key: 'createdBy', labelKey: 'r_col_createdBy' }
];

function getRowValue(e, key) {
  if (key === 'itemCode') return e.productItemCode || '';
  if (key === 'description') return e.productDescription || '';
  if (key === 'store') return e.store || '';
  if (key === 'quantity') return e.quantity ?? null;
  if (key === 'expiry') return e.expiryDate || '';
  if (key === 'diff') return daysDiff(e.expiryDate);
  if (key === 'createdBy') return e.enteredByEmail || '';
  return '';
}

export default function ExpiredReportView({ canDelete = false }) {
  const { t, lang } = useLanguage();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [columnFilters, setColumnFilters] = useState({});
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  // Εκτιμώμενο Απόθεμα ανά Κατάστημα — cross-reference με Προϊόντα (barcode) / Πωλήσεις /
  // Καταστροφές, ώστε να δείχνει όχι μόνο "τι έχει καταχωρηθεί" αλλά μια εκτίμηση του τι
  // πραγματικά μένει ακόμα στο σημείο (βλ. συζήτηση: οι πωλήσεις δεν αφαιρούνται αυτόματα
  // από τις καταχωρήσεις Ληγμένα σήμερα).
  const [products, setProducts] = useState([]);
  const [destructions, setDestructions] = useState([]);
  const [salesProducts, setSalesProducts] = useState([]);
  const [showStockReport, setShowStockReport] = useState(false);
  const [stockSearch, setStockSearch] = useState('');

  useEffect(() => {
    Promise.all([Products.list(), Destructions.list(), SalesProducts.list()])
      .then(([p, d, sp]) => { setProducts(p); setDestructions(d); setSalesProducts(sp); })
      .catch(() => {});
  }, []);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function getRowFilterText(e, key) {
    if (key === 'expiry') return formatDate(e.expiryDate);
    if (key === 'diff') return diffLabel(daysDiff(e.expiryDate), t, lang);
    const v = getRowValue(e, key);
    return v === null || v === undefined ? '' : String(v);
  }

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    Entries.list()
      .then((rows) => { setEntries(rows); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }

  async function handleDelete(id) {
    setDeleteError('');
    try {
      await Entries.remove(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setDeleteError(t('r_delete_error_prefix') + ' ' + (err.message || err));
    }
  }

  const storeOptions = useMemo(() => {
    const set = new Set();
    entries.forEach((e) => e.store && set.add(e.store));
    return Array.from(set).sort();
  }, [entries]);

  // Σύνοψη σε τεμάχια (ίδια λογική με τον Πίνακα Ελέγχου) — υπολογίζεται πάντα από
  // όλες τις καταχωρήσεις, όχι μόνο από τις φιλτραρισμένες, ώστε να ταιριάζει με το badge.
  const summary = useMemo(() => {
    let expired = 0, today = 0, soon = 0, total = 0;
    entries.forEach((e) => {
      if (!e.expiryDate) return;
      const q = Number(e.quantity);
      const qty = Number.isFinite(q) && q > 0 ? q : 1;
      const d = daysDiff(e.expiryDate);
      total += qty;
      if (d < 0) expired += qty;
      else if (d === 0) { today += qty; soon += qty; }
      else if (d <= 7) soon += qty;
    });
    return { expired, today, soon, total };
  }, [entries]);

  const filtered = useMemo(() => {
    let rows = entries;
    if (storeFilter !== 'all') rows = rows.filter((e) => e.store === storeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((e) =>
        (e.productItemCode || '').toLowerCase().includes(q) ||
        (e.productDescription || '').toLowerCase().includes(q)
      );
    }
    if (fromDate) rows = rows.filter((e) => e.expiryDate && e.expiryDate >= fromDate);
    if (toDate) rows = rows.filter((e) => e.expiryDate && e.expiryDate <= toDate);
    rows = rows.filter((e) =>
      REPORT_COLUMNS.every((col) => {
        const f = (columnFilters[col.key] || '').trim().toLowerCase();
        if (!f) return true;
        return getRowFilterText(e, col.key).toLowerCase().includes(f);
      })
    );
    const sorted = [...rows];
    if (sortKey) {
      sorted.sort((a, b) => {
        let av = getRowValue(a, sortKey);
        let bv = getRowValue(b, sortKey);
        const aEmpty = av === null || av === undefined || av === '';
        const bEmpty = bv === null || bv === undefined || bv === '';
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        av = String(av).toLowerCase();
        bv = String(bv).toLowerCase();
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      sorted.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    }
    return sorted;
  }, [entries, storeFilter, search, fromDate, toDate, columnFilters, sortKey, sortDir, t, lang]);

  // Μόνο η ΠΙΟ ΠΡΟΣΦΑΤΗ ανεβασμένη περίοδο πωλήσεων ανά κατάστημα (ίδια λογική με τον
  // Πίνακα Ελέγχου) — ώστε να μη μετράμε διπλά παλιότερες περιόδους.
  const latestSalesBatchByStore = useMemo(() => {
    const map = {};
    salesProducts.forEach((p) => {
      const cur = map[p.store];
      if (!cur || new Date(p.uploadedAt) > new Date(cur)) map[p.store] = p.uploadedAt;
    });
    return map;
  }, [salesProducts]);

  const latestSalesProducts = useMemo(
    () => salesProducts.filter((p) => p.uploadedAt === latestSalesBatchByStore[p.store]),
    [salesProducts, latestSalesBatchByStore]
  );

  // Η "Sales Analysis Report" περίοδος (π.χ. "01/05/2026 00:00 to 24/07/2026 23:59")
  // μπορεί να καλύπτει πολύ μεγαλύτερο διάστημα (π.χ. 3 μήνες) από όσο έχουμε ξεκινήσει
  // να καταχωρούμε παραλαβές σε αυτή την εφαρμογή (π.χ. λίγες μέρες). Αν αφαιρούσαμε
  // απευθείας το ΣΥΝΟΛΟ των πωλήσεων 3 μηνών από ενεργές καταχωρήσεις λίγων ημερών, θα
  // έβγαινε πάντα ψευδώς "πουλήθηκε όλο". Γι' αυτό υπολογίζουμε μέση ημερήσια πώληση και
  // την αναλογίζουμε μόνο στις μέρες που πραγματικά επικαλύπτονται με την καταχώρηση.
  function parsePeriod(periodLabel) {
    if (!periodLabel) return null;
    const m = periodLabel.match(/(\d{2})\/(\d{2})\/(\d{4}).*?to.*?(\d{2})\/(\d{2})\/(\d{4})/i);
    if (!m) return null;
    const start = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    const end = new Date(Number(m[6]), Number(m[5]) - 1, Number(m[4]));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
    return { start, end };
  }

  const periodByStore = useMemo(() => {
    const map = {};
    latestSalesProducts.forEach((sp) => {
      if (map[sp.store]) return;
      const period = parsePeriod(sp.periodLabel);
      if (period) map[sp.store] = period;
    });
    return map;
  }, [latestSalesProducts]);

  const destroyedTotals = useMemo(() => {
    const map = {};
    destructions.forEach((d) => {
      if (!d.productId || !d.store) return;
      const key = `${d.productId}|${d.store}`;
      map[key] = (map[key] || 0) + (Number(d.quantity) || 0);
    });
    return map;
  }, [destructions]);

  // Ανά (προϊόν, κατάστημα): άθροισμα ενεργών καταχωρήσεων (ό,τι δεν έχει ακόμα
  // καταστραφεί), πωλήσεις της τελευταίας περιόδου (ταιριασμένες μέσω barcode — τα
  // sales_products δεν έχουν δικό τους productId, μόνο scancode/όνομα από το αρχείο του
  // προμηθευτή) αναλογισμένες στις μέρες που έχουμε ενεργές καταχωρήσεις, και εκτιμώμενο
  // πραγματικό υπόλοιπο = ενεργές − αναλογισμένες πωλήσεις.
  const stockReport = useMemo(() => {
    const groups = {};
    entries.forEach((e) => {
      if (!e.productId || !e.store) return;
      const key = `${e.productId}|${e.store}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          productId: e.productId,
          store: e.store,
          itemCode: e.productItemCode || '',
          description: e.productDescription || '',
          activeQty: 0,
          earliestExpiry: null,
          earliestCreatedAt: null
        };
      }
      const g = groups[key];
      const q = Number(e.quantity);
      g.activeQty += Number.isFinite(q) ? q : 0;
      if (e.expiryDate && (!g.earliestExpiry || e.expiryDate < g.earliestExpiry)) g.earliestExpiry = e.expiryDate;
      if (e.createdAt && (!g.earliestCreatedAt || e.createdAt < g.earliestCreatedAt)) g.earliestCreatedAt = e.createdAt;
    });

    return Object.values(groups).map((g) => {
      const product = products.find((p) => p.id === g.productId);
      let soldRaw = 0;
      let hasSalesData = false;
      if (product) {
        const barcodes = (product.barcodes || []).map((b) => (b || '').trim()).filter(Boolean);
        if (barcodes.length) {
          latestSalesProducts.forEach((sp) => {
            if (sp.store !== g.store) return;
            if (barcodes.includes((sp.scancode || '').trim())) {
              soldRaw += Number(sp.sold) || 0;
              hasSalesData = true;
            }
          });
        }
      }
      const destroyed = destroyedTotals[g.key] || 0;
      const period = periodByStore[g.store];
      let sold = 0;
      let prorated = false;
      if (hasSalesData && period && g.earliestCreatedAt) {
        const trackingStart = new Date(g.earliestCreatedAt);
        const overlapStart = trackingStart > period.start ? trackingStart : period.start;
        const now = new Date();
        const overlapEnd = period.end < now ? period.end : now;
        const periodDays = Math.max(1, (period.end.getTime() - period.start.getTime()) / 86400000);
        const overlapDays = Math.max(0, (overlapEnd.getTime() - overlapStart.getTime()) / 86400000);
        const dailyRate = soldRaw / periodDays;
        sold = Math.round(dailyRate * overlapDays * 10) / 10;
        prorated = true;
      } else if (hasSalesData) {
        // Δεν μπορέσαμε να προσδιορίσουμε την περίοδο (ή δεν έχουμε ακόμα καταχώρηση) —
        // δείχνουμε το σύνολο πωλήσεων μόνο πληροφοριακά, ΔΕΝ το αφαιρούμε από το
        // εκτιμώμενο υπόλοιπο (για να μην εμφανίζεται ψευδώς "πουλήθηκε όλο").
        sold = 0;
      }
      const estimated = g.activeQty - sold;
      return { ...g, soldRaw, sold, hasSalesData, prorated, destroyed, estimated };
    });
  }, [entries, products, latestSalesProducts, destroyedTotals, periodByStore]);

  const stockReportFiltered = useMemo(() => {
    let rows = stockReport;
    if (stockSearch.trim()) {
      const q = stockSearch.trim().toLowerCase();
      rows = rows.filter((r) =>
        (r.itemCode || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.store || '').toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      if (!a.earliestExpiry && !b.earliestExpiry) return 0;
      if (!a.earliestExpiry) return 1;
      if (!b.earliestExpiry) return -1;
      return new Date(a.earliestExpiry) - new Date(b.earliestExpiry);
    });
  }, [stockReport, stockSearch]);

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape' });
    // Ενσωμάτωση γραμματοσειράς Unicode — τα βασικά fonts του jsPDF δεν έχουν ελληνικούς χαρακτήρες.
    doc.addFileToVFS('DejaVuSans.ttf', DEJAVU_SANS_BASE64);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(12);
    doc.text(`Quick & Fresh — ${t('title_expired')}`, 14, 12);
    autoTable(doc, {
      startY: 18,
      head: [[t('r_col_itemCode'), t('r_col_description'), t('r_col_store'), t('r_col_quantity'), t('r_col_expiry'), t('r_col_diff'), t('r_col_createdBy')]],
      body: filtered.map((e) => {
        const diff = daysDiff(e.expiryDate);
        return [
          e.productItemCode || '',
          e.productDescription || '',
          e.store || '',
          e.quantity ?? '',
          formatDate(e.expiryDate),
          diffLabel(diff, t, lang),
          e.enteredByEmail || ''
        ];
      }),
      styles: { fontSize: 8, cellPadding: 2, font: 'DejaVuSans' },
      headStyles: { fillColor: [47, 143, 138], font: 'DejaVuSans' }
    });
    doc.save(`quick-fresh-ligmena-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{t('title_expired')}</strong>
        <button className="btn-primary" style={{ background: '#b23b2e' }} onClick={exportPDF} title={t('common_export_pdf')}>
          PDF
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('r_search_placeholder_specific')}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13, width: 220 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#6b7684' }}>
          {t('r_from_date')}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13 }}
          />
          {fromDate && (
            <button
              type="button"
              onClick={() => setFromDate('')}
              title={t('common_cancel')}
              style={{ border: 'none', background: '#eef1f4', color: '#6b7684', borderRadius: '50%', width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            >✕</button>
          )}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#6b7684' }}>
          {t('r_to_date')}
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13 }}
          />
          {toDate && (
            <button
              type="button"
              onClick={() => setToDate('')}
              title={t('common_cancel')}
              style={{ border: 'none', background: '#eef1f4', color: '#6b7684', borderRadius: '50%', width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            >✕</button>
          )}
        </label>
        <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13 }}>
          <option value="all">{t('r_all_stores')}</option>
          {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '14px 20px', background: '#fff', borderBottom: '1px solid #e1e5ea', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#c0392b' }}>{summary.expired}</div>
            <div style={{ fontSize: 11.5, color: '#6b7684' }}>{t('d_expired_pieces')}</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#e0703a' }}>{summary.today}</div>
            <div style={{ fontSize: 11.5, color: '#6b7684' }}>{t('d_today_pieces')}</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#c98a1f' }}>{summary.soon}</div>
            <div style={{ fontSize: 11.5, color: '#6b7684' }}>{t('d_soon_pieces')}</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#16233f' }}>{summary.total}</div>
            <div style={{ fontSize: 11.5, color: '#6b7684' }}>{t('d_total_pieces')}</div>
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        {deleteError && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#fdecea', color: '#c0392b', border: '1px solid #f3c1bb', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
            <span>{deleteError}</span>
            <button
              type="button"
              onClick={() => setDeleteError('')}
              style={{ border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
            >✕</button>
          </div>
        )}

        <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong style={{ fontSize: 13, color: '#16233f' }}>📦 {t('r_stock_report_title')}</strong>
              <p style={{ fontSize: 12, color: '#97a2b0', margin: '4px 0 0', maxWidth: 640 }}>{t('r_stock_report_desc')}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowStockReport((v) => !v)}
              style={{ border: '1px solid #2f8f8a', background: showStockReport ? '#2f8f8a' : '#fff', color: showStockReport ? '#fff' : '#2f8f8a', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {showStockReport ? t('r_stock_report_hide') : t('r_stock_report_show')}
            </button>
          </div>

          {showStockReport && (
            <div style={{ marginTop: 14, borderTop: '1px solid #eef1f4', paddingTop: 14 }}>
              <input
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder={t('common_filter_placeholder')}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13, width: 220, marginBottom: 12 }}
              />
              {stockReportFiltered.length === 0 ? (
                <p style={{ color: '#97a2b0', fontSize: 13 }}>{t('r_stock_report_empty')}</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11, textTransform: 'uppercase', background: '#f4f6f8' }}>
                        <th style={{ padding: '7px 10px' }}>{t('r_stock_col_store')}</th>
                        <th style={{ padding: '7px 10px' }}>{t('r_stock_col_product')}</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>{t('r_stock_col_active')}</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>{t('r_stock_col_sold')}</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>{t('r_stock_col_destroyed')}</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>{t('r_stock_col_estimated')}</th>
                        <th style={{ padding: '7px 10px' }}>{t('r_stock_col_nearest_expiry')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockReportFiltered.map((r) => {
                        const diff = r.earliestExpiry ? daysDiff(r.earliestExpiry) : null;
                        const risky = r.estimated > 0 && diff !== null && diff <= 7;
                        return (
                          <tr key={r.key} style={{ borderTop: '1px solid #eef1f4', background: risky ? '#fdecea33' : 'transparent' }}>
                            <td style={{ padding: '7px 10px' }}>{r.store}</td>
                            <td style={{ padding: '7px 10px' }}>
                              <strong>{r.itemCode}</strong>
                              <span style={{ color: '#6b7684' }}> — {r.description}</span>
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right' }}>{r.activeQty}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                              {!r.hasSalesData ? (
                                <span style={{ color: '#c1c8d1', fontStyle: 'italic' }}>{t('r_stock_no_sales_data')}</span>
                              ) : r.prorated ? (
                                r.sold
                              ) : (
                                <span title={t('r_stock_unprorated_hint')} style={{ color: '#c98a1f' }}>
                                  {r.soldRaw} <span style={{ fontSize: 10 }}>ⓘ</span>
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6b7684' }}>{r.destroyed || '—'}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: r.estimated <= 0 ? '#2f8f8a' : diffColor(diff ?? 99) }}>
                              {r.estimated <= 0 ? (
                                <span style={{ fontWeight: 400, fontSize: 11.5, fontStyle: 'italic' }}>{t('r_stock_likely_sold_out')}</span>
                              ) : r.estimated}
                            </td>
                            <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                              {r.earliestExpiry ? (
                                <span style={{ color: '#fff', background: diffColor(diff), padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                                  {diffLabel(diff, t, lang)}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <p style={{ color: '#97a2b0' }}>{t('d_loading')}</p>
        ) : error ? (
          <p style={{ color: '#c0392b' }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#97a2b0' }}>{t('r_no_results')}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                {REPORT_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    title={t('common_sort_hint')}
                    style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  >
                    {t(col.labelKey)}
                    {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                {canDelete && <th style={{ padding: '10px 12px' }}></th>}
              </tr>
              <tr style={{ background: '#fff', borderBottom: '1px solid #eef1f4' }}>
                {REPORT_COLUMNS.map((col) => (
                  <th key={col.key} style={{ padding: '4px 12px', fontWeight: 400 }}>
                    <input
                      value={columnFilters[col.key] || ''}
                      onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                      placeholder={t('common_filter_placeholder')}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '4px 6px', borderRadius: 4, border: '1px solid #e1e5ea', fontSize: 12 }}
                    />
                  </th>
                ))}
                {canDelete && <th style={{ padding: '4px 12px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const diff = daysDiff(e.expiryDate);
                return (
                  <tr key={e.id} style={{ borderTop: '1px solid #eef1f4' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{e.productItemCode}</td>
                    <td style={{ padding: '10px 12px', color: '#3a4353' }}>{e.productDescription}</td>
                    <td style={{ padding: '10px 12px' }}>{e.store}</td>
                    <td style={{ padding: '10px 12px' }}>{e.quantity ?? '—'}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{formatDate(e.expiryDate)}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#fff', background: diffColor(diff), padding: '3px 9px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>
                        {diffLabel(diff, t, lang)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7684' }}>{e.enteredByEmail || '—'}</td>
                    {canDelete && (
                      <td style={{ padding: '10px 12px' }}>
                        <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => handleDelete(e.id)}>{t('common_delete')}</button>
                      </td>
                    )}
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
