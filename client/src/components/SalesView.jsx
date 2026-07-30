import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { SalesDaily, SalesProducts, Products } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

// Το "Location" στα reports της POS δεν γράφεται πάντα ίδιο ακριβώς με το όνομα
// καταστήματος της εφαρμογής (π.χ. "Kryoneri" στο report vs "Gefsinus Kryoneri Q&F"
// στα Προϊόντα) — ψάχνουμε μερική αντιστοιχία μέσα στα ΠΡΑΓΜΑΤΙΚΑ ονόματα από τη
// κεντρική λίστα καταστημάτων (Προϊόντα → Cost → Κατάστημα) αντί για hardcoded λίστα.
function normalizeStoreName(raw, knownStores) {
  if (!raw) return raw || '';
  const lower = String(raw).toLowerCase();
  const match = (knownStores || []).find((s) => lower.includes(s.toLowerCase()) || s.toLowerCase().includes(lower));
  return match || String(raw).trim();
}

// Δέχεται είτε κείμενο 'dd/mm/yyyy' είτε αριθμό-σειρά ημερομηνίας του Excel
// (όταν το κελί "Date" είναι μορφοποιημένο ως πραγματική ημερομηνία αντί για
// κείμενο — τότε το SheetJS με raw:true επιστρέφει αριθμό, όχι string, και το
// παλιό split('/') απέτυχε σιωπηλά, πετώντας τη γραμμή). -> 'yyyy-mm-dd'
function toIsoDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel epoch: 30/12/1899 (λόγω του ιστορικού 1900-leap-year quirk).
    const epochMs = Date.UTC(1899, 11, 30);
    const d = new Date(epochMs + value * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const parts = String(value).split('/');
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

function parseDailySalesSummary(workbook, knownStores) {
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
    const store = normalizeStoreName(location, knownStores);
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

// Ψάχνει μέσα σε ένα ελεύθερο κείμενο (τίτλος report, όνομα αρχείου) για κάποιο από
// τα γνωστά ονόματα καταστημάτων — δεύτερη γραμμή άμυνας όταν το φύλλο "Details" δεν
// βοηθάει (δεν υπάρχει, ή δεν έχει καθόλου στήλη Location).
function guessStoreFromText(text, knownStores) {
  if (!text) return '';
  const low = String(text).toLowerCase();
  return (knownStores || []).find((s) => low.includes(s.toLowerCase())) || '';
}

// Για αντιστοίχιση ονομάτων προϊόντων ανάμεσα στα φύλλα "Summary" και "Details" (το
// "Details" δεν έχει Scancode) — τα ονόματα δεν είναι πάντα byte-for-byte ίδια μεταξύ
// των δύο φύλλων (π.χ. διαφορετικά κεφαλαία, ή "35gr" vs "35g"), οπότε κάνουμε μια
// ήπια κανονικοποίηση (lowercase + συμπίεση κενών) πριν το ταίριασμα.
function normalizeProductName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Δεύτερο, πιο "χαλαρό" πέρασμα κανονικοποίησης — χρησιμοποιείται ΜΟΝΟ όταν το αυστηρό
// ταίριασμα (normalizeProductName) αποτύχει. Εξομαλύνει τις πιο συνηθισμένες διαφορές
// μορφοποίησης ανάμεσα στα φύλλα "Summary"/"Details" του ίδιου report (π.χ. "300 ml" vs
// "300ml", "35gr" vs "35g", σημεία στίξης) ώστε να πιάνει περισσότερα ταιριάσματα χωρίς να
// ρισκάρει να μπερδέψει εντελώς διαφορετικά προϊόντα.
function normalizeProductNameLoose(s) {
  return normalizeProductName(s)
    .replace(/(\d)\s+(ml|gr|g|kg|lt|l)\b/g, '$1$2')
    .replace(/(\d)gr\b/g, '$1g')
    .replace(/[.,()&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSalesAnalysisReport(workbook, storeOverride, knownStores, fileName) {
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

  // Scancode/κατηγορίες ανά (κανονικοποιημένο) όνομα προϊόντος — χρησιμοποιείται όταν
  // σπάμε το report ανά κατάστημα μέσω του φύλλου "Details" παρακάτω, αφού εκείνο το
  // φύλλο δεν έχει Scancode.
  const summaryByName = {};
  const summaryByNameLoose = {};
  rowsSummary.slice(headerIdx + 1).forEach((r) => {
    if (!r || !r[iName]) return;
    const info = {
      scancode: r[iScancode] ? String(r[iScancode]).trim() : '',
      cat1: r[iCat1] ? String(r[iCat1]).trim() : '',
      cat2: r[iCat2] ? String(r[iCat2]).trim() : '',
      cat3: r[iCat3] ? String(r[iCat3]).trim() : ''
    };
    summaryByName[normalizeProductName(r[iName])] = info;
    // Στο χαλαρό ευρετήριο δεν ξαναγράφουμε μια εγγραφή που ταιριάζει ήδη με άλλο προϊόν
    // (θα σήμαινε 2 διαφορετικά προϊόντα να "συγκρούονται" στο ίδιο χαλαρό κλειδί) — σε
    // τέτοια σπάνια περίπτωση προτιμάμε να ΜΗΝ ταιριάξουμε παρά να ταιριάξουμε λάθος.
    const looseKey = normalizeProductNameLoose(r[iName]);
    if (looseKey in summaryByNameLoose) summaryByNameLoose[looseKey] = null;
    else summaryByNameLoose[looseKey] = info;
  });

  function lookupSummaryInfo(productName) {
    return summaryByName[normalizeProductName(productName)]
      || summaryByNameLoose[normalizeProductNameLoose(productName)]
      || {};
  }

  // Διαβάζουμε το φύλλο "Details" (Location ανά γραμμή) για να δούμε ΠΟΣΑ και ΠΟΙΑ
  // καταστήματα καλύπτει στην πραγματικότητα το αρχείο — ένα report μπορεί να περιέχει
  // αναμεμειγμένες πωλήσεις από πολλά καταστήματα μαζί.
  let detailsRows = null;
  let iLoc = -1, iDName = -1, iDSold = -1, iDPrice = -1, iDTax = -1, iDDeposit = -1, iDDiscount = -1, iDTotalPrice = -1, iDCost = -1, iDNet = -1, iDGm = -1;
  if (detailsSheetName) {
    const wsDetails = workbook.Sheets[detailsSheetName];
    const rowsDetails = XLSX.utils.sheet_to_json(wsDetails, { header: 1, defval: null, raw: true });
    const dHeaderIdx = findHeaderRow(rowsDetails, ['Location']);
    if (dHeaderIdx !== -1) {
      const dHeader = rowsDetails[dHeaderIdx].map((h) => String(h || '').trim());
      iLoc = dHeader.indexOf('Location');
      iDName = dHeader.indexOf('Product Name');
      iDSold = dHeader.indexOf('Sold');
      iDPrice = dHeader.indexOf('Price');
      iDTax = dHeader.indexOf('Tax');
      iDDeposit = dHeader.indexOf('Deposit');
      iDDiscount = dHeader.indexOf('Discount');
      iDTotalPrice = dHeader.indexOf('Total Price');
      iDCost = dHeader.indexOf('Cost');
      iDNet = dHeader.indexOf('Net');
      iDGm = dHeader.indexOf('GM%');
      detailsRows = rowsDetails.slice(dHeaderIdx + 1).filter((r) => r && r[iLoc]);
    }
  }

  const distinctLocs = detailsRows ? new Set(detailsRows.map((r) => String(r[iLoc]).trim())) : new Set();

  const batchId = 'batch-' + Date.now();
  const uploadedAt = new Date().toISOString();
  const out = [];

  if (distinctLocs.size > 1) {
    // ΠΟΛΛΑ καταστήματα μέσα στο ίδιο αρχείο — σπάμε ανά πραγματική γραμμή του "Details"
    // (που ήδη κουβαλάει Location + Sold/Price/Tax/... ανά κατάστημα), εμπλουτισμένη με
    // Scancode/κατηγορία από το "Summary" μέσω αντιστοίχισης ονόματος. Αν κάποιο προϊόν
    // δεν αντιστοιχιστεί (σπάνιο, διαφορές μορφοποίησης ονόματος), κρατάμε τη γραμμή
    // χωρίς scancode — απλά δεν θα μπορεί να «δει» barcode-based αναφορές (π.χ. Εκτιμώμενο
    // Απόθεμα), όπως ακριβώς συμβαίνει σήμερα με προϊόντα χωρίς καταχωρημένο barcode.
    detailsRows.forEach((r) => {
      if (!r[iDName]) return;
      const store = normalizeStoreName(r[iLoc], knownStores);
      const match = lookupSummaryInfo(r[iDName]);
      const totalPrice = num(r[iDTotalPrice]);
      const tax = num(r[iDTax]);
      out.push({
        batchId,
        uploadedAt,
        periodLabel,
        store,
        productName: String(r[iDName]).trim(),
        scancode: match.scancode || '',
        cat1: match.cat1 || '',
        cat2: match.cat2 || '',
        cat3: match.cat3 || '',
        sold: num(r[iDSold]),
        price: num(r[iDPrice]),
        tax,
        deposit: num(r[iDDeposit]),
        discount: num(r[iDDiscount]),
        totalPrice,
        netRevenue: totalPrice - tax,
        cost: num(r[iDCost]),
        netProfit: num(r[iDNet]),
        gmPercent: num(r[iDGm])
      });
    });
    return { rows: out, resolvedStore: '', periodLabel, multiStore: true };
  }

  // ΕΝΑ μόνο κατάστημα σε όλο το αρχείο (η κοινή περίπτωση) — χρησιμοποιούμε απευθείας
  // το "Summary" (πιο αξιόπιστο, έχει ήδη Scancode) και του βάζουμε το ένα κατάστημα.
  let resolvedStore = storeOverride || '';
  if (!resolvedStore && distinctLocs.size === 1) resolvedStore = normalizeStoreName([...distinctLocs][0], knownStores);
  if (!resolvedStore) resolvedStore = guessStoreFromText(titleCell, knownStores);
  if (!resolvedStore) resolvedStore = guessStoreFromText(fileName, knownStores);

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
  return { rows: out, resolvedStore, periodLabel, multiStore: false };
}

export default function SalesView({ canDelete = false }) {
  const { t } = useLanguage();
  const [dailyCount, setDailyCount] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyDaily, setBusyDaily] = useState(false);
  const [busyProducts, setBusyProducts] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'ok'|'error', text }
  const [allProducts, setAllProducts] = useState([]);
  const dailyInputRef = useRef(null);
  const productsInputRef = useRef(null);
  // Όταν η αυτόματη αναγνώριση καταστήματος αποτύχει, δεν αποθηκεύουμε πλέον σιωπηλά ως
  // "—" — κρατάμε τις γραμμές σε αναμονή και ζητάμε από τον χρήστη να διαλέξει κατάστημα.
  const [pendingUpload, setPendingUpload] = useState(null); // { rows, fileName, count }
  const [pendingStorePick, setPendingStorePick] = useState('');
  // Επεξεργασία καταστήματος σε ήδη ανεβασμένη παρτίδα (π.χ. διόρθωση ενός "—").
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [editStoreValue, setEditStoreValue] = useState('');

  // Η λίστα καταστημάτων προέρχεται από την ίδια κεντρική λίστα με παντού αλλού
  // στην εφαρμογή (Προϊόντα → Cost → Κατάστημα) — όχι από ξεχωριστή/παλιωμένη λίστα.
  const storeOptions = useMemo(() => {
    const set = new Set();
    allProducts.forEach((p) => (p.stores || []).forEach((s) => s && s.name && set.add(s.name)));
    return Array.from(set).sort();
  }, [allProducts]);

  useEffect(() => {
    Products.list().then(setAllProducts).catch(() => {});
  }, []);

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
      const rows = parseDailySalesSummary(wb, storeOptions);
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

  // Αν το αρχείο περιέχει πωλήσεις από ΠΟΛΛΑ καταστήματα μαζί, το parseSalesAnalysisReport
  // τις σπάει ήδη σωστά ανά πραγματικό κατάστημα (μέσω του φύλλου "Details") — κάθε γραμμή
  // έρχεται με το δικό της store, οπότε αποθηκεύουμε απευθείας χωρίς να ρωτήσουμε τίποτα.
  // Μόνο όταν δεν μπορεί να αναγνωριστεί ΚΑΝΕΝΑ κατάστημα αυτόματα (σπάνια περίπτωση, π.χ.
  // λείπει εντελώς το φύλλο "Details") ζητάμε από τον χρήστη να διαλέξει ένα κατάστημα για
  // όλο το αρχείο πριν αποθηκευτεί η παρτίδα (βλ. pendingUpload) — ποτέ πια σιωπηλό "—".
  async function handleProductsFile(e) {
    const file = e.target.files && e.target.files[0];
    if (productsInputRef.current) productsInputRef.current.value = '';
    if (!file) return;
    setBusyProducts(true);
    setMessage(null);
    try {
      const wb = await readWorkbook(file);
      const { rows, resolvedStore, multiStore } = parseSalesAnalysisReport(wb, '', storeOptions, file.name);
      if (!rows.length) throw new Error('no_rows');
      if (multiStore) {
        await SalesProducts.insertBatch(rows);
        setMessage({ type: 'ok', text: t('sales_upload_products_ok').replace('{n}', rows.length) });
        refresh();
        return;
      }
      const finalStore = resolvedStore || (storeOptions.length === 1 ? storeOptions[0] : '');
      if (!finalStore) {
        setPendingUpload({ rows, fileName: file.name, count: rows.length });
        setPendingStorePick('');
        return;
      }
      const finalRows = rows.map((r) => ({ ...r, store: finalStore }));
      await SalesProducts.insertBatch(finalRows);
      setMessage({ type: 'ok', text: t('sales_upload_products_ok').replace('{n}', rows.length) });
      refresh();
    } catch (err) {
      setMessage({ type: 'error', text: t('sales_upload_error') + ' ' + (err.message || err) });
    } finally {
      setBusyProducts(false);
    }
  }

  async function confirmPendingUpload() {
    if (!pendingUpload || !pendingStorePick) return;
    setBusyProducts(true);
    setMessage(null);
    try {
      const finalRows = pendingUpload.rows.map((r) => ({ ...r, store: pendingStorePick }));
      await SalesProducts.insertBatch(finalRows);
      setMessage({ type: 'ok', text: t('sales_upload_products_ok').replace('{n}', finalRows.length) });
      setPendingUpload(null);
      refresh();
    } catch (err) {
      setMessage({ type: 'error', text: t('sales_upload_error') + ' ' + (err.message || err) });
    } finally {
      setBusyProducts(false);
    }
  }

  function cancelPendingUpload() {
    setPendingUpload(null);
    setPendingStorePick('');
  }

  async function handleDeleteBatch(batchId) {
    try {
      await SalesProducts.removeBatch(batchId);
      refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || String(err) });
    }
  }

  function startEditBatchStore(b) {
    setEditingBatchId(b.batchId);
    setEditStoreValue(b.store === '—' ? '' : b.store);
  }

  function cancelEditBatchStore() {
    setEditingBatchId(null);
    setEditStoreValue('');
  }

  async function saveEditBatchStore(batchId) {
    if (!editStoreValue) return;
    try {
      await SalesProducts.updateBatchStore(batchId, editStoreValue);
      setEditingBatchId(null);
      setEditStoreValue('');
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

        {pendingUpload && (
          <div style={{ background: '#fff8e6', border: '1px solid #f0d998', borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8a6d1f', marginBottom: 6 }}>{t('sales_pick_store_title')}</div>
            <p style={{ fontSize: 12.5, color: '#8a6d1f', margin: '0 0 12px' }}>
              {t('sales_pick_store_desc').replace('{file}', pendingUpload.fileName).replace('{n}', pendingUpload.count)}
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={pendingStorePick}
                onChange={(e) => setPendingStorePick(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #d8c78a', fontSize: 13, minWidth: 220 }}
              >
                <option value="">{t('sales_pick_store_placeholder')}</option>
                {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                type="button"
                className="btn-primary"
                disabled={!pendingStorePick || busyProducts}
                onClick={confirmPendingUpload}
                style={{ opacity: !pendingStorePick || busyProducts ? 0.6 : 1 }}
              >
                {busyProducts ? t('sales_uploading') : t('sales_pick_store_save')}
              </button>
              <button type="button" onClick={cancelPendingUpload} style={{ background: 'transparent', border: '1px solid #d8c78a', color: '#8a6d1f', borderRadius: 6, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>
                {t('common_cancel')}
              </button>
            </div>
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
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>
                      {editingBatchId === b.batchId ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <select
                            value={editStoreValue}
                            onChange={(e) => setEditStoreValue(e.target.value)}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d5dae2', fontSize: 12.5 }}
                          >
                            <option value="">{t('sales_pick_store_placeholder')}</option>
                            {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button type="button" onClick={() => saveEditBatchStore(b.batchId)} disabled={!editStoreValue} title={t('sales_pick_store_save')} style={{ border: 'none', background: 'transparent', color: '#1f7a52', cursor: 'pointer', fontWeight: 700 }}>✓</button>
                          <button type="button" onClick={cancelEditBatchStore} title={t('common_cancel')} style={{ border: 'none', background: 'transparent', color: '#97a2b0', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                        </div>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {b.store === '—' ? <span title={t('sales_store_unresolved_hint')} style={{ color: '#c0392b' }}>⚠ {b.store}</span> : b.store}
                          <button type="button" onClick={() => startEditBatchStore(b)} title={t('sales_edit_store_button')} style={{ border: 'none', background: 'transparent', color: '#97a2b0', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                        </span>
                      )}
                    </td>
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
