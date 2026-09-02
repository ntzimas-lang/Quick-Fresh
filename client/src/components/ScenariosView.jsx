import React, { useEffect, useMemo, useState } from 'react';
import { PricingScenarios } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';
import { SCENARIO_BASELINE_PRODUCTS } from '../data/scenarioBaseline.js';

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

// --- Στατικό σύνολο αναφοράς (τιμοκατάλογος BASIC), από το ανεβασμένο Excel -----
// Μέση μηνιαία ποσότητα, υπολογισμένη ΜΟΝΟ από τα προϊόντα που όντως πουλήθηκαν τον
// Ιούνιο (juneQty > 0). Χρησιμοποιείται ως ρεαλιστική εκτίμηση ποσότητας για τα υπόλοιπα
// προϊόντα του τιμοκαταλόγου που δεν πουλήθηκαν καθόλου τον Ιούνιο, ώστε ΟΛΟΚΛΗΡΟΣ ο
// τιμοκατάλογος (128 προϊόντα) να έχει μια ρεαλιστική εκτιμώμενη μηνιαία αξία — όχι μόνο
// όσα έτυχε να πουληθούν.
const SOLD_PRODUCTS = SCENARIO_BASELINE_PRODUCTS.filter((p) => p.juneQty > 0);
const AVG_MONTHLY_QTY = SOLD_PRODUCTS.length
  ? SOLD_PRODUCTS.reduce((s, p) => s + p.juneQty, 0) / SOLD_PRODUCTS.length
  : 0;

// Εκτιμώμενη ποσότητα αναφοράς ανά προϊόν: η πραγματική ποσότητα Ιουνίου αν πουλήθηκε,
// αλλιώς η μέση μηνιαία ποσότητα (εκτίμηση) — και αντίστοιχη εκτιμώμενη αξία (ίδιος τύπος
// με basicValue: τιμή χωρίς ΦΠΑ × ποσότητα).
const REFERENCE_PRODUCTS = SCENARIO_BASELINE_PRODUCTS.map((p) => {
  const isEstimatedQty = !(p.juneQty > 0);
  const refQty = isEstimatedQty ? AVG_MONTHLY_QTY : p.juneQty;
  const refValue = (p.basicPrice / 1.13) * refQty;
  return { ...p, refQty, refValue, isEstimatedQty };
});

// Σύνολο ΟΛΟΚΛΗΡΟΥ του τιμοκαταλόγου BASIC (128 προϊόντα, με ρεαλιστική εκτιμώμενη μηνιαία
// αξία και για τα προϊόντα που δεν πουλήθηκαν τον Ιούνιο) — αυτή είναι η βάση πάνω στην
// οποία υπολογίζεται η %έκπτωση, ώστε η επιδότηση να καλύπτει ολόκληρο τον τιμοκατάλογο
// κάθε μήνα και όχι μόνο ό,τι έτυχε να πουληθεί τον Ιούνιο.
const BASIC_TOTAL_VALUE = REFERENCE_PRODUCTS.reduce((s, p) => s + p.refValue, 0);
const BASIC_COGS = REFERENCE_PRODUCTS.reduce((s, p) => s + p.ptk * p.refQty, 0);
const BASIC_GROSS_PROFIT = BASIC_TOTAL_VALUE - BASIC_COGS;
const BASIC_GROSS_PROFIT_PCT = BASIC_TOTAL_VALUE ? BASIC_GROSS_PROFIT / BASIC_TOTAL_VALUE : 0;

function emptyDraft() {
  return { name: '', notes: '', subsidyAmount: 0 };
}

// Στρογγυλοποίηση ΠΑΝΤΑ προς τα πάνω, στο κοντινότερο 0,10€ (π.χ. 1,73€ → 1,80€).
function roundUpToDime(x) {
  return Math.ceil(x * 10 - 1e-6) / 10;
}

// Μία ενιαία λογική, σε μηνιαία βάση: η επιδότηση (σε €) που παίρνεις ΚΑΘΕ ΜΗΝΑ μετατρέπεται
// σε ΕΝΑ ποσοστό έκπτωσης πάνω στη ρεαλιστική εκτιμώμενη αξία ΟΛΟΚΛΗΡΟΥ του τιμοκαταλόγου
// BASIC (128 προϊόντα — όχι μόνο όσα πουλήθηκαν τον Ιούνιο), και εφαρμόζεται εξίσου σε ΟΛΕΣ
// τις τιμές. Κάθε νέα τιμή στρογγυλοποιείται προς τα πάνω στο κοντινότερο 0,10€. Επειδή η
// στρογγυλοποίηση προς τα πάνω "τρώει" μέρος της έκπτωσης (περισσότερο σε φθηνά προϊόντα,
// όπου τα 0,10€ είναι μεγάλο ποσοστό της τιμής), η ΠΡΑΓΜΑΤΙΚΗ μείωση τζίρου (revenueDrop)
// μπορεί να είναι αισθητά μικρότερη από το ονομαστικό ποσό επιδότησης — γι' αυτό
// εμφανίζεται ξεχωριστά στην οθόνη, ώστε να φαίνεται καθαρά το πραγματικό αποτέλεσμα.
function computeSubsidyScenario(subsidyAmount) {
  const amount = Number(subsidyAmount) || 0;
  const discountPct = BASIC_TOTAL_VALUE ? amount / BASIC_TOTAL_VALUE : 0;
  let netRevenue = 0;
  const rows = REFERENCE_PRODUCTS.map((p) => {
    const newPrice = roundUpToDime(p.basicPrice * (1 - discountPct));
    const newValue = (newPrice / 1.13) * p.refQty;
    const diff = newValue - p.refValue;
    netRevenue += newValue;
    return { ...p, newPrice, newValue, diff };
  });
  const grossProfit = netRevenue - BASIC_COGS;
  const revenueDrop = BASIC_TOTAL_VALUE - netRevenue; // πραγματική μείωση τζίρου, μετά τη στρογγυλοποίηση
  return {
    rows,
    discountPct,
    netRevenue,
    cogs: BASIC_COGS,
    grossProfit,
    grossProfitPct: netRevenue ? grossProfit / netRevenue : 0,
    revenueDrop
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

  const preview = useMemo(() => (editing ? computeSubsidyScenario(editing.subsidyAmount) : null), [editing]);

  function startNew() {
    setSaveError('');
    setSearch('');
    setEditing(emptyDraft());
  }

  function startEdit(sc) {
    setSaveError('');
    setSearch('');
    setEditing({ ...emptyDraft(), ...sc });
  }

  function cancelEdit() {
    setEditing(null);
    setSaveError('');
  }

  async function save() {
    if (!editing.name || !editing.name.trim()) {
      setSaveError(t('sc_name_required_error'));
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const body = { name: editing.name, notes: editing.notes || '', subsidyAmount: Number(editing.subsidyAmount) || 0 };
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

  const savedComputed = useMemo(
    () => scenarios.map((sc) => ({ sc, result: computeSubsidyScenario(sc.subsidyAmount) })),
    [scenarios]
  );

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
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>
                        {t('sc_price_list_total_label')}
                        <div style={{ fontSize: 10.5, color: '#97a2b0', fontWeight: 400 }}>{t('sc_price_list_total_hint')}</div>
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }} colSpan={savedComputed.length + 1}>
                        {fmtEuro(BASIC_TOTAL_VALUE)}
                      </td>
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_net_revenue_label')}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }}>{fmtEuro(BASIC_TOTAL_VALUE)}</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }}>{fmtEuro(result.netRevenue)}</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_subsidy_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#97a2b0' }}>—</td>
                      {savedComputed.map(({ sc }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: '#c0392b', fontWeight: 600 }}>−{fmtEuro(Number(sc.subsidyAmount) || 0)}</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>
                        {t('sc_actual_drop_label')}
                        <div style={{ fontSize: 10.5, color: '#97a2b0', fontWeight: 400 }}>{t('sc_actual_drop_hint')}</div>
                      </td>
                      <td style={{ padding: '8px 10px', color: '#97a2b0' }}>—</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: '#c98a1f', fontWeight: 600 }}>−{fmtEuro(result.revenueDrop)}</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_discount_pct_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#97a2b0' }}>—</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: '#16233f' }}>−{fmtPct1(result.discountPct)}</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_cogs_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#16233f' }}>{fmtEuro(BASIC_COGS)}</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: '#16233f' }}>{fmtEuro(result.cogs)}</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_gross_profit_label')}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }}>{fmtEuro(BASIC_GROSS_PROFIT)}</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }}>{fmtEuro(result.grossProfit)}</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_gross_profit_pct_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#16233f' }}>{fmtPct1(BASIC_GROSS_PROFIT_PCT)}</td>
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
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ flex: '2 1 300px' }}>
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
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_subsidy_amount_label')}</label>
                  <input
                    type="number" step="1" min="0"
                    value={editing.subsidyAmount}
                    disabled={readOnly}
                    onChange={(e) => setEditing((prev) => ({ ...prev, subsidyAmount: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                  />
                </div>
              </div>
              <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 14px' }}>{t('sc_subsidy_hint')}</p>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_notes_label')}</label>
                <textarea
                  value={editing.notes || ''}
                  disabled={readOnly}
                  onChange={(e) => setEditing((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13, resize: 'vertical' }}
                />
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
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c0392b' }}>
                      −{fmtEuro(Number(editing.subsidyAmount) || 0)}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_subsidy_label')} (−{fmtPct1(preview.discountPct)})</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c98a1f' }}>−{fmtEuro(preview.revenueDrop)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_actual_drop_label')}</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 180 }}>{t('sc_actual_drop_hint')}</div>
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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 10.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                      <th style={{ padding: '7px 8px' }}>{t('sc_col_code')}</th>
                      <th style={{ padding: '7px 8px', minWidth: 220 }}>{t('sc_col_desc')}</th>
                      <th style={{ padding: '7px 8px' }}>{t('sc_col_cat')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_june_qty')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_ref_qty')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_basic_price')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_ref_value')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_new_price')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_new_value')}</th>
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
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: r.isEstimatedQty ? '#c98a1f' : 'inherit' }}>
                          {fmtNum(r.refQty, 0)}{r.isEstimatedQty ? ` ${t('sc_estimated_marker')}` : ''}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(r.basicPrice)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(r.refValue)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#2f8f8a' }}>{fmtEuro(r.newPrice)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#16233f' }}>{fmtEuro(r.newValue)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c0392b' }}>{fmtEuro(r.diff)}</td>
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
