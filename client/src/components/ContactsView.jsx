import React, { useEffect, useRef, useState } from 'react';
import { Contacts } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

// Οι ετικέτες των στηλών ΕΙΝΑΙ κείμενο διεπαφής — μεταφράζονται μέσω t().
function buildContactColumns(t) {
  return [
    { key: 'company', label: t('c_col_company') },
    { key: 'department', label: t('c_col_department') },
    { key: 'phone', label: t('c_col_phone') },
    { key: 'emailInfo', label: t('c_col_emailInfo') },
    { key: 'status', label: t('c_col_status') },
    { key: 'autoSeller', label: t('c_col_autoSeller') },
    { key: 'interest', label: t('c_col_interest') },
    { key: 'peopleCount', label: t('c_col_peopleCount') },
    { key: 'responsible', label: t('c_col_responsible') },
    { key: 'email', label: t('c_col_email') },
    { key: 'phone2', label: t('c_col_phone2') },
    { key: 'firstCallDate', label: t('c_col_firstCallDate') },
    { key: 'firstMailDate', label: t('c_col_firstMailDate') },
    { key: 'firstVisitDate', label: t('c_col_firstVisitDate') },
    { key: 'secondCallDate', label: t('c_col_secondCallDate') },
    { key: 'secondMailDate', label: t('c_col_secondMailDate') },
    { key: 'secondVisitDate', label: t('c_col_secondVisitDate') },
    { key: 'notes', label: t('c_col_notes') }
  ];
}

const DEFAULT_VISIBLE_CONTACT_COLUMNS = [
  'company', 'department', 'phone', 'emailInfo', 'status', 'autoSeller', 'interest',
  'peopleCount', 'responsible', 'email', 'phone2', 'firstCallDate', 'firstMailDate',
  'firstVisitDate', 'secondCallDate', 'secondMailDate', 'secondVisitDate', 'notes'
];

const DATE_KEYS = new Set(['firstCallDate', 'firstMailDate', 'firstVisitDate', 'secondCallDate', 'secondMailDate', 'secondVisitDate']);
const TEXT_KEYS = new Set(['company', 'department', 'phone', 'emailInfo', 'responsible', 'email', 'phone2', 'notes']);

// Η "τιμή" (value) που αποθηκεύεται στην εγγραφή παραμένει πάντα η ίδια (Ελληνικά),
// ανεξάρτητα από τη γλώσσα διεπαφής — μόνο η ετικέτα (label) που φαίνεται μεταφράζεται.
const STATUS_VALUES = [
  { value: '', labelKey: '' },
  { value: 'Έκλεισε', labelKey: 'c_status_closed', color: '#27ae60' },
  { value: 'Ενδιαφέρεται', labelKey: 'c_status_interested', color: '#e0a500' },
  { value: 'Δεν Ενδιαφέρεται', labelKey: 'c_status_not_interested', color: '#c0392b' }
];
const INTEREST_VALUES = [
  { value: '', labelKey: '' },
  { value: 'Υψηλό', labelKey: 'c_interest_high', color: '#27ae60' },
  { value: 'Χαμηλό', labelKey: 'c_interest_low', color: '#e0a500' }
];
const AUTO_SELLER_VALUES = [
  { value: '', labelKey: '' },
  { value: 'Αυτόματος Πωλητής', labelKey: 'c_auto_seller_vending' },
  { value: 'Κυλικείο', labelKey: 'c_auto_seller_canteen' },
  { value: 'Τίποτα', labelKey: 'c_auto_seller_none' }
];

function statusColor(value) {
  const opt = STATUS_VALUES.find((o) => o.value === value);
  return opt && opt.color ? opt.color : '#c7cdd6';
}
function interestColor(value) {
  const opt = INTEREST_VALUES.find((o) => o.value === value);
  return opt && opt.color ? opt.color : '#c7cdd6';
}
function badgeStyle(color) {
  return { display: 'inline-block', color: '#fff', background: color, padding: '3px 9px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 };
}
function buildOptions(t, values) {
  return values.map((o) => ({ ...o, label: o.labelKey ? t(o.labelKey) : '—' }));
}

// Παλιές επαφές είχαν λίστα ονομάτων (people[]) αντί για αριθμό. Μετατρέπουμε
// μία φορά, κατά τη φόρτωση, σε peopleCount — ώστε μετά να είναι πάντα ένας
// συγκεκριμένος αριθμός και να μην "ξαναϋπολογίζεται" ενώ ο χρήστης πληκτρολογεί
// (αυτό προκαλούσε το πρόβλημα που δεν μπορούσες να γράψεις ελεύθερα το νούμερο).
function normalizeContact(c) {
  if (c.peopleCount !== undefined && c.peopleCount !== null) return c;
  return { ...c, peopleCount: Array.isArray(c.people) ? c.people.length : 0 };
}

function getContactColumnValue(c, key) {
  if (key === 'peopleCount') return c.peopleCount ?? '';
  return c[key];
}
function getContactFilterText(c, key) {
  const v = getContactColumnValue(c, key);
  return v === null || v === undefined ? '' : String(v);
}

const CONTACT_COLUMNS_KEY = 'qf_contacts_visible_columns';
function loadVisibleColumns() {
  try {
    const raw = localStorage.getItem(CONTACT_COLUMNS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore corrupt/unavailable storage
  }
  return null;
}

const CONTACT_SORT_KEY = 'qf_contacts_sort_state';
function loadContactSortState() {
  try {
    const raw = localStorage.getItem(CONTACT_SORT_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore corrupt/unavailable storage
  }
  return null;
}

const inlineInputStyle = {
  width: '100%', border: '1px solid transparent', background: 'transparent',
  padding: '3px 4px', fontSize: 12.5, fontFamily: 'inherit', color: 'inherit', borderRadius: 4
};

export default function ContactsView({ readOnly = false }) {
  const { t } = useLanguage();
  const CONTACT_COLUMNS = buildContactColumns(t);
  const STATUS_OPTIONS = buildOptions(t, STATUS_VALUES);
  const INTEREST_OPTIONS = buildOptions(t, INTEREST_VALUES);
  const AUTO_SELLER_OPTIONS = buildOptions(t, AUTO_SELLER_VALUES);

  const [contacts, setContacts] = useState([]);
  const [current, setCurrent] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const [viewMode, setViewMode] = useState('table');
  const [visibleColumns, setVisibleColumns] = useState(() => loadVisibleColumns() || DEFAULT_VISIBLE_CONTACT_COLUMNS);
  const [showColPicker, setShowColPicker] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});
  const [sortKey, setSortKey] = useState(() => loadContactSortState()?.sortKey ?? null);
  const [sortDir, setSortDir] = useState(() => loadContactSortState()?.sortDir || 'asc');

  const cardSaveTimer = useRef(null);
  const inlineSaveTimers = useRef({});

  useEffect(() => {
    try {
      localStorage.setItem(CONTACT_SORT_KEY, JSON.stringify({ sortKey, sortDir }));
    } catch (e) {
      // ignore storage errors
    }
  }, [sortKey, sortDir]);

  useEffect(() => {
    Contacts.list().then((list) => setContacts(list.map(normalizeContact)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CONTACT_COLUMNS_KEY, JSON.stringify(visibleColumns));
    } catch (e) {
      // ignore storage errors
    }
  }, [visibleColumns]);

  async function selectContact(id) {
    const c = contacts.find((x) => x.id === id) || normalizeContact(await Contacts.get(id));
    setCurrent(c);
    setViewMode('card');
  }

  async function handleNew() {
    const c = normalizeContact(await Contacts.create({ company: 'Νέα εταιρεία' }));
    setContacts((prev) => [...prev, c]);
    setCurrent(c);
    setViewMode('card');
  }

  // ---------- Card view: auto-save (debounced) ----------
  function scheduleCardSave(record) {
    if (cardSaveTimer.current) clearTimeout(cardSaveTimer.current);
    cardSaveTimer.current = setTimeout(async () => {
      const saved = await Contacts.update(record.id, record);
      setCurrent((prev) => (prev && prev.id === saved.id ? saved : prev));
      setContacts((list) => list.map((c) => (c.id === saved.id ? saved : c)));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    }, 700);
  }
  function applyCardUpdate(updater) {
    setCurrent((prev) => {
      const next = updater(prev);
      scheduleCardSave(next);
      return next;
    });
  }

  function updateField(key, value) {
    applyCardUpdate((prev) => ({ ...prev, [key]: value }));
  }

  async function handleDelete() {
    if (!window.confirm(t('c_delete_confirm'))) return;
    await Contacts.remove(current.id);
    setContacts((list) => list.filter((c) => c.id !== current.id));
    setCurrent(null);
    setViewMode('table');
  }

  // ---------- Table view: inline editing (debounced per-row) ----------
  function scheduleInlineSave(contactId) {
    if (inlineSaveTimers.current[contactId]) clearTimeout(inlineSaveTimers.current[contactId]);
    inlineSaveTimers.current[contactId] = setTimeout(async () => {
      setContacts((list) => {
        const record = list.find((c) => c.id === contactId);
        if (record) {
          Contacts.update(contactId, record).then((saved) => {
            setContacts((list2) => list2.map((c) => (c.id === saved.id ? saved : c)));
            setCurrent((prev) => (prev && prev.id === saved.id ? saved : prev));
          });
        }
        return list;
      });
    }, 700);
  }
  function updateContactInline(contactId, updater) {
    setContacts((prevList) => prevList.map((c) => (c.id === contactId ? updater(c) : c)));
    setCurrent((prev) => (prev && prev.id === contactId ? updater(prev) : prev));
    scheduleInlineSave(contactId);
  }

  function toggleColumn(key) {
    setVisibleColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }
  function moveColumn(key, direction) {
    setVisibleColumns((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const cols = [...prev];
      [cols[idx], cols[newIdx]] = [cols[newIdx], cols[idx]];
      return cols;
    });
  }

  // Η σειρά εμφάνισης ακολουθεί τη σειρά μέσα στο visibleColumns (όχι τη σταθερή σειρά
  // CONTACT_COLUMNS), ώστε να δουλεύει η μετακίνηση στηλών δεξιά/αριστερά.
  const visibleColumnDefs = visibleColumns
    .map((key) => CONTACT_COLUMNS.find((col) => col.key === key))
    .filter(Boolean);
  const filteredContacts = contacts.filter((c) =>
    visibleColumnDefs.every((col) => {
      const f = (columnFilters[col.key] || '').trim().toLowerCase();
      if (!f) return true;
      return getContactFilterText(c, col.key).toLowerCase().includes(f);
    })
  );

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortedContacts = (() => {
    if (!sortKey) return filteredContacts;
    const withVal = filteredContacts.map((c) => ({ c, v: getContactColumnValue(c, sortKey) }));
    withVal.sort((a, b) => {
      let av = a.v;
      let bv = b.v;
      const aEmpty = av === null || av === undefined || av === '';
      const bEmpty = bv === null || bv === undefined || bv === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return withVal.map((x) => x.c);
  })();

  function renderCell(c, col) {
    const stop = (e) => e.stopPropagation();
    if (readOnly) {
      if (col.key === 'status') {
        const opt = STATUS_OPTIONS.find((o) => o.value === c.status);
        return c.status ? <span style={badgeStyle(statusColor(c.status))}>{opt ? opt.label : c.status}</span> : '—';
      }
      if (col.key === 'interest') {
        const opt = INTEREST_OPTIONS.find((o) => o.value === c.interest);
        return c.interest ? <span style={badgeStyle(interestColor(c.interest))}>{opt ? opt.label : c.interest}</span> : '—';
      }
      const value = getContactColumnValue(c, col.key);
      return value === '' || value === null || value === undefined ? '—' : value;
    }
    if (col.key === 'status') {
      const hasVal = !!c.status;
      return (
        <select
          value={c.status || ''}
          onClick={stop}
          onChange={(e) => updateContactInline(c.id, (rec) => ({ ...rec, status: e.target.value }))}
          style={{ ...inlineInputStyle, background: hasVal ? statusColor(c.status) : 'transparent', color: hasVal ? '#fff' : 'inherit', fontWeight: hasVal ? 600 : 400, borderRadius: 10 }}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (col.key === 'interest') {
      const hasVal = !!c.interest;
      return (
        <select
          value={c.interest || ''}
          onClick={stop}
          onChange={(e) => updateContactInline(c.id, (rec) => ({ ...rec, interest: e.target.value }))}
          style={{ ...inlineInputStyle, background: hasVal ? interestColor(c.interest) : 'transparent', color: hasVal ? '#fff' : 'inherit', fontWeight: hasVal ? 600 : 400, borderRadius: 10 }}
        >
          {INTEREST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (col.key === 'autoSeller') {
      return (
        <select
          value={c.autoSeller || ''}
          onClick={stop}
          onChange={(e) => updateContactInline(c.id, (rec) => ({ ...rec, autoSeller: e.target.value }))}
          style={inlineInputStyle}
        >
          {AUTO_SELLER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (col.key === 'peopleCount') {
      return (
        <input
          type="number"
          min="0"
          value={getContactColumnValue(c, 'peopleCount')}
          onClick={stop}
          onChange={(e) => updateContactInline(c.id, (rec) => ({ ...rec, peopleCount: e.target.value === '' ? '' : Number(e.target.value) }))}
          style={inlineInputStyle}
        />
      );
    }
    if (TEXT_KEYS.has(col.key)) {
      return (
        <input
          value={c[col.key] || ''}
          onClick={stop}
          onChange={(e) => updateContactInline(c.id, (rec) => ({ ...rec, [col.key]: e.target.value }))}
          style={inlineInputStyle}
        />
      );
    }
    if (DATE_KEYS.has(col.key)) {
      return (
        <input
          type="date"
          value={c[col.key] || ''}
          onClick={stop}
          onChange={(e) => updateContactInline(c.id, (rec) => ({ ...rec, [col.key]: e.target.value || null }))}
          style={inlineInputStyle}
        />
      );
    }
    // people: read-only preview, κλικ ανοίγει την κάρτα για επεξεργασία
    const value = getContactColumnValue(c, col.key);
    return value || '—';
  }

  return (
    <div className="detail-pane" style={{ width: '100%' }}>
      <div className="tabs" style={{ position: 'sticky', top: 0 }}>
        <button className={'tab' + (viewMode === 'table' ? ' active' : '')} onClick={() => setViewMode('table')}>{t('common_table')}</button>
        <button className={'tab' + (viewMode === 'card' ? ' active' : '')} onClick={() => { if (current) setViewMode('card'); }}>{t('common_card')}</button>
        {viewMode === 'table' && (
          <div className="tab-actions" style={{ position: 'relative' }}>
            <button className="btn-primary" style={{ background: '#6b7684' }} onClick={() => setShowColPicker((v) => !v)}>
              {t('common_columns')} ({visibleColumns.length})
            </button>
            {showColPicker && (
              <div style={{ position: 'absolute', right: 0, top: '110%', width: 260, background: '#fff', border: '1px solid #e1e5ea', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, padding: '8px 0', maxHeight: 320, overflowY: 'auto' }}>
                {CONTACT_COLUMNS.map((col) => (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={visibleColumns.includes(col.key)} onChange={() => toggleColumn(col.key)} />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {viewMode === 'table' && (
        <div style={{ padding: 16 }}>
          <div style={{ overflowX: 'auto', border: '1px solid #e1e5ea', borderRadius: 8, background: '#fff' }}>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e1e5ea' }}>
                <tr style={{ color: '#6b7684' }}>
                  <th style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px' }}>#</th>
                  {visibleColumnDefs.map((col, colIdx) => (
                    <th
                      key={col.key}
                      style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px', whiteSpace: 'nowrap', userSelect: 'none' }}
                    >
                      <span onClick={() => toggleSort(col.key)} style={{ cursor: 'pointer' }} title={t('common_sort_hint')}>
                        {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </span>
                      <span style={{ marginLeft: 6, display: 'inline-flex', gap: 1 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveColumn(col.key, -1); }}
                          disabled={colIdx === 0}
                          title={t('common_move_left')}
                          style={{ border: 'none', background: 'transparent', cursor: colIdx === 0 ? 'default' : 'pointer', fontSize: 10, color: colIdx === 0 ? '#d7dce2' : '#97a2b0', padding: '0 2px' }}
                        >◀</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveColumn(col.key, 1); }}
                          disabled={colIdx === visibleColumnDefs.length - 1}
                          title={t('common_move_right')}
                          style={{ border: 'none', background: 'transparent', cursor: colIdx === visibleColumnDefs.length - 1 ? 'default' : 'pointer', fontSize: 10, color: colIdx === visibleColumnDefs.length - 1 ? '#d7dce2' : '#97a2b0', padding: '0 2px' }}
                        >▶</button>
                      </span>
                    </th>
                  ))}
                </tr>
                <tr style={{ borderTop: '1px solid #e1e5ea' }}>
                  <th></th>
                  {visibleColumnDefs.map((col) => (
                    <th key={col.key} style={{ padding: '4px 8px' }}>
                      <input
                        value={columnFilters[col.key] || ''}
                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                        placeholder={t('common_filter_placeholder')}
                        style={{ width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid #e1e5ea' }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedContacts.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => selectContact(c.id)}
                    style={{ borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '8px 12px', color: '#97a2b0' }}>{i + 1}</td>
                    {visibleColumnDefs.map((col) => (
                      <td key={col.key} style={{ padding: '4px 8px' }}>
                        {renderCell(c, col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <p style={{ fontSize: 12, color: '#97a2b0' }}>
              # {filteredContacts.length}{filteredContacts.length !== contacts.length ? ` / ${contacts.length}` : ''}
            </p>
            {!readOnly && <button className="btn-primary" onClick={handleNew}>{t('common_new')}</button>}
          </div>
        </div>
      )}

      {viewMode === 'card' && !current && (
        <div className="empty-state">{t('c_empty_state')}</div>
      )}

      {viewMode === 'card' && current && (
        <div className="detail">
          <div className="tabs">
            <div className="tab-actions" style={{ marginLeft: 'auto' }}>
              <button className="btn-primary" onClick={() => setViewMode('table')} style={{ background: '#6b7684' }}>{t('common_back_to_table')}</button>
              <span style={{ fontSize: 12, color: savedFlash ? '#2f8f8a' : '#97a2b0', alignSelf: 'center', minWidth: 110 }}>
                {readOnly ? t('common_readonly') : savedFlash ? t('common_saved') : t('common_autosave')}
              </span>
              {!readOnly && <button className="btn-danger" onClick={handleDelete}>{t('common_delete')}</button>}
            </div>
          </div>
          <div className="tab-panel active">
            <div className="grid-2">
              <div className="field"><label>{t('c_col_company')}</label><input disabled={readOnly} value={current.company || ''} onChange={(e) => updateField('company', e.target.value)} /></div>
              <div className="field"><label>{t('c_col_department')}</label><input disabled={readOnly} value={current.department || ''} onChange={(e) => updateField('department', e.target.value)} /></div>
              <div className="field"><label>{t('c_col_phone')}</label><input disabled={readOnly} value={current.phone || ''} onChange={(e) => updateField('phone', e.target.value)} /></div>
              <div className="field"><label>{t('c_col_emailInfo')}</label><input disabled={readOnly} type="email" value={current.emailInfo || ''} onChange={(e) => updateField('emailInfo', e.target.value)} /></div>
              <div className="field">
                <label>{t('c_col_status')}</label>
                <select
                  disabled={readOnly}
                  value={current.status || ''}
                  onChange={(e) => updateField('status', e.target.value)}
                  style={current.status ? { background: statusColor(current.status), color: '#fff', fontWeight: 600, border: 'none' } : undefined}
                >
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{t('c_col_autoSeller')}</label>
                <select disabled={readOnly} value={current.autoSeller || ''} onChange={(e) => updateField('autoSeller', e.target.value)}>
                  {AUTO_SELLER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{t('c_col_interest')}</label>
                <select
                  disabled={readOnly}
                  value={current.interest || ''}
                  onChange={(e) => updateField('interest', e.target.value)}
                  style={current.interest ? { background: interestColor(current.interest), color: '#fff', fontWeight: 600, border: 'none' } : undefined}
                >
                  {INTEREST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{t('c_col_peopleCount')}</label>
                <input
                  disabled={readOnly}
                  type="number"
                  min="0"
                  value={getContactColumnValue(current, 'peopleCount')}
                  onChange={(e) => updateField('peopleCount', e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field"><label>{t('c_col_responsible')}</label><input disabled={readOnly} value={current.responsible || ''} onChange={(e) => updateField('responsible', e.target.value)} /></div>
              <div className="field"><label>{t('c_col_email')}</label><input disabled={readOnly} type="email" value={current.email || ''} onChange={(e) => updateField('email', e.target.value)} /></div>
              <div className="field"><label>{t('c_col_phone2')}</label><input disabled={readOnly} value={current.phone2 || ''} onChange={(e) => updateField('phone2', e.target.value)} /></div>
            </div>

            <div className="grid-3">
              <div className="field"><label>{t('c_col_firstCallDate')}</label><input disabled={readOnly} type="date" value={current.firstCallDate || ''} onChange={(e) => updateField('firstCallDate', e.target.value || null)} /></div>
              <div className="field"><label>{t('c_col_firstMailDate')}</label><input disabled={readOnly} type="date" value={current.firstMailDate || ''} onChange={(e) => updateField('firstMailDate', e.target.value || null)} /></div>
              <div className="field"><label>{t('c_col_firstVisitDate')}</label><input disabled={readOnly} type="date" value={current.firstVisitDate || ''} onChange={(e) => updateField('firstVisitDate', e.target.value || null)} /></div>
              <div className="field"><label>{t('c_col_secondCallDate')}</label><input disabled={readOnly} type="date" value={current.secondCallDate || ''} onChange={(e) => updateField('secondCallDate', e.target.value || null)} /></div>
              <div className="field"><label>{t('c_col_secondMailDate')}</label><input disabled={readOnly} type="date" value={current.secondMailDate || ''} onChange={(e) => updateField('secondMailDate', e.target.value || null)} /></div>
              <div className="field"><label>{t('c_col_secondVisitDate')}</label><input disabled={readOnly} type="date" value={current.secondVisitDate || ''} onChange={(e) => updateField('secondVisitDate', e.target.value || null)} /></div>
            </div>

            <div className="field">
              <label>{t('c_col_notes')}</label>
              <textarea disabled={readOnly} rows="4" value={current.notes || ''} onChange={(e) => updateField('notes', e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
