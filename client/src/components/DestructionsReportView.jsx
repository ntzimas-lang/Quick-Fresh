import React, { useEffect, useMemo, useState } from 'react';
import { Destructions } from '../api.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEJAVU_SANS_BASE64 } from '../dejavu-font.js';
import { useLanguage } from '../LanguageContext.jsx';

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const REPORT_COLUMNS = [
  { key: 'itemCode', labelKey: 'r_col_itemCode' },
  { key: 'description', labelKey: 'r_col_description' },
  { key: 'store', labelKey: 'r_col_store' },
  { key: 'quantity', labelKey: 'r_col_quantity' },
  { key: 'reason', labelKey: 'x_col_reason' },
  { key: 'date', labelKey: 'x_col_date' },
  { key: 'createdBy', labelKey: 'r_col_createdBy' }
];

function getRowValue(d, key) {
  if (key === 'itemCode') return d.productItemCode || '';
  if (key === 'description') return d.productDescription || '';
  if (key === 'store') return d.store || '';
  if (key === 'quantity') return d.quantity ?? null;
  if (key === 'reason') return d.reason || '';
  if (key === 'date') return d.createdAt || '';
  if (key === 'createdBy') return d.destroyedByEmail || '';
  return '';
}

export default function DestructionsReportView({ canDelete = false }) {
  const { t } = useLanguage();
  const [destructions, setDestructions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState({});
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function getRowFilterText(d, key) {
    if (key === 'date') return formatDate(d.createdAt);
    const v = getRowValue(d, key);
    return v === null || v === undefined ? '' : String(v);
  }

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    Destructions.list()
      .then((rows) => { setDestructions(rows); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }

  async function handleDelete(id) {
    setDeleteError('');
    try {
      await Destructions.remove(id);
      setDestructions((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setDeleteError(t('r_delete_error_prefix') + ' ' + (err.message || err));
    }
  }

  const storeOptions = useMemo(() => {
    const set = new Set();
    destructions.forEach((d) => d.store && set.add(d.store));
    return Array.from(set).sort();
  }, [destructions]);

  const summary = useMemo(() => {
    let totalQty = 0;
    let events = destructions.length;
    destructions.forEach((d) => {
      const q = Number(d.quantity);
      totalQty += Number.isFinite(q) && q > 0 ? q : 0;
    });
    return { totalQty, events };
  }, [destructions]);

  const filtered = useMemo(() => {
    let rows = destructions;
    if (storeFilter !== 'all') rows = rows.filter((d) => d.store === storeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((d) =>
        (d.productItemCode || '').toLowerCase().includes(q) ||
        (d.productDescription || '').toLowerCase().includes(q)
      );
    }
    rows = rows.filter((d) =>
      REPORT_COLUMNS.every((col) => {
        const f = (columnFilters[col.key] || '').trim().toLowerCase();
        if (!f) return true;
        return getRowFilterText(d, col.key).toLowerCase().includes(f);
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
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return sorted;
  }, [destructions, storeFilter, search, columnFilters, sortKey, sortDir]);

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.addFileToVFS('DejaVuSans.ttf', DEJAVU_SANS_BASE64);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(12);
    doc.text(`Quick & Fresh — ${t('title_destructions_report')}`, 14, 12);
    autoTable(doc, {
      startY: 18,
      head: [[t('r_col_itemCode'), t('r_col_description'), t('r_col_store'), t('r_col_quantity'), t('x_col_reason'), t('x_col_date'), t('r_col_createdBy')]],
      body: filtered.map((d) => [
        d.productItemCode || '',
        d.productDescription || '',
        d.store || '',
        d.quantity ?? '',
        d.reason || '',
        formatDate(d.createdAt),
        d.destroyedByEmail || ''
      ]),
      styles: { fontSize: 8, cellPadding: 2, font: 'DejaVuSans' },
      headStyles: { fillColor: [192, 57, 43], font: 'DejaVuSans' }
    });
    doc.save(`quick-fresh-katastrofes-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{t('title_destructions_report')}</strong>
        <button className="btn-primary" style={{ background: '#b23b2e' }} onClick={exportPDF} title={t('common_export_pdf')}>
          PDF
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('r_search_placeholder_specific')}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13, width: 220 }}
        />
        <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13 }}>
          <option value="all">{t('r_all_stores')}</option>
          {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '14px 20px', background: '#fff', borderBottom: '1px solid #e1e5ea', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#c0392b' }}>{summary.totalQty}</div>
            <div style={{ fontSize: 11.5, color: '#6b7684' }}>{t('x_total_qty')}</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#16233f' }}>{summary.events}</div>
            <div style={{ fontSize: 11.5, color: '#6b7684' }}>{t('x_total_events')}</div>
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        {deleteError && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#fdecea', color: '#c0392b', border: '1px solid #f3c1bb', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
            <span>{deleteError}</span>
            <button type="button" onClick={() => setDeleteError('')} style={{ border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontWeight: 700 }}>✕</button>
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
              {filtered.map((d) => (
                <tr key={d.id} style={{ borderTop: '1px solid #eef1f4' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{d.productItemCode}</td>
                  <td style={{ padding: '10px 12px', color: '#3a4353' }}>{d.productDescription}</td>
                  <td style={{ padding: '10px 12px' }}>{d.store}</td>
                  <td style={{ padding: '10px 12px' }}>{d.quantity ?? '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7684' }}>{d.reason || '—'}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{formatDate(d.createdAt)}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7684' }}>{d.destroyedByEmail || '—'}</td>
                  {canDelete && (
                    <td style={{ padding: '10px 12px' }}>
                      <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => handleDelete(d.id)}>{t('common_delete')}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
