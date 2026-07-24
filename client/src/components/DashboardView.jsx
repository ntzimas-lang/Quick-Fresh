import React, { useEffect, useState } from 'react';
import { Contacts, Entries } from '../api.js';
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

function Bar({ label, value, max, color }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <strong style={{ fontSize: 13 }}>{value}</strong>
      </div>
      <div style={{ height: 8, background: '#f1f3f5', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: color }} />
      </div>
    </div>
  );
}

export default function DashboardView() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState([]);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    Promise.all([
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

  // Μετράμε τεμάχια (ποσότητα) αντί για αριθμό καταχωρήσεων — μία καταχώρηση
  // μπορεί να αντιπροσωπεύει πολλά τεμάχια. Χωρίς ποσότητα, θεωρούμε 1 τεμάχιο.
  function entryQty(e) {
    const q = Number(e.quantity);
    return Number.isFinite(q) && q > 0 ? q : 1;
  }
  const entryDiffs = entries.map((e) => ({ ...e, diff: daysDiff(e.expiryDate), qty: entryQty(e) }));
  const expiredQty = entryDiffs.filter((e) => e.diff < 0).reduce((sum, e) => sum + e.qty, 0);
  const soonEntries = entryDiffs.filter((e) => e.diff >= 0 && e.diff <= 7);
  const soonQty = soonEntries.reduce((sum, e) => sum + e.qty, 0);
  const totalQty = entryDiffs.reduce((sum, e) => sum + e.qty, 0);

  // Ανάλυση ειδικά για όσα λήγουν εντός 7 ημερών: ανά ημέρες-απόσταση και ανά κατάστημα.
  const bucketToday = soonEntries.filter((e) => e.diff === 0).reduce((s, e) => s + e.qty, 0);
  const bucket1_3 = soonEntries.filter((e) => e.diff >= 1 && e.diff <= 3).reduce((s, e) => s + e.qty, 0);
  const bucket4_7 = soonEntries.filter((e) => e.diff >= 4 && e.diff <= 7).reduce((s, e) => s + e.qty, 0);
  const maxBucket = Math.max(bucketToday, bucket1_3, bucket4_7, 1);

  // Ανά κατάστημα: σύνολο τεμαχίων + σύνθεση (Σήμερα / 1-3 / 4-7 ημέρες) στην ίδια γραμμή.
  const soonStoreMap = {};
  soonEntries.forEach((e) => {
    const key = e.store || '—';
    if (!soonStoreMap[key]) soonStoreMap[key] = { today: 0, d1_3: 0, d4_7: 0, total: 0 };
    const bucket = e.diff === 0 ? 'today' : e.diff <= 3 ? 'd1_3' : 'd4_7';
    soonStoreMap[key][bucket] += e.qty;
    soonStoreMap[key].total += e.qty;
  });
  const soonStoreBreakdown = Object.entries(soonStoreMap).sort((a, b) => b[1].total - a[1].total).slice(0, 8);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 1. Ληγμένα — πρώτη, σε πλήρες πλάτος, με μεγαλύτερη ανάλυση για όσα λήγουν σε 7 ημέρες */}
          <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 22 }}>
            <div style={{ fontSize: 14, color: '#6b7684', fontWeight: 700, textTransform: 'uppercase', marginBottom: 16 }}>
              {t('d_expired_title')}
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#c0392b' }}>{expiredQty}</div>
                <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_expired_pieces')}</div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#e0703a' }}>{bucketToday}</div>
                <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_today_pieces')}</div>
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

            <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18 }}>
              <div style={{ fontSize: 13.5, color: '#16233f', fontWeight: 700, marginBottom: 14 }}>
                {t('d_soon_analysis_title')}
              </div>
              {soonQty === 0 ? (
                <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_no_soon')}</p>
              ) : (
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                    <Bar label={t('d_bucket_today')} value={bucketToday} max={maxBucket} color="#c0392b" />
                    <Bar label={t('d_bucket_1_3')} value={bucket1_3} max={maxBucket} color="#e0703a" />
                    <Bar label={t('d_bucket_4_7')} value={bucket4_7} max={maxBucket} color="#c98a1f" />
                  </div>
                  <div style={{ flex: '1 1 300px', minWidth: 260 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>
                        {t('d_by_store_soon')}
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 10.5, color: '#6b7684' }}>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#c0392b', marginRight: 3 }} />{t('d_bucket_today')}</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#e0703a', marginRight: 3 }} />{t('d_bucket_1_3')}</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#c98a1f', marginRight: 3 }} />{t('d_bucket_4_7')}</span>
                      </div>
                    </div>
                    {soonStoreBreakdown.map(([store, s]) => {
                      const pctToday = s.total ? Math.round((s.today / s.total) * 100) : 0;
                      const pct1_3 = s.total ? Math.round((s.d1_3 / s.total) * 100) : 0;
                      const pct4_7 = s.total ? Math.max(0, 100 - pctToday - pct1_3) : 0;
                      return (
                        <div key={store} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13 }}>{store}</span>
                            <strong style={{ fontSize: 13 }}>{s.total} {t('d_pieces_abbr')}</strong>
                          </div>
                          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#f1f3f5' }}>
                            {s.today > 0 && <div title={`${t('d_bucket_today')}: ${s.today}`} style={{ width: pctToday + '%', background: '#c0392b' }} />}
                            {s.d1_3 > 0 && <div title={`${t('d_bucket_1_3')}: ${s.d1_3}`} style={{ width: pct1_3 + '%', background: '#e0703a' }} />}
                            {s.d4_7 > 0 && <div title={`${t('d_bucket_4_7')}: ${s.d4_7}`} style={{ width: pct4_7 + '%', background: '#c98a1f' }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. Επαφές ανά Status — κάτω, σε πλήρες πλάτος */}
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
        </div>
      </div>
    </div>
  );
}
