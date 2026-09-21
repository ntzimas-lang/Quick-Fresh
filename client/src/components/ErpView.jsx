import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { ErpProducts } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

// Ο πραγματικός μηνιαίος πίνακας ERP από τον προμηθευτή έχει πολλά φύλλα
// (Production OTE, Αγορές, Πωλήσεις, ...) αλλά ο κατάλογος με ΟΛΕΣ τις
// περιγραφές/τιμές των προϊόντων βρίσκεται πάντα στο φύλλο με όνομα "ERP".
// Διαβάζουμε αποκλειστικά αυτό, όχι το πρώτο φύλλο του αρχείου.
const ERP_SHEET_NAME = 'ERP';

// Ονόματα στηλών όπως εμφανίζονται στο φύλλο "ERP" του μηνιαίου αρχείου — αν η
// σειρά τους αλλάξει στο μέλλον δεν πειράζει, τις εντοπίζουμε με βάση το όνομα.
const COLS = {
  code: 'Κωδ.Είδους',
  description: 'Περιγραφή',
  unit: 'ΜΜ',
  stock: 'Υπόλοιπο',
  wholesalePrice: 'Τιμή χονδρικής',
  retailPrice: 'Τιμή λιανικής',
  supplier: 'Βασικός Προμηθευτής',
  country: 'Χώρα Προέλευσης',
  retailCategoryDesc: '(Retail) Κατηγορία/Ομάδα Περιγραφή',
  family: 'Οικογένεια',
  category: 'Κατηγορία',
  commercialSector: 'Εμπορικός Τομέας',
  inactive: 'Ανενεργό',
  barcode: 'Bar code',
  group: 'Ομάδα',
  subcategory: 'Υποκατηγορία',
  vatCategory: 'Κατηγορία ΦΠΑ',
  standardCost: 'Πρότυπη τιμή κόστους',
  itemType: 'Τύπος Ειδών'
};

async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: 'array' });
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrEmpty(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function parseErpSheet(workbook) {
  const sheetName = workbook.SheetNames.find((n) => n.trim().toLowerCase() === ERP_SHEET_NAME.toLowerCase());
  if (!sheetName) {
    const err = new Error('sheet_not_found');
    err.code = 'sheet_not_found';
    throw err;
  }
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h || '').trim());
  const col = (name) => header.indexOf(name);
  const idx = {};
  Object.keys(COLS).forEach((key) => { idx[key] = col(COLS[key]); });

  const byCode = new Map();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const code = strOrEmpty(idx.code >= 0 ? row[idx.code] : null);
    if (!code) continue;
    const record = {
      id: code,
      code,
      description: strOrEmpty(idx.description >= 0 ? row[idx.description] : null),
      unit: strOrEmpty(idx.unit >= 0 ? row[idx.unit] : null),
      stock: numOrNull(idx.stock >= 0 ? row[idx.stock] : null),
      wholesalePrice: numOrNull(idx.wholesalePrice >= 0 ? row[idx.wholesalePrice] : null),
      retailPrice: numOrNull(idx.retailPrice >= 0 ? row[idx.retailPrice] : null),
      supplier: strOrEmpty(idx.supplier >= 0 ? row[idx.supplier] : null),
      country: strOrEmpty(idx.country >= 0 ? row[idx.country] : null),
      retailCategoryDesc: strOrEmpty(idx.retailCategoryDesc >= 0 ? row[idx.retailCategoryDesc] : null),
      family: strOrEmpty(idx.family >= 0 ? row[idx.family] : null),
      category: strOrEmpty(idx.category >= 0 ? row[idx.category] : null),
      commercialSector: strOrEmpty(idx.commercialSector >= 0 ? row[idx.commercialSector] : null),
      inactive: strOrEmpty(idx.inactive >= 0 ? row[idx.inactive] : null),
      barcode: strOrEmpty(idx.barcode >= 0 ? row[idx.barcode] : null),
      group: strOrEmpty(idx.group >= 0 ? row[idx.group] : null),
      subcategory: strOrEmpty(idx.subcategory >= 0 ? row[idx.subcategory] : null),
      vatCategory: strOrEmpty(idx.vatCategory >= 0 ? row[idx.vatCategory] : null),
      standardCost: numOrNull(idx.standardCost >= 0 ? row[idx.standardCost] : null),
      itemType: strOrEmpty(idx.itemType >= 0 ? row[idx.itemType] : null)
    };
    byCode.set(code, record);
  }
  return Array.from(byCode.values());
}

function fmtEuro(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ErpView({ canUpload = false }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ count: 0, lastUpdated: null });

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { done, total }
  const [uploadMessage, setUploadMessage] = useState(null); // { type: 'ok'|'error', text }
  const fileInputRef = useRef(null);
  const searchTimer = useRef(null);

  function loadStats() {
    ErpProducts.stats().then(setStats).catch(() => {});
  }

  function runSearch(term) {
    setLoading(true);
    setError('');
    ErpProducts.search(term, 200)
      .then((r) => { setRows(r); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }

  useEffect(() => {
    loadStats();
    runSearch('');
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(search), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setUploading(true);
    setUploadMessage(null);
    setUploadProgress(null);
    try {
      const wb = await readWorkbook(file);
      const records = parseErpSheet(wb);
      if (!records.length) throw new Error('no_rows');
      const existingIds = await ErpProducts.listIds();
      const added = records.filter((r) => !existingIds.has(r.id)).length;
      const updated = records.length - added;
      await ErpProducts.bulkUpsert(records, (done, total) => setUploadProgress({ done, total }));
      setUploadMessage({
        type: 'ok',
        text: t('erp_upload_ok')
          .replace('{added}', added)
          .replace('{updated}', updated)
          .replace('{total}', records.length)
      });
      loadStats();
      runSearch(search);
    } catch (err) {
      const key = err && err.code === 'sheet_not_found' ? 'erp_sheet_not_found'
        : err && err.message === 'no_rows' ? 'erp_no_rows'
        : null;
      setUploadMessage({ type: 'error', text: key ? t(key) : t('erp_upload_error') + ' ' + (err.message || err) });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{t('title_erp')}</strong>
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              style={{ display: 'none' }}
              id="erp-upload-input"
            />
            <label
              htmlFor="erp-upload-input"
              className="btn-primary"
              style={{ display: 'inline-block', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}
            >
              {uploading
                ? (uploadProgress ? t('erp_uploading_progress').replace('{done}', uploadProgress.done).replace('{total}', uploadProgress.total) : t('erp_uploading'))
                : t('erp_upload_button')}
            </label>
          </>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('erp_search_placeholder')}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13, width: 280 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '14px 20px', background: '#fff', borderBottom: '1px solid #e1e5ea', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#16233f' }}>{stats.count.toLocaleString('el-GR')}</div>
          <div style={{ fontSize: 11.5, color: '#6b7684' }}>{t('erp_total_count_label')}</div>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#3a4353', marginTop: 4 }}>{fmtDateTime(stats.lastUpdated)}</div>
          <div style={{ fontSize: 11.5, color: '#6b7684' }}>{t('erp_last_updated_label')}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        <p style={{ color: '#6b7684', fontSize: 12.5, margin: '0 0 14px' }}>{t('erp_hint')}</p>

        {uploadMessage && (
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              background: uploadMessage.type === 'ok' ? '#eafaf1' : '#fdecea',
              color: uploadMessage.type === 'ok' ? '#1e8449' : '#c0392b',
              border: `1px solid ${uploadMessage.type === 'ok' ? '#bfe8cf' : '#f3c1bb'}`,
              borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14
            }}
          >
            <span>{uploadMessage.text}</span>
            <button type="button" onClick={() => setUploadMessage(null)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}

        {loading ? (
          <p style={{ color: '#97a2b0' }}>{t('d_loading')}</p>
        ) : error ? (
          <p style={{ color: '#c0392b' }}>{error}</p>
        ) : rows.length === 0 ? (
          <p style={{ color: '#97a2b0' }}>{t('erp_no_results')}</p>
        ) : (
          <>
            <p style={{ color: '#97a2b0', fontSize: 12, margin: '0 0 8px' }}>
              {t('erp_showing_results').replace('{n}', rows.length)}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                  <th style={{ padding: '10px 12px' }}>{t('erp_col_code')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('erp_col_description')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('erp_col_category')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('erp_col_subcategory')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('erp_col_unit')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('erp_col_standard_cost')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid #eef1f4' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.code}</td>
                    <td style={{ padding: '10px 12px', color: '#3a4353' }}>{p.description || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7684' }}>{p.category || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7684' }}>{p.subcategory || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>{p.unit || '—'}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtEuro(p.standardCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
