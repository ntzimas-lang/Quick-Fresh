import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NewCustomers } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const emptyForm = {
  businessName: '',
  phone: '',
  visitDate: new Date().toISOString().slice(0, 10),
  placeType: '',
  outcome: '',
  nextStep: '',
  nextContactDate: '',
  notes: '',
  sketch: ''
};

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr + (isoStr.length <= 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function outcomeColor(value) {
  if (value === 'deal') return { bg: '#e8f7f0', fg: '#1f8f5f' };
  if (value === 'interested') return { bg: '#eaf3fe', fg: '#2a6fd6' };
  if (value === 'followup') return { bg: '#fef6e6', fg: '#c98a1f' };
  if (value === 'not_interested') return { bg: '#fdecea', fg: '#c0392b' };
  return { bg: '#f0f2f5', fg: '#6b7684' };
}

// Sketch pad — υποστηρίζει Pointer Events (Apple Pencil πίεση/hover, δάχτυλο, ποντίκι).
// touchAction: 'none' ώστε το iPad να μη κάνει scroll ενώ σχεδιάζεις.
function SketchPad({ canvasRef, hasContent, onChange }) {
  const drawingRef = useRef(false);
  const lastRef = useRef(null);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = getPos(e);
  }

  function handlePointerMove(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    ctx.strokeStyle = '#16233f';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.2 + pressure * 3.5;
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastRef.current = pos;
    onChange && onChange();
  }

  function handlePointerUp(e) {
    drawingRef.current = false;
    lastRef.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={1400}
      height={560}
      style={{
        width: '100%',
        maxWidth: 1400,
        height: 460,
        background: '#fff',
        border: '1px solid #d7dce2',
        borderRadius: 8,
        touchAction: 'none',
        cursor: 'crosshair'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}

export default function NewCustomersView({ canDelete = false }) {
  const { t } = useLanguage();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [sketchViewId, setSketchViewId] = useState(null);
  const canvasRef = useRef(null);
  const canvasHasContent = useRef(false);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    NewCustomers.list()
      .then((rows) => { setRecords(rows); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvasHasContent.current = false;
  }

  function loadSketchIntoCanvas(dataUrl) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!dataUrl) {
      canvasHasContent.current = false;
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvasHasContent.current = true;
    };
    img.src = dataUrl;
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setSaveError('');
    clearCanvas();
  }

  function startEdit(record) {
    setEditingId(record.id);
    setForm({
      businessName: record.businessName || '',
      phone: record.phone || '',
      visitDate: record.visitDate || new Date().toISOString().slice(0, 10),
      placeType: record.placeType || '',
      outcome: record.outcome || '',
      nextStep: record.nextStep || '',
      nextContactDate: record.nextContactDate || '',
      notes: record.notes || '',
      sketch: record.sketch || ''
    });
    setSaveError('');
    loadSketchIntoCanvas(record.sketch || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave() {
    setSaveError('');
    if (!form.businessName.trim()) {
      setSaveError(t('nc_required_business_name'));
      return;
    }
    const canvas = canvasRef.current;
    const sketch = canvas && canvasHasContent.current ? canvas.toDataURL('image/png') : '';
    setSaving(true);
    try {
      if (editingId) {
        const current = records.find((r) => r.id === editingId);
        const updated = await NewCustomers.update(editingId, { ...current, ...form, sketch });
        setRecords((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      } else {
        const created = await NewCustomers.create({ ...form, sketch });
        setRecords((prev) => [created, ...prev]);
      }
      resetForm();
    } catch (err) {
      setSaveError(t('nc_save_error_prefix') + ' ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm(t('nc_delete_confirm'))) return;
    setDeleteError('');
    try {
      await NewCustomers.remove(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      setDeleteError(t('nc_delete_error_prefix') + ' ' + (err.message || err));
    }
  }

  const filtered = useMemo(() => {
    let rows = records;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.businessName || '').toLowerCase().includes(q) ||
          (r.phone || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => new Date(b.visitDate || b.createdAt) - new Date(a.visitDate || a.createdAt));
  }, [records, search]);

  const placeTypeLabel = (v) =>
    ({
      office: t('nc_place_office'),
      shop: t('nc_place_shop'),
      factory: t('nc_place_factory'),
      school: t('nc_place_school'),
      hospital: t('nc_place_hospital'),
      other: t('nc_place_other')
    }[v] || '—');

  const outcomeLabel = (v) =>
    ({
      interested: t('nc_outcome_interested'),
      followup: t('nc_outcome_followup'),
      not_interested: t('nc_outcome_not_interested'),
      deal: t('nc_outcome_deal')
    }[v] || '—');

  const nextStepLabel = (v) =>
    ({
      call: t('nc_next_call'),
      email: t('nc_next_email'),
      appointment: t('nc_next_appointment'),
      none: t('nc_next_none')
    }[v] || '—');

  const inputStyle = { padding: '7px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13.5, width: '100%', boxSizing: 'border-box' };
  const labelStyle = { fontSize: 11.5, color: '#6b7684', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.3 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_new_customers')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 18, marginBottom: 20 }}>
          <strong style={{ fontSize: 13.5, display: 'block', marginBottom: 14 }}>
            {editingId ? t('nc_form_title_edit') : t('nc_form_title_new')}
          </strong>
          {saveError && (
            <div style={{ background: '#fdecea', color: '#c0392b', border: '1px solid #f3c1bb', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
              {saveError}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>{t('nc_col_businessName')}</label>
              <input
                style={inputStyle}
                value={form.businessName}
                placeholder={t('nc_placeholder_businessName')}
                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('nc_col_phone')}</label>
              <input
                style={inputStyle}
                value={form.phone}
                placeholder={t('nc_placeholder_phone')}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('nc_col_visitDate')}</label>
              <input
                type="date"
                style={inputStyle}
                value={form.visitDate}
                onChange={(e) => setForm((f) => ({ ...f, visitDate: e.target.value }))}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('nc_col_placeType')}</label>
              <select style={inputStyle} value={form.placeType} onChange={(e) => setForm((f) => ({ ...f, placeType: e.target.value }))}>
                <option value="">{t('nc_option_pick')}</option>
                <option value="office">{t('nc_place_office')}</option>
                <option value="shop">{t('nc_place_shop')}</option>
                <option value="factory">{t('nc_place_factory')}</option>
                <option value="school">{t('nc_place_school')}</option>
                <option value="hospital">{t('nc_place_hospital')}</option>
                <option value="other">{t('nc_place_other')}</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('nc_col_outcome')}</label>
              <select style={inputStyle} value={form.outcome} onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}>
                <option value="">{t('nc_option_pick')}</option>
                <option value="interested">{t('nc_outcome_interested')}</option>
                <option value="followup">{t('nc_outcome_followup')}</option>
                <option value="not_interested">{t('nc_outcome_not_interested')}</option>
                <option value="deal">{t('nc_outcome_deal')}</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('nc_col_nextStep')}</label>
              <select style={inputStyle} value={form.nextStep} onChange={(e) => setForm((f) => ({ ...f, nextStep: e.target.value }))}>
                <option value="">{t('nc_option_pick')}</option>
                <option value="call">{t('nc_next_call')}</option>
                <option value="email">{t('nc_next_email')}</option>
                <option value="appointment">{t('nc_next_appointment')}</option>
                <option value="none">{t('nc_next_none')}</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('nc_col_nextContactDate')}</label>
              <input
                type="date"
                style={inputStyle}
                value={form.nextContactDate}
                onChange={(e) => setForm((f) => ({ ...f, nextContactDate: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t('nc_col_notes')}</label>
            <textarea
              style={{ ...inputStyle, minHeight: 90, fontFamily: 'inherit', resize: 'vertical' }}
              value={form.notes}
              placeholder={t('nc_placeholder_notes')}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t('nc_sketch_title')}</label>
            <div style={{ fontSize: 12, color: '#97a2b0', marginBottom: 8 }}>{t('nc_sketch_hint')}</div>
            <SketchPad canvasRef={canvasRef} onChange={() => { canvasHasContent.current = true; }} />
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: 8, padding: '6px 12px', fontSize: 12.5 }}
              onClick={clearCanvas}
            >
              {t('nc_sketch_clear')}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {t('nc_save_button')}
            </button>
            {editingId && (
              <button className="btn-secondary" onClick={resetForm}>
                {t('nc_cancel_edit_button')}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍"
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13, width: 220 }}
          />
        </div>

        {deleteError && (
          <div style={{ background: '#fdecea', color: '#c0392b', border: '1px solid #f3c1bb', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
            {deleteError}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#97a2b0' }}>{t('d_loading')}</p>
        ) : error ? (
          <p style={{ color: '#c0392b' }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#97a2b0' }}>{t('nc_no_records')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((r) => {
              const colors = outcomeColor(r.outcome);
              return (
                <div
                  key={r.id}
                  style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 14, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}
                >
                  <div style={{ minWidth: 180, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.businessName || '—'}</div>
                    <div style={{ fontSize: 12, color: '#6b7684', marginTop: 2 }}>{r.phone || '—'}</div>
                    <div style={{ fontSize: 12, color: '#6b7684', marginTop: 2 }}>{formatDate(r.visitDate)} · {placeTypeLabel(r.placeType)}</div>
                  </div>
                  <div style={{ minWidth: 140 }}>
                    <span style={{ background: colors.bg, color: colors.fg, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 600 }}>
                      {outcomeLabel(r.outcome)}
                    </span>
                    <div style={{ fontSize: 12, color: '#6b7684', marginTop: 6 }}>{nextStepLabel(r.nextStep)}</div>
                    {r.nextContactDate && <div style={{ fontSize: 11.5, color: '#97a2b0', marginTop: 2 }}>→ {formatDate(r.nextContactDate)}</div>}
                  </div>
                  <div style={{ flex: 2, minWidth: 220, fontSize: 12.5, color: '#3a4353', whiteSpace: 'pre-wrap' }}>{r.notes || '—'}</div>
                  {r.sketch && (
                    <img
                      src={r.sketch}
                      alt={t('nc_view_sketch')}
                      onClick={() => setSketchViewId(sketchViewId === r.id ? null : r.id)}
                      style={{ width: 70, height: 22, objectFit: 'cover', border: '1px solid #e1e5ea', borderRadius: 4, cursor: 'pointer', background: '#fff' }}
                    />
                  )}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => startEdit(r)}>
                      {t('nc_edit_button')}
                    </button>
                    {canDelete && (
                      <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => handleDelete(r.id)}>
                        {t('common_delete')}
                      </button>
                    )}
                  </div>
                  {sketchViewId === r.id && r.sketch && (
                    <div style={{ width: '100%' }}>
                      <img src={r.sketch} alt={t('nc_view_sketch')} style={{ maxWidth: '100%', border: '1px solid #e1e5ea', borderRadius: 8 }} />
                    </div>
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
