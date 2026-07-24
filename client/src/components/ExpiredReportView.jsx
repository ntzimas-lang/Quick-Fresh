import React, { useEffect, useMemo, useState } from 'react';
import { Entries } from '../api.js';
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
