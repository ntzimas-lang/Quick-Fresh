import React, { useEffect, useState } from 'react';
import { Products, Contacts, Entries } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const CONTACT_STATUS_COLORS = {
  'Έκλεισε': '#27ae60',
  'Ενδιαφέρεται': '#e0a500',
  'Δεν Ενδιαφέρεται': '#c0392b',
  '': '#c7cdd6'
};

function daysDiff(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr + 'T00:00:00');
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
}

export default function DashboardView() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    Promise.all([
      Products.list().then(setProducts),
      Contacts.list().then(setContacts),
      Entries.list().then(setEntries)
    ])
      .then(() => setLoading(false))
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }, []);

  if (loading) {
    return <div style={{ padding: 20, color: '#97a2b0' }}>{t('d_loading')}</div>;
  }
  if (error) {
    return <div style={{ padding: 20, color: '#c0392b' }}>{error}</div>;
  }

  const entos = products.filter((p) => (p.status || 'ΕΝΤΟΣ') !== 'ΕΚΤΟΣ').length;
  const ektos = products.length - entos;

  // Μετράμε τεμάχια (ποσότητα) αντί για αριθμό καταχωρήσεων — μία καταχώρηση
  // μπορεί να αντιπροσωπεύει πολλά τεμάχια. Χωρίς ποσότητα, θεωρούμε 1 τεμάχιο.
  function entryQty(e) {
    const q = Number(e.quantity);
    return Number.isFinite(q) && q > 0 ? q : 1;
  }
  const entryDiffs = entries.map((e) => ({ ...e, diff: daysDiff(e.expiryDate), qty: entryQty(e) }));
  const expiredQty = entryDiffs.filter((e) => e.diff < 0).reduce((sum, e) => sum + e.qty, 0);
  const soonQty = entryDiffs.filter((e) => e.diff >= 0 && e.diff <= 7).reduce((sum, e) => sum + e.qty, 0);
  const totalQty = entryDiffs.reduce((sum, e) => sum + e.qty, 0);

  const storeQtyMap = {};
  entryDiffs.filter((e) => e.diff <= 7).forEach((e) => {
    const key = e.store || '—';
    storeQtyMap[key] = (storeQtyMap[key] || 0) + e.qty;
  });
  const storeBreakdown = Object.entries(storeQtyMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxStoreQty = storeBreakdown.length ? storeBreakdown[0][1] : 0;

  const statusGroups = {};
  contacts.forEach((c) => {
    const key = c.status || '';
    statusGroups[key] = (statusGroups[key] || 0) + 1;
  });
  const statusOrder = ['Έκλεισε', 'Ενδιαφέρεται', 'Δεν Ενδιαφέρεται', ''];
  const statusLabelKeys = { 'Έκλεισε': 'c_status_closed', 'Ενδιαφέρεται': 'c_status_interested', 'Δεν Ενδιαφέρεται': 'c_status_not_interested' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_dashboard')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        <div className="dashboard-grid">

          {/* 1. Επαφές ανά Status — μεγαλύτερη έμφαση, με μπάρες ποσοστού */}
          <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 22 }}>
            <div style={{ fontSize: 14, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 16 }}>
              {t('d_contacts_by_status')}
            </div>
            {contacts.length === 0 ? (
              <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_no_contacts')}</p>
            ) : (
              statusOrder.map((key) => {
                const count = statusGroups[key] || 0;
                if (count === 0) return null;
                const pct = contacts.length ? Math.round((count / contacts.length) * 100) : 0;
                return (
                  <div key={key || 'none'} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{key ? t(statusLabelKeys[key]) : t('d_no_status')}</span>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>
                        {count} <span style={{ fontSize: 12.5, color: '#97a2b0', fontWeight: 400 }}>({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 12, background: '#f1f3f5', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', background: CONTACT_STATUS_COLORS[key] || '#c7cdd6' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 2. Ληγμένα — μεγαλύτερη έμφαση, σε τεμάχια + ανάλυση ανά κατάστημα */}
          <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 22 }}>
            <div style={{ fontSize: 14, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 16 }}>
              {t('d_expired_title')}
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: storeBreakdown.length ? 20 : 0 }}>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#c0392b' }}>{expiredQty}</div>
                <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_expired_pieces')}</div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#c98a1f' }}>{soonQty}</div>
                <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_soon_pieces')}</div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#16233f' }}>{totalQty}</div>
                <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_total_pieces')}</div>
              </div>
            </div>
            {storeBreakdown.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#6b7684', fontWeight: 700, marginBottom: 10 }}>
                  {t('d_by_store')}
                </div>
                {storeBreakdown.map(([store, q]) => {
                  const pct = maxStoreQty ? Math.round((q / maxStoreQty) * 100) : 0;
                  return (
                    <div key={store} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13 }}>{store}</span>
                        <strong style={{ fontSize: 13 }}>{q} {t('d_pieces_abbr')}</strong>
                      </div>
                      <div style={{ height: 8, background: '#f1f3f5', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: pct + '%', height: '100%', background: '#c0392b' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Προϊόντα — πιο συμπαγής κάρτα, τελευταία */}
          <div className="dashboard-card--sm" style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ fontSize: 11.5, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase' }}>{t('d_products_title')}</div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#27ae60' }}>{entos}</span>
                <span style={{ fontSize: 11.5, color: '#6b7684' }}>ΕΝΤΟΣ</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#c0392b' }}>{ektos}</span>
                <span style={{ fontSize: 11.5, color: '#6b7684' }}>ΕΚΤΟΣ</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#16233f' }}>{products.length}</span>
                <span style={{ fontSize: 11.5, color: '#6b7684' }}>{t('d_products_total')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
