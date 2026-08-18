import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Products, Entries, Destructions, ExpiredSales, PendingDeliveries, DeliveryShortages } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const METHODS = [
  { key: 'scan', icon: '📷', labelKey: 'e_method_scan' },
  { key: 'manual', icon: '⌨️', labelKey: 'e_method_manual' },
  { key: 'no-barcode', icon: '📋', labelKey: 'e_method_no_barcode' },
  { key: 'description', icon: '🔎', labelKey: 'e_method_description' },
  { key: 'delivery-pdf', icon: '📄', labelKey: 'e_method_delivery_pdf' }
];

const ENTRY_MODES = [
  { key: 'expiry', icon: '⏰', labelKey: 'e_mode_expiry', color: '#2f8f8a', bg: '#eef7f6' },
  { key: 'destruction', icon: '🗑️', labelKey: 'e_mode_destruction', color: '#c0392b', bg: '#fdecea' }
];

// Μετατροπή "YYYY-MM-DD" (όπως το αποθηκεύουμε) σε "DD/MM/YYYY" για εμφάνιση.
function formatDMY(isoDate) {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

// Placeholder που παίρνει αυτόματα ένα προϊόν όταν δημιουργείται από τα "Προϊόντα"
// χωρίς να συμπληρωθεί ακόμα — δεν έχει νόημα να εμφανίζεται στις λίστες αναζήτησης εδώ.
function isUnfinishedPlaceholder(p) {
  return p.descriptionGr === 'Νέο προϊόν' && !p.itemCode && !p.descriptionErp;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Ίδια λογική με το Report Ληγμένα — πόσες ημέρες μένουν (αρνητικό = ήδη έληξε).
function daysDiff(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr + 'T00:00:00');
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
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

export default function ProductEntryView({ canDeletePending = false }) {
  const { t, lang } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [entryMode, setEntryMode] = useState('expiry');
  const [method, setMethod] = useState('scan');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [matchedProduct, setMatchedProduct] = useState(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState('');
  const [store, setStore] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [destructionDate, setDestructionDate] = useState(todayIso());
  // Όταν επεξεργαζόμαστε ένα ληγμένο: 'destroyed' (πραγματικά πετάχτηκε) ή 'sold'
  // (πουλήθηκε πριν προλάβει να λήξει — δεν υπάρχει πια, αλλά δεν είναι σπατάλη).
  // Κρατάει το Report Καταστροφές καθαρό από πωλήσεις.
  const [destructionOutcome, setDestructionOutcome] = useState('destroyed');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [recentEntries, setRecentEntries] = useState([]);
  const [noBarcodeQuery, setNoBarcodeQuery] = useState('');
  const [descQuery, setDescQuery] = useState('');
  const [expiredEntries, setExpiredEntries] = useState([]);
  const [entryQuery, setEntryQuery] = useState('');
  const [entryStoreFilter, setEntryStoreFilter] = useState('');

  // Μαζική καταχώρηση από Δελτίο Αποστολής (PDF) — μία παραλαβή, πολλά προϊόντα μαζί.
  const [batchParsing, setBatchParsing] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [batchFlash, setBatchFlash] = useState('');
  const [batchMeta, setBatchMeta] = useState(null);
  const [batchRows, setBatchRows] = useState([]);
  const [batchStore, setBatchStore] = useState('');
  const [batchSaving, setBatchSaving] = useState(false);
  // Ημερομηνία που παραλήφθηκε πραγματικά η παραγγελία στο κατάστημα — ξεχωριστή από την
  // "Ημ/νία Αποστολής" που είναι τυπωμένη στο Δελτίο (πότε στάλθηκε, όχι πότε έφτασε).
  // Προεπιλογή σήμερα, αλλά επεξεργάσιμη.
  const [receivedDate, setReceivedDate] = useState(todayIso());
  // Όταν επεξεργαζόμαστε (ή ολοκληρώνουμε) μια ήδη αποθηκευμένη "εκκρεμότητα" — κρατάμε
  // ολόκληρη την υπάρχουσα εγγραφή (όχι μόνο το id) ώστε να μη χαθούν πεδία όπως
  // createdBy/createdAt όταν κάνουμε update.
  const [openPendingRecord, setOpenPendingRecord] = useState(null);
  const [pendingDeliveries, setPendingDeliveries] = useState([]);

  useEffect(() => {
    PendingDeliveries.list().then(setPendingDeliveries).catch(() => {});
  }, []);

  const pendingDeliveriesList = useMemo(
    () => pendingDeliveries.filter((d) => d.status !== 'completed'),
    [pendingDeliveries]
  );

  const scannerDivId = 'qf-barcode-scanner-region';
  const html5QrRef = useRef(null);

  useEffect(() => {
    Products.list()
      .then((rows) => { setProducts(rows); setLoadingProducts(false); })
      .catch(() => setLoadingProducts(false));
  }, []);

  // Στην Καταχώρηση Καταστροφής επιλέγουμε ΑΠΟ τις ίδιες καταχωρήσεις που δείχνει το
  // Report Ληγμένα (όχι ελεύθερη αναζήτηση σε όλα τα προϊόντα) — έτσι δεν καταστρέφεται
  // κάτι που δεν έχει καν καταχωρηθεί ως ληγμένο.
  useEffect(() => {
    Entries.list().then(setExpiredEntries).catch(() => {});
  }, []);

  // Καταστήματα που εμφανίζονται πράγματι στα ληγμένα (όχι όλη τη λίστα καταστημάτων) —
  // έτσι το φίλτρο δείχνει μόνο επιλογές που έχουν νόημα εδώ.
  const entryStoreOptions = useMemo(() => {
    const set = new Set();
    expiredEntries.forEach((e) => { const s = (e.store || '').trim(); if (s) set.add(s); });
    return Array.from(set).sort();
  }, [expiredEntries]);

  const expiredFiltered = useMemo(() => {
    // Ό,τι έχει ΗΔΗ λήξει ή λήγει σήμερα (diff <= 0) — όχι "σε X ημέρες".
    const alreadyExpired = expiredEntries.filter((e) => e.expiryDate && daysDiff(e.expiryDate) <= 0);
    const byStore = entryStoreFilter
      ? alreadyExpired.filter((e) => (e.store || '') === entryStoreFilter)
      : alreadyExpired;
    const q = entryQuery.trim().toLowerCase();
    const base = q
      ? byStore.filter((e) =>
          (e.productItemCode || '').toLowerCase().includes(q) ||
          (e.productDescription || '').toLowerCase().includes(q) ||
          (e.store || '').toLowerCase().includes(q)
        )
      : byStore;
    return [...base].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).slice(0, 40);
  }, [expiredEntries, entryQuery, entryStoreFilter]);

  function selectExpiredEntry(entry) {
    setMatchedProduct({
      id: entry.productId,
      itemCode: entry.productItemCode,
      descriptionErp: entry.productDescription,
      descriptionGr: entry.productDescription
    });
    setStore(entry.store || '');
    setQuantity(entry.quantity != null ? String(entry.quantity) : '1');
    setNotFoundBarcode('');
    setScanError('');
  }

  useEffect(() => {
    return () => {
      if (html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {}).then(() => {
          try { html5QrRef.current.clear(); } catch (e) { /* ignore */ }
        });
      }
    };
  }, []);

  // Η λίστα καταστημάτων προέρχεται από τη λίστα "Κατάστημα" των Προϊόντων (Cost tab) —
  // εκεί προστίθενται νέα καταστήματα, και ανοίγουν αυτόματα και εδώ.
  const storeOptions = useMemo(() => {
    const set = new Set();
    products.forEach((p) => (p.stores || []).forEach((s) => s && s.name && set.add(s.name)));
    return Array.from(set).sort();
  }, [products]);

  // Προϊόντα χωρίς Barcode — καταχωρούνται επιλέγοντάς τα από λίστα αντί για σάρωση.
  // Εξαιρούνται τα ανολοκλήρωτα "Νέο προϊόν" placeholders.
  const noBarcodeProducts = useMemo(
    () => products.filter((p) => !(p.barcodes && p.barcodes.length) && !isUnfinishedPlaceholder(p)),
    [products]
  );
  const noBarcodeFiltered = useMemo(() => {
    const q = noBarcodeQuery.trim().toLowerCase();
    const base = q
      ? noBarcodeProducts.filter((p) =>
          (p.itemCode || '').toLowerCase().includes(q) ||
          (p.descriptionErp || '').toLowerCase().includes(q) ||
          (p.descriptionGr || '').toLowerCase().includes(q)
        )
      : noBarcodeProducts;
    return base.slice(0, 30);
  }, [noBarcodeProducts, noBarcodeQuery]);

  // Αναζήτηση με περιγραφή — σε όλα τα προϊόντα (με ή χωρίς barcode).
  const descFiltered = useMemo(() => {
    const q = descQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => !isUnfinishedPlaceholder(p))
      .filter((p) =>
        (p.itemCode || '').toLowerCase().includes(q) ||
        (p.descriptionErp || '').toLowerCase().includes(q) ||
        (p.descriptionGr || '').toLowerCase().includes(q) ||
        (p.descriptionEn || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [products, descQuery]);

  function selectProductManually(p) {
    setMatchedProduct(p);
    setNotFoundBarcode('');
    setScanError('');
  }

  function findByBarcode(code) {
    const clean = (code || '').trim();
    if (!clean) return null;
    return products.find((p) => (p.barcodes || []).some((b) => (b || '').trim() === clean)) || null;
  }

  function handleScanResult(code) {
    const product = findByBarcode(code);
    if (product) {
      setMatchedProduct(product);
      setNotFoundBarcode('');
      setScanError('');
    } else {
      setMatchedProduct(null);
      setNotFoundBarcode(code);
      setScanError('');
    }
  }

  async function startScan() {
    setScanError('');
    setScanning(true);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      html5QrRef.current = new Html5Qrcode(scannerDivId);
      await html5QrRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 260, height: 160 },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE
          ]
        },
        (decodedText) => {
          handleScanResult(decodedText);
          stopScan();
        },
        () => { /* ignore per-frame scan errors */ }
      );
    } catch (err) {
      setScanError(t('e_camera_error_prefix') + ' ' + (err && err.message ? err.message : String(err)));
      setScanning(false);
    }
  }

  async function stopScan() {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop();
        html5QrRef.current.clear();
      } catch (e) { /* ignore */ }
    }
    setScanning(false);
  }

  function selectMethod(key) {
    if (method === key) return;
    if (scanning) stopScan();
    if (method === 'delivery-pdf' && key !== 'delivery-pdf') resetBatch();
    setMethod(key);
  }

  function resetBatch() {
    setBatchParsing(false);
    setBatchError('');
    setBatchFlash('');
    setBatchMeta(null);
    setBatchRows([]);
    setBatchStore('');
    setBatchSaving(false);
    setOpenPendingRecord(null);
    setReceivedDate(todayIso());
  }

  // Ανοίγει μια ήδη αποθηκευμένη εκκρεμότητα για συμπλήρωση/ολοκλήρωση (π.χ. ο οδηγός
  // στο σημείο, την επόμενη μέρα) — ξαναφτιάχνει το matchedProduct από τα ζωντανά
  // products (με fallback στο "στιγμιότυπο" που είχε αποθηκευτεί, αν το προϊόν έχει
  // διαγραφεί στο μεταξύ).
  function openPendingDelivery(pd) {
    setBatchError('');
    setBatchFlash('');
    setBatchMeta({ orderNumber: pd.orderNumber, shipDate: pd.shipDate, storeHint: pd.storeHint });
    setBatchStore(pd.store || '');
    setReceivedDate(pd.receivedDate || todayIso());
    setBatchRows((pd.rows || []).map((r) => ({
      sku: r.sku,
      pdfName: r.pdfName || r.productDescription || '',
      qty: r.qty != null ? String(r.qty) : '1',
      matchedProduct: r.productId
        ? (products.find((p) => p.id === r.productId) || { id: r.productId, itemCode: r.productItemCode, descriptionErp: r.productDescription, descriptionGr: r.productDescription })
        : null,
      expiryDate: r.expiryDate || '',
      include: r.include !== false,
      manualQuery: ''
    })));
    setOpenPendingRecord(pd);
  }

  async function deletePendingDelivery(id) {
    if (!window.confirm(t('e_batch_pending_delete_confirm'))) return;
    try {
      await PendingDeliveries.remove(id);
      setPendingDeliveries((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setBatchError(t('e_save_error_prefix') + ' ' + (err && err.message ? err.message : String(err)));
    }
  }

  function serializeBatchRows() {
    return batchRows.map((r) => ({
      sku: r.sku,
      pdfName: r.pdfName,
      qty: r.qty,
      productId: r.matchedProduct ? r.matchedProduct.id : null,
      productItemCode: r.matchedProduct ? r.matchedProduct.itemCode : null,
      productDescription: r.matchedProduct ? (r.matchedProduct.descriptionErp || r.matchedProduct.descriptionGr) : null,
      expiryDate: r.expiryDate,
      include: r.include
    }));
  }

  async function saveBatchAsPending() {
    if (!batchStore) {
      setBatchError(t('e_batch_pick_store_error'));
      return;
    }
    if (batchRows.filter((r) => r.include).length === 0) {
      setBatchError(t('e_batch_incomplete_error'));
      return;
    }
    setBatchSaving(true);
    setBatchError('');
    try {
      if (openPendingRecord) {
        const updated = await PendingDeliveries.update(openPendingRecord.id, {
          ...openPendingRecord,
          status: 'pending',
          store: batchStore,
          receivedDate,
          rows: serializeBatchRows()
        });
        setPendingDeliveries((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await PendingDeliveries.create({
          status: 'pending',
          orderNumber: (batchMeta && batchMeta.orderNumber) || '',
          shipDate: (batchMeta && batchMeta.shipDate) || '',
          storeHint: (batchMeta && batchMeta.storeHint) || '',
          store: batchStore,
          receivedDate,
          rows: serializeBatchRows()
        });
        setPendingDeliveries((prev) => [...prev, created]);
      }
      resetBatch();
      setBatchFlash(t('e_batch_saved_pending_flash'));
      setTimeout(() => setBatchFlash(''), 2500);
    } catch (err) {
      setBatchError(t('e_save_error_prefix') + ' ' + (err && err.message ? err.message : String(err)));
    } finally {
      setBatchSaving(false);
    }
  }

  async function handleDeliveryFileChange(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBatchError('');
    setBatchParsing(true);
    setBatchMeta(null);
    setBatchRows([]);
    try {
      const { parseDeliveryNotePdf } = await import('../pdfDeliveryParser.js');
      const { meta, rows, unrecognized } = await parseDeliveryNotePdf(file);
      if (unrecognized || rows.length === 0) {
        setBatchError(t('e_batch_parse_error'));
        return;
      }
      const mapped = rows.map((r) => ({
        sku: r.sku,
        pdfName: r.name,
        qty: r.qty != null ? String(r.qty) : '1',
        matchedProduct: products.find((p) => (p.itemCode || '').trim() === r.sku.trim()) || null,
        expiryDate: '',
        include: true,
        manualQuery: ''
      }));
      setBatchMeta(meta);
      setBatchRows(mapped);
    } catch (err) {
      setBatchError(t('e_batch_parse_error') + ' (' + (err && err.message ? err.message : String(err)) + ')');
    } finally {
      setBatchParsing(false);
    }
  }

  function updateBatchRow(idx, field, value) {
    setBatchRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function pickManualProduct(idx, product) {
    setBatchRows((prev) => prev.map((r, i) => (i === idx ? { ...r, matchedProduct: product, manualQuery: '' } : r)));
  }

  const batchIncludedCount = batchRows.filter((r) => r.include).length;

  async function submitBatch() {
    if (!batchStore) {
      setBatchError(t('e_batch_pick_store_error'));
      return;
    }
    const toSave = batchRows.filter((r) => r.include);
    // Γραμμές που ΔΕΝ παραλήφθηκαν (checkbox απενεργοποιημένο) — δεν χάνονται πια σιωπηλά,
    // καταγράφονται στις "Ελλείψεις Παραλαβής" ώστε να φαίνονται και να διαγράφονται αργότερα.
    const notReceived = batchRows.filter((r) => !r.include);
    const invalid = toSave.some((r) => !r.matchedProduct || !r.expiryDate || !r.qty || Number(r.qty) <= 0);
    if (invalid || (toSave.length === 0 && notReceived.length === 0)) {
      setBatchError(t('e_batch_incomplete_error'));
      return;
    }
    setBatchSaving(true);
    setBatchError('');
    const created = [];
    try {
      for (const r of toSave) {
        // eslint-disable-next-line no-await-in-loop
        const entry = await Entries.create({
          productId: r.matchedProduct.id,
          productItemCode: r.matchedProduct.itemCode,
          productDescription: r.matchedProduct.descriptionErp || r.matchedProduct.descriptionGr,
          store: batchStore,
          expiryDate: r.expiryDate,
          quantity: r.qty
        });
        created.push(entry);
      }
      setRecentEntries((prev) => [...created.map((entry) => ({ ...entry, type: 'expiry' })), ...prev].slice(0, 8));

      if (notReceived.length > 0) {
        await DeliveryShortages.insertMany(notReceived.map((r) => ({
          sku: r.sku,
          pdfName: r.pdfName,
          productId: r.matchedProduct ? r.matchedProduct.id : null,
          productItemCode: r.matchedProduct ? r.matchedProduct.itemCode : null,
          productDescription: r.matchedProduct ? (r.matchedProduct.descriptionErp || r.matchedProduct.descriptionGr) : (r.pdfName || ''),
          qty: r.qty,
          store: batchStore,
          orderNumber: (batchMeta && batchMeta.orderNumber) || '',
          shipDate: (batchMeta && batchMeta.shipDate) || ''
        })));
      }

      if (openPendingRecord) {
        const updated = await PendingDeliveries.update(openPendingRecord.id, {
          ...openPendingRecord,
          status: 'completed',
          store: batchStore,
          receivedDate,
          rows: serializeBatchRows(),
          completedAt: new Date().toISOString()
        });
        setPendingDeliveries((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      resetBatch();
      if (notReceived.length > 0) {
        setBatchFlash(t('e_batch_shortages_flash').replace('{n}', String(notReceived.length)));
        setTimeout(() => setBatchFlash(''), 4000);
      }
    } catch (err) {
      setBatchError(t('e_save_error_prefix') + ' ' + (err && err.message ? err.message : String(err)));
    } finally {
      setBatchSaving(false);
    }
  }

  function selectEntryMode(key) {
    if (entryMode === key) return;
    if (scanning) stopScan();
    setEntryMode(key);
    resetSelection();
  }

  function handleManualLookup(e) {
    e.preventDefault();
    handleScanResult(manualBarcode);
  }

  function resetSelection() {
    setMatchedProduct(null);
    setNotFoundBarcode('');
    setManualBarcode('');
    setStore('');
    setExpiryDate('');
    setQuantity('1');
    setReason('');
    setDestructionDate(todayIso());
    setDestructionOutcome('destroyed');
    setNoBarcodeQuery('');
    setDescQuery('');
    setEntryQuery('');
    setEntryStoreFilter('');
    resetBatch();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!matchedProduct || !store) return;
    if (entryMode === 'expiry' && !expiryDate) return;
    setSaving(true);
    try {
      if (entryMode === 'expiry') {
        const entry = await Entries.create({
          productId: matchedProduct.id,
          productItemCode: matchedProduct.itemCode,
          productDescription: matchedProduct.descriptionErp || matchedProduct.descriptionGr,
          store,
          expiryDate,
          quantity
        });
        setRecentEntries((prev) => [{ ...entry, type: 'expiry' }, ...prev].slice(0, 8));
      } else if (destructionOutcome === 'sold') {
        const { record, removedEntries } = await ExpiredSales.create({
          productId: matchedProduct.id,
          productItemCode: matchedProduct.itemCode,
          productDescription: matchedProduct.descriptionErp || matchedProduct.descriptionGr,
          store,
          quantity,
          date: destructionDate
        });
        setRecentEntries((prev) => [{ ...record, removedEntries, type: 'sold' }, ...prev].slice(0, 8));
        // Ίδια λογική με την καταστροφή: αφαιρεί αυτόματα την καταχώρηση Ληγμένα στο backend.
        Entries.list().then(setExpiredEntries).catch(() => {});
      } else {
        const { record, removedEntries } = await Destructions.create({
          productId: matchedProduct.id,
          productItemCode: matchedProduct.itemCode,
          productDescription: matchedProduct.descriptionErp || matchedProduct.descriptionGr,
          store,
          quantity,
          reason,
          date: destructionDate
        });
        setRecentEntries((prev) => [{ ...record, removedEntries, type: 'destruction' }, ...prev].slice(0, 8));
        // Η καταστροφή αφαιρεί αυτόματα τις αντίστοιχες καταχωρήσεις Ληγμένα στο backend —
        // ξαναφορτώνουμε τη λίστα ώστε να μην εμφανίζονται πια εδώ ούτε στο Report Ληγμένα.
        Entries.list().then(setExpiredEntries).catch(() => {});
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      resetSelection();
    } catch (err) {
      setScanError(t('e_save_error_prefix') + ' ' + (err && err.message ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  const activeMode = ENTRY_MODES.find((m) => m.key === entryMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_entry')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#f9fafb' }}>
        <div style={{ maxWidth: method === 'delivery-pdf' && batchRows.length > 0 ? 760 : 480, margin: '0 auto', transition: 'max-width 0.15s' }}>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
            {ENTRY_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => selectEntryMode(m.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '10px 8px', borderRadius: 10,
                  border: entryMode === m.key ? `2px solid ${m.color}` : '1px solid #e1e5ea',
                  background: entryMode === m.key ? m.bg : '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, color: entryMode === m.key ? '#16233f' : '#6b7684'
                }}
              >
                <span style={{ fontSize: 16 }}>{m.icon}</span>
                {t(m.labelKey)}
              </button>
            ))}
          </div>

          {!matchedProduct && !notFoundBarcode && entryMode === 'destruction' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 18 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7684', marginBottom: 6, fontWeight: 600 }}>
                  {t('x_pick_expired_label')}
                </label>
                <select
                  value={entryStoreFilter}
                  onChange={(e) => setEntryStoreFilter(e.target.value)}
                  style={{ width: '100%', padding: '9px 10px', border: '1px solid #d7dce2', borderRadius: 6, fontSize: 13.5, marginBottom: 8 }}
                >
                  <option value="">{t('x_pick_expired_all_stores')}</option>
                  {entryStoreOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  value={entryQuery}
                  onChange={(e) => setEntryQuery(e.target.value)}
                  placeholder={t('x_pick_expired_placeholder')}
                  style={{ width: '100%', padding: '9px 10px', border: '1px solid #d7dce2', borderRadius: 6, fontSize: 13.5, marginBottom: 8 }}
                />
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #eef1f4', borderRadius: 8 }}>
                  {expiredFiltered.length === 0 ? (
                    <p style={{ padding: 12, fontSize: 12.5, color: '#97a2b0', margin: 0 }}>{t('x_no_expired_entries')}</p>
                  ) : (
                    expiredFiltered.map((entry) => {
                      const diff = daysDiff(entry.expiryDate);
                      return (
                        <div
                          key={entry.id}
                          onClick={() => selectExpiredEntry(entry)}
                          style={{ padding: '9px 12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                        >
                          <span>
                            <strong>{entry.productItemCode || '—'}</strong>
                            <span style={{ color: '#6b7684' }}> — {entry.productDescription || ''} — {entry.store}{entry.quantity != null ? ` — ${entry.quantity}` : ''}</span>
                          </span>
                          <span style={{ color: '#fff', background: diffColor(diff), padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {diffLabel(diff, t, lang)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {!matchedProduct && !notFoundBarcode && entryMode !== 'destruction' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
                {METHODS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => selectMethod(m.key)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '12px 8px', borderRadius: 10,
                      border: method === m.key ? `2px solid ${activeMode.color}` : '1px solid #e1e5ea',
                      background: method === m.key ? activeMode.bg : '#fff', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, color: method === m.key ? '#16233f' : '#6b7684'
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{m.icon}</span>
                    {t(m.labelKey)}
                  </button>
                ))}
              </div>

              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 18 }}>
                {method === 'scan' && (
                  <div>
                    {!scanning ? (
                      <button className="btn-primary" style={{ width: '100%', background: activeMode.color }} onClick={startScan} disabled={loadingProducts}>
                        📷 {t('e_scan_button')}
                      </button>
                    ) : (
                      <div>
                        <div id={scannerDivId} style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }} />
                        <button className="btn-danger" style={{ width: '100%', marginTop: 10 }} onClick={stopScan}>
                          {t('e_cancel_scan')}
                        </button>
                      </div>
                    )}
                    {scanError && <p style={{ color: '#c0392b', fontSize: 12.5, marginTop: 10 }}>{scanError}</p>}
                  </div>
                )}

                {method === 'manual' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7684', marginBottom: 6, fontWeight: 600 }}>
                      {t('e_manual_barcode')}
                    </label>
                    <form onSubmit={handleManualLookup} style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={manualBarcode}
                        onChange={(e) => setManualBarcode(e.target.value)}
                        placeholder={t('e_barcode_example')}
                        autoFocus
                        style={{ flex: 1, padding: '9px 10px', border: '1px solid #d7dce2', borderRadius: 6, fontSize: 13.5 }}
                      />
                      <button className="btn-primary" type="submit" style={{ background: activeMode.color }}>{t('e_search_button')}</button>
                    </form>
                    {scanError && <p style={{ color: '#c0392b', fontSize: 12.5, marginTop: 10 }}>{scanError}</p>}
                  </div>
                )}

                {method === 'no-barcode' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7684', marginBottom: 6, fontWeight: 600 }}>
                      {t('e_no_barcode_search')}
                    </label>
                    <input
                      value={noBarcodeQuery}
                      onChange={(e) => setNoBarcodeQuery(e.target.value)}
                      placeholder={t('e_no_barcode_placeholder')}
                      autoFocus
                      style={{ width: '100%', padding: '9px 10px', border: '1px solid #d7dce2', borderRadius: 6, fontSize: 13.5, marginBottom: 8 }}
                    />
                    <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #eef1f4', borderRadius: 8 }}>
                      {noBarcodeFiltered.length === 0 ? (
                        <p style={{ padding: 12, fontSize: 12.5, color: '#97a2b0', margin: 0 }}>{t('e_no_products_found')}</p>
                      ) : (
                        noBarcodeFiltered.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => selectProductManually(p)}
                            style={{ padding: '9px 12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer', fontSize: 13 }}
                          >
                            <strong>{p.itemCode || '—'}</strong>
                            <span style={{ color: '#6b7684' }}> — {p.descriptionErp || p.descriptionGr || ''}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {method === 'description' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7684', marginBottom: 6, fontWeight: 600 }}>
                      {t('e_method_description')}
                    </label>
                    <input
                      value={descQuery}
                      onChange={(e) => setDescQuery(e.target.value)}
                      placeholder={t('e_description_placeholder')}
                      autoFocus
                      style={{ width: '100%', padding: '9px 10px', border: '1px solid #d7dce2', borderRadius: 6, fontSize: 13.5, marginBottom: 8 }}
                    />
                    <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #eef1f4', borderRadius: 8 }}>
                      {descQuery.trim() === '' ? null : descFiltered.length === 0 ? (
                        <p style={{ padding: 12, fontSize: 12.5, color: '#97a2b0', margin: 0 }}>{t('e_no_products_found')}</p>
                      ) : (
                        descFiltered.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => selectProductManually(p)}
                            style={{ padding: '9px 12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer', fontSize: 13 }}
                          >
                            <strong>{p.itemCode || '—'}</strong>
                            <span style={{ color: '#6b7684' }}> — {p.descriptionErp || p.descriptionGr || ''}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {method === 'delivery-pdf' && (
                  <div>
                    {batchFlash && (
                      <div style={{ background: '#eef7f6', border: '1px solid #2f8f8a55', color: '#1f8f5f', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>
                        ✓ {batchFlash}
                      </div>
                    )}

                    {batchRows.length === 0 && (
                      <div>
                        {pendingDeliveriesList.length > 0 && (
                          <div style={{ marginBottom: 18 }}>
                            <label style={{ display: 'block', fontSize: 12, color: '#6b7684', marginBottom: 8, fontWeight: 600 }}>
                              ⏳ {t('e_batch_pending_list_title')} ({pendingDeliveriesList.length})
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {pendingDeliveriesList.map((pd) => (
                                <div key={pd.id} style={{ background: '#fff8e8', border: '1px solid #eddca6', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: 12.5 }}>
                                    <strong>{pd.store || '—'}</strong>
                                    <span style={{ color: '#6b7684' }}>
                                      {pd.orderNumber ? ` · ${t('e_batch_meta_order')} ${pd.orderNumber}` : ''}
                                      {pd.receivedDate ? (
                                        <>
                                          {' · '}
                                          <span style={{ color: '#3a4353', fontWeight: 600 }}>{t('e_batch_received_date_label')} {formatDMY(pd.receivedDate)}</span>
                                        </>
                                      ) : ''}
                                      {` · ${(pd.rows || []).length} ${t('e_batch_pending_items_suffix')}`}
                                      {pd.createdByEmail ? ` · ${t('e_batch_pending_created_by_prefix')} ${pd.createdByEmail}` : ''}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button type="button" className="btn-primary" style={{ padding: '5px 12px', fontSize: 12, background: activeMode.color }} onClick={() => openPendingDelivery(pd)}>
                                      {t('e_batch_pending_open_button')}
                                    </button>
                                    {canDeletePending && (
                                      <button type="button" onClick={() => deletePendingDelivery(pd.id)} title={t('common_delete')} style={{ border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 13, padding: '4px 6px' }}>🗑</button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <label style={{ display: 'block', fontSize: 12, color: '#6b7684', marginBottom: 6, fontWeight: 600 }}>
                          {pendingDeliveriesList.length > 0 ? t('e_batch_new_upload_section_title') : t('e_batch_upload_label')}
                        </label>
                        <p style={{ fontSize: 12, color: '#97a2b0', margin: '0 0 12px' }}>{t('e_batch_upload_hint')}</p>
                        <label className="btn-primary" style={{ display: 'block', textAlign: 'center', background: activeMode.color, cursor: batchParsing ? 'default' : 'pointer', opacity: batchParsing ? 0.6 : 1 }}>
                          {batchParsing ? t('e_batch_parsing') : `📄 ${t('e_batch_choose_file')}`}
                          <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={batchParsing} onChange={handleDeliveryFileChange} />
                        </label>
                        {batchError && <p style={{ color: '#c0392b', fontSize: 12.5, marginTop: 10 }}>{batchError}</p>}
                      </div>
                    )}

                    {batchRows.length > 0 && (
                      <div>
                        {openPendingRecord && (
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#8a6116', marginBottom: 8, textTransform: 'uppercase' }}>
                            ⏳ {t('e_batch_editing_pending_title')}
                          </div>
                        )}
                        {batchMeta && (
                          <div style={{ background: '#f4f6f8', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#3a4353', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                            {batchMeta.orderNumber && <span><strong>{t('e_batch_meta_order')}:</strong> {batchMeta.orderNumber}</span>}
                            {batchMeta.shipDate && <span><strong>{t('e_batch_meta_ship_date')}:</strong> {batchMeta.shipDate}</span>}
                            {batchMeta.storeHint && <span><strong>{t('e_batch_meta_store_hint')}:</strong> {batchMeta.storeHint}</span>}
                          </div>
                        )}

                        <div className="field" style={{ marginBottom: 14 }}>
                          <label>{t('e_batch_store_label')}</label>
                          <select value={batchStore} onChange={(e) => setBatchStore(e.target.value)}>
                            <option value="">{t('common_select_placeholder')}</option>
                            {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>

                        <div className="field" style={{ marginBottom: 14 }}>
                          <label>{t('e_batch_received_date_label')}</label>
                          <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
                        </div>

                        <div style={{ overflowX: 'auto', border: '1px solid #eef1f4', borderRadius: 8, marginBottom: 14 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
                            <thead>
                              <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11, textTransform: 'uppercase', background: '#f4f6f8' }}>
                                <th style={{ padding: '7px 8px' }}></th>
                                <th style={{ padding: '7px 8px' }}>{t('e_batch_col_sku')}</th>
                                <th style={{ padding: '7px 8px' }}>{t('e_batch_col_product')}</th>
                                <th style={{ padding: '7px 8px', width: 70 }}>{t('e_batch_col_qty')}</th>
                                <th style={{ padding: '7px 8px', width: 150 }}>{t('e_batch_col_expiry')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batchRows.map((row, idx) => {
                                const matchQuery = row.manualQuery.trim().toLowerCase();
                                const matchOptions = matchQuery
                                  ? products.filter((p) => !isUnfinishedPlaceholder(p) && (
                                      (p.itemCode || '').toLowerCase().includes(matchQuery) ||
                                      (p.descriptionErp || '').toLowerCase().includes(matchQuery) ||
                                      (p.descriptionGr || '').toLowerCase().includes(matchQuery)
                                    )).slice(0, 10)
                                  : [];
                                return (
                                  <tr key={idx} style={{ borderTop: '1px solid #eef1f4', opacity: row.include ? 1 : 0.45 }}>
                                    <td style={{ padding: '6px 8px' }}>
                                      <input type="checkbox" checked={row.include} onChange={(e) => updateBatchRow(idx, 'include', e.target.checked)} />
                                    </td>
                                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{row.sku}</td>
                                    <td style={{ padding: '6px 8px' }}>
                                      {row.matchedProduct ? (
                                        <span>{row.matchedProduct.descriptionErp || row.matchedProduct.descriptionGr}</span>
                                      ) : (
                                        <div>
                                          <div style={{ color: '#c0392b', fontSize: 11.5, marginBottom: 4 }}>
                                            ⚠ {t('e_batch_unmatched_prefix')} ({row.pdfName})
                                          </div>
                                          <input
                                            value={row.manualQuery}
                                            onChange={(e) => updateBatchRow(idx, 'manualQuery', e.target.value)}
                                            placeholder={t('e_batch_manual_pick_placeholder')}
                                            style={{ width: '100%', padding: '5px 7px', border: '1px solid #d7dce2', borderRadius: 5, fontSize: 12 }}
                                          />
                                          {matchOptions.length > 0 && (
                                            <div style={{ border: '1px solid #eef1f4', borderRadius: 6, marginTop: 4, maxHeight: 140, overflowY: 'auto' }}>
                                              {matchOptions.map((p) => (
                                                <div
                                                  key={p.id}
                                                  onClick={() => pickManualProduct(idx, p)}
                                                  style={{ padding: '5px 8px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer', fontSize: 11.5 }}
                                                >
                                                  <strong>{p.itemCode || '—'}</strong> — {p.descriptionErp || p.descriptionGr || ''}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <input
                                        type="number" min="0" step="1"
                                        value={row.qty}
                                        onChange={(e) => updateBatchRow(idx, 'qty', e.target.value)}
                                        style={{ width: '100%', padding: '5px 7px', border: '1px solid #d7dce2', borderRadius: 5, fontSize: 12.5 }}
                                      />
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <input
                                        type="date"
                                        value={row.expiryDate}
                                        onChange={(e) => updateBatchRow(idx, 'expiryDate', e.target.value)}
                                        style={{ width: '100%', padding: '5px 7px', border: '1px solid #d7dce2', borderRadius: 5, fontSize: 12.5 }}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {batchError && <p style={{ color: '#c0392b', fontSize: 12.5, marginBottom: 10 }}>{batchError}</p>}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="btn-primary" type="button" style={{ flex: 1, minWidth: 160, background: activeMode.color }} disabled={batchSaving} onClick={submitBatch}>
                            {batchSaving ? t('e_saving') : openPendingRecord ? t('e_batch_complete_button') : `${t('e_batch_row_count_prefix')} (${batchIncludedCount})`}
                          </button>
                          {!openPendingRecord && (
                            <button className="btn-secondary" type="button" style={{ flex: 1, minWidth: 160 }} disabled={batchSaving} onClick={saveBatchAsPending}>
                              ⏳ {t('e_batch_save_pending_button')}
                            </button>
                          )}
                          <button className="btn-danger" type="button" onClick={resetBatch}>
                            {openPendingRecord ? t('e_batch_close_button') : t('e_batch_cancel_button')}
                          </button>
                        </div>
                        {!openPendingRecord && (
                          <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '8px 0 0' }}>{t('e_batch_save_pending_hint')}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {notFoundBarcode && (
            <div style={{ background: '#fdf1ef', border: '1px solid #e3b3ac', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <p style={{ margin: 0, color: '#c0392b', fontSize: 13.5 }}>
                {t('e_not_found_prefix')} <strong>{notFoundBarcode}</strong>
              </p>
              <button className="btn-danger" style={{ marginTop: 10 }} onClick={resetSelection}>{t('e_try_again')}</button>
            </div>
          )}

          {matchedProduct && (
            <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 18 }}>
              <div style={{ background: activeMode.bg, border: `1px solid ${activeMode.color}55`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11.5, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t('e_product_label')}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#16233f' }}>{matchedProduct.itemCode}</div>
                <div style={{ fontSize: 13, color: '#3a4353' }}>{matchedProduct.descriptionErp || matchedProduct.descriptionGr}</div>
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <label>{t('e_store_label')}</label>
                <select value={store} onChange={(e) => setStore(e.target.value)} required>
                  <option value="">{t('common_select_placeholder')}</option>
                  {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <label>{t('e_quantity_label')}</label>
                <input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
              </div>

              {entryMode === 'expiry' ? (
                <div className="field" style={{ marginBottom: 16 }}>
                  <label>{t('e_expiry_label')}</label>
                  <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
                </div>
              ) : (
                <>
                  <div className="field" style={{ marginBottom: 14 }}>
                    <label>{t('x_outcome_label')}</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setDestructionOutcome('destroyed')}
                        style={{
                          padding: '9px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                          border: destructionOutcome === 'destroyed' ? '2px solid #c0392b' : '1px solid #e1e5ea',
                          background: destructionOutcome === 'destroyed' ? '#fdecea' : '#fff',
                          color: destructionOutcome === 'destroyed' ? '#16233f' : '#6b7684'
                        }}
                      >
                        🗑️ {t('x_outcome_destroyed')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDestructionOutcome('sold')}
                        style={{
                          padding: '9px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                          border: destructionOutcome === 'sold' ? '2px solid #2f8f8a' : '1px solid #e1e5ea',
                          background: destructionOutcome === 'sold' ? '#eef7f6' : '#fff',
                          color: destructionOutcome === 'sold' ? '#16233f' : '#6b7684'
                        }}
                      >
                        💰 {t('x_outcome_sold')}
                      </button>
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 14 }}>
                    <label>{destructionOutcome === 'sold' ? t('x_sold_date_label') : t('x_date_label')}</label>
                    <input type="date" value={destructionDate} onChange={(e) => setDestructionDate(e.target.value)} required />
                  </div>
                  {destructionOutcome === 'destroyed' && (
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>{t('x_reason_label')}</label>
                      <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('x_reason_placeholder')} />
                    </div>
                  )}
                  <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 16px' }}>
                    {destructionOutcome === 'sold' ? t('x_sold_auto_remove_hint') : t('x_auto_remove_hint')}
                  </p>
                </>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" type="submit" style={{ flex: 1, background: activeMode.color }} disabled={saving}>
                  {saving
                    ? t('e_saving')
                    : savedFlash
                    ? t('common_saved')
                    : entryMode === 'expiry'
                    ? t('e_submit_button')
                    : destructionOutcome === 'sold'
                    ? t('x_submit_button_sold')
                    : t('x_submit_button')}
                </button>
                <button className="btn-danger" type="button" onClick={resetSelection}>{t('common_cancel')}</button>
              </div>
            </form>
          )}

          {recentEntries.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 12, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
                {t('e_recent_entries')}
              </div>
              {recentEntries.map((e) => (
                <div key={e.id} style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 8, padding: '10px 12px', marginBottom: 6, fontSize: 13 }}>
                  {e.type === 'destruction' ? (
                    <>
                      <span style={{ marginRight: 4 }}>🗑️</span>
                      <strong>{e.productItemCode}</strong> — {e.store} — {t('e_quantity_label').toLowerCase()}: {e.quantity ?? '—'}
                      {e.removedEntries > 0 && (
                        <span style={{ color: '#2f8f8a' }}> · {t('x_removed_from_expired').replace('{n}', e.removedEntries)}</span>
                      )}
                    </>
                  ) : e.type === 'sold' ? (
                    <>
                      <span style={{ marginRight: 4 }}>💰</span>
                      <strong>{e.productItemCode}</strong> — {e.store} — {t('e_quantity_label').toLowerCase()}: {e.quantity ?? '—'}
                      {e.removedEntries > 0 && (
                        <span style={{ color: '#2f8f8a' }}> · {t('x_removed_from_expired').replace('{n}', e.removedEntries)}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span style={{ marginRight: 4 }}>⏰</span>
                      <strong>{e.productItemCode}</strong> — {e.store} — {t('e_quantity_label').toLowerCase()}: {e.quantity ?? '—'} — {t('e_expiry_label').toLowerCase()}: {e.expiryDate}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
