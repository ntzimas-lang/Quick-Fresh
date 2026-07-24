import React, { useEffect, useState } from 'react';
import { Contacts, Entries, SalesDaily, SalesProducts } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const SALES_LINE_COLORS = { net: '#2f8f8a', tx: '#c98a1f' };

function monthKey(dateStr) {
  return String(dateStr).slice(0, 7); // 'yyyy-mm-dd' -> 'yyyy-mm'
}

const MONTH_LABELS_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(key, lang) {
  const [y, m] = key.split('-');
  const labels = lang === 'en' ? MONTH_LABELS_EN : MONTH_LABELS_EL;
  return `${labels[Number(m) - 1]} ${y}`;
}

// Μετατρέπει μια σειρά τιμών σε συντεταγμένες SVG, κανονικοποιημένες 0-100
// ώστε πολλές καμπύλες με διαφορετική κλίμακα να χωράνε στο ίδιο γράφημα.
// Επιστρέφει και την πραγματική τιμή ανά σημείο, για να δείχνουμε νούμερα πάνω στο γράφημα.
function trendCoords(series, width = 360, height = 100, topPad = 20) {
  if (!series.length) return [];
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const n = series.length;
  return series.map((v, i) => {
    const x = n > 1 ? (i * width) / (n - 1) : width / 2;
    const frac = hi !== lo ? (v - lo) / (hi - lo) : 0.5;
    const y = topPad + (1 - frac) * (height - topPad * 1.5);
    return { x, y, value: v };
  });
}

function coordsToPoints(coords) {
  return coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
}

function formatEuro(v) {
  return '€' + Math.round(v).toLocaleString('el-GR');
}

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

export default function DashboardView({ isDriver = false } = {}) {
  const { t, lang } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [salesDaily, setSalesDaily] = useState([]);
  const [salesProducts, setSalesProducts] = useState([]);

  useEffect(() => {
    // Ο Οδηγός βλέπει μόνο την κάρτα Ληγμένα — δεν χρειάζεται να φορτώσουμε
    // Επαφές/Πωλήσεις γι' αυτόν, ώστε να μην κάνουμε άσκοπα requests.
    const tasks = isDriver
      ? [Entries.list().then(setEntries)]
      : [
          Contacts.list().then(setContacts),
          Entries.list().then(setEntries),
          SalesDaily.list().then(setSalesDaily),
          SalesProducts.list().then(setSalesProducts)
        ];
    Promise.all(tasks)
      .then(() => setLoading(false))
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }, [isDriver]);

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

  // Ανά κατάστημα: ΟΛΑ τα προϊόντα του καταστήματος (όχι μόνο όσα λήγουν σύντομα),
  // με σύνθεση Ληγμένα / Σήμερα / 1-3 / 4-7 ημέρες / >7 ημέρες στην ίδια γραμμή.
  const storeFullMap = {};
  entryDiffs.forEach((e) => {
    const key = e.store || '—';
    if (!storeFullMap[key]) storeFullMap[key] = { expired: 0, today: 0, d1_3: 0, d4_7: 0, rest: 0, total: 0 };
    let bucket;
    if (e.diff < 0) bucket = 'expired';
    else if (e.diff === 0) bucket = 'today';
    else if (e.diff <= 3) bucket = 'd1_3';
    else if (e.diff <= 7) bucket = 'd4_7';
    else bucket = 'rest';
    storeFullMap[key][bucket] += e.qty;
    storeFullMap[key].total += e.qty;
  });
  const storeBreakdown = Object.entries(storeFullMap).sort((a, b) => b[1].total - a[1].total);

  const statusGroups = {};
  contacts.forEach((c) => {
    const key = c.status || '';
    statusGroups[key] = (statusGroups[key] || 0) + 1;
  });
  const statusOrder = ['Έκλεισε', 'Ενδιαφέρεται', 'Δεν Ενδιαφέρεται', ''];
  const statusLabelKeys = { 'Έκλεισε': 'c_status_closed', 'Ενδιαφέρεται': 'c_status_interested', 'Δεν Ενδιαφέρεται': 'c_status_not_interested' };

  // --- Πωλήσεις ---------------------------------------------------------
  // KPIs — καθαρά ποσά, χωρίς ΦΠΑ (η στήλη netSales έχει ήδη αφαιρέσει τον φόρο).
  const salesTx = salesDaily.reduce((s, r) => s + (r.transactions || 0), 0);
  const salesItems = salesDaily.reduce((s, r) => s + (r.itemCount || 0), 0);
  const salesNet = salesDaily.reduce((s, r) => s + (r.netSales || 0), 0);
  const avgTicket = salesTx ? salesNet / salesTx : 0;
  const avgBasket = salesTx ? salesItems / salesTx : 0;

  // Τάση ανά μήνα (καθαρές πωλήσεις / συναλλαγές / μέσο καλάθι).
  const monthMap = {};
  salesDaily.forEach((r) => {
    if (!r.date) return;
    const mk = monthKey(r.date);
    if (!monthMap[mk]) monthMap[mk] = { tx: 0, net: 0, items: 0 };
    monthMap[mk].tx += r.transactions || 0;
    monthMap[mk].net += r.netSales || 0;
    monthMap[mk].items += r.itemCount || 0;
  });
  const monthKeys = Object.keys(monthMap).sort();
  const monthNet = monthKeys.map((k) => monthMap[k].net);
  const monthTx = monthKeys.map((k) => monthMap[k].tx);
  const monthAvgBasket = monthKeys.map((k) => (monthMap[k].tx ? monthMap[k].items / monthMap[k].tx : 0));
  const monthAvgTicket = monthKeys.map((k) => (monthMap[k].tx ? monthMap[k].net / monthMap[k].tx : 0));
  const netCoords = trendCoords(monthNet);
  const txCoords = trendCoords(monthTx);

  // Top 5 προϊόντα + κατηγορίες ανά μήνα: ομαδοποίηση των uploads με βάση τον μήνα
  // μεταφόρτωσης, κρατώντας μόνο την πιο πρόσφατη παρτίδα ανά κατάστημα ΜΕΣΑ σε κάθε μήνα
  // (ώστε επαναληπτικά uploads του ίδιου μήνα να μην διπλομετρηθούν).
  const latestBatchByStoreMonth = {};
  salesProducts.forEach((p) => {
    if (!p.uploadedAt) return;
    const key = monthKey(p.uploadedAt) + '|' + p.store;
    const cur = latestBatchByStoreMonth[key];
    if (!cur || new Date(p.uploadedAt) > new Date(cur)) latestBatchByStoreMonth[key] = p.uploadedAt;
  });
  const monthlyProducts = salesProducts.filter((p) => {
    if (!p.uploadedAt) return false;
    const key = monthKey(p.uploadedAt) + '|' + p.store;
    return p.uploadedAt === latestBatchByStoreMonth[key];
  });
  const productMonthTotals = {};
  const categoryMonthTotals = {};
  monthlyProducts.forEach((p) => {
    const mk = monthKey(p.uploadedAt);
    if (!productMonthTotals[mk]) productMonthTotals[mk] = {};
    const name = p.productName || '—';
    if (!productMonthTotals[mk][name]) productMonthTotals[mk][name] = { sold: 0, netRevenue: 0 };
    productMonthTotals[mk][name].sold += p.sold || 0;
    productMonthTotals[mk][name].netRevenue += p.netRevenue || 0;

    if (!categoryMonthTotals[mk]) categoryMonthTotals[mk] = {};
    const cat = p.cat1 || '—';
    categoryMonthTotals[mk][cat] = (categoryMonthTotals[mk][cat] || 0) + (p.netRevenue || 0);
  });
  const productMonthKeys = Object.keys(productMonthTotals).sort().reverse();
  const topProductsByMonth = productMonthKeys.map((mk) => ({
    monthKey: mk,
    products: Object.entries(productMonthTotals[mk])
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.netRevenue - a.netRevenue)
      .slice(0, 5)
  }));
  const categoryBreakdownByMonth = productMonthKeys.map((mk) => {
    const categories = Object.entries(categoryMonthTotals[mk] || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { monthKey: mk, categories, max: categories.length ? categories[0][1] : 1 };
  });

  const hasSalesData = salesDaily.length > 0 || salesProducts.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_dashboard')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 1. Πωλήσεις — καθαρά ποσά (χωρίς ΦΠΑ), από τα uploads στο πεδίο "Πωλήσεις" */}
          {!isDriver && (
          <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 22 }}>
            <div style={{ fontSize: 14, color: '#2f8f8a', fontWeight: 700, textTransform: 'uppercase', marginBottom: 16 }}>
              {t('d_sales_title')}
            </div>
            {!hasSalesData ? (
              <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_sales_empty')}</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: '#16233f' }}>€{salesNet.toFixed(0)}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_sales_net')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: '#2f8f8a' }}>{salesTx}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_sales_tx')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: '#c98a1f' }}>€{avgTicket.toFixed(2)}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_sales_avg_ticket')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: '#7a4fc9' }}>{avgBasket.toFixed(2)}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_sales_avg_basket')}</div>
                  </div>
                </div>

                {monthKeys.length > 1 && (
                  <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18, marginBottom: 22 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>{t('d_sales_trend_title')}</span>
                      <div style={{ display: 'flex', gap: 12, fontSize: 10.5, color: '#6b7684' }}>
                        <span><span style={{ display: 'inline-block', width: 14, height: 2.5, background: SALES_LINE_COLORS.net, marginRight: 4, verticalAlign: 'middle' }} />{t('d_sales_net')}</span>
                        <span><span style={{ display: 'inline-block', width: 14, height: 2.5, background: SALES_LINE_COLORS.tx, marginRight: 4, verticalAlign: 'middle' }} />{t('d_sales_tx')}</span>
                      </div>
                    </div>
                    <svg viewBox="0 0 360 110" style={{ width: '100%', height: 160 }}>
                      <polyline points={coordsToPoints(netCoords)} fill="none" stroke={SALES_LINE_COLORS.net} strokeWidth="2.5" />
                      <polyline points={coordsToPoints(txCoords)} fill="none" stroke={SALES_LINE_COLORS.tx} strokeWidth="2" strokeDasharray="4,3" />
                      {netCoords.map((c, i) => (
                        <g key={'net' + i}>
                          <circle cx={c.x} cy={c.y} r="3" fill={SALES_LINE_COLORS.net} />
                          <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill={SALES_LINE_COLORS.net}>
                            {formatEuro(c.value)}
                          </text>
                        </g>
                      ))}
                      {txCoords.map((c, i) => (
                        <g key={'tx' + i}>
                          <circle cx={c.x} cy={c.y} r="3" fill={SALES_LINE_COLORS.tx} />
                          <text x={c.x} y={c.y + 16} textAnchor="middle" fontSize="9" fontWeight="700" fill={SALES_LINE_COLORS.tx}>
                            {Math.round(c.value)}
                          </text>
                        </g>
                      ))}
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#97a2b0', marginTop: 4 }}>
                      {monthKeys.map((k) => <span key={k}>{monthLabel(k, lang)}</span>)}
                    </div>
                  </div>
                )}

                {monthKeys.length > 0 && (
                  <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18, marginBottom: 22 }}>
                    <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                      {t('d_sales_monthly_kpi_title')}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 480 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #eef1f4' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('d_month')}</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('d_sales_net')}</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('d_sales_tx')}</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('d_sales_avg_ticket')}</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('d_sales_avg_basket')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthKeys.map((k, i) => (
                            <tr key={k} style={{ borderTop: '1px solid #eef1f4' }}>
                              <td style={{ padding: '7px 8px', fontWeight: 600 }}>{monthLabel(k, lang)}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#16233f', fontWeight: 700 }}>{formatEuro(monthNet[i])}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#2f8f8a' }}>{monthTx[i]}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#c98a1f' }}>€{monthAvgTicket[i].toFixed(2)}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#7a4fc9' }}>{monthAvgBasket[i].toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                    {t('d_sales_by_category_monthly_title')}
                  </div>
                  {categoryBreakdownByMonth.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_sales_no_products')}</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      {categoryBreakdownByMonth.map(({ monthKey: mk, categories, max }) => (
                        <div key={mk} style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 420 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16233f', marginBottom: 8 }}>
                            {monthLabel(mk, lang)}
                          </div>
                          {categories.map(([cat, val]) => (
                            <Bar key={cat} label={cat} value={Math.round(val)} max={max} color="#2f8f8a" />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18 }}>
                  <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                    {t('d_sales_top_products_monthly_title')}
                  </div>
                  {topProductsByMonth.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_sales_no_products')}</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      {topProductsByMonth.map(({ monthKey: mk, products }) => (
                        <div key={mk} style={{ flex: '1 1 260px', minWidth: 240 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16233f', marginBottom: 8 }}>
                            {monthLabel(mk, lang)}
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <tbody>
                              {products.map((p) => (
                                <tr key={p.name} style={{ borderTop: '1px solid #eef1f4' }}>
                                  <td style={{ padding: '6px 0' }}>{p.name}</td>
                                  <td style={{ padding: '6px 0', textAlign: 'right', color: '#6b7684', whiteSpace: 'nowrap' }}>{p.sold} {t('d_pieces_abbr')}</td>
                                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>€{p.netRevenue.toFixed(0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          )}

          {/* 2. Ληγμένα */}
          <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 22 }}>
            <div style={{ fontSize: 14, color: '#c0392b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 16 }}>
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
              {totalQty === 0 ? (
                <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_no_soon')}</p>
              ) : (
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                    {soonQty === 0 ? (
                      <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_no_soon')}</p>
                    ) : (
                      <>
                        <Bar label={t('d_bucket_today')} value={bucketToday} max={maxBucket} color="#c0392b" />
                        <Bar label={t('d_bucket_1_3')} value={bucket1_3} max={maxBucket} color="#e0703a" />
                        <Bar label={t('d_bucket_4_7')} value={bucket4_7} max={maxBucket} color="#c98a1f" />
                      </>
                    )}
                  </div>
                  <div style={{ flex: '1 1 300px', minWidth: 260 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>
                        {t('d_by_store_soon')}
                      </span>
                      <div style={{ display: 'flex', gap: 10, fontSize: 10.5, color: '#6b7684', flexWrap: 'wrap' }}>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#7a1f1f', marginRight: 3 }} />{t('d_expired_title')}</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#c0392b', marginRight: 3 }} />{t('d_bucket_today')}</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#e0703a', marginRight: 3 }} />{t('d_bucket_1_3')}</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#c98a1f', marginRight: 3 }} />{t('d_bucket_4_7')}</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#b9c3d6', marginRight: 3 }} />{t('d_bucket_rest')}</span>
                      </div>
                    </div>
                    {storeBreakdown.map(([store, s]) => {
                      const pctExpired = s.total ? Math.round((s.expired / s.total) * 100) : 0;
                      const pctToday = s.total ? Math.round((s.today / s.total) * 100) : 0;
                      const pct1_3 = s.total ? Math.round((s.d1_3 / s.total) * 100) : 0;
                      const pct4_7 = s.total ? Math.round((s.d4_7 / s.total) * 100) : 0;
                      const pctRest = s.total ? Math.max(0, 100 - pctExpired - pctToday - pct1_3 - pct4_7) : 0;
                      return (
                        <div key={store} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13 }}>{store}</span>
                            <strong style={{ fontSize: 13 }}>{s.total} {t('d_pieces_abbr')}</strong>
                          </div>
                          <div style={{ display: 'flex', height: 20, borderRadius: 5, overflow: 'hidden', background: '#f1f3f5' }}>
                            {s.expired > 0 && (
                              <div
                                style={{ width: pctExpired + '%', background: '#7a1f1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>{s.expired}</span>
                              </div>
                            )}
                            {s.today > 0 && (
                              <div
                                style={{ width: pctToday + '%', background: '#c0392b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>{s.today}</span>
                              </div>
                            )}
                            {s.d1_3 > 0 && (
                              <div
                                style={{ width: pct1_3 + '%', background: '#e0703a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>{s.d1_3}</span>
                              </div>
                            )}
                            {s.d4_7 > 0 && (
                              <div
                                style={{ width: pct4_7 + '%', background: '#c98a1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>{s.d4_7}</span>
                              </div>
                            )}
                            {s.rest > 0 && (
                              <div
                                style={{ width: pctRest + '%', background: '#b9c3d6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16233f', textShadow: '0 1px 1px rgba(255,255,255,0.35)' }}>{s.rest}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Επαφές ανά Status — κάτω, σε πλήρες πλάτος */}
          {!isDriver && (
          <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 22 }}>
            <div style={{ fontSize: 14, color: '#7a4fc9', fontWeight: 700, textTransform: 'uppercase', marginBottom: 16 }}>
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
          )}
        </div>
      </div>
    </div>
  );
}
