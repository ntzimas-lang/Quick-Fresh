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
// Για ποσά όπου το πρόσημο μπορεί να αντιστρέψει νόημα (π.χ. erosion): θετικό = κόστος (−),
// αρνητικό = όφελος (+). Αποφεύγει το μπερδεμένο "−€-51,95".
function fmtSignedCost(n) {
  const v = isFinite(n) ? n : 0;
  return v >= 0 ? '−' + fmtEuro(v) : '+' + fmtEuro(-v);
}

// --- Στατικό σύνολο αναφοράς (τιμοκατάλογος BASIC), από το ανεβασμένο Excel -----
// Η βάση πάνω στην οποία υπολογίζεται η %έκπτωση είναι ο ΠΡΑΓΜΑΤΙΚΟΣ μηνιαίος τζίρος
// Ιουνίου (μόνο ό,τι όντως πουλήθηκε — juneQty ανά προϊόν, τιμολογημένο σε τιμή BASIC).
// ΔΕΝ γίνεται καμία εκτίμηση/πρόσθεση ποσότητας για προϊόντα που δεν πουλήθηκαν, ώστε η
// βάση να μείνει ρεαλιστική και να αφορά ΕΝΑΝ μήνα. Η έκπτωση % που προκύπτει εφαρμόζεται
// όμως σε ΟΛΑ τα 128 προϊόντα του τιμοκαταλόγου (δηλαδή κάθε προϊόν παίρνει νέα προτεινόμενη
// τιμή, ακόμα κι αν δεν πουλήθηκε τον Ιούνιο) — απλά η ΒΑΣΗ υπολογισμού του ποσοστού είναι ο
// πραγματικός τζίρος, όχι μια φουσκωμένη εκτίμηση.
const BASIC_TOTAL_VALUE = SCENARIO_BASELINE_PRODUCTS.reduce((s, p) => s + p.basicValue, 0);
const BASIC_COGS = SCENARIO_BASELINE_PRODUCTS.reduce((s, p) => s + p.ptk * p.juneQty, 0);
const BASIC_GROSS_PROFIT = BASIC_TOTAL_VALUE - BASIC_COGS;
const BASIC_GROSS_PROFIT_PCT = BASIC_TOTAL_VALUE ? BASIC_GROSS_PROFIT / BASIC_TOTAL_VALUE : 0;
// F.C. = ΠΤΚ (κόστος) / καθαρή τιμή (χωρίς ΦΠΑ) × 100 — ίδιος τύπος με το computeFC() του
// ProductsView.jsx. Στο σύνολο, F.C.% = 100 − Μικτό Κέρδος% (COGS/Revenue = 1 − GrossProfit/Revenue).
const BASIC_FC_PCT = 100 - BASIC_GROSS_PROFIT_PCT * 100;

function emptyDraft() {
  return { name: '', notes: '', subsidyAmount: 0, volumeGrowthPct: 0 };
}

// Στρογγυλοποίηση ΠΑΝΤΑ προς τα πάνω, στο κοντινότερο 0,10€ (π.χ. 1,73€ → 1,80€).
function roundUpToDime(x) {
  return Math.ceil(x * 10 - 1e-6) / 10;
}

// Μία ενιαία λογική, σε μηνιαία βάση: η επιδότηση (σε €) που παίρνεις ΚΑΘΕ ΜΗΝΑ μετατρέπεται
// σε ΕΝΑ ποσοστό έκπτωσης πάνω στον πραγματικό μηνιαίο τζίρο Ιουνίου (BASIC_TOTAL_VALUE), και
// το ποσοστό αυτό εφαρμόζεται εξίσου σε ΟΛΕΣ τις τιμές BASIC — και των 128 προϊόντων, ακόμα κι
// αυτών που δεν πουλήθηκαν τον Ιούνιο. Κάθε νέα τιμή στρογγυλοποιείται προς τα πάνω στο
// κοντινότερο 0,10€. Επειδή η στρογγυλοποίηση προς τα πάνω "τρώει" μέρος της έκπτωσης
// (περισσότερο σε φθηνά προϊόντα, όπου τα 0,10€ είναι μεγάλο ποσοστό της τιμής), η ΠΡΑΓΜΑΤΙΚΗ
// μείωση τζίρου (revenueDrop, υπολογισμένη πάνω στα προϊόντα που όντως πουλήθηκαν) μπορεί να
// είναι αισθητά μικρότερη από το ονομαστικό ποσό επιδότησης — γι' αυτό εμφανίζεται ξεχωριστά
// στην οθόνη, ώστε να φαίνεται καθαρά το πραγματικό αποτέλεσμα.
//
// Ανάλυση Ευαισθησίας Όγκου (volumeGrowthPct): η επιδότηση είναι ΣΤΑΘΕΡΟ ποσό, υπολογισμένο
// ώστε να καλύπτει την έκπτωση ΣΤΟΝ ΟΓΚΟ ΤΟΥ ΙΟΥΝΙΟΥ. Αν οι πωλήσεις αυξηθούν, δίνεις την ίδια
// % έκπτωση σε περισσότερα τεμάχια — άρα δίνεις περισσότερα € έκπτωσης συνολικά, ενώ η
// επιδότηση παραμένει σταθερή. Το "erosion" (ροκάνισμα) δείχνει ακριβώς αυτή τη διαφορά: πόσο
// λιγότερο κερδίζεις σε σχέση με το αν πουλούσες τον ίδιο αυξημένο όγκο ΧΩΡΙΣ έκπτωση. Παρόλα
// αυτά, το netBenefitVsToday μένει θετικό όσο η νέα τιμή είναι πάνω από το κόστος — απλά
// μικρότερο απ' όσο θα περίμενες, ακριβώς λόγω αυτού του ροκανίσματος.
function computeSubsidyScenario(subsidyAmount, volumeGrowthPct) {
  const amount = Number(subsidyAmount) || 0;
  const growthPct = Number(volumeGrowthPct) || 0;
  const growthFactor = 1 + growthPct / 100;
  const discountPct = BASIC_TOTAL_VALUE ? amount / BASIC_TOTAL_VALUE : 0;

  let soldNetRevenue = 0;
  let grownNetRevenue = 0;
  let grownCOGS = 0;
  let grownRevenueNoDiscount = 0;

  const rows = SCENARIO_BASELINE_PRODUCTS.map((p) => {
    const newPrice = roundUpToDime(p.basicPrice * (1 - discountPct));
    const newValue = (newPrice / 1.13) * p.juneQty;
    const diff = newValue - p.basicValue;
    soldNetRevenue += newValue;

    const grownQty = p.juneQty * growthFactor;
    grownNetRevenue += (newPrice / 1.13) * grownQty;
    grownCOGS += p.ptk * grownQty;
    grownRevenueNoDiscount += (p.basicPrice / 1.13) * grownQty;

    const fcBasic = p.basicPrice ? (p.ptk / (p.basicPrice / 1.13)) * 100 : NaN;
    const fcNew = newPrice ? (p.ptk / (newPrice / 1.13)) * 100 : NaN;

    return { ...p, newPrice, newValue, diff, fcBasic, fcNew };
  });

  const grossProfit = soldNetRevenue - BASIC_COGS;
  const grossProfitPct = soldNetRevenue ? grossProfit / soldNetRevenue : 0;
  const fcNewPct = 100 - grossProfitPct * 100;
  const revenueDrop = BASIC_TOTAL_VALUE - soldNetRevenue; // πραγματική μείωση τζίρου, μετά τη στρογγυλοποίηση

  const grownGrossProfit = grownNetRevenue - grownCOGS; // μικτό κέρδος στον ΝΕΟ (αυξημένο) όγκο, με τη μειωμένη τιμή
  const totalWithSubsidy = grownGrossProfit + amount; // + η σταθερή επιδότηση
  const noDiscountGrownProfit = grownRevenueNoDiscount - grownCOGS; // υποθετικό: ίδιος αυξημένος όγκος, ΧΩΡΙΣ έκπτωση
  const erosion = noDiscountGrownProfit - totalWithSubsidy; // πόσο "τρώει" η αύξηση όγκου από την επιδότηση
  const netBenefitVsToday = totalWithSubsidy - BASIC_GROSS_PROFIT; // vs το σημερινό μικτό κέρδος (χωρίς σενάριο)

  return {
    rows,
    discountPct,
    netRevenue: soldNetRevenue,
    cogs: BASIC_COGS,
    grossProfit,
    grossProfitPct,
    fcNewPct,
    revenueDrop,
    volumeGrowthPct: growthPct,
    grownGrossProfit,
    totalWithSubsidy,
    erosion,
    netBenefitVsToday
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

  const preview = useMemo(
    () => (editing ? computeSubsidyScenario(editing.subsidyAmount, editing.volumeGrowthPct) : null),
    [editing]
  );

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
      const body = {
        name: editing.name,
        notes: editing.notes || '',
        subsidyAmount: Number(editing.subsidyAmount) || 0,
        volumeGrowthPct: Number(editing.volumeGrowthPct) || 0
      };
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
    () => scenarios.map((sc) => ({ sc, result: computeSubsidyScenario(sc.subsidyAmount, sc.volumeGrowthPct) })),
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
                        {t('sc_net_revenue_label')}
                        <div style={{ fontSize: 10.5, color: '#97a2b0', fontWeight: 400 }}>{t('sc_price_list_total_hint')}</div>
                      </td>
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
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_fc_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#16233f' }}>{fmtNum(BASIC_FC_PCT, 1)}%</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: '#c0392b' }}>{fmtNum(result.fcNewPct, 1)}%</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_volume_growth_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#97a2b0' }}>—</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: '#16233f' }}>+{fmtNum(result.volumeGrowthPct, 0)}%</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>
                        {t('sc_erosion_label')}
                        <div style={{ fontSize: 10.5, color: '#97a2b0', fontWeight: 400 }}>{t('sc_erosion_hint')}</div>
                      </td>
                      <td style={{ padding: '8px 10px', color: '#97a2b0' }}>—</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: result.erosion >= 0 ? '#c0392b' : '#2f8f8a', fontWeight: 600 }}>{fmtSignedCost(result.erosion)}</td>
                      ))}
                    </tr>
                    <tr style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '8px 10px 8px 0', color: '#6b7684' }}>{t('sc_net_benefit_label')}</td>
                      <td style={{ padding: '8px 10px', color: '#97a2b0' }}>—</td>
                      {savedComputed.map(({ sc, result }) => (
                        <td key={sc.id} style={{ padding: '8px 10px', color: '#2f8f8a', fontWeight: 600 }}>+{fmtEuro(result.netBenefitVsToday)}</td>
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
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_volume_growth_label')}</label>
                  <input
                    type="number" step="1"
                    value={editing.volumeGrowthPct ?? 0}
                    disabled={readOnly}
                    onChange={(e) => setEditing((prev) => ({ ...prev, volumeGrowthPct: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                  />
                </div>
              </div>
              <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 6px' }}>{t('sc_subsidy_hint')}</p>
              <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 14px' }}>{t('sc_volume_growth_hint')}</p>
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
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c0392b' }}>{fmtNum(preview.fcNewPct, 1)}%</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_fc_new_label')} ({t('sc_fc_basic_label')}: {fmtNum(BASIC_FC_PCT, 1)}%)</div>
                  </div>
                </div>
              </div>
            )}

            {preview && (
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t('sc_sensitivity_title')}</div>
                <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 12px', maxWidth: 700 }}>{t('sc_sensitivity_hint')}</p>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#16233f' }}>{fmtEuro(preview.totalWithSubsidy)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_grown_profit_label')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: preview.erosion >= 0 ? '#c0392b' : '#2f8f8a' }}>{fmtSignedCost(preview.erosion)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_erosion_label')}</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 220 }}>{t('sc_erosion_hint')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#2f8f8a' }}>+{fmtEuro(preview.netBenefitVsToday)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_net_benefit_label')}</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 220 }}>{t('sc_net_benefit_hint')}</div>
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
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_basic_price')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_basic_value')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_fc_basic')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_new_price')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_new_value')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_fc_new')}</th>
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
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(r.basicPrice)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(r.basicValue)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7684' }}>{isFinite(r.fcBasic) ? fmtNum(r.fcBasic, 1) + '%' : '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#2f8f8a' }}>{fmtEuro(r.newPrice)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#16233f' }}>{fmtEuro(r.newValue)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c0392b' }}>{isFinite(r.fcNew) ? fmtNum(r.fcNew, 1) + '%' : '—'}</td>
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
