import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Products, Entries } from '../api.js';

export default function ProductEntryView() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [matchedProduct, setMatchedProduct] = useState(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState('');
  const [store, setStore] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [recentEntries, setRecentEntries] = useState([]);

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

  function findByBarcode(code) {
    const clean = (code || '').trim();
    if (!clean) return null;
    return products.find((p) => (p.barcode || '').trim() === clean) || null;
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
      setScanError('Δεν ήταν δυνατή η πρόσβαση στην κάμερα: ' + (err && err.message ? err.message : String(err)));
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
        expiryDate
      });
      setRecentEntries((prev) => [entry, ...prev].slice(0, 8));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      resetSelection();
    } catch (err) {
      setScanError('Σφάλμα αποθήκευσης: ' + (err && err.message ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>Καταχώρηση προϊόντων</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#f9fafb' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {!matchedProduct && !notFoundBarcode && (
            <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 18, marginBottom: 16 }}>
              {!scanning ? (
                <button className="btn-primary" style={{ width: '100%' }} onClick={startScan} disabled={loadingProducts}>
                  📷 Σάρωση Barcode
                </button>
              ) : (
                <div>
                  <div id={scannerDivId} style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }} />
                  <button className="btn-danger" style={{ width: '100%', marginTop: 10 }} onClick={stopScan}>
                    Ακύρωση σάρωσης
                  </button>
                </div>
              )}

              {scanError && <p style={{ color: '#c0392b', fontSize: 12.5, marginTop: 10 }}>{scanError}</p>}

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #eef1f4' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7684', marginBottom: 6, fontWeight: 600 }}>
                  Ή καταχώρησε barcode χειροκίνητα
                </label>
                <form onSubmit={handleManualLookup} style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    placeholder="π.χ. 5201234567890"
                    style={{ flex: 1, padding: '9px 10px', border: '1px solid #d7dce2', borderRadius: 6, fontSize: 13.5 }}
                  />
                  <button className="btn-primary" type="submit">Αναζήτηση</button>
                </form>
              </div>
            </div>
          )}

          {notFoundBarcode && (
            <div style={{ background: '#fdf1ef', border: '1px solid #e3b3ac', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <p style={{ margin: 0, color: '#c0392b', fontSize: 13.5 }}>
                Δεν βρέθηκε προϊόν με barcode: <strong>{notFoundBarcode}</strong>
              </p>
              <button className="btn-danger" style={{ marginTop: 10 }} onClick={resetSelection}>Δοκίμασε ξανά</button>
            </div>
          )}

          {matchedProduct && (
            <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 18 }}>
              <div style={{ background: '#eef7f6', border: '1px solid #cfe8e5', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11.5, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Προϊόν</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#16233f' }}>{matchedProduct.itemCode}</div>
                <div style={{ fontSize: 13, color: '#3a4353' }}>{matchedProduct.descriptionErp || matchedProduct.descriptionGr}</div>
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <label>Κατάστημα</label>
                <select value={store} onChange={(e) => setStore(e.target.value)} required>
                  <option value="">— Επίλεξε —</option>
                  {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="field" style={{ marginBottom: 16 }}>
                <label>Ημερομηνία λήξης</label>
                <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" type="submit" style={{ flex: 1 }} disabled={saving}>
                  {saving ? 'Αποθήκευση...' : savedFlash ? 'Αποθηκεύτηκε ✓' : 'Καταχώρηση'}
                </button>
                <button className="btn-danger" type="button" onClick={resetSelection}>Άκυρο</button>
              </div>
            </form>
          )}

          {recentEntries.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 12, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
                Τελευταίες καταχωρήσεις (αυτή τη συνεδρία)
              </div>
              {recentEntries.map((e) => (
                <div key={e.id} style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 8, padding: '10px 12px', marginBottom: 6, fontSize: 13 }}>
                  <strong>{e.productItemCode}</strong> — {e.store} — λήξη {e.expiryDate}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
