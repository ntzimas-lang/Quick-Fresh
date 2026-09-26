import React, { useEffect, useState } from 'react';
import { PendingInstallations } from '../api.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEJAVU_SANS_BASE64 } from '../dejavu-font.js';
import { useLanguage } from '../LanguageContext.jsx';

// Λίστα καταστημάτων σε εκκρεμότητα εγκατάστασης. ΣΚΟΠΙΜΑ αυτόνομο πεδίο — δεν αντλεί
// ΤΙΠΟΤΑ από άλλο σημείο της εφαρμογής (όχι από την κεντρική λίστα καταστημάτων, όχι
// από Στοιχεία Καταστήματος). Το όνομα καταστήματος είναι ελεύθερο κείμενο, γιατί αυτά
// τα καταστήματα δεν έχουν ακόμα εγκατασταθεί — δεν υπάρχουν πουθενά αλλού στην εφαρμογή.
//
// Δύο βασικά "σχέδια" εξοπλισμού βλέπει ο χρήστης στην πράξη (φωτογραφίες πάνω-πάνω στη
// σελίδα, μόνο για οπτική αναφορά — δεν επηρεάζουν καθόλου τα δεδομένα):
//   Σχέδιο με Ψυγεία: Ψυγείο 1 + Ψυγείο 2 + Heat + Καφές
//   Σχέδιο με Stockwell: Stockwell + Heat + Καφές
// Κάθε επιλογή παρακάτω αντιστοιχεί σε ΜΙΑ στήλη/ενότητα του πάγκου (όπως φαίνεται στις
// φωτογραφίες) — π.χ. το "Heat" είναι ΜΙΑ στήλη με 2 φούρνους μέσα της, όχι δύο ξεχωριστές
// επιλογές. Αντί να κλειδώσουμε δύο σταθερά "σχέδια", δίνουμε ένα ελεύθερο checklist με
// όλες τις πιθανές στήλες — έτσι καλύπτεται και οποιοσδήποτε συνδυασμός στο μέλλον.
const EQUIPMENT_OPTIONS = [
  { key: 'stockwell', labelKey: 'pi_eq_stockwell' },
  { key: 'fridge1', labelKey: 'pi_eq_fridge1' },
  { key: 'fridge2', labelKey: 'pi_eq_fridge2' },
  { key: 'heat', labelKey: 'pi_eq_heat' },
  { key: 'coffee', labelKey: 'pi_eq_coffee' }
];

const STATUS_OPTIONS = [
  { key: 'pending', labelKey: 'pi_status_pending', color: '#c98a1f' },
  { key: 'scheduled', labelKey: 'pi_status_scheduled', color: '#2f80ed' },
  { key: 'done', labelKey: 'pi_status_done', color: '#2f8f8a' }
];

// Χρώμα ανά τύπο εξοπλισμού — μόνο για να ξεχωρίζει οπτικά κάθε στοιχείο στη λίστα
// επιλογής (checkboxes), ανεξάρτητα από το αν έχει ήδη γραφτεί το όνομα καταστήματος.
const EQUIPMENT_COLOR = {
  stockwell: '#2f8f8a',
  fridge1: '#3d6bd6',
  fridge2: '#3d6bd6',
  heat: '#c98a1f',
  coffee: '#8a5a3d'
};

function emptyDraft() {
  return { store: '', equipment: [], targetDate: '', notes: '', status: 'pending', peopleCount: '', subsidized: false };
}

function statusMeta(key) {
  return STATUS_OPTIONS.find((s) => s.key === key) || STATUS_OPTIONS[0];
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr + 'T00:00:00');
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PendingInstallationsView({ canDelete = false, readOnly = false }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newDraft, setNewDraft] = useState(emptyDraft());
  const [creating, setCreating] = useState(false);
  const [editDrafts, setEditDrafts] = useState({}); // id -> draft
  const [savingId, setSavingId] = useState(null);
  // Προεπιλογή true — οι ολοκληρωμένες εγκαταστάσεις ΔΕΝ εξαφανίζονται μόλις πατηθεί
  // "Ολοκληρώθηκε" (μπέρδευε, έμοιαζε σαν να χάνονταν δεδομένα). Ο χρήστης μπορεί ακόμα
  // να τις αποκρύψει χειροκίνητα με το checkbox αν θέλει πιο καθαρή λίστα εκκρεμοτήτων.
  const [showDone, setShowDone] = useState(true);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    PendingInstallations.list()
      .then((r) => { setRows(r); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }

  function toggleEquipment(list, key) {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  }

  // Πάντα με τη σταθερή σειρά του EQUIPMENT_OPTIONS (Stockwell, Ψυγείο 1, Ψυγείο 2,
  // Φούρνοι, Καφές) — ΟΧΙ με τη σειρά που τσεκαρίστηκαν τα κουτάκια.
  function equipmentLabel(list) {
    return EQUIPMENT_OPTIONS.filter((e) => (list || []).includes(e.key)).map((e) => t(e.labelKey)).join(', ') || '—';
  }

  async function handleCreate() {
    if (!newDraft.store.trim()) return;
    setCreating(true);
    try {
      const created = await PendingInstallations.create(newDraft);
      setRows((prev) => [created, ...prev]);
      setNewDraft(emptyDraft());
    } catch (err) {
      setError(err.message || t('common_load_error'));
    } finally {
      setCreating(false);
    }
  }

  function draftFor(row) {
    return editDrafts[row.id] || row;
  }

  function setDraftField(id, field, value) {
    setEditDrafts((prev) => ({ ...prev, [id]: { ...draftFor(rows.find((r) => r.id === id)), ...prev[id], [field]: value } }));
  }

  async function handleSaveRow(id) {
    const draft = editDrafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      const updated = await PendingInstallations.update(id, draft);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } catch (err) {
      setError(err.message || t('common_load_error'));
    } finally {
      setSavingId(null);
    }
  }

  async function handleMarkDone(row) {
    setSavingId(row.id);
    try {
      const updated = await PendingInstallations.update(row.id, { ...draftFor(row), status: 'done' });
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      setEditDrafts((prev) => { const next = { ...prev }; delete next[row.id]; return next; });
    } catch (err) {
      setError(err.message || t('common_load_error'));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id) {
    try {
      await PendingInstallations.remove(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.message || t('common_load_error'));
    }
  }

  // Σειρά βάσει Επιθυμητής Ημερομηνίας (η πιο κοντινή πρώτη) — ισχύει και στην οθόνη
  // και στο PDF, αφού και τα δύο διαβάζουν από το visibleRows. Γραμμές χωρίς ημερομηνία
  // πάνε στο τέλος.
  const visibleRows = rows
    .filter((r) => (showDone ? true : r.status !== 'done'))
    .slice()
    .sort((a, b) => {
      if (!a.targetDate && !b.targetDate) return 0;
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    });

  // Φορτώνει μια εικόνα από το /public σε base64 dataURL, ώστε να μπει μέσα στο PDF
  // (το jsPDF χρειάζεται dataURL/ArrayBuffer, όχι απλό URL string).
  function loadImageAsDataURL(url) {
    return fetch(url)
      .then((res) => res.blob())
      .then(
        (blob) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
      );
  }

  function getImageSize(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.src = dataUrl;
    });
  }

  async function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.addFileToVFS('DejaVuSans.ttf', DEJAVU_SANS_BASE64);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(12);
    doc.text(`Quick & Fresh — ${t('nav_pending_installations')}`, 14, 10);

    // Τα δύο σχέδια εγκατάστασης πάνω-πάνω στο PDF, σαν οπτική αναφορά — ίδια λογική
    // με την οθόνη.
    let tableStartY = 16;
    try {
      const [fridgesUrl, stockwellUrl] = await Promise.all([
        loadImageAsDataURL('/pending-install-plan-fridges.jpg'),
        loadImageAsDataURL('/pending-install-plan-stockwell.jpg')
      ]);
      const [fridgesSize, stockwellSize] = await Promise.all([getImageSize(fridgesUrl), getImageSize(stockwellUrl)]);
      const boxW = 128;
      const gap = 10;
      const x1 = 14;
      const x2 = x1 + boxW + gap;
      const h1 = boxW * (fridgesSize.h / fridgesSize.w);
      const h2 = boxW * (stockwellSize.h / stockwellSize.w);
      const imgY = 14;
      doc.addImage(fridgesUrl, 'JPEG', x1, imgY, boxW, h1);
      doc.addImage(stockwellUrl, 'JPEG', x2, imgY, boxW, h2);
      doc.setFontSize(9);
      doc.text(t('pi_plan_fridges'), x1, imgY + h1 + 5);
      doc.text(t('pi_plan_stockwell'), x2, imgY + h2 + 5);
      doc.setFontSize(12);
      tableStartY = imgY + Math.max(h1, h2) + 12;
    } catch (e) {
      // Αν αποτύχει η φόρτωση των εικόνων (π.χ. offline), απλά συνεχίζουμε χωρίς αυτές —
      // ο πίνακας δεδομένων είναι το σημαντικό μέρος του PDF.
    }

    autoTable(doc, {
      startY: tableStartY,
      head: [[t('pi_col_store'), t('pi_col_equipment'), t('pi_col_people'), t('pi_col_subsidized'), t('pi_col_target_date'), t('pi_col_status'), t('pi_col_notes')]],
      body: visibleRows.map((r) => [
        r.store || '',
        equipmentLabel(r.equipment),
        r.peopleCount || r.peopleCount === 0 ? String(r.peopleCount) : '—',
        r.subsidized ? t('pi_subsidized_label') : '—',
        formatDate(r.targetDate),
        t(statusMeta(r.status).labelKey),
        r.notes || ''
      ]),
      styles: { fontSize: 9, cellPadding: 3, font: 'DejaVuSans' },
      headStyles: { fillColor: [22, 35, 63], font: 'DejaVuSans' },
      columnStyles: { 6: { cellWidth: 70 } }
    });
    doc.save(`quick-fresh-ekkremeis-egkatastaseis-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{t('nav_pending_installations')}</strong>
        <button className="btn-primary" style={{ background: '#c98a1f' }} onClick={exportPDF} title={t('common_export_pdf')}>
          PDF
        </button>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#6b7684' }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          {t('pi_show_done')}
        </label>
      </div>
      {/* Το padding-bottom είναι σκόπιμο κενό (ίδιο γκρι φόντο με την υπόλοιπη σελίδα,
          #f9fafb) — δίνει χώρο ώστε το ημερολόγιο (date picker) της τελευταίας γραμμής
          να μην κόβεται όταν ανοίγει. Δεν είναι bug/άδειο section. */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 140px', background: '#f9fafb' }}>
        {/* Δύο σχέδια εγκατάστασης — μόνο οπτική αναφορά, δεν συνδέονται με δεδομένα */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, overflow: 'hidden' }}>
            <img src="/pending-install-plan-fridges.jpg" alt={t('pi_plan_fridges')} style={{ width: '100%', display: 'block' }} />
            <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#16233f' }}>{t('pi_plan_fridges')}</div>
          </div>
          <div style={{ flex: '1 1 320px', background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, overflow: 'hidden' }}>
            <img src="/pending-install-plan-stockwell.jpg" alt={t('pi_plan_stockwell')} style={{ width: '100%', display: 'block' }} />
            <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#16233f' }}>{t('pi_plan_stockwell')}</div>
          </div>
        </div>

        <p style={{ color: '#6b7684', fontSize: 12.5, margin: '0 0 14px' }}>{t('pi_hint')}</p>

        {error && (
          <div style={{ background: '#fdecea', color: '#c0392b', border: '1px solid #f3c1bb', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#97a2b0' }}>{t('d_loading')}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                <th style={{ padding: '10px 12px', minWidth: 160 }}>{t('pi_col_store')}</th>
                <th style={{ padding: '10px 12px', minWidth: 260 }}>{t('pi_col_equipment')}</th>
                <th style={{ padding: '10px 12px', minWidth: 80 }}>{t('pi_col_people')}</th>
                <th style={{ padding: '10px 12px', minWidth: 120 }}>{t('pi_col_subsidized')}</th>
                <th style={{ padding: '10px 12px', minWidth: 130 }}>{t('pi_col_target_date')}</th>
                <th style={{ padding: '10px 12px', minWidth: 140 }}>{t('pi_col_status')}</th>
                <th style={{ padding: '10px 12px', minWidth: 180 }}>{t('pi_col_notes')}</th>
                {!readOnly && <th style={{ padding: '10px 12px' }} />}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 7 : 8} style={{ padding: '14px 12px', color: '#97a2b0' }}>{t('pi_no_results')}</td>
                </tr>
              )}
              {visibleRows.map((row) => {
                const draft = draftFor(row);
                const dirty = !!editDrafts[row.id];
                const sm = statusMeta(draft.status);
                return (
                  <tr key={row.id} style={{ borderTop: '1px solid #eef1f4' }}>
                    <td style={{ padding: '6px 12px' }}>
                      <input
                        value={draft.store}
                        onChange={(e) => setDraftField(row.id, 'store', e.target.value)}
                        disabled={readOnly}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 12.5, fontWeight: 600, color: '#16233f' }}
                      />
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {EQUIPMENT_OPTIONS.map((eq) => (
                          <label key={eq.key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, whiteSpace: 'nowrap', color: EQUIPMENT_COLOR[eq.key] || '#374151', fontWeight: 700 }}>
                            <input
                              type="checkbox"
                              checked={(draft.equipment || []).includes(eq.key)}
                              onChange={() => setDraftField(row.id, 'equipment', toggleEquipment(draft.equipment || [], eq.key))}
                              disabled={readOnly}
                            />
                            {t(eq.labelKey)}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <input
                        type="number"
                        min="0"
                        value={draft.peopleCount ?? ''}
                        onChange={(e) => setDraftField(row.id, 'peopleCount', e.target.value)}
                        disabled={readOnly}
                        style={{ width: 64, boxSizing: 'border-box', padding: '5px 8px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 12.5 }}
                      />
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <label style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 10,
                        fontSize: 11.5, fontWeight: 700, cursor: readOnly ? 'default' : 'pointer',
                        background: draft.subsidized ? '#e1f5ee' : '#f4f6f8', color: draft.subsidized ? '#0f6e56' : '#97a2b0'
                      }}>
                        <input
                          type="checkbox"
                          checked={!!draft.subsidized}
                          onChange={(e) => setDraftField(row.id, 'subsidized', e.target.checked)}
                          disabled={readOnly}
                          style={{ margin: 0 }}
                        />
                        {t('pi_subsidized_label')}
                      </label>
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <input
                        type="date"
                        value={draft.targetDate || ''}
                        onChange={(e) => setDraftField(row.id, 'targetDate', e.target.value)}
                        disabled={readOnly}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 12.5 }}
                      />
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <select
                        value={draft.status}
                        onChange={(e) => setDraftField(row.id, 'status', e.target.value)}
                        disabled={readOnly}
                        style={{ background: sm.color, color: '#fff', fontWeight: 600, border: 'none', borderRadius: 10, padding: '5px 10px', fontSize: 12 }}
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <input
                        value={draft.notes || ''}
                        onChange={(e) => setDraftField(row.id, 'notes', e.target.value)}
                        disabled={readOnly}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 12.5 }}
                      />
                    </td>
                    {!readOnly && (
                      <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {dirty && (
                            <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => handleSaveRow(row.id)} disabled={savingId === row.id}>
                              {savingId === row.id ? '…' : t('common_save')}
                            </button>
                          )}
                          {row.status !== 'done' && (
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ background: '#2f8f8a', padding: '4px 10px', fontSize: 11.5 }}
                              onClick={() => handleMarkDone(row)}
                              disabled={savingId === row.id}
                            >
                              ✓
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" className="btn-danger" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => handleDelete(row.id)}>
                              {t('common_delete')}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!readOnly && (
                <tr style={{ borderTop: '1px solid #eef1f4', background: '#fbfcfd' }}>
                  <td style={{ padding: '6px 12px' }}>
                    <input
                      value={newDraft.store}
                      onChange={(e) => setNewDraft((d) => ({ ...d, store: e.target.value }))}
                      placeholder={t('pi_store_placeholder')}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 12.5 }}
                    />
                  </td>
                  <td style={{ padding: '6px 12px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {EQUIPMENT_OPTIONS.map((eq) => (
                        <label key={eq.key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, whiteSpace: 'nowrap', color: EQUIPMENT_COLOR[eq.key] || '#374151', fontWeight: 700 }}>
                          <input
                            type="checkbox"
                            checked={newDraft.equipment.includes(eq.key)}
                            onChange={() => setNewDraft((d) => ({ ...d, equipment: toggleEquipment(d.equipment, eq.key) }))}
                          />
                          {t(eq.labelKey)}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '6px 12px' }}>
                    <input
                      type="number"
                      min="0"
                      value={newDraft.peopleCount ?? ''}
                      onChange={(e) => setNewDraft((d) => ({ ...d, peopleCount: e.target.value }))}
                      style={{ width: 64, boxSizing: 'border-box', padding: '5px 8px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 12.5 }}
                    />
                  </td>
                  <td style={{ padding: '6px 12px' }}>
                    <label style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 10,
                      fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      background: newDraft.subsidized ? '#e1f5ee' : '#f4f6f8', color: newDraft.subsidized ? '#0f6e56' : '#97a2b0'
                    }}>
                      <input
                        type="checkbox"
                        checked={!!newDraft.subsidized}
                        onChange={(e) => setNewDraft((d) => ({ ...d, subsidized: e.target.checked }))}
                        style={{ margin: 0 }}
                      />
                      {t('pi_subsidized_label')}
                    </label>
                  </td>
                  <td style={{ padding: '6px 12px' }}>
                    <input
                      type="date"
                      value={newDraft.targetDate || ''}
                      onChange={(e) => setNewDraft((d) => ({ ...d, targetDate: e.target.value }))}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 12.5 }}
                    />
                  </td>
                  <td style={{ padding: '6px 12px' }}>
                    <select
                      value={newDraft.status}
                      onChange={(e) => setNewDraft((d) => ({ ...d, status: e.target.value }))}
                      style={{ background: statusMeta(newDraft.status).color, color: '#fff', fontWeight: 600, border: 'none', borderRadius: 10, padding: '5px 10px', fontSize: 12 }}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '6px 12px' }}>
                    <input
                      value={newDraft.notes}
                      onChange={(e) => setNewDraft((d) => ({ ...d, notes: e.target.value }))}
                      placeholder={t('pi_notes_placeholder')}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 12.5 }}
                    />
                  </td>
                  <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>
                    <button className="btn-primary" onClick={handleCreate} disabled={creating || !newDraft.store.trim()}>
                      {creating ? '…' : t('pi_add_button')}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
