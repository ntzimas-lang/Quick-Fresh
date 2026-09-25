import React, { useEffect, useRef, useState } from 'react';
import { Products, Entries, Destructions } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

// Καθολική αναζήτηση πάνω στο sidebar — SKU, όνομα προϊόντος ή κατάστημα, με
// αποτελέσματα από Προϊόντα / Report Ληγμένα / Report Καταστροφών, και ένα κλικ πάει
// κατευθείαν στη σωστή σελίδα (+ ανοίγει την Κάρτα προϊόντος ή γεμίζει το πεδίο
// αναζήτησης εκεί, ανάλογα με τον τύπο αποτελέσματος).
export default function GlobalSearch({ onNavigate, onJumpProduct, onJumpExpired, onJumpDestructions }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [destructions, setDestructions] = useState([]);
  const boxRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function ensureLoaded() {
    if (loaded || loading) return;
    setLoading(true);
    Promise.all([Products.list(), Entries.list(), Destructions.list()])
      .then(([p, e, d]) => { setProducts(p); setEntries(e); setDestructions(d); setLoaded(true); setLoading(false); })
      .catch(() => setLoading(false));
  }

  const q = query.trim().toLowerCase();

  const storeNames = Array.from(
    new Set(products.flatMap((p) => (p.stores || []).map((s) => s && s.name).filter(Boolean)))
  );

  const productResults = q.length >= 2
    ? products
        .filter((p) => (p.itemCode || '').toLowerCase().includes(q) || (p.descriptionErp || '').toLowerCase().includes(q) || (p.descriptionGr || '').toLowerCase().includes(q))
        .slice(0, 6)
    : [];

  const storeResults = q.length >= 2 ? storeNames.filter((s) => s.toLowerCase().includes(q)).slice(0, 4) : [];

  const expiredResults = q.length >= 2
    ? entries.filter((e) => (e.productItemCode || '').toLowerCase().includes(q) || (e.productDescription || '').toLowerCase().includes(q)).slice(0, 4)
    : [];

  const destructionResults = q.length >= 2
    ? destructions.filter((d) => (d.productItemCode || '').toLowerCase().includes(q) || (d.productDescription || '').toLowerCase().includes(q)).slice(0, 4)
    : [];

  const hasAnyResults = productResults.length || storeResults.length || expiredResults.length || destructionResults.length;

  function pickProduct(p) {
    setOpen(false);
    setQuery('');
    onNavigate('products');
    onJumpProduct(p.id);
  }
  function pickStore(store) {
    setOpen(false);
    setQuery('');
    onNavigate('sales');
  }
  function pickExpired(e) {
    setOpen(false);
    setQuery('');
    onNavigate('expired');
    onJumpExpired(e.productItemCode || e.productDescription || '');
  }
  function pickDestruction(d) {
    setOpen(false);
    setQuery('');
    onNavigate('destructionsReport');
    onJumpDestructions(d.productItemCode || d.productDescription || '');
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', padding: '10px 16px 0' }}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { ensureLoaded(); setOpen(true); }}
        placeholder={t('search_placeholder')}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '7px 10px',
          borderRadius: 7,
          border: '1px solid rgba(255,255,255,0.18)',
          background: 'rgba(255,255,255,0.08)',
          color: '#fff',
          fontSize: 12.5
        }}
      />
      {open && q.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: 44,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            maxHeight: 360,
            overflowY: 'auto',
            zIndex: 50,
            padding: '6px 0'
          }}
        >
          {loading && <div style={{ padding: '10px 14px', fontSize: 12.5, color: '#97a2b0' }}>{t('d_loading')}</div>}
          {!loading && !hasAnyResults && (
            <div style={{ padding: '10px 14px', fontSize: 12.5, color: '#97a2b0' }}>{t('search_no_results')}</div>
          )}
          {productResults.length > 0 && (
            <div>
              <div style={searchGroupLabelStyle}>{t('nav_products')}</div>
              {productResults.map((p) => (
                <button key={p.id} type="button" onClick={() => pickProduct(p)} style={searchResultBtnStyle}>
                  <span style={{ fontWeight: 700, color: '#16233f' }}>{p.itemCode || '—'}</span>{' '}
                  <span style={{ color: '#6b7684' }}>{p.descriptionErp || p.descriptionGr || ''}</span>
                </button>
              ))}
            </div>
          )}
          {storeResults.length > 0 && (
            <div>
              <div style={searchGroupLabelStyle}>{t('fc_col_store')}</div>
              {storeResults.map((s) => (
                <button key={s} type="button" onClick={() => pickStore(s)} style={searchResultBtnStyle}>
                  <span style={{ color: '#16233f' }}>{s}</span>
                </button>
              ))}
            </div>
          )}
          {expiredResults.length > 0 && (
            <div>
              <div style={searchGroupLabelStyle}>{t('nav_expired')}</div>
              {expiredResults.map((e) => (
                <button key={e.id} type="button" onClick={() => pickExpired(e)} style={searchResultBtnStyle}>
                  <span style={{ fontWeight: 700, color: '#16233f' }}>{e.productItemCode || '—'}</span>{' '}
                  <span style={{ color: '#6b7684' }}>{e.productDescription || ''} · {e.store || ''}</span>
                </button>
              ))}
            </div>
          )}
          {destructionResults.length > 0 && (
            <div>
              <div style={searchGroupLabelStyle}>{t('nav_destructions_report')}</div>
              {destructionResults.map((d) => (
                <button key={d.id} type="button" onClick={() => pickDestruction(d)} style={searchResultBtnStyle}>
                  <span style={{ fontWeight: 700, color: '#16233f' }}>{d.productItemCode || '—'}</span>{' '}
                  <span style={{ color: '#6b7684' }}>{d.productDescription || ''} · {d.store || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const searchGroupLabelStyle = {
  padding: '6px 14px 2px',
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  color: '#97a2b0',
  letterSpacing: 0.3
};

const searchResultBtnStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '7px 14px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 12.5
};
