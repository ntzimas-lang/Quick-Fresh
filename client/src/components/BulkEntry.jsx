import React, { useState } from 'react';
import { Products } from '../api.js';

const CATEGORIES = [
  { gr: 'THREPSIS ΓΕΥΜΑΤΑ', en: 'THREPSIS MAIN DISHES' },
  { gr: 'ΑΝΑΨΥΚΤΙΚΑ – ΝΕΡΑ', en: 'SODA – WATER' },
  { gr: 'ΓΑΛΑΚΤΟΚΟΜΙΚΑ', en: 'YOGURTS' },
  { gr: 'ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ', en: 'NUTS & SWEETS' },
  { gr: 'ΣΑΛΑΤΕΣ', en: 'SALADS' },
  { gr: 'ΦΡΟΥΤΑ', en: 'FRUITS' },
  { gr: 'ΧΥΜΟΙ – ΤΣΑΪ', en: 'BEVERAGES' },
  { gr: 'ΣΑΝΤΟΥΙΤΣ - Golden Sandwich', en: 'SANDWICHES - G.S.' },
  { gr: 'PARMA', en: 'PARMA' },
  { gr: 'ΡΟΦΗΜΑΤΑ', en: 'COFFEE' }
];

function emptyRow() {
  return {
    categoryGr: '',
    itemCode: '',
    barcode: '',
    descriptionGr: '',
    descriptionEn: '',
    sellingPrice: '',
    ptk: '',
    quantity: ''
  };
}

export default function BulkEntry({ onDone, onCancel }) {
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);

  function updateRow(idx, field, value) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }
  function removeRow(idx) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  const validRows = rows.filter((r) => r.descriptionGr.trim());

  async function handleSaveAll() {
    if (!validRows.length) return;
    setSaving(true);
    const created = [];
    for (const row of validRows) {
      const pair = CATEGORIES.find((c) => c.gr === row.categoryGr);
      const payload = {
        categoryGr: row.categoryGr,
        categoryEn: pair ? pair.en : '',
        itemCode: row.itemCode,
        barcode: row.barcode,
        descriptionGr: row.descriptionGr,
        descriptionEn: row.descriptionEn,
        cost: {
          sellingPrice: parseFloat(row.sellingPrice) || 0,
          ptk: parseFloat(row.ptk) || 0,
          quantity: parseFloat(row.quantity) || 0,
          vatPercent: 13
        }
      };
      const saved = await Products.create(payload);
      created.push(saved);
    }
    setSaving(false);
    onDone(created);
  }

  return (
    <div className="tab-panel active">
      <div className="section-bar navy">Γρήγορη καταχώριση πολλών προϊόντων</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="stores-table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Κατηγορία GR</th>
              <th>Κωδικός</th>
              <th>Barcode</th>
              <th>Περιγραφή GR</th>
              <th>Περιγραφή EN</th>
              <th>Τιμή Πώλησης</th>
              <th>ΠΤΚ</th>
              <th>Ποσότητα</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <select value={row.categoryGr} onChange={(e) => updateRow(i, 'categoryGr', e.target.value)}>
                    <option value="">—</option>
                    {CATEGORIES.map((c) => <option key={c.gr} value={c.gr}>{c.gr}</option>)}
                  </select>
                </td>
                <td><input value={row.itemCode} onChange={(e) => updateRow(i, 'itemCode', e.target.value)} /></td>
                <td><input value={row.barcode} onChange={(e) => updateRow(i, 'barcode', e.target.value)} /></td>
                <td><input value={row.descriptionGr} onChange={(e) => updateRow(i, 'descriptionGr', e.target.value)} /></td>
                <td><input value={row.descriptionEn} onChange={(e) => updateRow(i, 'descriptionEn', e.target.value)} /></td>
                <td><input type="number" step="0.01" value={row.sellingPrice} onChange={(e) => updateRow(i, 'sellingPrice', e.target.value)} /></td>
                <td><input type="number" step="0.01" value={row.ptk} onChange={(e) => updateRow(i, 'ptk', e.target.value)} /></td>
                <td><input type="number" step="1" value={row.quantity} onChange={(e) => updateRow(i, 'quantity', e.target.value)} /></td>
                <td>
                  <button className="btn-danger" onClick={() => removeRow(i)} disabled={rows.length === 1}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn-primary" onClick={addRow} style={{ background: '#6b7684' }}>+ Γραμμή</button>
        <button className="btn-primary" onClick={handleSaveAll} disabled={saving || !validRows.length}>
          {saving ? 'Αποθήκευση...' : `Αποθήκευση όλων (${validRows.length})`}
        </button>
        <button className="btn-danger" onClick={onCancel}>Άκυρο</button>
      </div>
      <p style={{ fontSize: 12, color: '#6b7684', marginTop: 10 }}>
        Μόνο οι γραμμές με συμπληρωμένη "Περιγραφή GR" αποθηκεύονται. Τα υπόλοιπα πεδία (εικόνες, stores, αναλυτική περιγραφή κ.λπ.) μπορείς να τα συμπληρώσεις μετά ανοίγοντας κάθε προϊόν ξεχωριστά.
      </p>
    </div>
  );
}
