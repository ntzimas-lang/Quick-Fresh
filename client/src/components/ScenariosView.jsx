import React, { useEffect, useMemo, useState } from 'react';
import { PricingScenarios } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';
import { SCENARIO_BASELINE_PRODUCTS, SCENARIO_CATEGORIES } from '../data/scenarioBaseline.js';

function fmtEuro(n) {
  const v = isFinite(n) ? n : 0;
  return '€' + v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct1(n) {
  return isFinite(n) ? (n * 100).toFixed(1) + '%' : '—';
}
function fmtNum(n, digits = 2) {
  const v = isFinite(n) ? n : 0;
  return v.toLocaleString('el-GR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// --- Στατικό σύνολο αναφοράς (Ιούνιος), από το ανεβασμένο Excel -----------------
const BASELINE_NET_REVENUE = SCENARIO_BASELINE_PRODUCTS.reduce((s, p) => s + p.juneValue, 0);
const BASELINE_COGS = SCENARIO_BASELINE_PRODUCTS.reduce((s, p) => s + p.ptk * p.juneQty, 0);
const BASELINE_GROSS_PROFIT = BASELINE_NET_REVENUE - BASELINE_COGS;
const BASELINE_GROSS_PROFIT_PCT = BASELINE_NET_REVENUE ? BASELINE_GROSS_PROFIT / BASELINE_NET_REVENUE : 0;

function emptyDraft() {
  return {
    name: '',
    notes: '',
    globalPricePercent: 0,
    globalQtyPercent: 0,
    categoryPercents: Object.fromEntries(SCENARIO_CATEGORIES.map((c) => [c, 0])),
    productOverrides: {}
  };
}

// Ίδιοι τύποι με το φύλλο "Σενάριο Τιμών" του Excel:
// Τιμή Σεναρίου = override ή Ιουνίου*(1+γενική%)*(1+ανά κατηγορία%)
// Ποσότητα Σεναρίου = override ή Ιουνίου*(1+προσαρμογή ποσοτήτων%)
// Αξία Σεναρίου = Τιμή * Ποσότητα · Τιμή Ραφιού = ROUND(Τιμή*1.13, 2)
function computeScenario(draft) {
  const catPercents = draft.categoryPercents || {};
  const overrides = draft.productOverrides || {};
  const globalPricePct = (Number(draft.globalPricePercent) || 0) / 100;
  const globalQtyPct = (Number(draft.globalQtyPercent) || 0) / 100;
  let netRevenue = 0;
  let cogs = 0;
  const rows = SCENARIO_BASELINE_PRODUCTS.map((p) => {
    const ov = overrides[p.code] || {};
    const catPct = (Number(catPercents[p.cat]) || 0) / 100;
    const hasPriceOverride = ov.price !== undefined && ov.price !== null && ov.price !== '';
    const price = hasPriceOverride ? Number(ov.price) : p.junePrice * (1 + globalPricePct) * (1 + catPct);
    const hasQtyOverride = ov.qty !== undefined && ov.qty !== null && ov.qty !== '';
    const qty = hasQtyOverride ? Number(ov.qty) : p.juneQty * (1 + globalQtyPct);
    const value = price * qty;
    const shelfPrice = Math.round(price * 1.13 * 100) / 100;
    const diff = value - p.juneValue;
    netRevenue += value;
    cogs += p.ptk * qty;
    return { ...p, price, qty, value, shelfPrice, diff, hasPriceOverride, hasQtyOverride };
  });
  const grossProfit = netRevenue - cogs;
  return {
    rows,
    netRevenue,
    cogs,
    grossProfit,
    grossProfitPct: netRevenue ? grossProfit / netRevenue : 0,
    diffVsJune: netRevenue - BASELINE_NET_REVENUE,
    diffPctVsJune: BASELINE_NET_REVENUE ? (netRevenue - BASELINE_NET_REVENUE) / BASELINE_NET_REVENUE : 0
  };
}

export default function ScenariosView({ readOnly = false, canDelete = false }) {
  const { t } = useLanguage();
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | draft object (μπορεί να έχει id)
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function load() {
    setLoading(true);
    PricingScenarios.list()
      .then((rows) => { setScenarios(rows); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  const preview = useMemo(() => (editing ? computeScenario(editing) : null), [editing]);

  function startNew() {
    setSaveError('');
    setSearch('');
    setEditing(emptyDraft());
  }

  function startEdit(sc) {
    setSaveError('');
    setSearch('');
    setEditing({
      ...sc,
      categoryPercents: { ...Object.fromEntries(SCENARIO_CATEGORIES.map((c) => [c, 0])), ...(sc.categoryPercents || {}) },
      productOverrides: { ...(sc.productOverrides || {}) }
    });
  }

  function cancelEdit() {
    setEditing(null);
    setSaveError('');
  }

  function updateOverride(code, field, value) {
    setEditing((prev) => {
      const productOverrides = { ...(prev.productOverrides || {}) };
      const ov = { ...(productOverrides[code] || {}) };
      ov[field] = value;
      productOverrides[code] = ov;
      return { ...prev, productOverrides };
    });
  }

  function updateCategoryPercent(cat, value) {
    setEditing((prev) => ({ ...prev, categoryPercents: { ...prev.categoryPercents, [cat]: value } }));
  }

  async function save() {
    if (!editing.name || !editing.name.trim()) {
      setSaveError(t('sc_name_required_error'));
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      // Καθαρίζουμε overrides χωρίς πραγματική τιμή, ώστε να μη γεμίζει άσκοπα το JSON.
      const cleanedOverrides = {};
      Object.entries(editing.productOverrides || {}).forEach(([code, ov]) => {
        const hasPrice = ov.price !== undefined && ov.price !== null && ov.price !== '';
        const hasQty = ov.qty !== undefined && ov.qty !== null && ov.qty !== '';
        if (hasPrice || hasQty) {
          cleanedOverrides[code] = {
            price: hasPrice ? ov.price : null,
            qty: hasQty ? ov.qty : null
          };
        }
      });
      const body = { ...editing, productOverrides: cleanedOverrides };
      if (editing.id) {
        await PricingScenarios.update(editing.id, body);
      } else {
        await PricingScenarios.create(body);
      }
      setEditing(null);
      load();
    } catch (err) {
      setSaveError((t('sc_save_error_prefix') || '') + ' ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm(t('sc_delete_confirm'))) return;
    try {
      await PricingScenarios.remove(id);
      load();
    } catch (err) {
      alert(err.message || err);
    }
  }

  const filteredRows = useMemo(() => {
    if (!preview) return [];
    const q = search.trim().toLowerCase();
    if (!q) return preview.rows;
    return preview.rows.filter((r) => r.desc.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  }, [preview, search]);

  const savedComputed = useMemo(() => scenarios.map((sc) => ({ sc, result: computeScenario(sc) })), [scenarios]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_scenarios')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        {!editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 12.5, color: '#97a2b0', margin: 0, maxWidth: 800 }}>{t('sc_intro_hint')}</p>

            {!readOnly && (
              <div>
                <button type="button" className="btn-primary" onClick={startNew}>{t('sc_new_button')}</button>
              </div>
            )}

            {loading ? (
              <p style={{ color: '#97a2b0' }}>{t('sc_loading')}</p>
            ) : error ? (
              <p style={{ color: '#c0392b' }}>{error}</p>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 + savedComputed.length * 170 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11, textTransform: 'uppercase' }}>
                      <th style={{ padding: '6px 10px 10px 0', minWidth: 170 }}></th>
                      <th style={{ padding: '6px 10px 10px', minWidth: 150, color: '#16233f', fontWeight: 700 }}>{t('sc_baseline_label')}</th>
                      {savedComputed.map(({ sc }) => (
                        <th key={sc.id} style={{ padding: '6px 10px 10px', minWidth: 170 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span style={{ color: '#16233f', fontWeight: 700, fontSize: 12.5, textTransform: 'none' }}>{sc.name || '—'}</span>
                            <span style={{ display: 'flex', gap: 4 }}>
                              {!readOnly && (
                                <button type="button" onClick={() => startEdit(sc)} title={t('sc_edit_button')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2f8f8a', fontSize: 13 }}>✎</button>
                              )}
                              {canDelete && (
                                <button type="button" onClick={() => remove(sc.id)} title={t('sc_delete_button')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#c0392b', fontSize: 13 }}>✕</button>
                              )}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_net_revenue_label')}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }}>{fmtEuro(BASELINE_NET_REVENUE)}</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }}>{fmtEuro(result.netRevenue)}</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_diff_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#97a2b0' }}>—</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: result.diffVsJune >= 0 ? '#2f8f8a' : '#c0392b', fontWeight: 600 }}>
                          {result.diffVsJune >= 0 ? '+' : ''}{fmtEuro(result.diffVsJune)}
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_diff_pct_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#97a2b0' }}>—</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: result.diffPctVsJune >= 0 ? '#2f8f8a' : '#c0392b', fontWeight: 600 }}>
                          {result.diffPctVsJune >= 0 ? '+' : ''}{fmtPct1(result.diffPctVsJune)}
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_cogs_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#16233f' }}>{fmtEuro(BASELINE_COGS)}</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: '#16233f' }}>{fmtEuro(result.cogs)}</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_gross_profit_label')}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }}>{fmtEuro(BASELINE_GROSS_PROFIT)}</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }}>{fmtEuro(result.grossProfit)}</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_gross_profit_pct_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#16233f' }}>{fmtPct1(BASELINE_GROSS_PROFIT_PCT)}</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: '#16233f' }}>{fmtPct1(result.grossProfitPct)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                {savedComputed.length === 0 && (
                  <p style={{ fontSize: 12.5, color: '#97a2b0', marginTop: 14, marginBottom: 0 }}>{t('sc_empty_list')}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#16233f', marginBottom: 14, textTransform: 'uppercase' }}>
                {editing.id ? t('sc_editing_title_edit') : t('sc_editing_title_new')}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ flex: '1 1 260px' }}>
                  <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_name_label')}</label>
                  <input
                    type="text"
                    value={editing.name}
                    placeholder={t('sc_name_placeholder')}
                    disabled={readOnly}
                    onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                  />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_global_price_label')}</label>
                  <input
                    type="number" step="0.1"
                    value={editing.globalPricePercent}
                    disabled={readOnly}
                    onChange={(e) => setEditing((prev) => ({ ...prev, globalPricePercent: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                  />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_global_qty_label')}</label>
                  <input
                    type="number" step="0.1"
                    value={editing.globalQtyPercent}
                    disabled={readOnly}
                    onChange={(e) => setEditing((prev) => ({ ...prev, globalQtyPercent: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_notes_label')}</label>
                <textarea
                  value={editing.notes || ''}
                  disabled={readOnly}
                  onChange={(e) => setEditing((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13, resize: 'vertical' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#6b7684', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>{t('sc_category_changes_title')}</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {SCENARIO_CATEGORIES.map((cat) => (
                    <div key={cat} style={{ minWidth: 160 }}>
                      <label style={{ display: 'block', fontSize: 11, color: '#97a2b0', marginBottom: 4 }}>{cat}</label>
                      <input
                        type="number" step="0.1"
                        value={editing.categoryPercents[cat] ?? 0}
                        disabled={readOnly}
                        onChange={(e) => updateCategoryPercent(cat, e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {preview && (
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>{t('sc_live_summary_title')}</div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#16233f' }}>{fmtEuro(preview.netRevenue)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_net_revenue_label')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: preview.diffVsJune >= 0 ? '#2f8f8a' : '#c0392b' }}>
                      {preview.diffVsJune >= 0 ? '+' : ''}{fmtEuro(preview.diffVsJune)}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_diff_label')} ({preview.diffPctVsJune >= 0 ? '+' : ''}{fmtPct1(preview.diffPctVsJune)})</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c98a1f' }}>{fmtEuro(preview.cogs)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_cogs_label')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#7a4fc9' }}>{fmtEuro(preview.grossProfit)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_gross_profit_label')} ({fmtPct1(preview.grossProfitPct)})</div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#97a2b0' }}>{t('sc_products_count')}</span>
                <input
                  type="text"
                  placeholder={t('sc_search_placeholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: '7px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 12.5, minWidth: 240 }}
                />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 980 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 10.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                      <th style={{ padding: '7px 8px' }}>{t('sc_col_code')}</th>
                      <th style={{ padding: '7px 8px', minWidth: 220 }}>{t('sc_col_desc')}</th>
                      <th style={{ padding: '7px 8px' }}>{t('sc_col_cat')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_june_qty')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_june_price')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_june_value')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right', minWidth: 90 }}>{t('sc_col_new_price')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right', minWidth: 90 }}>{t('sc_col_new_qty')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_scenario_price')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_scenario_qty')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_scenario_value')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_diff')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => (
                      <tr key={r.code} style={{ borderTop: '1px solid #eef1f4' }}>
                        <td style={{ padding: '6px 8px', color: '#97a2b0', whiteSpace: 'nowrap' }}>{r.code}</td>
                        <td style={{ padding: '6px 8px' }}>{r.desc}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7684', whiteSpace: 'nowrap' }}>{r.cat}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtNum(r.juneQty, 0)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(r.junePrice)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(r.juneValue)}</td>
                        <td style={{ padding: '4px' }}>
                          <input
                            type="number" step="0.01"
                            value={(editing.productOverrides[r.code] && editing.productOverrides[r.code].price) ?? ''}
                            disabled={readOnly}
                            onChange={(e) => updateOverride(r.code, 'price', e.target.value)}
                            style={{ width: 78, padding: '4px 6px', border: '1px solid #dde2e8', borderRadius: 4, fontSize: 12, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input
                            type="number" step="1"
                            value={(editing.productOverrides[r.code] && editing.productOverrides[r.code].qty) ?? ''}
                            disabled={readOnly}
                            onChange={(e) => updateOverride(r.code, 'qty', e.target.value)}
                            style={{ width: 70, padding: '4px 6px', border: '1px solid #dde2e8', borderRadius: 4, fontSize: 12, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: r.hasPriceOverride ? 700 : 400, color: r.hasPriceOverride ? '#2f8f8a' : '#16233f' }}>{fmtEuro(r.price)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: r.hasQtyOverride ? 700 : 400, color: r.hasQtyOverride ? '#2f8f8a' : '#16233f' }}>{fmtNum(r.qty, 0)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#16233f' }}>{fmtEuro(r.value)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: r.diff >= 0 ? '#2f8f8a' : '#c0392b' }}>{r.diff >= 0 ? '+' : ''}{fmtEuro(r.diff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {saveError && <p style={{ color: '#c0392b', fontSize: 12.5, margin: 0 }}>{saveError}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              {!readOnly && (
                <button type="button" className="btn-primary" onClick={save} disabled={saving}>
                  {t('sc_save_button')}
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={cancelEdit}>{t('sc_cancel_button')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
