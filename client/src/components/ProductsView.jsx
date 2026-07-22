import React, { useEffect, useState } from 'react';
import { Products, upload } from '../api.js';

const STORE_CANDIDATES = ['DEMO', 'Plaisio', 'Novibet', 'Kryoneri', 'Nestle', 'AIA', 'Metlen', 'ACS Courier'];

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

const ALL_COLUMNS = [
  { key: 'categoryGr', label: 'Κατηγορία GR' },
  { key: 'categoryEn', label: 'Κατηγορία EN' },
  { key: 'itemCode', label: 'Κωδικός είδους' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'descriptionErp', label: 'Περιγραφή είδους ERP' },
  { key: 'descriptionGr', label: 'Περιγραφή είδους GR' },
  { key: 'descriptionEn', label: 'Περιγραφή είδους EN' },
  { key: 'detailedDescriptionGr', label: 'Αναλυτική Περιγραφή GR' },
  { key: 'detailedDescriptionEn', label: 'Αναλυτική Περιγραφή EN' },
  { key: 'unitsPerMachine', label: 'ΤΕΜ στο μηχάνημα' },
  { key: 'status', label: 'Status' },
  { key: 'activeOnMachine', label: 'Ενεργό Στο Μηχάνημα' },
  { key: 'activeStores', label: 'Ενεργό Σε Κατάστημα' },
  { key: 'sellingPrice', label: 'Τιμή Πώλησης' },
  { key: 'vatPercent', label: 'ΦΠΑ %' },
  { key: 'ptk', label: 'ΠΤΚ' },
  { key: 'fc', label: 'F.C.' },
  { key: 'images365', label: 'Image - 365' },
  { key: 'imagesPromo', label: 'Image - Promo' }
];

const DEFAULT_VISIBLE_COLUMNS = ['categoryGr', 'itemCode', 'barcode', 'descriptionErp', 'status', 'images365'];

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

export default function ProductsView() {
  const [products, setProducts] = useState([]);
  const [current, setCurrent] = useState(null);
  const [tab, setTab] = useState('info');
  const [savedFlash, setSavedFlash] = useState(false);

  const [viewMode, setViewMode] = useState('table');
  const [tableViews, setTableViews] = useState([{ id: 'data', name: 'Data', columns: DEFAULT_VISIBLE_COLUMNS }]);
  const [activeViewId, setActiveViewId] = useState('data');
  const [showColPicker, setShowColPicker] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});
  const [storeOptions, setStoreOptions] = useState(STORE_CANDIDATES);

  useEffect(() => {
    Products.list().then((list) => {
      setProducts(list);
      const extra = new Set();
      list.forEach((p) => (p.stores || []).forEach((s) => extra.add(s.name)));
      setStoreOptions((prev) => Array.from(new Set([...prev, ...extra])));
    });
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

  function updateField(key, value) {
    setCurrent((prev) => ({ ...prev, [key]: value }));
  }
  function updateCost(key, value) {
    setCurrent((prev) => ({ ...prev, cost: { ...prev.cost, [key]: value } }));
  }
  function updateStore(idx, field, value) {
    setCurrent((prev) => {
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
    const name = window.prompt('Όνομα καταστήματος (θα προστεθεί σε όλα τα προϊόντα):');
    if (!name || !name.trim()) return;
    await addStoreEverywhere(name);
  }
  function removeStore(idx) {
    setCurrent((prev) => ({ ...prev, stores: prev.stores.filter((_, i) => i !== idx) }));
  }
  function toggleActiveStore(name) {
    setCurrent((prev) => {
      const active = prev.activeStores.includes(name)
        ? prev.activeStores.filter((n) => n !== name)
        : [...prev.activeStores, name];
      return { ...prev, activeStores: active };
    });
  }
  async function addStoreOption() {
    const name = window.prompt('Όνομα καταστήματος (θα προστεθεί σε όλα τα προϊόντα):');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    await addStoreEverywhere(trimmed);
    setCurrent((prev) => (prev.activeStores.includes(trimmed) ? prev : { ...prev, activeStores: [...prev.activeStores, trimmed] }));
  }
  function removeStoreOption(name) {
    if (!window.confirm(`Αφαίρεση καταστήματος "${name}" από τη λίστα;`)) return;
    setStoreOptions((prev) => prev.filter((n) => n !== name));
  }

  async function handleImageUpload(key, file) {
    if (!file) return;
    const { url } = await upload(file);
    setCurrent((prev) => ({ ...prev, [key]: [...(prev[key] || []), url] }));
  }

  async function handleSave() {
    const saved = await Products.update(current.id, current);
    setCurrent(saved);
    setProducts((list) => list.map((p) => (p.id === saved.id ? saved : p)));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  async function handleDelete() {
    if (!window.confirm('Διαγραφή προϊόντος;')) return;
    await Products.remove(current.id);
    setProducts((list) => list.filter((p) => p.id !== current.id));
    setCurrent(null);
    setViewMode('table');
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
  function addTableView() {
    const name = window.prompt('Όνομα νέου tab πίνακα:');
    if (!name || !name.trim()) return;
    const id = 'view-' + Date.now();
    setTableViews((prev) => [...prev, { id, name: name.trim(), columns: activeView.columns }]);
    setActiveViewId(id);
  }
  function renameTableView(id) {
    const existing = tableViews.find((v) => v.id === id);
    const name = window.prompt('Νέο όνομα tab:', existing ? existing.name : '');
    if (!name || !name.trim()) return;
    setTableViews((prev) => prev.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)));
  }
  function removeTableView(id) {
    if (tableViews.length === 1) return;
    if (!window.confirm('Διαγραφή αυτού του tab πίνακα;')) return;
    setTableViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId(tableViews.find((v) => v.id !== id)?.id || tableViews[0].id);
  }

  const activeView = tableViews.find((v) => v.id === activeViewId) || tableViews[0];
  const visibleColumns = activeView.columns;

  const storeColumnDefs = storeOptions.flatMap((name) => [
    { key: `store:${name}:price`, label: `${name} Τιμή Store` },
    { key: `store:${name}:fc`, label: `${name} F.C. Store` },
    { key: `store:${name}:priceQF`, label: `${name} Τιμή Q&F` },
    { key: `store:${name}:fcQF`, label: `${name} F.C. Q&F` }
  ]);
  const allColumnDefs = [...ALL_COLUMNS, ...storeColumnDefs];
  const visibleColumnDefs = allColumnDefs.filter((col) => visibleColumns.includes(col.key));
  const filteredProducts = products.filter((p) =>
    visibleColumnDefs.every((col) => {
      const f = (columnFilters[col.key] || '').trim().toLowerCase();
      if (!f) return true;
      return getFilterText(p, col.key).toLowerCase().includes(f);
    })
  );

  const cost = current?.cost || { sellingPrice: 0, ptk: 0, quantity: 0, vatPercent: 13 };
  const vat = cost.vatPercent || 0;
  const net = cost.sellingPrice ? cost.sellingPrice / (1 + vat / 100) : 0;
  const profit = net - (cost.ptk || 0);
  const fc = net > 0 ? ((cost.ptk || 0) / net) * 100 : NaN;

  return (
    <div className="detail-pane" style={{ width: '100%' }}>
      {viewMode !== 'card' && (
        <div className="tabs" style={{ position: 'sticky', top: 0 }}>
          <button className={'tab' + (viewMode === 'table' ? ' active' : '')} onClick={() => setViewMode('table')}>Πίνακας</button>
          <button className={'tab' + (viewMode === 'card' ? ' active' : '')} onClick={() => { if (current) setViewMode('card'); }}>Κάρτα</button>
          {viewMode === 'table' && (
            <div className="tab-actions" style={{ position: 'relative' }}>
              <button className="btn-primary" style={{ background: '#6b7684' }} onClick={() => setShowColPicker((v) => !v)}>
                Στήλες ({visibleColumns.length})
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
                title="Διπλό κλικ για μετονομασία"
              >
                {v.name}
              </button>
              {tableViews.length > 1 && (
                <span onClick={() => removeTableView(v.id)} style={{ color: '#97a2b0', cursor: 'pointer', fontSize: 11 }}>✕</span>
              )}
            </div>
          ))}
          <button onClick={addTableView} style={{ border: 'none', background: 'transparent', color: '#97a2b0', cursor: 'pointer', padding: '8px 8px', fontSize: 14 }} title="Νέο tab πίνακα">+</button>
        </div>
      )}

      {viewMode === 'table' && (
        <div style={{ padding: 16 }}>
          <div style={{ overflowX: 'auto', border: '1px solid #e1e5ea', borderRadius: 8, background: '#fff' }}>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e1e5ea' }}>
                <tr style={{ color: '#6b7684' }}>
                  <th style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px' }}>#</th>
                  {visibleColumnDefs.map((col) => (
                    <th key={col.key} style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px', whiteSpace: 'nowrap' }}>{col.label}</th>
                  ))}
                </tr>
                <tr style={{ borderTop: '1px solid #e1e5ea' }}>
                  <th></th>
                  {visibleColumnDefs.map((col) => (
                    <th key={col.key} style={{ padding: '4px 8px' }}>
                      <input
                        value={columnFilters[col.key] || ''}
                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                        placeholder="Φίλτρο..."
                        style={{ width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid #e1e5ea' }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p, i) => (
                  <tr
                    key={p.id}
                    onClick={() => selectProduct(p.id)}
                    style={{ borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '8px 12px', color: '#97a2b0' }}>{i + 1}</td>
                    {visibleColumnDefs.map((col) => {
                      const value = getColumnValue(p, col.key);
                      if (col.key === 'status') {
                        return (
                          <td key={col.key} style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: value === 'ΕΝΤΟΣ' ? '#e6f4ea' : '#eef1f4', color: value === 'ΕΝΤΟΣ' ? '#257873' : '#6b7684' }}>
                              {value}
                            </span>
                          </td>
                        );
                      }
                      if (col.key === 'images365' || col.key === 'imagesPromo') {
                        return (
                          <td key={col.key} style={{ padding: '8px 12px' }}>
                            {value && value[0] ? <img src={value[0]} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} /> : <span style={{ color: '#d7dce2' }}>—</span>}
                          </td>
                        );
                      }
                      if (col.key === 'sellingPrice' || col.key === 'ptk') {
                        return <td key={col.key} style={{ padding: '8px 12px' }}>{value ? fmtEuro(value) : '—'}</td>;
                      }
                      if (col.key === 'fc') {
                        return <td key={col.key} style={{ padding: '8px 12px' }}>{isFinite(value) ? fmtPct(value) : '—'}</td>;
                      }
                      const storeCol = parseStoreColKey(col.key);
                      if (storeCol) {
                        if (storeCol.field === 'price' || storeCol.field === 'priceQF') {
                          return <td key={col.key} style={{ padding: '8px 12px' }}>{value ? fmtEuro(value) : '—'}</td>;
                        }
                        return <td key={col.key} style={{ padding: '8px 12px' }}>{isFinite(value) ? fmtPct(value) : '—'}</td>;
                      }
                      return <td key={col.key} style={{ padding: '8px 12px' }}>{value || '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <p style={{ fontSize: 12, color: '#97a2b0' }}>
              # {filteredProducts.length}{filteredProducts.length !== products.length ? ` / ${products.length}` : ''}
            </p>
            <button className="btn-primary" onClick={handleNew}>+ Νέο</button>
          </div>
        </div>
      )}

      {viewMode === 'card' && !current && (
        <div className="empty-state">Επίλεξε ή δημιούργησε ένα προϊόν</div>
      )}

      {viewMode === 'card' && current && (
        <div className="detail">
          <div className="tabs">
            <button className={'tab' + (tab === 'info' ? ' active' : '')} onClick={() => setTab('info')}>Product List</button>
            <button className={'tab' + (tab === 'cost' ? ' active' : '')} onClick={() => setTab('cost')}>Cost</button>
            <div className="tab-actions">
              <button className="btn-primary" onClick={() => setViewMode('table')} style={{ background: '#6b7684' }}>← Πίνακας</button>
              <button className="btn-primary" onClick={handleSave}>{savedFlash ? 'Αποθηκεύτηκε ✓' : 'Αποθήκευση'}</button>
              <button className="btn-danger" onClick={handleDelete}>Διαγραφή</button>
            </div>
          </div>

          {tab === 'info' && (
            <div className="tab-panel active">
              <div className="grid-2">
                <div className="field">
                  <label>Κατηγορία GR</label>
                  <select
                    value={current.categoryGr || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const pair = CATEGORIES.find((c) => c.gr === val);
                      updateField('categoryGr', val);
                      if (pair) updateField('categoryEn', pair.en);
                    }}
                  >
                    <option value="">—</option>
                    {CATEGORIES.map((c) => <option key={c.gr} value={c.gr}>{c.gr}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Κατηγορία EN</label>
                  <select
                    value={current.categoryEn || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const pair = CATEGORIES.find((c) => c.en === val);
                      updateField('categoryEn', val);
                      if (pair) updateField('categoryGr', pair.gr);
                    }}
                  >
                    <option value="">—</option>
                    {CATEGORIES.map((c) => <option key={c.en} value={c.en}>{c.en}</option>)}
                  </select>
                </div>
                <div className="field"><label>Κωδικός είδους</label><input value={current.itemCode || ''} onChange={(e) => updateField('itemCode', e.target.value)} /></div>
                <div className="field"><label>Barcode</label><input value={current.barcode || ''} onChange={(e) => updateField('barcode', e.target.value)} /></div>
                <div className="field"><label>Περιγραφή είδους ERP</label><input value={current.descriptionErp || ''} onChange={(e) => updateField('descriptionErp', e.target.value)} /></div>
                <div className="field"><label>ΤΕΜ στο μηχάνημα</label><input type="number" value={current.unitsPerMachine ?? ''} onChange={(e) => updateField('unitsPerMachine', e.target.value ? +e.target.value : null)} /></div>
                <div className="field"><label>Περιγραφή είδους GR</label><input value={current.descriptionGr || ''} onChange={(e) => updateField('descriptionGr', e.target.value)} /></div>
                <div className="field"><label>Περιγραφή είδους EN</label><input value={current.descriptionEn || ''} onChange={(e) => updateField('descriptionEn', e.target.value)} /></div>
              </div>
              <div className="grid-2">
                <div className="field"><label>Αναλυτική Περιγραφή είδους GR</label><textarea rows="4" value={current.detailedDescriptionGr || ''} onChange={(e) => updateField('detailedDescriptionGr', e.target.value)} /></div>
                <div className="field"><label>Αναλυτική Περιγραφή είδους EN</label><textarea rows="4" value={current.detailedDescriptionEn || ''} onChange={(e) => updateField('detailedDescriptionEn', e.target.value)} /></div>
              </div>
              <div className="grid-3">
                <div className="field">
                  <label>Status</label>
                  <select value={current.status || 'ΕΝΤΟΣ'} onChange={(e) => updateField('status', e.target.value)}>
                    <option>ΕΝΤΟΣ</option>
                    <option>ΕΚΤΟΣ</option>
                  </select>
                </div>
                <div className="field">
                  <label>Ενεργό Στο Μηχάνημα</label>
                  <select value={current.activeOnMachine || 'YES'} onChange={(e) => updateField('activeOnMachine', e.target.value)}>
                    <option value="YES">YES</option>
                    <option value="NO">NO</option>
                  </select>
                </div>
                <div className="field">
                  <label>Ενεργό Σε Κατάστημα</label>
                  <div className="chip-row">
                    {storeOptions.map((name) => {
                      const on = (current.activeStores || []).includes(name);
                      return (
                        <div key={name} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} className="group">
                          <div
                            className={'chip clickable' + (on ? '' : ' off')}
                            onClick={() => toggleActiveStore(name)}
                            style={{ paddingRight: 18 }}
                          >
                            {name}
                          </div>
                          <span
                            onClick={() => removeStoreOption(name)}
                            style={{ position: 'absolute', right: 4, fontSize: 10, cursor: 'pointer', color: on ? '#fff' : '#6b7684', opacity: 0.6 }}
                            title="Αφαίρεση από τη λίστα"
                          >
                            ✕
                          </span>
                        </div>
                      );
                    })}
                    <div className="chip clickable off" onClick={addStoreOption} style={{ borderStyle: 'dashed' }}>
                      + Κατάστημα
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Image - 365</label>
                  <div className="image-box">
                    <input type="file" accept="image/*" className="image-input" onChange={(e) => handleImageUpload('images365', e.target.files[0])} />
                    <div className="image-thumbs">
                      {(current.images365 || []).map((u, i) => <img key={i} src={u} alt="" />)}
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>Image - Promo</label>
                  <div className="image-box">
                    <input type="file" accept="image/*" className="image-input" onChange={(e) => handleImageUpload('imagesPromo', e.target.files[0])} />
                    <div className="image-thumbs">
                      {(current.imagesPromo || []).map((u, i) => <img key={i} src={u} alt="" />)}
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
                <div className="cost-field"><label>Τιμή Πώλησης</label><input type="number" step="0.01" value={cost.sellingPrice ?? ''} onChange={(e) => updateCost('sellingPrice', parseFloat(e.target.value) || 0)} /></div>
                <div className="cost-field"><label>ΦΠΑ %</label><input type="number" step="1" value={cost.vatPercent ?? 13} onChange={(e) => updateCost('vatPercent', parseFloat(e.target.value) || 0)} /></div>
                <div className="cost-field"><label>ΠΤΚ (κόστος)</label><input type="number" step="0.01" value={cost.ptk ?? ''} onChange={(e) => updateCost('ptk', parseFloat(e.target.value) || 0)} /></div>
                <div className="readonly-value teal" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ fontSize: 11, marginBottom: 4 }}>F.C.</label>
                  {fmtPct(fc)}
                </div>
              </div>

              <div className="section-bar navy">Stores</div>
              <table className="stores-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', paddingLeft: 12 }}>Κατάστημα</th>
                    <th>Τιμή Πώλησης Store</th>
                    <th>F.C. Store</th>
                    <th>Τιμή Πώλησης Q&amp;F</th>
                    <th>F.C. Q&amp;F</th>
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
                        <td><input type="number" step="0.01" value={s.sellingPriceStore ?? ''} onChange={(e) => updateStore(i, 'sellingPriceStore', e.target.value)} /></td>
                        <td><div className="fc-cell">{fmtPct(fcStore)}</div></td>
                        <td><input type="number" step="0.01" value={s.sellingPriceQF ?? ''} onChange={(e) => updateStore(i, 'sellingPriceQF', e.target.value)} /></td>
                        <td><div className="fc-cell">{fmtPct(fcQF)}</div></td>
                        <td><button className="btn-danger" onClick={() => removeStore(i)}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button className="btn-primary" style={{ background: '#6b7684', marginTop: 10 }} onClick={addStore}>+ Κατάστημα</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
