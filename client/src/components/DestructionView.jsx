import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Products, Destructions } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const METHODS = [
  { key: 'scan', icon: '📷', labelKey: 'e_method_scan' },
  { key: 'manual', icon: '⌨️', labelKey: 'e_method_manual' },
  { key: 'no-barcode', icon: '📋', labelKey: 'e_method_no_barcode' },
  { key: 'description', icon: '🔎', labelKey: 'e_method_description' }
];

// Placeholder που παίρνει αυτόματα ένα προϊόν όταν δημιουργείται από τα "Προϊόντα"
// χωρίς να συμπληρωθεί ακόμα — δεν έχει νόημα να εμφανίζεται στις λίστες αναζήτησης εδώ.
function isUnfinishedPlaceholder(p) {
  return p.descriptionGr === 'Νέο προϊόν' && !p.itemCode && !p.descriptionErp;
}

export default function DestructionView() {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [method, setMethod] = useState('scan');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [matchedProduct, setMatchedProduct] = useState(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState('');
  const [store, setStore] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [recentDestructions, setRecentDestructions] = useState([]);
  const [noBarcodeQuery, setNoBarcodeQuery] = useState('');
  const [descQuery, setDescQuery] = useState('');

  const scannerDivId = 'qf-destruction-scanner-region';
  const html5QrRef = useRef(null);

  useEffect(() => {
    Products.list()
      .then((rows) => { setProducts(rows); setLoadingProducts(false); })
      .catch(() => setLoadingProducts(false));
  }, []);

  useEffect(() => {
    return () => {
      if (html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {}).then(() => {
          try { html5QrRef.current.clear(); } catch (e) { /* ignore */ }
        });
      }
    };
  }, []);

  const storeOptions = useMemo(() => {
    const set = new Set();
    products.forEach((p) => (p.stores || []).forEach((s) => s && s.name && set.add(s.name)));
    return Array.from(set).sort();
  }, [products]);

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
    setMethod(key);
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
    setQuantity('1');
    setReason('');
    setNoBarcodeQuery('');
    setDescQuery('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!matchedProduct || !store) return;
    setSaving(true);
    try {
      const { record, removedEntries } = await Destructions.create({
        productId: matchedProduct.id,
        productItemCode: matchedProduct.itemCode,
        productDescription: matchedProduct.descriptionErp || matchedProduct.descriptionGr,
        store,
        quantity,
        reason
      });
      setRecentDestructions((prev) => [{ ...record, removedEntries }, ...prev].slice(0, 8));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      resetSelection();
    } catch (err) {
      setScanError(t('e_save_error_prefix') + ' ' + (err && err.message ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_destruction')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#f9fafb' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {!matchedProduct && !notFoundBarcode && (
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
                      border: method === m.key ? '2px solid #c0392b' : '1px solid #e1e5ea',
                      background: method === m.key ? '#fdecea' : '#fff', cursor: 'pointer',
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
                      <button className="btn-primary" style={{ width: '100%', background: '#c0392b' }} onClick={startScan} disabled={loadingProducts}>
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
                      <button className="btn-primary" type="submit" style={{ background: '#c0392b' }}>{t('e_search_button')}</button>
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
              <div style={{ background: '#fdecea', border: '1px solid #f3c1bb', borderRadius: 8, padding: 12, marginBottom: 16 }}>
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

              <div className="field" style={{ marginBottom: 8 }}>
                <label>{t('x_reason_label')}</label>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('x_reason_placeholder')} />
              </div>

              <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 16px' }}>{t('x_auto_remove_hint')}</p>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" type="submit" style={{ flex: 1, background: '#c0392b' }} disabled={saving}>
                  {saving ? t('e_saving') : savedFlash ? t('common_saved') : t('x_submit_button')}
                </button>
                <button className="btn-danger" type="button" onClick={resetSelection}>{t('common_cancel')}</button>
              </div>
            </form>
          )}

          {recentDestructions.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 12, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
                {t('x_recent_entries')}
              </div>
              {recentDestructions.map((d) => (
                <div key={d.id} style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 8, padding: '10px 12px', marginBottom: 6, fontSize: 13 }}>
                  <strong>{d.productItemCode}</strong> — {d.store} — {t('e_quantity_label').toLowerCase()}: {d.quantity ?? '—'}
                  {d.removedEntries > 0 && (
                    <span style={{ color: '#2f8f8a' }}> · {t('x_removed_from_expired').replace('{n}', d.removedEntries)}</span>
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
