import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { SalesDaily, SalesProducts } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const STORE_CANDIDATES = ['DEMO', 'Plaisio', 'Novibet', 'Kryoneri', 'Nestle', 'AIA', 'Metlen', 'ACS Courier'];

function normalizeStoreName(raw) {
  if (!raw) return raw || '';
  const lower = String(raw).toLowerCase();
  const match = STORE_CANDIDATES.find((s) => lower.includes(s.toLowerCase()));
  return match || String(raw).trim();
}

// 'dd/mm/yyyy' -> 'yyyy-mm-dd'
function toIsoDate(ddmmyyyy) {
  if (!ddmmyyyy) return null;
  const parts = String(ddmmyyyy).split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: 'array' });
}

// Βρίσκει τη γραμμή-επικεφαλίδα (η πρώτη γραμμή είναι συνήθως ο τίτλος του report)
// ψάχνοντας για ένα από τα αναμενόμενα ονόματα στηλών.
function findHeaderRow(rows, mustInclude) {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i] || [];
    if (row.some((cell) => mustInclude.includes(String(cell || '').trim()))) return i;
  }
  return -1;
}

function parseDailySalesSummary(workbook) {
  const sheetName = workbook.SheetNames.find((n) => /daily/i.test(n)) || workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const headerIdx = findHeaderRow(rows, ['Date']);
  if (headerIdx === -1) throw new Error('header_not_found');
  const header = rows[headerIdx].map((h) => String(h || '').trim());
  const col = (name) => header.indexOf(name);
  const iDate = col('Date');
  const iLocation = col('Location');
  const iTx = col('Transactions');
  const iItems = col('Item Count');
  const iSales = col('Sales €');
  const iTax = col('Taxes');
  const iDeposit = col('Deposit');
  const iDiscount = col('Discount');
  const iTotal = col('Total Sales');
  const iUsers = col('Unique GMA Users');
  const iNonTaxed = col('Non-Taxed Sales');
  const iTaxable = col('Taxable Sales');

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[iDate]) continue;
    const location = String(r[iLocation] || '').trim();
    if (!location || location.toLowerCase() === 'total') continue;
    const isoDate = toIsoDate(r[iDate]);
    if (!isoDate) continue;
    const store = normalizeStoreName(location);
    const totalSales = num(r[iTotal]);
    const tax = num(r[iTax]);
    out.push({
      id: `${isoDate}|${store}`,
      date: isoDate,
      store,
      rawLocation: location,
      transactions: num(r[iTx]),
      itemCount: num(r[iItems]),
      salesGross: num(r[iSales]),
      tax,
      deposit: num(r[iDeposit]),
      discount: num(r[iDiscount]),
      totalSales,
      netSales: totalSales - tax,
      uniqueUsers: num(r[iUsers]),
      nonTaxedSales: num(r[iNonTaxed]),
      taxableSales: num(r[iTaxable]),
      importedAt: new Date().toISOString()
    });
  }
  return out;
}

function parseSalesAnalysisReport(workbook, storeOverride) {
  const summarySheetName = workbook.SheetNames.find((n) => /summary/i.test(n)) || workbook.SheetNames[0];
  const detailsSheetName = workbook.SheetNames.find((n) => /details/i.test(n));
  const wsSummary = workbook.Sheets[summarySheetName];
  const rowsSummary = XLSX.utils.sheet_to_json(wsSummary, { header: 1, defval: null, raw: true });
  const headerIdx = findHeaderRow(rowsSummary, ['Product Name']);
  if (headerIdx === -1) throw new Error('header_not_found');
  const header = rowsSummary[headerIdx].map((h) => String(h || '').trim());
  const col = (name) => header.indexOf(name);
  const iName = col('Product Name');
  const iScancode = col('Scancode');
  const iCat1 = col('Cat1');
  const iCat2 = col('Cat2');
  const iCat3 = col('Cat3');
  const iSold = col('Sold');
  const iPrice = col('Price');
  const iTax = col('Tax');
  const iDeposit = col('Deposit');
  const iDiscount = col('Discount');
  const iTotalPrice = col('Total Price');
  const iCost = col('Cost');
  const iNet = col('Net');
  const iGm = col('GM%');

  // Τίτλος (π.χ. "Sales Analysis-01/05/2026 00:00 to 24/07/2026 23:59") -> περίοδος αναφοράς.
  const titleCell = rowsSummary[0] && rowsSummary[0][0];
  const periodLabel = titleCell ? String(titleCell).replace(/^Sales Analysis-?/i, '').trim() : '';

  // Προσπαθούμε να βρούμε το κατάστημα από το φύλλο "Details" (έχει στήλη Location).
  let resolvedStore = storeOverride || '';
  if (!resolvedStore && detailsSheetName) {
    const wsDetails = workbook.Sheets[detailsSheetName];
    const rowsDetails = XLSX.utils.sheet_to_json(wsDetails, { header: 1, defval: null, raw: true });
    const dHeaderIdx = findHeaderRow(rowsDetails, ['Location']);
    if (dHeaderIdx !== -1) {
      const dHeader = rowsDetails[dHeaderIdx].map((h) => String(h || '').trim());
      const iLoc = dHeader.indexOf('Location');
      const locs = new Set();
      for (let i = dHeaderIdx + 1; i < rowsDetails.length; i++) {
        const loc = rowsDetails[i] && rowsDetails[i][iLoc];
        if (loc) locs.add(normalizeStoreName(loc));
      }
      if (locs.size === 1) resolvedStore = [...locs][0];
    }
  }

  const batchId = 'batch-' + Date.now();
  const uploadedAt = new Date().toISOString();
  const out = [];
  for (let i = headerIdx + 1; i < rowsSummary.length; i++) {
    const r = rowsSummary[i];
    if (!r || !r[iName]) continue;
    const totalPrice = num(r[iTotalPrice]);
    const tax = num(r[iTax]);
    out.push({
      batchId,
      uploadedAt,
      periodLabel,
      store: resolvedStore || '—',
      productName: String(r[iName]).trim(),
      scancode: r[iScancode] ? String(r[iScancode]).trim() : '',
      cat1: r[iCat1] ? String(r[iCat1]).trim() : '',
      cat2: r[iCat2] ? String(r[iCat2]).trim() : '',
      cat3: r[iCat3] ? String(r[iCat3]).trim() : '',
      sold: num(r[iSold]),
      price: num(r[iPrice]),
      tax,
      deposit: num(r[iDeposit]),
      discount: num(r[iDiscount]),
      totalPrice,
      netRevenue: totalPrice - tax,
      cost: num(r[iCost]),
      netProfit: num(r[iNet]),
      gmPercent: num(r[iGm])
    });
  }
  return { rows: out, resolvedStore, periodLabel };
}

export default function SalesView({ canDelete = false }) {
  const { t } = useLanguage();
  const [dailyCount, setDailyCount] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyDaily, setBusyDaily] = useState(false);
  const [busyProducts, setBusyProducts] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'ok'|'error', text }
  const [pendingStoreFile, setPendingStoreFile] = useState(null); // file waiting for store pick
  const [storePick, setStorePick] = useState(STORE_CANDIDATES[0]);
  const dailyInputRef = useRef(null);
  const productsInputRef = useRef(null);

  async function refresh() {
    setLoading(true);
    try {
      const [daily, products] = await Promise.all([SalesDaily.list(), SalesProducts.list()]);
      setDailyCount(daily.length);
      const byBatch = {};
      products.forEach((p) => {
        if (!byBatch[p.batchId]) byBatch[p.batchId] = { batchId: p.batchId, store: p.store, periodLabel: p.periodLabel, uploadedAt: p.uploadedAt, count: 0 };
        byBatch[p.batchId].count += 1;
      });
      const list = Object.values(byBatch).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      setBatches(list);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || String(err) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDailyFile(e) {
    const file = e.target.files && e.target.files[0];
    if (dailyInputRef.current) dailyInputRef.current.value = '';
    if (!file) return;
    setBusyDaily(true);
    setMessage(null);
    try {
      const wb = await readWorkbook(file);
      const rows = parseDailySalesSummary(wb);
      if (!rows.length) throw new Error('no_rows');
      await SalesDaily.upsertMany(rows);
      setMessage({ type: 'ok', text: t('sales_upload_daily_ok').replace('{n}', rows.length) });
      refresh();
    } catch (err) {
      setMessage({ type: 'error', text: t('sales_upload_error') + ' ' + (err.message || err) });
    } finally {
      setBusyDaily(false);
    }
  }

  function handleProductsFile(e) {
    const file = e.target.files && e.target.files[0];
    if (productsInputRef.current) productsInputRef.current.value = '';
    if (!file) return;
    setPendingStoreFile(file);
  }

  async function confirmProductsUpload() {
    const file = pendingStoreFile;
    if (!file) return;
    setBusyProducts(true);
    setMessage(null);
    try {
      const wb = await readWorkbook(file);
      const { rows } = parseSalesAnalysisReport(wb, storePick);
      if (!rows.length) throw new Error('no_rows');
      await SalesProducts.insertBatch(rows);
      setMessage({ type: 'ok', text: t('sales_upload_products_ok').replace('{n}', rows.length) });
      setPendingStoreFile(null);
      refresh();
    } catch (err) {
      setMessage({ type: 'error', text: t('sales_upload_error') + ' ' + (err.message || err) });
    } finally {
      setBusyProducts(false);
    }
  }

  async function handleDeleteBatch(batchId) {
    try {
      await SalesProducts.removeBatch(batchId);
      refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || String(err) });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_sales')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        {message && (
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              background: message.type === 'ok' ? '#eafaf3' : '#fdecea',
              color: message.type === 'ok' ? '#1f7a52' : '#c0392b',
              border: `1px solid ${message.type === 'ok' ? '#bfe9d5' : '#f3c1bb'}`,
              borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16
            }}
          >
            <span>{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          {/* Upload Daily Sales Summary */}
          <div style={{ flex: '1 1 360px', background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
              {t('sales_daily_title')}
            </div>
            <p style={{ fontSize: 12.5, color: '#97a2b0', margin: '0 0 14px' }}>{t('sales_daily_desc')}</p>
            <input ref={dailyInputRef} type="file" accept=".xlsx,.xls" onChange={handleDailyFile} style={{ display: 'none' }} id="daily-upload" />
            <label htmlFor="daily-upload" className="btn-primary" style={{ display: 'inline-block', cursor: 'pointer', opacity: busyDaily ? 0.6 : 1 }}>
              {busyDaily ? t('sales_uploading') : t('sales_choose_file')}
            </label>
            {dailyCount !== null && (
              <div style={{ fontSize: 12, color: '#6b7684', marginTop: 12 }}>
                {t('sales_daily_stored_prefix')} <strong>{dailyCount}</strong> {t('sales_daily_stored_suffix')}
              </div>
            )}
          </div>

          {/* Upload Sales Analysis Report */}
          <div style={{ flex: '1 1 360px', background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
              {t('sales_products_title')}
            </div>
            <p style={{ fontSize: 12.5, color: '#97a2b0', margin: '0 0 14px' }}>{t('sales_products_desc')}</p>
            <input ref={productsInputRef} type="file" accept=".xlsx,.xls" onChange={handleProductsFile} style={{ display: 'none' }} id="products-upload" />
            <label htmlFor="products-upload" className="btn-primary" style={{ display: 'inline-block', cursor: 'pointer', opacity: busyProducts ? 0.6 : 1 }}>
              {busyProducts ? t('sales_uploading') : t('sales_choose_file')}
            </label>

            {pendingStoreFile && (
              <div style={{ marginTop: 14, padding: 12, background: '#f4f6f8', borderRadius: 8 }}>
                <div style={{ fontSize: 12.5, marginBottom: 8 }}>{t('sales_pick_store_prefix')} <strong>{pendingStoreFile.name}</strong></div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={storePick} onChange={(e) => setStorePick(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13 }}>
                    {STORE_CANDIDATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="btn-primary" onClick={confirmProductsUpload} disabled={busyProducts} style={{ padding: '6px 14px' }}>
                    {busyProducts ? t('sales_uploading') : t('sales_confirm_upload')}
                  </button>
                  <button onClick={() => setPendingStoreFile(null)} style={{ border: '1px solid #d7dce2', background: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
                    {t('common_cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Import history */}
        <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
            {t('sales_import_history')}
          </div>
          {loading ? (
            <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_loading')}</p>
          ) : batches.length === 0 ? (
            <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('sales_no_batches')}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#97a2b0', fontSize: 11.5, textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 0' }}>{t('sales_col_store')}</th>
                  <th style={{ padding: '6px 0' }}>{t('sales_col_period')}</th>
                  <th style={{ padding: '6px 0' }}>{t('sales_col_rows')}</th>
                  <th style={{ padding: '6px 0' }}>{t('sales_col_uploaded')}</th>
                  {canDelete && <th style={{ padding: '6px 0' }}></th>}
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batchId} style={{ borderTop: '1px solid #eef1f4' }}>
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>{b.store}</td>
                    <td style={{ padding: '8px 0', color: '#6b7684' }}>{b.periodLabel || '—'}</td>
                    <td style={{ padding: '8px 0' }}>{b.count}</td>
                    <td style={{ padding: '8px 0', color: '#6b7684', whiteSpace: 'nowrap' }}>
                      {new Date(b.uploadedAt).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    {canDelete && (
                      <td style={{ padding: '8px 0' }}>
                        <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => handleDeleteBatch(b.batchId)}>{t('common_delete')}</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
