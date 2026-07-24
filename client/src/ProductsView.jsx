import React, { useEffect, useRef, useState } from 'react';
import { Products, StoreEquipment, upload } from '../api.js';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEJAVU_SANS_BASE64 } from '../dejavu-font.js';
import { useLanguage } from '../LanguageContext.jsx';

const STORE_CANDIDATES = ['DEMO', 'Plaisio', 'Novibet', 'Kryoneri', 'Nestle', 'AIA', 'Metlen', 'ACS Courier'];

// Οι κατηγορίες είναι δεδομένα προϊόντος (όχι κείμενο διεπαφής) — παραμένουν ίδιες
// ανεξάρτητα από τη γλώσσα της εφαρμογής.
const CATEGORIES = [
  { gr: 'THREPSIS ΓΕΥΜΑΤΑ', en: 'THREPSIS MAIN DISHES' },
  { gr: 'ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ', en: 'SODA - WATER' },
  { gr: 'ΓΑΛΑΚΤΟΚΟΜΙΚΑ', en: 'YOGURTS' },
  { gr: 'ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ', en: 'NUTS & SWEETS' },
  { gr: 'ΣΑΛΑΤΕΣ', en: 'SALADS' },
  { gr: 'ΦΡΟΥΤΑ', en: 'FRUITS' },
  { gr: 'ΧΥΜΟΙ - ΤΣΑΪ', en: 'BEVERAGES' },
  { gr: 'ΣΑΝΤΟΥΙΤΣ - Golden Sandwich', en: 'SANDWICHES - G.S.' },
  { gr: 'PARMA', en: 'PARMA' },
  { gr: 'ΡΟΦΗΜΑΤΑ', en: 'COFFEE' }
];

// Οι ετικέτες των στηλών ΕΙΝΑΙ κείμενο διεπαφής — μεταφράζονται μέσω t().
function buildAllColumns(t) {
  return [
    { key: 'categoryGr', label: t('p_col_categoryGr') },
    { key: 'categoryEn', label: t('p_col_categoryEn') },
    { key: 'itemCode', label: t('p_col_itemCode') },
    { key: 'barcode', label: t('p_col_barcode') },
    { key: 'descriptionErp', label: t('p_col_descriptionErp') },
    { key: 'descriptionGr', label: t('p_col_descriptionGr') },
    { key: 'descriptionEn', label: t('p_col_descriptionEn') },
    { key: 'detailedDescriptionGr', label: t('p_col_detailedDescriptionGr') },
    { key: 'detailedDescriptionEn', label: t('p_col_detailedDescriptionEn') },
    { key: 'unitsPerMachine', label: t('p_col_unitsPerMachine') },
    { key: 'status', label: t('p_col_status') },
    { key: 'region', label: t('p_col_region') },
    { key: 'activeOnMachine', label: t('p_col_activeOnMachine') },
    { key: 'activeStores', label: t('p_col_activeStores') },
    { key: 'sellingPrice', label: t('p_col_sellingPrice') },
    { key: 'vatPercent', label: t('p_col_vatPercent') },
    { key: 'ptk', label: t('p_col_ptk') },
    { key: 'fc', label: t('p_col_fc') },
    { key: 'images365', label: t('p_col_images365') },
    { key: 'imagesPromo', label: t('p_col_imagesPromo') }
  ];
}

const DEFAULT_VISIBLE_COLUMNS = ['categoryGr', 'itemCode', 'barcode', 'descriptionErp', 'status', 'region', 'images365'];

// Η περιοχή είναι δεδομένο προϊόντος (τοποθεσία) — δεν μεταφράζεται.
const REGION_OPTIONS = ['Αθήνα', 'Θεσσαλονίκη', 'Παντού'];

// Στήλες που επεξεργάζονται απευθείας μέσα στον πίνακα (χωρίς να ανοίγει η κάρτα).
const INLINE_EDITABLE_TEXT_KEYS = new Set([
  'itemCode', 'descriptionErp', 'descriptionGr', 'descriptionEn',
  'detailedDescriptionGr', 'detailedDescriptionEn'
]);
const INLINE_EDITABLE_NUMBER_KEYS = new Set(['unitsPerMachine']);

function statusColor(value) {
  return value === 'ΕΚΤΟΣ' ? '#c0392b' : '#27ae60';
}
function statusBadgeStyle(color) {
  return { display: 'inline-block', color: '#fff', background: color, padding: '3px 9px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 };
}

function computeFC(p) {
  const vat = p.cost?.vatPercent || 0;
  const price = p.cost?.sellingPrice || 0;
  const ptk = p.cost?.ptk || 0;
  const net = price ? price / (1 + vat / 100) : 0;
  return net > 0 ? (ptk / net) * 100 : NaN;
}

function parseStoreColKey(key) {
  if (!key.startsWith('store:')) return null;
  const parts = key.split(':');
  return { storeName: parts[1], field: parts[2] };
}

function getStoreColumnValue(p, storeName, field) {
  const s = (p.stores || []).find((x) => x.name === storeName);
  if (!s) return null;
  const vat = p.cost?.vatPercent || 0;
  const ptk = p.cost?.ptk || 0;
  if (field === 'price') return s.sellingPriceStore;
  if (field === 'priceQF') return s.sellingPriceQF;
  if (field === 'fc') {
    const net = s.sellingPriceStore ? s.sellingPriceStore / (1 + vat / 100) : null;
    return net ? (ptk / net) * 100 : NaN;
  }
  if (field === 'fcQF') {
    const net = s.sellingPriceQF ? s.sellingPriceQF / (1 + vat / 100) : null;
    return net ? (ptk / net) * 100 : NaN;
  }
  return null;
}

function getColumnValue(p, key) {
  const storeCol = parseStoreColKey(key);
  if (storeCol) return getStoreColumnValue(p, storeCol.storeName, storeCol.field);
  if (key === 'sellingPrice') return p.cost?.sellingPrice ?? null;
  if (key === 'vatPercent') return p.cost?.vatPercent ?? null;
  if (key === 'ptk') return p.cost?.ptk ?? null;
  if (key === 'fc') return computeFC(p);
  if (key === 'activeStores') return (p.activeStores || []).join(', ');
  if (key === 'barcode') return (p.barcodes || []).join(', ');
  return p[key];
}

function getFilterText(p, key) {
  const storeCol = parseStoreColKey(key);
  if (storeCol) {
    const v = getStoreColumnValue(p, storeCol.storeName, storeCol.field);
    if (storeCol.field === 'fc' || storeCol.field === 'fcQF') return isFinite(v) ? Math.round(v) + '' : '';
    return v === null || v === undefined ? '' : String(v);
  }
  if (key === 'images365' || key === 'imagesPromo') return (p[key] || []).length ? 'έχει εικόνα' : '';
  if (key === 'fc') {
    const v = computeFC(p);
    return isFinite(v) ? Math.round(v) + '' : '';
  }
  const v = getColumnValue(p, key);
  return v === null || v === undefined ? '' : String(v);
}

function fmtEuro(n) { return isFinite(n) ? n.toFixed(2) + ' €' : '-'; }
function fmtPct(n) { return isFinite(n) ? Math.round(n) + ' %' : '∞ %'; }

// Τιμή στήλης έτοιμη για εξαγωγή (Excel/PDF) — αριθμοί μένουν αριθμοί, ώστε
// να μπορούν να γίνουν υπολογισμοί στο Excel.
function getExportValue(p, col) {
  const storeCol = parseStoreColKey(col.key);
  if (storeCol && (storeCol.field === 'fc' || storeCol.field === 'fcQF')) {
    const v = getStoreColumnValue(p, storeCol.storeName, storeCol.field);
    return isFinite(v) ? Math.round(v) : '';
  }
  if (col.key === 'fc') {
    const v = computeFC(p);
    return isFinite(v) ? Math.round(v) : '';
  }
  if (col.key === 'images365' || col.key === 'imagesPromo') {
    const v = p[col.key];
    return v && v.length ? 'Ναι' : '';
  }
  const v = getColumnValue(p, col.key);
  return v === null || v === undefined ? '' : v;
}

const VIEW_STATE_KEY = 'qf_products_view_state';
function loadViewState() {
  try {
    const raw = localStorage.getItem(VIEW_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore corrupt/unavailable storage
  }
  return null;
}

const inlineInputStyle = {
  width: '100%', border: '1px solid transparent', background: 'transparent',
  padding: '3px 4px', fontSize: 12.5, fontFamily: 'inherit', color: 'inherit', borderRadius: 4
};

const thumbBtnStyle = {
  width: 18, height: 18, borderRadius: 4, border: 'none', background: 'rgba(0,0,0,0.6)',
  color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0
};

export default function ProductsView({ readOnly = false }) {
  const { t } = useLanguage();
  const ALL_COLUMNS = buildAllColumns(t);
  const [products, setProducts] = useState([]);
  const [current, setCurrent] = useState(null);
  const [tab, setTab] = useState('info');
  const [savedFlash, setSavedFlash] = useState(false);

  const [viewMode, setViewMode] = useState('table');
  const [tableViews, setTableViews] = useState(
    () => loadViewState()?.tableViews || [{ id: 'data', name: 'Data', columns: DEFAULT_VISIBLE_COLUMNS }]
  );
  const [activeViewId, setActiveViewId] = useState(() => loadViewState()?.activeViewId || 'data');
  const [showColPicker, setShowColPicker] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});
  const [storeOptions, setStoreOptions] = useState(STORE_CANDIDATES);
  // Κεντρική/έγκυρη λίστα καταστημάτων (σελίδα "Καταστήματα") — πηγή για το
  // "Ενεργό Σε Κατάστημα", ώστε να μην ξαναδημιουργούνται διπλότυπα με ελεύθερο κείμενο εδώ.
  const [canonicalStores, setCanonicalStores] = useState([]);
  const [sortKey, setSortKey] = useState(() => loadViewState()?.sortKey ?? null);
  const [sortDir, setSortDir] = useState(() => loadViewState()?.sortDir || 'asc');
  const [barcodeInput, setBarcodeInput] = useState('');

  const cardSaveTimer = useRef(null);
  const inlineSaveTimers = useRef({});

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({ tableViews, activeViewId, sortKey, sortDir }));
    } catch (e) {
      // ignore storage errors (e.g. private browsing quota)
    }
  }, [tableViews, activeViewId, sortKey, sortDir]);

  useEffect(() => {
    Products.list().then((list) => {
      setProducts(list);
      const extra = new Set();
      list.forEach((p) => (p.stores || []).forEach((s) => extra.add(s.name)));
      setStoreOptions((prev) => Array.from(new Set([...prev, ...extra])));
    });
    StoreEquipment.list().then((se) => {
      const set = new Set();
      se.forEach((r) => { const clean = (r.store || '').trim(); if (clean) set.add(clean); });
      setCanonicalStores(Array.from(set).sort());
    }).catch(() => {});
  }, []);

  async function selectProduct(id) {
    const p = products.find((x) => x.id === id) || (await Products.get(id));
    setCurrent(p);
    setTab('info');
    setViewMode('card');
  }

  async function handleNew() {
    const p = await Products.create({ descriptionGr: 'Νέο προϊόν' });
    setProducts((prev) => [...prev, p]);
    setCurrent(p);
    setTab('info');
    setViewMode('card');
  }

  // ---------- Card view: auto-save (debounced) ----------
  function scheduleCardSave(record) {
    if (cardSaveTimer.current) clearTimeout(cardSaveTimer.current);
    cardSaveTimer.current = setTimeout(async () => {
      const saved = await Products.update(record.id, record);
      setCurrent((prev) => (prev && prev.id === saved.id ? saved : prev));
      setProducts((list) => list.map((p) => (p.id === saved.id ? saved : p)));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    }, 700);
  }
  function applyCardUpdate(updater) {
    setCurrent((prev) => {
      const next = updater(prev);
      scheduleCardSave(next);
      return next;
    });
  }

  function updateField(key, value) {
    applyCardUpdate((prev) => ({ ...prev, [key]: value }));
  }
  function addBarcode() {
    const code = barcodeInput.trim();
    if (!code) return;
    applyCardUpdate((prev) => ({ ...prev, barcodes: [...(prev.barcodes || []), code] }));
    setBarcodeInput('');
  }
  function removeBarcode(idx) {
    applyCardUpdate((prev) => ({ ...prev, barcodes: (prev.barcodes || []).filter((_, i) => i !== idx) }));
  }
  function updateCost(key, value) {
    applyCardUpdate((prev) => ({ ...prev, cost: { ...prev.cost, [key]: value } }));
  }
  function updateStore(idx, field, value) {
    applyCardUpdate((prev) => {
      const stores = prev.stores.map((s, i) =>
        i === idx ? { ...s, [field]: value === '' ? null : parseFloat(value) } : s
      );
      return { ...prev, stores };
    });
  }
  // Προσθέτει ένα νέο κατάστημα σε ΟΛΑ τα προϊόντα (όχι μόνο στο τρέχον),
  // ώστε να εμφανίζεται αμέσως στον πίνακα Stores κάθε προϊόντος, και το
  // αποθηκεύει στη βάση. Επιστρέφει τη λίστα προϊόντων μετά την ενημέρωση.
  async function addStoreEverywhere(rawName) {
    const trimmed = (rawName || '').trim();
    if (!trimmed) return null;
    if (!storeOptions.includes(trimmed)) {
      setStoreOptions((prev) => [...prev, trimmed]);
    }
    const updatedList = await Promise.all(
      products.map(async (p) => {
        if ((p.stores || []).some((s) => s.name === trimmed)) return p;
        const updatedProduct = {
          ...p,
          stores: [...(p.stores || []), { name: trimmed, sellingPriceStore: null, sellingPriceQF: null }]
        };
        try {
          return await Products.update(p.id, updatedProduct);
        } catch (e) {
          console.error('Αποτυχία ενημέρωσης προϊόντος', p.id, e);
          return updatedProduct;
        }
      })
    );
    setProducts(updatedList);
    setCurrent((prev) => (prev ? updatedList.find((p) => p.id === prev.id) || prev : prev));
    return updatedList;
  }
  async function addStore() {
    const name = window.prompt(t('p_add_store_prompt'));
    if (!name || !name.trim()) return;
    await addStoreEverywhere(name);
  }
  function removeStore(idx) {
    applyCardUpdate((prev) => ({ ...prev, stores: prev.stores.filter((_, i) => i !== idx) }));
  }
  function toggleActiveStore(name) {
    applyCardUpdate((prev) => {
      const active = prev.activeStores.includes(name)
        ? prev.activeStores.filter((n) => n !== name)
        : [...prev.activeStores, name];
      return { ...prev, activeStores: active };
    });
  }
  async function addStoreOption() {
    const name = window.prompt(t('p_add_store_prompt'));
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    await addStoreEverywhere(trimmed);
    applyCardUpdate((prev) => (prev.activeStores.includes(trimmed) ? prev : { ...prev, activeStores: [...prev.activeStores, trimmed] }));
  }
  function removeStoreOption(name) {
    if (!window.confirm(`${t('p_remove_store_confirm_prefix')} "${name}" ${t('p_remove_store_confirm_suffix')}`)) return;
    setStoreOptions((prev) => prev.filter((n) => n !== name));
  }

  async function handleImageUpload(key, file) {
    if (!file) return;
    const { url } = await upload(file);
    applyCardUpdate((prev) => ({ ...prev, [key]: [...(prev[key] || []), url] }));
  }
  function removeImage(key, idx) {
    if (!window.confirm(t('p_remove_photo_confirm'))) return;
    applyCardUpdate((prev) => ({ ...prev, [key]: (prev[key] || []).filter((_, i) => i !== idx) }));
  }
  async function downloadImage(url, filename) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      window.open(url, '_blank');
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('p_delete_product_confirm'))) return;
    await Products.remove(current.id);
    setProducts((list) => list.filter((p) => p.id !== current.id));
    setCurrent(null);
    setViewMode('table');
  }

  // ---------- Table view: inline editing (debounced per-row) ----------
  function scheduleInlineSave(productId) {
    if (inlineSaveTimers.current[productId]) clearTimeout(inlineSaveTimers.current[productId]);
    inlineSaveTimers.current[productId] = setTimeout(async () => {
      setProducts((list) => {
        const record = list.find((p) => p.id === productId);
        if (record) {
          Products.update(productId, record).then((saved) => {
            setProducts((list2) => list2.map((p) => (p.id === saved.id ? saved : p)));
            setCurrent((prev) => (prev && prev.id === saved.id ? saved : prev));
          });
        }
        return list;
      });
    }, 700);
  }
  function updateProductInline(productId, updater) {
    setProducts((prevList) => prevList.map((p) => (p.id === productId ? updater(p) : p)));
    setCurrent((prev) => (prev && prev.id === productId ? updater(prev) : prev));
    scheduleInlineSave(productId);
  }

  function toggleColumn(key) {
    setTableViews((prev) =>
      prev.map((v) =>
        v.id === activeViewId
          ? { ...v, columns: v.columns.includes(key) ? v.columns.filter((k) => k !== key) : [...v.columns, key] }
          : v
      )
    );
  }
  function moveColumn(key, direction) {
    setTableViews((prev) =>
      prev.map((v) => {
        if (v.id !== activeViewId) return v;
        const idx = v.columns.indexOf(key);
        if (idx === -1) return v;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= v.columns.length) return v;
        const cols = [...v.columns];
        [cols[idx], cols[newIdx]] = [cols[newIdx], cols[idx]];
        return { ...v, columns: cols };
      })
    );
  }
  function addTableView() {
    const name = window.prompt(t('p_new_view_prompt'));
    if (!name || !name.trim()) return;
    const id = 'view-' + Date.now();
    setTableViews((prev) => [...prev, { id, name: name.trim(), columns: activeView.columns }]);
    setActiveViewId(id);
  }
  function renameTableView(id) {
    const existing = tableViews.find((v) => v.id === id);
    const name = window.prompt(t('p_rename_view_prompt'), existing ? existing.name : '');
    if (!name || !name.trim()) return;
    setTableViews((prev) => prev.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)));
  }
  function removeTableView(id) {
    if (tableViews.length === 1) return;
    if (!window.confirm(t('p_delete_view_confirm'))) return;
    setTableViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId(tableViews.find((v) => v.id !== id)?.id || tableViews[0].id);
  }

  const activeView = tableViews.find((v) => v.id === activeViewId) || tableViews[0];
  const visibleColumns = activeView.columns;

  const storeColumnDefs = storeOptions.flatMap((name) => [
    { key: `store:${name}:price`, label: `${name} ${t('p_store_price_suffix')}` },
    { key: `store:${name}:fc`, label: `${name} ${t('p_store_fc_suffix')}` },
    { key: `store:${name}:priceQF`, label: `${name} ${t('p_store_priceQF_suffix')}` },
    { key: `store:${name}:fcQF`, label: `${name} ${t('p_store_fcQF_suffix')}` }
  ]);
  const allColumnDefs = [...ALL_COLUMNS, ...storeColumnDefs];
  // Η σειρά εμφάνισης ακολουθεί τη σειρά μέσα στο visibleColumns (όχι τη σταθερή σειρά ALL_COLUMNS),
  // ώστε να δουλεύει η μετακίνηση στηλών δεξιά/αριστερά.
  const visibleColumnDefs = visibleColumns
    .map((key) => allColumnDefs.find((col) => col.key === key))
    .filter(Boolean);
  const filteredProducts = products.filter((p) =>
    visibleColumnDefs.every((col) => {
      const f = (columnFilters[col.key] || '').trim().toLowerCase();
      if (!f) return true;
      return getFilterText(p, col.key).toLowerCase().includes(f);
    })
  );

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortedProducts = (() => {
    if (!sortKey) return filteredProducts;
    const withVal = filteredProducts.map((p) => ({ p, v: getColumnValue(p, sortKey) }));
    withVal.sort((a, b) => {
      let av = a.v;
      let bv = b.v;
      const aEmpty = av === null || av === undefined || av === '' || (typeof av === 'number' && isNaN(av));
      const bEmpty = bv === null || bv === undefined || bv === '' || (typeof bv === 'number' && isNaN(bv));
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
    return withVal.map((x) => x.p);
  })();

  function exportExcel() {
    const rows = sortedProducts.map((p) => {
      const row = {};
      visibleColumnDefs.forEach((col) => { row[col.label] = getExportValue(p, col); });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Product List');
    XLSX.writeFile(wb, `quick-fresh-products-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape' });
    // Embed a Unicode font (Greek + Latin) — jsPDF's built-in fonts can't render Greek text.
    doc.addFileToVFS('DejaVuSans.ttf', DEJAVU_SANS_BASE64);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(12);
    doc.text('Quick & Fresh — Product List', 14, 12);
    autoTable(doc, {
      startY: 18,
      head: [visibleColumnDefs.map((col) => col.label)],
      body: sortedProducts.map((p) => visibleColumnDefs.map((col) => {
        const v = getExportValue(p, col);
        return v === null || v === undefined ? '' : String(v);
      })),
      styles: { fontSize: 7, cellPadding: 2, font: 'DejaVuSans' },
      headStyles: { fillColor: [47, 143, 138], font: 'DejaVuSans' }
    });
    doc.save(`quick-fresh-products-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const cost = current?.cost || { sellingPrice: 0, ptk: 0, quantity: 0, vatPercent: 13 };
  const vat = cost.vatPercent || 0;
  const net = cost.sellingPrice ? cost.sellingPrice / (1 + vat / 100) : 0;
  const fc = net > 0 ? ((cost.ptk || 0) / net) * 100 : NaN;

  // Επεξεργάσιμο κελί πίνακα — κλικ μέσα δεν ανοίγει την κάρτα.
  function renderCell(p, col) {
    const stop = (e) => e.stopPropagation();

    if (readOnly) {
      const storeColRO = parseStoreColKey(col.key);
      const value = getColumnValue(p, col.key);
      if (col.key === 'fc' || (storeColRO && (storeColRO.field === 'fc' || storeColRO.field === 'fcQF'))) {
        return isFinite(value) ? fmtPct(value) : '—';
      }
      if (col.key === 'images365' || col.key === 'imagesPromo') {
        return value && value[0] ? <img src={value[0]} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} /> : <span style={{ color: '#d7dce2' }}>—</span>;
      }
      if (col.key === 'status') {
        return <span style={statusBadgeStyle(statusColor(p.status || 'ΕΝΤΟΣ'))}>{p.status || 'ΕΝΤΟΣ'}</span>;
      }
      if (col.key === 'sellingPrice' || col.key === 'ptk') return isFinite(value) ? fmtEuro(value) : '—';
      if (storeColRO && (storeColRO.field === 'price' || storeColRO.field === 'priceQF')) return isFinite(value) ? fmtEuro(value) : '—';
      return value || '—';
    }

    if (col.key === 'categoryGr' || col.key === 'categoryEn') {
      return (
        <select
          value={p[col.key] || ''}
          onClick={stop}
          onChange={(e) => {
            const val = e.target.value;
            const pair = col.key === 'categoryGr'
              ? CATEGORIES.find((c) => c.gr === val)
              : CATEGORIES.find((c) => c.en === val);
            updateProductInline(p.id, (prod) => ({
              ...prod,
              categoryGr: pair ? pair.gr : (col.key === 'categoryGr' ? val : prod.categoryGr),
              categoryEn: pair ? pair.en : (col.key === 'categoryEn' ? val : prod.categoryEn)
            }));
          }}
          style={inlineInputStyle}
        >
          <option value="">—</option>
          {CATEGORIES.map((c) => (
            <option key={c.gr} value={col.key === 'categoryGr' ? c.gr : c.en}>
              {col.key === 'categoryGr' ? c.gr : c.en}
            </option>
          ))}
        </select>
      );
    }
    if (col.key === 'barcode') {
      return (
        <input
          value={(p.barcodes || []).join(', ')}
          onClick={stop}
          placeholder={t('p_barcode_placeholder')}
          onChange={(e) =>
            updateProductInline(p.id, (prod) => ({
              ...prod,
              barcodes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
            }))
          }
          style={inlineInputStyle}
        />
      );
    }
    if (INLINE_EDITABLE_TEXT_KEYS.has(col.key)) {
      return (
        <input
          value={p[col.key] || ''}
          onClick={stop}
          onChange={(e) => updateProductInline(p.id, (prod) => ({ ...prod, [col.key]: e.target.value }))}
          style={inlineInputStyle}
        />
      );
    }
    if (INLINE_EDITABLE_NUMBER_KEYS.has(col.key)) {
      return (
        <input
          type="number"
          value={p[col.key] ?? ''}
          onClick={stop}
          onChange={(e) => updateProductInline(p.id, (prod) => ({ ...prod, [col.key]: e.target.value === '' ? null : +e.target.value }))}
          style={inlineInputStyle}
        />
      );
    }
    if (col.key === 'status') {
      const sv = p.status || 'ΕΝΤΟΣ';
      return (
        <select
          value={sv}
          onClick={stop}
          onChange={(e) => updateProductInline(p.id, (prod) => ({ ...prod, status: e.target.value }))}
          style={{ ...inlineInputStyle, background: statusColor(sv), color: '#fff', fontWeight: 600, borderRadius: 10 }}
        >
          <option>ΕΝΤΟΣ</option>
          <option>ΕΚΤΟΣ</option>
        </select>
      );
    }
    if (col.key === 'region') {
      return (
        <select
          value={p.region || ''}
          onClick={stop}
          onChange={(e) => updateProductInline(p.id, (prod) => ({ ...prod, region: e.target.value }))}
          style={inlineInputStyle}
        >
          <option value="">—</option>
          {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      );
    }
    if (col.key === 'activeOnMachine') {
      return (
        <select
          value={p.activeOnMachine || 'YES'}
          onClick={stop}
          onChange={(e) => updateProductInline(p.id, (prod) => ({ ...prod, activeOnMachine: e.target.value }))}
          style={inlineInputStyle}
        >
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
      );
    }
    if (col.key === 'sellingPrice' || col.key === 'ptk' || col.key === 'vatPercent') {
      const field = col.key === 'sellingPrice' ? 'sellingPrice' : col.key === 'ptk' ? 'ptk' : 'vatPercent';
      return (
        <input
          type="number"
          step="0.01"
          value={p.cost?.[field] ?? ''}
          onClick={stop}
          onChange={(e) =>
            updateProductInline(p.id, (prod) => ({
              ...prod,
              cost: { ...prod.cost, [field]: e.target.value === '' ? 0 : parseFloat(e.target.value) }
            }))
          }
          style={inlineInputStyle}
        />
      );
    }
    const storeCol = parseStoreColKey(col.key);
    if (storeCol && (storeCol.field === 'price' || storeCol.field === 'priceQF')) {
      const storeField = storeCol.field === 'price' ? 'sellingPriceStore' : 'sellingPriceQF';
      const storeEntry = (p.stores || []).find((s) => s.name === storeCol.storeName);
      return (
        <input
          type="number"
          step="0.01"
          value={storeEntry?.[storeField] ?? ''}
          onClick={stop}
          onChange={(e) => {
            const val = e.target.value === '' ? null : parseFloat(e.target.value);
            updateProductInline(p.id, (prod) => {
              const stores = (prod.stores || []).some((s) => s.name === storeCol.storeName)
                ? prod.stores.map((s) => (s.name === storeCol.storeName ? { ...s, [storeField]: val } : s))
                : [...(prod.stores || []), { name: storeCol.storeName, sellingPriceStore: null, sellingPriceQF: null, [storeField]: val }];
              return { ...prod, stores };
            });
          }}
          style={inlineInputStyle}
        />
      );
    }

    // Μη επεξεργάσιμες στήλες: εμφάνιση τιμής μόνο.
    const value = getColumnValue(p, col.key);
    if (col.key === 'fc' || (storeCol && (storeCol.field === 'fc' || storeCol.field === 'fcQF'))) {
      return isFinite(value) ? fmtPct(value) : '—';
    }
    if (col.key === 'images365' || col.key === 'imagesPromo') {
      return value && value[0] ? <img src={value[0]} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} /> : <span style={{ color: '#d7dce2' }}>—</span>;
    }
    return value || '—';
  }

  return (
    <div className="detail-pane" style={{ width: '100%' }}>
      {viewMode !== 'card' && (
        <div className="tabs" style={{ position: 'sticky', top: 0 }}>
          <button className={'tab' + (viewMode === 'table' ? ' active' : '')} onClick={() => setViewMode('table')}>{t('common_table')}</button>
          <button className={'tab' + (viewMode === 'card' ? ' active' : '')} onClick={() => { if (current) setViewMode('card'); }}>{t('common_card')}</button>
          {viewMode === 'table' && (
            <div className="tab-actions" style={{ position: 'relative' }}>
              <button className="btn-primary" style={{ background: '#1e7d45' }} onClick={exportExcel} title={t('common_export_excel')}>
                Excel
              </button>
              <button className="btn-primary" style={{ background: '#b23b2e' }} onClick={exportPDF} title={t('common_export_pdf')}>
                PDF
              </button>
              <button className="btn-primary" style={{ background: '#6b7684' }} onClick={() => setShowColPicker((v) => !v)}>
                {t('common_columns')} ({visibleColumns.length})
              </button>
              {showColPicker && (
                <div style={{ position: 'absolute', right: 0, top: '110%', width: 260, background: '#fff', border: '1px solid #e1e5ea', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, padding: '8px 0', maxHeight: 320, overflowY: 'auto' }}>
                  {allColumnDefs.map((col) => (
                    <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={visibleColumns.includes(col.key)} onChange={() => toggleColumn(col.key)} />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {viewMode === 'table' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', borderBottom: '1px solid #e1e5ea', padding: '0 16px' }}>
          {tableViews.map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setActiveViewId(v.id)}
                onDoubleClick={() => renameTableView(v.id)}
                style={{
                  border: 'none', background: 'transparent', padding: '8px 10px', fontSize: 12.5, cursor: 'pointer',
                  color: activeViewId === v.id ? '#16233f' : '#6b7684',
                  fontWeight: activeViewId === v.id ? 600 : 400,
                  borderBottom: activeViewId === v.id ? '2px solid #2f8f8a' : '2px solid transparent'
                }}
                title={t('common_rename_hint')}
              >
                {v.name}
              </button>
              {tableViews.length > 1 && (
                <span onClick={() => removeTableView(v.id)} style={{ color: '#97a2b0', cursor: 'pointer', fontSize: 11 }}>✕</span>
              )}
            </div>
          ))}
          <button onClick={addTableView} style={{ border: 'none', background: 'transparent', color: '#97a2b0', cursor: 'pointer', padding: '8px 8px', fontSize: 14 }} title={t('p_new_view_title')}>+</button>
        </div>
      )}

      {viewMode === 'table' && (
        <div style={{ padding: 16 }}>
          <div style={{ overflowX: 'auto', border: '1px solid #e1e5ea', borderRadius: 8, background: '#fff' }}>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e1e5ea' }}>
                <tr style={{ color: '#6b7684' }}>
                  <th style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px' }}>#</th>
                  {visibleColumnDefs.map((col, colIdx) => (
                    <th
                      key={col.key}
                      style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px', whiteSpace: 'nowrap', userSelect: 'none' }}
                    >
                      <span onClick={() => toggleSort(col.key)} style={{ cursor: 'pointer' }} title={t('common_sort_hint')}>
                        {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </span>
                      <span style={{ marginLeft: 6, display: 'inline-flex', gap: 1 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveColumn(col.key, -1); }}
                          disabled={colIdx === 0}
                          title={t('common_move_left')}
                          style={{ border: 'none', background: 'transparent', cursor: colIdx === 0 ? 'default' : 'pointer', fontSize: 10, color: colIdx === 0 ? '#d7dce2' : '#97a2b0', padding: '0 2px' }}
                        >◀</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveColumn(col.key, 1); }}
                          disabled={colIdx === visibleColumnDefs.length - 1}
                          title={t('common_move_right')}
                          style={{ border: 'none', background: 'transparent', cursor: colIdx === visibleColumnDefs.length - 1 ? 'default' : 'pointer', fontSize: 10, color: colIdx === visibleColumnDefs.length - 1 ? '#d7dce2' : '#97a2b0', padding: '0 2px' }}
                        >▶</button>
                      </span>
                    </th>
                  ))}
                </tr>
                <tr style={{ borderTop: '1px solid #e1e5ea' }}>
                  <th></th>
                  {visibleColumnDefs.map((col) => (
                    <th key={col.key} style={{ padding: '4px 8px' }}>
                      <input
                        value={columnFilters[col.key] || ''}
                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                        placeholder={t('common_filter_placeholder')}
                        style={{ width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid #e1e5ea' }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((p, i) => (
                  <tr
                    key={p.id}
                    onClick={() => selectProduct(p.id)}
                    style={{ borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '8px 12px', color: '#97a2b0' }}>{i + 1}</td>
                    {visibleColumnDefs.map((col) => (
                      <td key={col.key} style={{ padding: '4px 8px' }}>
                        {renderCell(p, col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <p style={{ fontSize: 12, color: '#97a2b0' }}>
              # {filteredProducts.length}{filteredProducts.length !== products.length ? ` / ${products.length}` : ''}
            </p>
            {!readOnly && <button className="btn-primary" onClick={handleNew}>{t('common_new')}</button>}
          </div>
        </div>
      )}

      {viewMode === 'card' && !current && (
        <div className="empty-state">{t('p_empty_state')}</div>
      )}

      {viewMode === 'card' && current && (
        <div className="detail">
          <div className="tabs">
            <button className={'tab' + (tab === 'info' ? ' active' : '')} onClick={() => setTab('info')}>{t('p_tab_info')}</button>
            <button className={'tab' + (tab === 'cost' ? ' active' : '')} onClick={() => setTab('cost')}>{t('p_tab_cost')}</button>
            <div className="tab-actions">
              <button className="btn-primary" onClick={() => setViewMode('table')} style={{ background: '#6b7684' }}>{t('common_back_to_table')}</button>
              <span style={{ fontSize: 12, color: savedFlash ? '#2f8f8a' : '#97a2b0', alignSelf: 'center', minWidth: 110 }}>
                {readOnly ? t('common_readonly') : savedFlash ? t('common_saved') : t('common_autosave')}
              </span>
              {!readOnly && <button className="btn-danger" onClick={handleDelete}>{t('common_delete')}</button>}
            </div>
          </div>

          {tab === 'info' && (
            <div className="tab-panel active">
              <div className="grid-2">
                <div className="field">
                  <label>{t('p_col_categoryGr')}</label>
                  <select
                    disabled={readOnly}
                    value={current.categoryGr || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const pair = CATEGORIES.find((c) => c.gr === val);
                      applyCardUpdate((prev) => ({ ...prev, categoryGr: val, categoryEn: pair ? pair.en : prev.categoryEn }));
                    }}
                  >
                    <option value="">—</option>
                    {CATEGORIES.map((c) => <option key={c.gr} value={c.gr}>{c.gr}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>{t('p_col_categoryEn')}</label>
                  <select
                    disabled={readOnly}
                    value={current.categoryEn || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const pair = CATEGORIES.find((c) => c.en === val);
                      applyCardUpdate((prev) => ({ ...prev, categoryEn: val, categoryGr: pair ? pair.gr : prev.categoryGr }));
                    }}
                  >
                    <option value="">—</option>
                    {CATEGORIES.map((c) => <option key={c.en} value={c.en}>{c.en}</option>)}
                  </select>
                </div>
                <div className="field"><label>{t('p_col_itemCode')}</label><input disabled={readOnly} value={current.itemCode || ''} onChange={(e) => updateField('itemCode', e.target.value)} /></div>
                <div className="field">
                  <label>{t('p_col_barcode')}</label>
                  <div className="chip-row">
                    {(current.barcodes || []).map((code, i) => (
                      <div className="chip" key={i}>
                        <span>{code}</span>
                        {!readOnly && <span className="x" onClick={() => removeBarcode(i)}>✕</span>}
                      </div>
                    ))}
                  </div>
                  {!readOnly && (
                    <div className="add-person-row">
                      <input
                        placeholder={t('p_barcode_add_placeholder')}
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBarcode(); } }}
                      />
                    </div>
                  )}
                </div>
                <div className="field"><label>{t('p_col_descriptionErp')}</label><input disabled={readOnly} value={current.descriptionErp || ''} onChange={(e) => updateField('descriptionErp', e.target.value)} /></div>
                <div className="field"><label>{t('p_col_unitsPerMachine')}</label><input disabled={readOnly} type="number" value={current.unitsPerMachine ?? ''} onChange={(e) => updateField('unitsPerMachine', e.target.value ? +e.target.value : null)} /></div>
                <div className="field"><label>{t('p_col_descriptionGr')}</label><input disabled={readOnly} value={current.descriptionGr || ''} onChange={(e) => updateField('descriptionGr', e.target.value)} /></div>
                <div className="field"><label>{t('p_col_descriptionEn')}</label><input disabled={readOnly} value={current.descriptionEn || ''} onChange={(e) => updateField('descriptionEn', e.target.value)} /></div>
              </div>
              <div className="grid-2">
                <div className="field"><label>{t('p_col_detailedDescriptionGr')}</label><textarea disabled={readOnly} rows="4" value={current.detailedDescriptionGr || ''} onChange={(e) => updateField('detailedDescriptionGr', e.target.value)} /></div>
                <div className="field"><label>{t('p_col_detailedDescriptionEn')}</label><textarea disabled={readOnly} rows="4" value={current.detailedDescriptionEn || ''} onChange={(e) => updateField('detailedDescriptionEn', e.target.value)} /></div>
              </div>
              <div className="grid-3">
                <div className="field">
                  <label>{t('p_col_status')}</label>
                  <select
                    disabled={readOnly}
                    value={current.status || 'ΕΝΤΟΣ'}
                    onChange={(e) => updateField('status', e.target.value)}
                    style={{ background: statusColor(current.status || 'ΕΝΤΟΣ'), color: '#fff', fontWeight: 600, border: 'none' }}
                  >
                    <option>ΕΝΤΟΣ</option>
                    <option>ΕΚΤΟΣ</option>
                  </select>
                </div>
                <div className="field">
                  <label>{t('p_col_activeOnMachine')}</label>
                  <select disabled={readOnly} value={current.activeOnMachine || 'YES'} onChange={(e) => updateField('activeOnMachine', e.target.value)}>
                    <option value="YES">YES</option>
                    <option value="NO">NO</option>
                  </select>
                </div>
                <div className="field">
                  <label>{t('p_col_region')}</label>
                  <select disabled={readOnly} value={current.region || ''} onChange={(e) => updateField('region', e.target.value)}>
                    <option value="">—</option>
                    {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>{t('p_col_activeStores')}</label>
                  <div className="chip-row">
                    {Array.from(new Set([...canonicalStores, ...(current.activeStores || [])])).sort().map((name) => {
                      const on = (current.activeStores || []).includes(name);
                      return (
                        <div
                          key={name}
                          className={'chip' + (readOnly ? '' : ' clickable') + (on ? '' : ' off')}
                          onClick={() => { if (!readOnly) toggleActiveStore(name); }}
                        >
                          {name}
                        </div>
                      );
                    })}
                  </div>
                  {!readOnly && (
                    <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '6px 0 0' }}>{t('p_stores_managed_hint')}</p>
                  )}
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>{t('p_col_images365')}</label>
                  <div className="image-box">
                    {!readOnly && <input type="file" accept="image/*" className="image-input" onChange={(e) => handleImageUpload('images365', e.target.files[0])} />}
                    <div className="image-thumbs">
                      {(current.images365 || []).map((u, i) => (
                        <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
                          <img src={u} alt="" />
                          <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
                            <button type="button" onClick={() => downloadImage(u, `${current.itemCode || 'product'}-365-${i + 1}.jpg`)} title={t('common_download')} style={thumbBtnStyle}>⬇</button>
                            {!readOnly && <button type="button" onClick={() => removeImage('images365', i)} title={t('common_delete')} style={{ ...thumbBtnStyle, background: 'rgba(192,57,43,0.85)' }}>✕</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>{t('p_col_imagesPromo')}</label>
                  <div className="image-box">
                    {!readOnly && <input type="file" accept="image/*" className="image-input" onChange={(e) => handleImageUpload('imagesPromo', e.target.files[0])} />}
                    <div className="image-thumbs">
                      {(current.imagesPromo || []).map((u, i) => (
                        <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
                          <img src={u} alt="" />
                          <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
                            <button type="button" onClick={() => downloadImage(u, `${current.itemCode || 'product'}-promo-${i + 1}.jpg`)} title={t('common_download')} style={thumbBtnStyle}>⬇</button>
                            {!readOnly && <button type="button" onClick={() => removeImage('imagesPromo', i)} title={t('common_delete')} style={{ ...thumbBtnStyle, background: 'rgba(192,57,43,0.85)' }}>✕</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'cost' && (
            <div className="tab-panel active">
              <div className="section-bar teal">General Cost</div>
              <div className="cost-grid">
                <div className="cost-field"><label>{t('p_col_sellingPrice')}</label><input disabled={readOnly} type="number" step="0.01" value={cost.sellingPrice ?? ''} onChange={(e) => updateCost('sellingPrice', parseFloat(e.target.value) || 0)} /></div>
                <div className="cost-field"><label>{t('p_col_vatPercent')}</label><input disabled={readOnly} type="number" step="1" value={cost.vatPercent ?? 13} onChange={(e) => updateCost('vatPercent', parseFloat(e.target.value) || 0)} /></div>
                <div className="cost-field"><label>{t('p_cost_ptk_label')}</label><input disabled={readOnly} type="number" step="0.01" value={cost.ptk ?? ''} onChange={(e) => updateCost('ptk', parseFloat(e.target.value) || 0)} /></div>
                <div className="readonly-value teal" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ fontSize: 11, marginBottom: 4 }}>{t('p_col_fc')}</label>
                  {fmtPct(fc)}
                </div>
              </div>

              <div className="section-bar navy">Stores</div>
              <table className="stores-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', paddingLeft: 12 }}>{t('p_stores_col_store')}</th>
                    <th>{t('p_stores_col_price_store')}</th>
                    <th>{t('p_stores_col_fc_store')}</th>
                    <th>{t('p_stores_col_price_qf')}</th>
                    <th>{t('p_stores_col_fc_qf')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(current.stores || []).map((s, i) => {
                    const netStore = s.sellingPriceStore ? s.sellingPriceStore / (1 + vat / 100) : null;
                    const netQF = s.sellingPriceQF ? s.sellingPriceQF / (1 + vat / 100) : null;
                    const fcStore = netStore ? ((cost.ptk || 0) / netStore) * 100 : NaN;
                    const fcQF = netQF ? ((cost.ptk || 0) / netQF) * 100 : NaN;
                    return (
                      <tr key={i}>
                        <td><div className="store-name">{s.name}</div></td>
                        <td><input disabled={readOnly} type="number" step="0.01" value={s.sellingPriceStore ?? ''} onChange={(e) => updateStore(i, 'sellingPriceStore', e.target.value)} /></td>
                        <td><div className="fc-cell">{fmtPct(fcStore)}</div></td>
                        <td><input disabled={readOnly} type="number" step="0.01" value={s.sellingPriceQF ?? ''} onChange={(e) => updateStore(i, 'sellingPriceQF', e.target.value)} /></td>
                        <td><div className="fc-cell">{fmtPct(fcQF)}</div></td>
                        <td>{!readOnly && <button className="btn-danger" onClick={() => removeStore(i)}>✕</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!readOnly && <button className="btn-primary" style={{ background: '#6b7684', marginTop: 10 }} onClick={addStore}>{t('p_add_store_chip')}</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
