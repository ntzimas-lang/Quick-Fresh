import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Products, Entries } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

export default function ProductEntryView() {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [matchedProduct, setMatchedProduct] = useState(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState('');
  const [store, setStore] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [recentEntries, setRecentEntries] = useState([]);
  const [noBarcodeQuery, setNoBarcodeQuery] = useState('');

  const scannerDivId = 'qf-barcode-scanner-region';
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

  // Προϊόντα χωρίς Barcode — καταχωρούνται επιλέγοντάς τα από λίστα αντί για σάρωση.
  const noBarcodeProducts = useMemo(() => products.filter((p) => !(p.barcodes && p.barcodes.length)), [products]);
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
    setNoBarcodeQuery('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!matchedProduct || !store || !expiryDate) return;
    setSaving(true);
    try {
      const entry = await Entries.create({
        productId: matchedProduct.id,
        productItemCode: matchedProduct.itemCode,
        productDescription: matchedProduct.descriptionErp || matchedProduct.descriptionGr,
        store,
        expiryDate,
        quantity
      });
      setRecentEntries((prev) => [entry, ...prev].slice(0, 8));
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
        <strong style={{ fontSize: 15 }}>{t('title_entry')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#f9fafb' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {!matchedProduct && !notFoundBarcode && (
            <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 18, marginBottom: 16 }}>
              {!scanning ? (
                <button className="btn-primary" style={{ width: '100%' }} onClick={startScan} disabled={loadingProducts}>
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

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #eef1f4' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7684', marginBottom: 6, fontWeight: 600 }}>
                  {t('e_manual_barcode')}
                </label>
                <form onSubmit={handleManualLookup} style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    placeholder={t('e_barcode_example')}
                    style={{ flex: 1, padding: '9px 10px', border: '1px solid #d7dce2', borderRadius: 6, fontSize: 13.5 }}
                  />
                  <button className="btn-primary" type="submit">{t('e_search_button')}</button>
                </form>
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #eef1f4' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7684', marginBottom: 6, fontWeight: 600 }}>
                  {t('e_no_barcode_search')}
                </label>
                <input
                  value={noBarcodeQuery}
                  onChange={(e) => setNoBarcodeQuery(e.target.value)}
                  placeholder={t('e_no_barcode_placeholder')}
                  style={{ width: '100%', padding: '9px 10px', border: '1px solid #d7dce2', borderRadius: 6, fontSize: 13.5, marginBottom: 8 }}
                />
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #eef1f4', borderRadius: 8 }}>
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
              <div style={{ background: '#eef7f6', border: '1px solid #cfe8e5', borderRadius: 8, padding: 12, marginBottom: 16 }}>
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

              <div className="field" style={{ marginBottom: 16 }}>
                <label>{t('e_expiry_label')}</label>
                <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" type="submit" style={{ flex: 1 }} disabled={saving}>
                  {saving ? t('e_saving') : savedFlash ? t('common_saved') : t('e_submit_button')}
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
                  <strong>{e.productItemCode}</strong> — {e.store} — {t('e_quantity_label').toLowerCase()}: {e.quantity ?? '—'} — {t('e_expiry_label').toLowerCase()}: {e.expiryDate}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
