import React, { useEffect, useState } from 'react';
import { PendingInstallations } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

// Λίστα καταστημάτων σε εκκρεμότητα εγκατάστασης. ΣΚΟΠΙΜΑ αυτόνομο πεδίο — δεν αντλεί
// ΤΙΠΟΤΑ από άλλο σημείο της εφαρμογής (όχι από την κεντρική λίστα καταστημάτων, όχι
// από Στοιχεία Καταστήματος). Το όνομα καταστήματος είναι ελεύθερο κείμενο, γιατί αυτά
// τα καταστήματα δεν έχουν ακόμα εγκατασταθεί — δεν υπάρχουν πουθενά αλλού στην εφαρμογή.
//
// Δύο βασικά "σχέδια" εξοπλισμού βλέπει ο χρήστης στην πράξη:
//   Σχέδιο Α: Stockwell + Φούρνοι (Heat) + Καφές
//   Σχέδιο Β: Ψυγείο 1 + Ψυγείο 2 + Φούρνοι (Heat) + Καφές
// Αντί να κλειδώσουμε δύο σταθερά "σχέδια", δίνουμε ένα ελεύθερο checklist με όλα τα
// πιθανά κομμάτια — έτσι καλύπτεται και οποιοσδήποτε συνδυασμός στο μέλλον.
const EQUIPMENT_OPTIONS = [
  { key: 'stockwell', labelKey: 'pi_eq_stockwell' },
  { key: 'fridge1', labelKey: 'pi_eq_fridge1' },
  { key: 'fridge2', labelKey: 'pi_eq_fridge2' },
  { key: 'oven1', labelKey: 'pi_eq_oven1' },
  { key: 'oven2', labelKey: 'pi_eq_oven2' },
  { key: 'coffee', labelKey: 'pi_eq_coffee' }
];

const STATUS_OPTIONS = [
  { key: 'pending', labelKey: 'pi_status_pending', color: '#c98a1f' },
  { key: 'scheduled', labelKey: 'pi_status_scheduled', color: '#2f80ed' },
  { key: 'done', labelKey: 'pi_status_done', color: '#2f8f8a' }
];

function emptyDraft() {
  return { store: '', equipment: [], targetDate: '', notes: '', status: 'pending' };
}

function statusMeta(key) {
  return STATUS_OPTIONS.find((s) => s.key === key) || STATUS_OPTIONS[0];
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
  const [showDone, setShowDone] = useState(false);

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

  const visibleRows = rows.filter((r) => (showDone ? true : r.status !== 'done'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{t('nav_pending_installations')}</strong>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#6b7684' }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          {t('pi_show_done')}
        </label>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        <p style={{ color: '#6b7684', fontSize: 12.5, margin: '0 0 14px' }}>{t('pi_hint')}</p>

        {error && (
          <div style={{ background: '#fdecea', color: '#c0392b', border: '1px solid #f3c1bb', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {/* Νέα εκκρεμότητα */}
        {!readOnly && (
        <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16233f', marginBottom: 10 }}>{t('pi_new_title')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="field">
              <label>{t('pi_col_store')}</label>
              <input
                value={newDraft.store}
                onChange={(e) => setNewDraft((d) => ({ ...d, store: e.target.value }))}
                placeholder={t('pi_store_placeholder')}
              />
            </div>
            <div className="field">
              <label>{t('pi_col_target_date')}</label>
              <input
                type="date"
                value={newDraft.targetDate || ''}
                onChange={(e) => setNewDraft((d) => ({ ...d, targetDate: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, color: '#6b7684', fontWeight: 600, marginBottom: 6 }}>{t('pi_col_equipment')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {EQUIPMENT_OPTIONS.map((eq) => (
                <label key={eq.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={newDraft.equipment.includes(eq.key)}
                    onChange={() => setNewDraft((d) => ({ ...d, equipment: toggleEquipment(d.equipment, eq.key) }))}
                  />
                  {t(eq.labelKey)}
                </label>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t('pi_col_notes')}</label>
            <textarea
              value={newDraft.notes}
              onChange={(e) => setNewDraft((d) => ({ ...d, notes: e.target.value }))}
              rows={2}
              placeholder={t('pi_notes_placeholder')}
            />
          </div>
          <button className="btn-primary" onClick={handleCreate} disabled={creating || !newDraft.store.trim()}>
            {creating ? t('d_loading') : t('pi_add_button')}
          </button>
        </div>
        )}

        {loading ? (
          <p style={{ color: '#97a2b0' }}>{t('d_loading')}</p>
        ) : visibleRows.length === 0 ? (
          <p style={{ color: '#97a2b0' }}>{t('pi_no_results')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visibleRows.map((row) => {
              const draft = draftFor(row);
              const dirty = !!editDrafts[row.id];
              const sm = statusMeta(draft.status);
              return (
                <div key={row.id} style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <input
                      value={draft.store}
                      onChange={(e) => setDraftField(row.id, 'store', e.target.value)}
                      disabled={readOnly}
                      style={{ fontSize: 14, fontWeight: 700, color: '#16233f', border: '1px solid #d7dce2', borderRadius: 6, padding: '5px 8px', flex: '1 1 220px' }}
                    />
                    <select
                      value={draft.status}
                      onChange={(e) => setDraftField(row.id, 'status', e.target.value)}
                      disabled={readOnly}
                      style={{ background: sm.color, color: '#fff', fontWeight: 600, border: 'none', borderRadius: 10, padding: '5px 10px', fontSize: 12 }}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
                    </select>
                    {!readOnly && row.status !== 'done' && (
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ background: '#2f8f8a' }}
                        onClick={() => handleMarkDone(row)}
                        disabled={savingId === row.id}
                      >
                        ✓ {t('pi_mark_done')}
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" className="btn-danger" onClick={() => handleDelete(row.id)}>
                        {t('common_delete')}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className="field">
                      <label>{t('pi_col_target_date')}</label>
                      <input
                        type="date"
                        value={draft.targetDate || ''}
                        onChange={(e) => setDraftField(row.id, 'targetDate', e.target.value)}
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11.5, color: '#6b7684', fontWeight: 600, marginBottom: 6 }}>{t('pi_col_equipment')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {EQUIPMENT_OPTIONS.map((eq) => (
                        <label key={eq.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
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
                  </div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label>{t('pi_col_notes')}</label>
                    <textarea
                      value={draft.notes || ''}
                      onChange={(e) => setDraftField(row.id, 'notes', e.target.value)}
                      rows={2}
                      disabled={readOnly}
                    />
                  </div>
                  {!readOnly && dirty && (
                    <button className="btn-primary" onClick={() => handleSaveRow(row.id)} disabled={savingId === row.id}>
                      {savingId === row.id ? t('d_loading') : t('common_save')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
