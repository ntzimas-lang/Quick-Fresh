import React, { useEffect, useState } from 'react';
import { Contacts } from '../api.js';

const CONTACT_COLUMNS = [
  { key: 'company', label: 'Εταιρεία' },
  { key: 'department', label: 'Αρμόδιο Τμήμα' },
  { key: 'phone', label: 'Phone' },
  { key: 'emailInfo', label: 'Email - Info' },
  { key: 'status', label: 'Status' },
  { key: 'autoSeller', label: 'Αυτόματος Πωλητής/Κυλικείο' },
  { key: 'interest', label: 'Ενδιαφέρον' },
  { key: 'people', label: 'Άτομα' },
  { key: 'responsible', label: 'Υπεύθυνος' },
  { key: 'email', label: 'Email' },
  { key: 'phone2', label: 'Phone (Υπεύθυνος)' },
  { key: 'firstCallDate', label: '1η Τηλεφωνική Επικοινωνία' },
  { key: 'firstMailDate', label: '1η Αποστολή Mail' },
  { key: 'firstVisitDate', label: '1η Επίσκεψη' },
  { key: 'secondCallDate', label: '2η Τηλεφωνική Επικοινωνία' },
  { key: 'secondMailDate', label: '2η Αποστολή Mail' },
  { key: 'secondVisitDate', label: '2η Επίσκεψη' },
  { key: 'notes', label: 'Παρατηρήσεις' }
];

const DEFAULT_VISIBLE_CONTACT_COLUMNS = CONTACT_COLUMNS.map((col) => col.key);

function getContactColumnValue(c, key) {
  if (key === 'people') return (c.people || []).join(', ');
  return c[key];
}
function getContactFilterText(c, key) {
  const v = getContactColumnValue(c, key);
  return v === null || v === undefined ? '' : String(v);
}

export default function ContactsView() {
  const [contacts, setContacts] = useState([]);
  const [current, setCurrent] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [personInput, setPersonInput] = useState('');

  const [viewMode, setViewMode] = useState('table');
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_CONTACT_COLUMNS);
  const [showColPicker, setShowColPicker] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});

  useEffect(() => {
    Contacts.list().then(setContacts);
  }, []);

  async function selectContact(id) {
    const c = contacts.find((x) => x.id === id) || (await Contacts.get(id));
    setCurrent(c);
    setViewMode('card');
  }

  async function handleNew() {
    const c = await Contacts.create({ company: 'Νέα εταιρεία' });
    setContacts((prev) => [...prev, c]);
    setCurrent(c);
    setViewMode('card');
  }

  function updateField(key, value) {
    setCurrent((prev) => ({ ...prev, [key]: value }));
  }
  function addPerson() {
    const name = personInput.trim();
    if (!name) return;
    setCurrent((prev) => ({ ...prev, people: [...(prev.people || []), name] }));
    setPersonInput('');
  }
  function removePerson(idx) {
    setCurrent((prev) => ({ ...prev, people: prev.people.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    const saved = await Contacts.update(current.id, current);
    setCurrent(saved);
    setContacts((list) => list.map((c) => (c.id === saved.id ? saved : c)));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  async function handleDelete() {
    if (!window.confirm('Διαγραφή επαφής;')) return;
    await Contacts.remove(current.id);
    setContacts((list) => list.filter((c) => c.id !== current.id));
    setCurrent(null);
    setViewMode('table');
  }

  function toggleColumn(key) {
    setVisibleColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const visibleColumnDefs = CONTACT_COLUMNS.filter((col) => visibleColumns.includes(col.key));
  const filteredContacts = contacts.filter((c) =>
    visibleColumnDefs.every((col) => {
      const f = (columnFilters[col.key] || '').trim().toLowerCase();
      if (!f) return true;
      return getContactFilterText(c, col.key).toLowerCase().includes(f);
    })
  );

  return (
    <div className="detail-pane" style={{ width: '100%' }}>
      <div className="tabs" style={{ position: 'sticky', top: 0 }}>
        <button className={'tab' + (viewMode === 'table' ? ' active' : '')} onClick={() => setViewMode('table')}>Πίνακας</button>
        <button className={'tab' + (viewMode === 'card' ? ' active' : '')} onClick={() => { if (current) setViewMode('card'); }}>Κάρτα</button>
        {viewMode === 'table' && (
          <div className="tab-actions" style={{ position: 'relative' }}>
            <button className="btn-primary" style={{ background: '#6b7684' }} onClick={() => setShowColPicker((v) => !v)}>
              Στήλες ({visibleColumns.length})
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
                  {visibleColumnDefs.map((col) => (
                    <th key={col.key} style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px', whiteSpace: 'nowrap' }}>{col.label}</th>
                  ))}
                </tr>
                <tr style={{ borderTop: '1px solid #e1e5ea' }}>
                  <th></th>
                  {visibleColumnDefs.map((col) => (
                    <th key={col.key} style={{ padding: '4px 8px' }}>
                      <input
                        value={columnFilters[col.key] || ''}
                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                        placeholder="Φίλτρο..."
                        style={{ width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid #e1e5ea' }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => selectContact(c.id)}
                    style={{ borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '8px 12px', color: '#97a2b0' }}>{i + 1}</td>
                    {visibleColumnDefs.map((col) => {
                      const value = getContactColumnValue(c, col.key);
                      if (col.key === 'status') {
                        return (
                          <td key={col.key} style={{ padding: '8px 12px' }}>
                            {value ? (
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#eef1f4', color: '#6b7684' }}>{value}</span>
                            ) : (
                              <span style={{ color: '#d7dce2' }}>—</span>
                            )}
                          </td>
                        );
                      }
                      return <td key={col.key} style={{ padding: '8px 12px' }}>{value || '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <p style={{ fontSize: 12, color: '#97a2b0' }}>
              # {filteredContacts.length}{filteredContacts.length !== contacts.length ? ` / ${contacts.length}` : ''}
            </p>
            <button className="btn-primary" onClick={handleNew}>+ Νέο</button>
          </div>
        </div>
      )}

      {viewMode === 'card' && !current && (
        <div className="empty-state">Επίλεξε ή δημιούργησε μία επαφή</div>
      )}

      {viewMode === 'card' && current && (
        <div className="detail">
          <div className="tabs">
            <div className="tab-actions" style={{ marginLeft: 'auto' }}>
              <button className="btn-primary" onClick={() => setViewMode('table')} style={{ background: '#6b7684' }}>← Πίνακας</button>
              <button className="btn-primary" onClick={handleSave}>{savedFlash ? 'Αποθηκεύτηκε ✓' : 'Αποθήκευση'}</button>
              <button className="btn-danger" onClick={handleDelete}>Διαγραφή</button>
            </div>
          </div>
          <div className="tab-panel active">
            <div className="grid-2">
              <div className="field"><label>Εταιρεία</label><input value={current.company || ''} onChange={(e) => updateField('company', e.target.value)} /></div>
              <div className="field"><label>Αρμόδιο Τμήμα</label><input value={current.department || ''} onChange={(e) => updateField('department', e.target.value)} /></div>
              <div className="field"><label>Phone</label><input value={current.phone || ''} onChange={(e) => updateField('phone', e.target.value)} /></div>
              <div className="field"><label>Email - Info</label><input type="email" value={current.emailInfo || ''} onChange={(e) => updateField('emailInfo', e.target.value)} /></div>
              <div className="field"><label>Status</label><input placeholder="π.χ. Ενδιαφέρεται" value={current.status || ''} onChange={(e) => updateField('status', e.target.value)} /></div>
              <div className="field"><label>Αυτόματος Πωλητής/Κυλικείο</label><input value={current.autoSeller || ''} onChange={(e) => updateField('autoSeller', e.target.value)} /></div>
              <div className="field"><label>Ενδιαφέρον</label><input placeholder="π.χ. Υψηλό" value={current.interest || ''} onChange={(e) => updateField('interest', e.target.value)} /></div>
            </div>

            <div className="field">
              <label>Άτομα</label>
              <div className="chip-row editable-chips">
                {(current.people || []).map((name, i) => (
                  <div className="chip" key={i}>
                    <span>{name}</span>
                    <span className="x" onClick={() => removePerson(i)}>✕</span>
                  </div>
                ))}
              </div>
              <div className="add-person-row">
                <input
                  placeholder="Όνομα ατόμου + Enter"
                  value={personInput}
                  onChange={(e) => setPersonInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field"><label>Υπεύθυνος</label><input value={current.responsible || ''} onChange={(e) => updateField('responsible', e.target.value)} /></div>
              <div className="field"><label>Email</label><input type="email" value={current.email || ''} onChange={(e) => updateField('email', e.target.value)} /></div>
              <div className="field"><label>Phone (Υπεύθυνος)</label><input value={current.phone2 || ''} onChange={(e) => updateField('phone2', e.target.value)} /></div>
            </div>

            <div className="grid-3">
              <div className="field"><label>1η Τηλεφωνική Επικοινωνία</label><input type="date" value={current.firstCallDate || ''} onChange={(e) => updateField('firstCallDate', e.target.value || null)} /></div>
              <div className="field"><label>1η Αποστολή Mail</label><input type="date" value={current.firstMailDate || ''} onChange={(e) => updateField('firstMailDate', e.target.value || null)} /></div>
              <div className="field"><label>1η Επίσκεψη</label><input type="date" value={current.firstVisitDate || ''} onChange={(e) => updateField('firstVisitDate', e.target.value || null)} /></div>
              <div className="field"><label>2η Τηλεφωνική Επικοινωνία</label><input type="date" value={current.secondCallDate || ''} onChange={(e) => updateField('secondCallDate', e.target.value || null)} /></div>
              <div className="field"><label>2η Αποστολή Mail</label><input type="date" value={current.secondMailDate || ''} onChange={(e) => updateField('secondMailDate', e.target.value || null)} /></div>
              <div className="field"><label>2η Επίσκεψη</label><input type="date" value={current.secondVisitDate || ''} onChange={(e) => updateField('secondVisitDate', e.target.value || null)} /></div>
            </div>

            <div className="field">
              <label>Παρατηρήσεις</label>
              <textarea rows="4" value={current.notes || ''} onChange={(e) => updateField('notes', e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
