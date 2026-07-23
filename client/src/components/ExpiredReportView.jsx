import React, { useEffect, useMemo, useState } from 'react';
import { Entries } from '../api.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEJAVU_SANS_BASE64 } from '../dejavu-font.js';

function daysDiff(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr + 'T00:00:00');
  const diffMs = expiry.getTime() - today.getTime();
  return Math.round(diffMs / 86400000);
}

function diffLabel(diff) {
  if (diff < 0) return `Έληξε πριν ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'ημέρα' : 'ημέρες'}`;
  if (diff === 0) return 'Λήγει σήμερα';
  return `σε ${diff} ${diff === 1 ? 'ημέρα' : 'ημέρες'}`;
}

function diffColor(diff) {
  if (diff <= 0) return '#c0392b';
  if (diff <= 7) return '#c98a1f';
  return '#2f8f8a';
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ExpiredReportView({ canDelete = false }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    Entries.list()
      .then((rows) => { setEntries(rows); setLoading(false); })
      .catch((err) => { setError(err.message || 'Σφάλμα φόρτωσης'); setLoading(false); });
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή αυτής της καταχώρησης;')) return;
    try {
      await Entries.remove(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      alert('Σφάλμα διαγραφής: ' + (err.message || err));
    }
  }

  const storeOptions = useMemo(() => {
    const set = new Set();
    entries.forEach((e) => e.store && set.add(e.store));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    let rows = entries;
    if (storeFilter !== 'all') rows = rows.filter((e) => e.store === storeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((e) =>
        (e.productItemCode || '').toLowerCase().includes(q) ||
        (e.productDescription || '').toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  }, [entries, storeFilter, search]);

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape' });
    // Ενσωμάτωση γραμματοσειράς Unicode — τα βασικά fonts του jsPDF δεν έχουν ελληνικούς χαρακτήρες.
    doc.addFileToVFS('DejaVuSans.ttf', DEJAVU_SANS_BASE64);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(12);
    doc.text('Quick & Fresh — Report Ληγμένα', 14, 12);
    autoTable(doc, {
      startY: 18,
      head: [['Κωδικός', 'Περιγραφή', 'Κατάστημα', 'Ποσότητα', 'Ημ. Λήξης', 'Διαφορά', 'Καταχώρησε']],
      body: filtered.map((e) => {
        const diff = daysDiff(e.expiryDate);
        return [
          e.productItemCode || '',
          e.productDescription || '',
          e.store || '',
          e.quantity ?? '',
          formatDate(e.expiryDate),
          diffLabel(diff),
          e.enteredByEmail || ''
        ];
      }),
      styles: { fontSize: 8, cellPadding: 2, font: 'DejaVuSans' },
      headStyles: { fillColor: [47, 143, 138], font: 'DejaVuSans' }
    });
    doc.save(`quick-fresh-ligmena-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>Report Ληγμένα</strong>
        <button className="btn-primary" style={{ background: '#b23b2e' }} onClick={exportPDF} title="Εξαγωγή σε PDF">
          PDF
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση κωδικού/περιγραφής..."
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13, width: 220 }}
        />
        <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13 }}>
          <option value="all">Όλα τα καταστήματα</option>
          {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        {loading ? (
          <p style={{ color: '#97a2b0' }}>Φόρτωση...</p>
        ) : error ? (
          <p style={{ color: '#c0392b' }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#97a2b0' }}>Δεν υπάρχουν καταχωρήσεις.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                <th style={{ padding: '10px 12px' }}>Κωδικός</th>
                <th style={{ padding: '10px 12px' }}>Περιγραφή</th>
                <th style={{ padding: '10px 12px' }}>Κατάστημα</th>
                <th style={{ padding: '10px 12px' }}>Ποσότητα</th>
                <th style={{ padding: '10px 12px' }}>Ημ. Λήξης</th>
                <th style={{ padding: '10px 12px' }}>Διαφορά</th>
                <th style={{ padding: '10px 12px' }}>Καταχώρησε</th>
                {canDelete && <th style={{ padding: '10px 12px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const diff = daysDiff(e.expiryDate);
                return (
                  <tr key={e.id} style={{ borderTop: '1px solid #eef1f4' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{e.productItemCode}</td>
                    <td style={{ padding: '10px 12px', color: '#3a4353' }}>{e.productDescription}</td>
                    <td style={{ padding: '10px 12px' }}>{e.store}</td>
                    <td style={{ padding: '10px 12px' }}>{e.quantity ?? '—'}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{formatDate(e.expiryDate)}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#fff', background: diffColor(diff), padding: '3px 9px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>
                        {diffLabel(diff)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7684' }}>{e.enteredByEmail || '—'}</td>
                    {canDelete && (
                      <td style={{ padding: '10px 12px' }}>
                        <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => handleDelete(e.id)}>Διαγραφή</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
