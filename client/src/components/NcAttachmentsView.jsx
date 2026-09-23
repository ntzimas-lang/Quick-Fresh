import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NcAttachments, upload } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr + (isoStr.length <= 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function NcAttachmentsView() {
  const { t } = useLanguage();

  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [attachmentsError, setAttachmentsError] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentCategory, setAttachmentCategory] = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const attachmentFileInputRef = useRef(null);
  const [editingAttachmentId, setEditingAttachmentId] = useState(null);
  const [editAttachmentName, setEditAttachmentName] = useState('');
  const [editAttachmentCategory, setEditAttachmentCategory] = useState('');
  const [editAttachmentFile, setEditAttachmentFile] = useState(null);
  const [editAttachmentSaving, setEditAttachmentSaving] = useState(false);
  const editAttachmentFileInputRef = useRef(null);
  const [attachmentReordering, setAttachmentReordering] = useState(null);

  useEffect(() => {
    loadAttachments();
  }, []);

  function loadAttachments() {
    setAttachmentsLoading(true);
    NcAttachments.list()
      .then((rows) => { setAttachments(rows); setAttachmentsLoading(false); })
      .catch((err) => { setAttachmentsError(err.message || t('common_load_error')); setAttachmentsLoading(false); });
  }

  async function handleAddAttachment() {
    setAttachmentsError('');
    if (!attachmentFile) {
      setAttachmentsError(t('nc_att_file_required'));
      return;
    }
    const name = attachmentName.trim() || attachmentFile.name;
    const category = attachmentCategory.trim();
    setAttachmentUploading(true);
    try {
      const { url } = await upload(attachmentFile);
      const maxOrder = attachments.reduce((m, a) => Math.max(m, Number(a.order) || 0), 0);
      const created = await NcAttachments.create({ name, category, url, fileName: attachmentFile.name || '', order: maxOrder + 1 });
      setAttachments((prev) => [...prev, created]);
      setAttachmentName('');
      setAttachmentCategory('');
      setAttachmentFile(null);
      if (attachmentFileInputRef.current) attachmentFileInputRef.current.value = '';
    } catch (err) {
      setAttachmentsError(err.message || String(err));
    } finally {
      setAttachmentUploading(false);
    }
  }

  const attachmentCategories = useMemo(() => {
    const set = new Set();
    attachments.forEach((a) => { if (a.category) set.add(a.category); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'el'));
  }, [attachments]);

  const attachmentGroups = useMemo(() => {
    const byCategory = {};
    attachments.forEach((a) => {
      const cat = a.category || '';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(a);
    });
    Object.values(byCategory).forEach((list) =>
      list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    );
    const keys = Object.keys(byCategory)
      .filter((k) => k !== '')
      .sort((a, b) => a.localeCompare(b, 'el'));
    if (byCategory['']) keys.push('');
    return keys.map((key) => ({ category: key, items: byCategory[key] }));
  }, [attachments]);

  async function moveAttachment(group, index, direction) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= group.length) return;
    // Re-normalize the whole group to sequential order values (0,1,2,...) based on the
    // CURRENT on-screen sequence, then swap the two positions. This also fixes older
    // records that all share order=0 (a plain swap of equal values would do nothing).
    const reordered = group.slice();
    const tmp = reordered[index];
    reordered[index] = reordered[targetIdx];
    reordered[targetIdx] = tmp;

    const toPersist = reordered
      .map((item, i) => ({ item, newOrder: i }))
      .filter(({ item, newOrder }) => (Number(item.order) || 0) !== newOrder);

    if (toPersist.length === 0) return;
    setAttachmentReordering(group[index].id);
    setAttachmentsError('');
    try {
      const updated = await Promise.all(
        toPersist.map(({ item, newOrder }) => NcAttachments.update(item.id, { ...item, order: newOrder }))
      );
      setAttachments((prev) => prev.map((x) => {
        const match = updated.find((u) => u.id === x.id);
        return match || x;
      }));
    } catch (err) {
      setAttachmentsError(err.message || String(err));
    } finally {
      setAttachmentReordering(null);
    }
  }

  async function handleRemoveAttachment(id) {
    if (!window.confirm(t('nc_att_delete_confirm'))) return;
    setAttachmentsError('');
    try {
      await NcAttachments.remove(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setAttachmentsError(err.message || String(err));
    }
  }

  function startEditAttachment(a) {
    setEditingAttachmentId(a.id);
    setEditAttachmentName(a.name || a.fileName || '');
    setEditAttachmentCategory(a.category || '');
    setEditAttachmentFile(null);
    setAttachmentsError('');
  }

  function cancelEditAttachment() {
    setEditingAttachmentId(null);
    setEditAttachmentName('');
    setEditAttachmentCategory('');
    setEditAttachmentFile(null);
    if (editAttachmentFileInputRef.current) editAttachmentFileInputRef.current.value = '';
  }

  async function saveEditAttachment(a) {
    setAttachmentsError('');
    const name = editAttachmentName.trim();
    if (!name) {
      setAttachmentsError(t('nc_att_name_required'));
      return;
    }
    setEditAttachmentSaving(true);
    try {
      let url = a.url;
      let fileName = a.fileName;
      if (editAttachmentFile) {
        const res = await upload(editAttachmentFile);
        url = res.url;
        fileName = editAttachmentFile.name || '';
      }
      const category = editAttachmentCategory.trim();
      const updated = await NcAttachments.update(a.id, { ...a, name, category, url, fileName });
      setAttachments((prev) => prev.map((x) => (x.id === a.id ? updated : x)));
      cancelEditAttachment();
    } catch (err) {
      setAttachmentsError(err.message || String(err));
    } finally {
      setEditAttachmentSaving(false);
    }
  }

  const inputStyle = { padding: '7px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13.5, width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_nc_attachments')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f9fafb' }}>
        <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 12, color: '#97a2b0', marginBottom: 12 }}>{t('nc_att_hint')}</div>
          {attachmentsError && (
            <div style={{ background: '#fdecea', color: '#c0392b', border: '1px solid #f3c1bb', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
              {attachmentsError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <input
              style={{ ...inputStyle, width: 220, flex: '1 1 200px' }}
              value={attachmentName}
              placeholder={t('nc_att_name_placeholder')}
              onChange={(e) => setAttachmentName(e.target.value)}
            />
            <input
              style={{ ...inputStyle, width: 180, flex: '1 1 160px' }}
              value={attachmentCategory}
              placeholder={t('nc_att_category_placeholder')}
              list="nc-att-categories"
              onChange={(e) => setAttachmentCategory(e.target.value)}
            />
            <datalist id="nc-att-categories">
              {attachmentCategories.map((c) => <option key={c} value={c} />)}
            </datalist>
            <input
              ref={attachmentFileInputRef}
              type="file"
              style={{ fontSize: 12.5 }}
              onChange={(e) => setAttachmentFile(e.target.files[0] || null)}
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={attachmentUploading}
              style={{ padding: '6px 14px', fontSize: 12.5 }}
              onClick={handleAddAttachment}
            >
              {attachmentUploading ? t('nc_att_uploading') : t('nc_att_add_button')}
            </button>
          </div>
          {attachmentsLoading ? (
            <p style={{ color: '#97a2b0', fontSize: 13 }}>{t('d_loading')}</p>
          ) : attachments.length === 0 ? (
            <p style={{ color: '#97a2b0', fontSize: 13 }}>{t('nc_att_no_records')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {attachmentGroups.map((grp) => (
                <div key={grp.category || '__none__'}>
                  <div style={{ fontSize: 11.5, color: '#97a2b0', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
                    {grp.category || t('nc_att_no_category')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {grp.items.map((a, idx) =>
                      editingAttachmentId === a.id ? (
                        <div key={a.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: '#eaf3fe', borderRadius: 6, padding: 8 }}>
                          <input
                            style={{ ...inputStyle, width: 180, flex: '1 1 160px' }}
                            value={editAttachmentName}
                            placeholder={t('nc_att_name_placeholder')}
                            onChange={(e) => setEditAttachmentName(e.target.value)}
                          />
                          <input
                            style={{ ...inputStyle, width: 160, flex: '1 1 140px' }}
                            value={editAttachmentCategory}
                            placeholder={t('nc_att_category_placeholder')}
                            list="nc-att-categories"
                            onChange={(e) => setEditAttachmentCategory(e.target.value)}
                          />
                          <input
                            ref={editAttachmentFileInputRef}
                            type="file"
                            style={{ fontSize: 12 }}
                            onChange={(e) => setEditAttachmentFile(e.target.files[0] || null)}
                          />
                          {a.fileName && !editAttachmentFile && (
                            <span style={{ fontSize: 11, color: '#6b7684' }}>{t('nc_att_current_file')}: {a.fileName}</span>
                          )}
                          <button type="button" className="btn-primary" disabled={editAttachmentSaving} style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => saveEditAttachment(a)}>
                            {editAttachmentSaving ? t('nc_att_uploading') : '✓'}
                          </button>
                          <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={cancelEditAttachment}>✕</button>
                        </div>
                      ) : (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f4f6f8', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <button
                              type="button"
                              disabled={idx === 0 || attachmentReordering}
                              onClick={() => moveAttachment(grp.items, idx, -1)}
                              style={{ border: 'none', background: 'transparent', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#c7cdd6' : '#6b7684', fontSize: 12, lineHeight: 1, padding: 0 }}
                            >▲</button>
                            <button
                              type="button"
                              disabled={idx === grp.items.length - 1 || attachmentReordering}
                              onClick={() => moveAttachment(grp.items, idx, 1)}
                              style={{ border: 'none', background: 'transparent', cursor: idx === grp.items.length - 1 ? 'default' : 'pointer', color: idx === grp.items.length - 1 ? '#c7cdd6' : '#6b7684', fontSize: 12, lineHeight: 1, padding: 0 }}
                            >▼</button>
                          </div>
                          <span style={{ flex: 1 }}>
                            📎 <a href={a.url} target="_blank" rel="noreferrer" style={{ color: '#2a6fd6', textDecoration: 'none' }}>
                              {a.name || a.fileName || '—'}
                            </a>
                            {a.createdAt && <span style={{ color: '#97a2b0', fontSize: 11.5 }}> — {formatDate(a.createdAt.slice(0, 10))}</span>}
                          </span>
                          <button type="button" className="btn-secondary" style={{ padding: '3px 8px', fontSize: 11.5 }} onClick={() => startEditAttachment(a)}>
                            {t('nc_att_edit_button')}
                          </button>
                          <button type="button" className="btn-danger" style={{ padding: '3px 8px', fontSize: 11.5 }} onClick={() => handleRemoveAttachment(a.id)}>
                            {t('common_delete')}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
