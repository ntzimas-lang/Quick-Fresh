import React, { useEffect, useMemo, useState } from 'react';
import { StoreEquipment, Products, Entries, Destructions } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

function buildColumns(t) {
  return [
    { key: 'store', label: t('se_col_store') },
    { key: 'equipment', label: `${t('se_col_fridgeNo')} / ${t('se_col_picoNo')}` }
  ];
}

// Κλειδί ομαδοποίησης "σχεδόν ίδιων" ονομάτων καταστήματος: αγνοεί κενά στην αρχή/τέλος,
// πολλαπλά κενά, κεφαλαία/πεζά και τόνους — ώστε "Κοτσοβολος" / "Κοτσόβολος " / "ΚΟΤΣΟΒΟΛΟΣ"
// να αναγνωρίζονται ως το ίδιο κατάστημα.
function normalizeStoreKey(s) {
  return (s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function toArray(v) {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined && String(x).trim() !== '');
  if (v === null || v === undefined || String(v).trim() === '') return [];
  return [String(v).trim()];
}

// Κάθε Ψυγείο "κλειδώνει" με ΕΝΑ συγκεκριμένο PICO — δεν είναι δύο ανεξάρτητες λίστες,
// είναι ζευγάρια {fridgeNo, picoNo}. Παλιές εγγραφές (πριν το ζευγάρωμα) είχαν δύο χωριστές
// λίστες fridgeNo[]/picoNo[] (ή ένα απλό string) — εδώ τις μετατρέπουμε αυτόματα σε ζευγάρια
// (ταιριάζοντας κατά σειρά· αν λείπει η μία πλευρά, μένει κενή).
function toPairs(record) {
  if (Array.isArray(record.equipment)) return record.equipment;
  const fridges = toArray(record.fridgeNo);
  const picos = toArray(record.picoNo);
  const len = Math.max(fridges.length, picos.length);
  const pairs = [];
  for (let i = 0; i < len; i++) pairs.push({ fridgeNo: fridges[i] || '', picoNo: picos[i] || '' });
  return pairs;
}

export default function StoreEquipmentView({ readOnly = false }) {
  const { t } = useLanguage();
  const COLUMNS = buildColumns(t);
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [destructions, setDestructions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'card'
  const [cardIndex, setCardIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('store');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    Promise.all([StoreEquipment.list(), Products.list(), Entries.list(), Destructions.list()])
      .then(([se, prods, ent, destr]) => { setRecords(se); setProducts(prods); setEntries(ent); setDestructions(destr); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }, []);

  // Η βάση/πηγή αλήθειας για τα ονόματα καταστημάτων είναι πλέον η λίστα "Κατάστημα"
  // των Προϊόντων → Cost tab (p.stores) — εκεί προστίθενται νέα καταστήματα, και ανοίγουν
  // παντού αλλού (εδώ, στο Ενεργό Σε Κατάστημα, στην Καταχώρηση/Καταστροφή).
  const storeOptions = useMemo(() => {
    const set = new Set();
    products.forEach((p) => (p.stores || []).forEach((s) => {
      const clean = (s && s.name ? s.name : '').trim();
      if (clean) set.add(clean);
    }));
    return Array.from(set).sort();
  }, [products]);

  // Για τη Μετονομασία θέλουμε να φαίνονται ΟΛΑ τα ονόματα καταστήματος που υπάρχουν
  // ΟΠΟΥΔΗΠΟΤΕ στην εφαρμογή — όχι μόνο στη λίστα Κατάστημα (Cost tab) των Προϊόντων.
  // Παλιές καταχωρήσεις Ληγμένα/Καταστροφών μπορεί να έχουν ένα όνομα (π.χ. "Kryoneri")
  // που πλέον δεν υπάρχει καν στα Προϊόντα (έχει ήδη αλλάξει εκεί σε κάτι άλλο) — τέτοια
  // "ορφανά" ονόματα δεν θα εμφανίζονταν ποτέ στο storeOptions, άρα δεν θα μπορούσες να τα
  // διορθώσεις. Εδώ τα μαζεύουμε από ΟΛΕΣ τις πηγές, ώστε να μπορείς να τα μετονομάσεις όλα.
  const allKnownStoreNames = useMemo(() => {
    const set = new Set(storeOptions);
    records.forEach((r) => { const c = (r.store || '').trim(); if (c) set.add(c); });
    entries.forEach((e) => { const c = (e.store || '').trim(); if (c) set.add(c); });
    destructions.forEach((d) => { const c = (d.store || '').trim(); if (c) set.add(c); });
    return Array.from(set).sort();
  }, [storeOptions, records, entries, destructions]);

  // Ανίχνευση "σχεδόν ίδιων" ονομάτων καταστήματος μέσα στη λίστα Κατάστημα (Cost tab) των
  // Προϊόντων (π.χ. κενό, κεφαλαία/πεζά, τόνος) — για το εργαλείο αυτόματης συγχώνευσης παρακάτω.
  const duplicateGroups = useMemo(() => {
    const byKey = {};
    products.forEach((p) => {
      (p.stores || []).forEach((s) => {
        const clean = (s && s.name ? s.name : '').trim();
        if (!clean) return;
        const key = normalizeStoreKey(clean);
        if (!byKey[key]) byKey[key] = {};
        byKey[key][clean] = (byKey[key][clean] || 0) + 1;
      });
    });
    const groups = [];
    Object.values(byKey).forEach((variantCounts) => {
      const variants = Object.entries(variantCounts).map(([name, count]) => ({ name, count }));
      if (variants.length > 1) {
        variants.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        groups.push({ variants, canonical: variants[0].name });
      }
    });
    return groups;
  }, [products]);

  const [merging, setMerging] = useState(false);

  async function mergeGroup(group) {
    setMerging(true);
    setError('');
    const canonical = group.canonical;
    const otherNames = group.variants.map((v) => v.name).filter((n) => n !== canonical);
    try {
      const affected = products.filter((p) => (p.stores || []).some((s) => otherNames.includes((s.name || '').trim())));
      const updated = await Promise.all(affected.map((p) => {
        const stores = p.stores || [];
        const canonicalEntry = stores.find((s) => (s.name || '').trim() === canonical);
        const variantEntries = stores.filter((s) => otherNames.includes((s.name || '').trim()));
        let nextStores;
        if (canonicalEntry) {
          // Κρατάμε την εγγραφή του σωστού ονόματος, συμπληρώνοντας τυχόν κενές τιμές από τα διπλότυπα.
          const merged = { ...canonicalEntry };
          variantEntries.forEach((v) => {
            if ((merged.sellingPriceStore === null || merged.sellingPriceStore === undefined) && v.sellingPriceStore != null) merged.sellingPriceStore = v.sellingPriceStore;
            if ((merged.sellingPriceQF === null || merged.sellingPriceQF === undefined) && v.sellingPriceQF != null) merged.sellingPriceQF = v.sellingPriceQF;
          });
          nextStores = stores.filter((s) => s !== canonicalEntry && !variantEntries.includes(s)).concat([merged]);
        } else {
          // Δεν υπάρχει ήδη εγγραφή με το σωστό όνομα — μετονομάζουμε την πρώτη παραλλαγή.
          const [first, ...rest] = variantEntries;
          nextStores = stores.filter((s) => !variantEntries.includes(s)).concat([{ ...first, name: canonical }]);
        }
        const nextActive = Array.from(new Set((p.activeStores || []).map((s) => {
          const clean = (s || '').trim();
          return otherNames.includes(clean) ? canonical : clean;
        })));
        return Products.update(p.id, { ...p, stores: nextStores, activeStores: nextActive });
      }));
      setProducts((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));
      if (!records.some((r) => (r.store || '').trim() === canonical)) {
        const rec = await StoreEquipment.create({ store: canonical, equipment: [] });
        setRecords((prev) => [...prev, rec]);
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setMerging(false);
    }
  }

  async function mergeAllGroups() {
    for (const group of duplicateGroups) {
      // eslint-disable-next-line no-await-in-loop
      await mergeGroup(group);
    }
  }

  // Μετονομασία ενός καταστήματος (π.χ. "Kryoneri" -> "Gefsinus Kryoneri Q&F") — αλλάζει
  // το όνομα ΠΑΝΤΟΥ όπου εμφανίζεται: στη λίστα Κατάστημα των Προϊόντων → Cost tab
  // (p.stores), στο "Ενεργό Σε Κατάστημα" (p.activeStores) και στην εγγραφή Ψυγείο/Pico
  // εδώ. Αν το νέο όνομα υπάρχει ήδη ως ξεχωριστό κατάστημα, τα συγχωνεύει (κρατώντας τις
  // τιμές/στοιχεία που λείπουν από το ένα, από το άλλο) αντί να δημιουργήσει διπλότυπο.
  async function renameStore(oldName, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed || trimmed === oldName) return;
    setMerging(true);
    setError('');
    try {
      const affected = products.filter((p) =>
        (p.stores || []).some((s) => (s.name || '').trim() === oldName) ||
        (p.activeStores || []).includes(oldName)
      );
      const updated = await Promise.all(affected.map((p) => {
        const stores = p.stores || [];
        const oldEntry = stores.find((s) => (s.name || '').trim() === oldName);
        const targetEntry = stores.find((s) => (s.name || '').trim() === trimmed);
        let nextStores = stores;
        if (oldEntry && targetEntry) {
          const merged = { ...targetEntry };
          if ((merged.sellingPriceStore === null || merged.sellingPriceStore === undefined) && oldEntry.sellingPriceStore != null) merged.sellingPriceStore = oldEntry.sellingPriceStore;
          if ((merged.sellingPriceQF === null || merged.sellingPriceQF === undefined) && oldEntry.sellingPriceQF != null) merged.sellingPriceQF = oldEntry.sellingPriceQF;
          nextStores = stores.filter((s) => s !== oldEntry && s !== targetEntry).concat([merged]);
        } else if (oldEntry) {
          nextStores = stores.map((s) => (s === oldEntry ? { ...s, name: trimmed } : s));
        }
        const nextActive = Array.from(new Set((p.activeStores || []).map((s) => ((s || '').trim() === oldName ? trimmed : s))));
        return Products.update(p.id, { ...p, stores: nextStores, activeStores: nextActive });
      }));
      setProducts((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));

      const seOld = records.find((r) => (r.store || '').trim() === oldName);
      const seTarget = records.find((r) => (r.store || '').trim() === trimmed);
      if (seOld && seTarget) {
        const mergedFields = { equipment: [...toPairs(seTarget), ...toPairs(seOld)] };
        const updatedTarget = await StoreEquipment.update(seTarget.id, { ...seTarget, ...mergedFields });
        await StoreEquipment.remove(seOld.id);
        setRecords((prev) => prev.filter((r) => r.id !== seOld.id).map((r) => (r.id === updatedTarget.id ? updatedTarget : r)));
      } else if (seOld) {
        const updatedRec = await StoreEquipment.update(seOld.id, { ...seOld, store: trimmed });
        setRecords((prev) => prev.map((r) => (r.id === seOld.id ? updatedRec : r)));
      }

      // Το Report Ληγμένα και οι Καταστροφές κρατάνε δικό τους αντίγραφο του ονόματος
      // καταστήματος (δεν διαβάζουν από τη λίστα Κατάστημα σε πραγματικό χρόνο) — γι' αυτό
      // η μετονομασία πρέπει να ενημερώσει και τις ήδη υπάρχουσες καταχωρήσεις τους, αλλιώς
      // θα συνέχιζαν να δείχνουν το παλιό όνομα.
      const affectedEntries = entries.filter((e) => (e.store || '').trim() === oldName);
      const updatedEntries = await Promise.all(affectedEntries.map((e) => Entries.update(e.id, { ...e, store: trimmed })));
      if (updatedEntries.length) {
        setEntries((prev) => prev.map((e) => updatedEntries.find((u) => u.id === e.id) || e));
      }

      const affectedDestructions = destructions.filter((d) => (d.store || '').trim() === oldName);
      const updatedDestructions = await Promise.all(affectedDestructions.map((d) => Destructions.update(d.id, { ...d, store: trimmed })));
      if (updatedDestructions.length) {
        setDestructions((prev) => prev.map((d) => updatedDestructions.find((u) => u.id === d.id) || d));
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setMerging(false);
    }
  }

  // Προσθήκη ΝΕΟΥ καταστήματος από εδώ (χωρίς να χρειάζεται να ανοίξεις κάποιο προϊόν) —
  // το προσθέτει στη λίστα Κατάστημα (Cost tab) ΟΛΩΝ των προϊόντων (με κενές τιμές,
  // συμπληρώνονται μετά ανά προϊόν) ώστε να εμφανιστεί αμέσως παντού, και δημιουργεί
  // και εγγραφή Ψυγείο/Pico για αυτό.
  const [newStoreName, setNewStoreName] = useState('');

  async function addNewStore() {
    const trimmed = newStoreName.trim();
    if (!trimmed) return;
    if (allKnownStoreNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setError(t('se_new_store_exists'));
      return;
    }
    setMerging(true);
    setError('');
    try {
      const updated = await Promise.all(
        products.map(async (p) => {
          if ((p.stores || []).some((s) => (s.name || '').trim() === trimmed)) return p;
          const nextStores = [...(p.stores || []), { name: trimmed, sellingPriceStore: null, sellingPriceQF: null }];
          return Products.update(p.id, { ...p, stores: nextStores });
        })
      );
      if (updated.length) setProducts((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));
      if (!records.some((r) => (r.store || '').trim() === trimmed)) {
        const rec = await StoreEquipment.create({ store: trimmed, equipment: [] });
        setRecords((prev) => [...prev, rec]);
      }
      setNewStoreName('');
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setMerging(false);
    }
  }

  // Διαγραφή καταστήματος: το αφαιρεί από τη λίστα Κατάστημα (Cost tab) και το Ενεργό Σε
  // Κατάστημα ΟΛΩΝ των προϊόντων, καθώς και την εγγραφή Ψυγείο/Pico. Τα ήδη υπάρχοντα Ληγμένα/
  // Καταστροφές με αυτό το όνομα ΔΕΝ πειράζονται — μένουν ως ιστορικό.
  async function deleteStore(name) {
    if (!window.confirm(`${t('se_delete_store_confirm_prefix')} "${name}" ${t('se_delete_store_confirm_suffix')}`)) return;
    setMerging(true);
    setError('');
    try {
      const affected = products.filter((p) =>
        (p.stores || []).some((s) => (s.name || '').trim() === name) ||
        (p.activeStores || []).includes(name)
      );
      const updated = await Promise.all(affected.map((p) => {
        const nextStores = (p.stores || []).filter((s) => (s.name || '').trim() !== name);
        const nextActive = (p.activeStores || []).filter((s) => (s || '').trim() !== name);
        return Products.update(p.id, { ...p, stores: nextStores, activeStores: nextActive });
      }));
      if (updated.length) setProducts((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));

      const seRec = records.find((r) => (r.store || '').trim() === name);
      if (seRec) {
        await StoreEquipment.remove(seRec.id);
        setRecords((prev) => prev.filter((r) => r.id !== seRec.id));
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setMerging(false);
    }
  }

  // Inline επεξεργασία ονόματος αντί για window.prompt() — σε κάποιες συσκευές/browsers
  // (π.χ. μέσα σε webview) το native prompt() μπορεί να μην ανοίγει καθόλου, οπότε το ✎
  // έμοιαζε να "μην κάνει τίποτα". Έτσι ο χρήστης βλέπει και επεξεργάζεται το όνομα μέσα
  // στην ίδια τη σελίδα.
  const [renamingName, setRenamingName] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  function startRename(oldName) {
    setRenamingName(oldName);
    setRenameValue(oldName);
  }

  function cancelRename() {
    setRenamingName(null);
    setRenameValue('');
  }

  async function confirmRename() {
    const oldName = renamingName;
    const next = renameValue;
    setRenamingName(null);
    setRenameValue('');
    await renameStore(oldName, next);
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filtered = useMemo(() => {
    let rows = records;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) =>
        (r.store || '').toLowerCase().includes(q) ||
        toPairs(r).some((p) => (p.fridgeNo || '').toLowerCase().includes(q) || (p.picoNo || '').toLowerCase().includes(q))
      );
    }
    const sorted = [...rows].sort((a, b) => {
      const av = (a[sortKey] || '').toString().toLowerCase();
      const bv = (b[sortKey] || '').toString().toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [records, search, sortKey, sortDir]);

  useEffect(() => {
    if (cardIndex >= filtered.length) setCardIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length]);

  // Το νέο (κενό) κατάστημα μπορεί να μην καταλήξει στο τέλος της λίστας μετά την ταξινόμηση
  // (π.χ. ένα κενό όνομα ταξινομείται πρώτο) — γι' αυτό ψάχνουμε το πραγματικό του index
  // στο filtered ΑΦΟΥ ενημερωθεί, αντί να μαντεύουμε τη θέση του εκ των προτέρων.
  const [pendingFocusId, setPendingFocusId] = useState(null);
  useEffect(() => {
    if (pendingFocusId == null) return;
    const idx = filtered.findIndex((r) => r.id === pendingFocusId);
    if (idx >= 0) {
      setCardIndex(idx);
      setPendingFocusId(null);
    }
  }, [filtered, pendingFocusId]);

  async function handleCreate() {
    try {
      const record = await StoreEquipment.create({ store: '', equipment: [] });
      setRecords((prev) => [...prev, record]);
      setSearch(''); // αλλιώς το νέο (άδειο) κατάστημα μπορεί να φιλτραριστεί εκτός λίστας
      setViewMode('card');
      setPendingFocusId(record.id);
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function handleFieldChange(id, field, value) {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    const current = records.find((r) => r.id === id);
    if (!current) return;
    try {
      await StoreEquipment.update(id, { ...current, [field]: value });
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function handleDelete(id) {
    try {
      await StoreEquipment.remove(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  // Πολλά ζευγάρια Ψυγείο+PICO ανά κατάστημα — κάθε ζευγάρι προστίθεται/διαγράφεται μαζί
  // (το ένα "κλειδώνει" με το άλλο, δεν είναι δύο ανεξάρτητες λίστες).
  // "pairDrafts" κρατάει το κείμενο που πληκτρολογείται πριν προστεθεί ένα νέο ζευγάρι.
  const [pairDrafts, setPairDrafts] = useState({});

  function getPairDraft(id) {
    return pairDrafts[id] || { fridgeNo: '', picoNo: '' };
  }
  function setPairDraftField(id, field, value) {
    setPairDrafts((d) => ({ ...d, [id]: { ...getPairDraft(id), [field]: value } }));
  }

  async function addEquipmentPair(id) {
    const draft = getPairDraft(id);
    const fridgeNo = (draft.fridgeNo || '').trim();
    const picoNo = (draft.picoNo || '').trim();
    if (!fridgeNo && !picoNo) return;
    const current = records.find((r) => r.id === id);
    if (!current) return;
    const nextPairs = [...toPairs(current), { fridgeNo, picoNo }];
    setPairDrafts((d) => ({ ...d, [id]: { fridgeNo: '', picoNo: '' } }));
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, equipment: nextPairs } : r)));
    try {
      await StoreEquipment.update(id, { ...current, equipment: nextPairs });
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function removeEquipmentPair(id, idx) {
    const current = records.find((r) => r.id === id);
    if (!current) return;
    const nextPairs = toPairs(current).filter((_, i) => i !== idx);
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, equipment: nextPairs } : r)));
    try {
      await StoreEquipment.update(id, { ...current, equipment: nextPairs });
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  function renderEquipmentPairs(r, inputWidth) {
    const pairs = toPairs(r);
    if (readOnly) {
      return pairs.length ? pairs.map((p) => `${p.fridgeNo || '—'} / ${p.picoNo || '—'}`).join(', ') : '—';
    }
    const draft = getPairDraft(r.id);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {pairs.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#eef1f4', borderRadius: 5, padding: '3px 4px 3px 8px', fontSize: 12.5, whiteSpace: 'nowrap' }}>
            <span>🧊 {p.fridgeNo || '—'}</span>
            <span style={{ color: '#c7cdd4' }}>↔</span>
            <span>📟 {p.picoNo || '—'}</span>
            <button
              type="button"
              onClick={() => removeEquipmentPair(r.id, i)}
              title={t('common_delete')}
              style={{ border: 'none', background: 'transparent', color: '#97a2b0', cursor: 'pointer', fontSize: 12, padding: '0 3px', lineHeight: 1 }}
            >✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            value={draft.fridgeNo}
            onChange={(e) => setPairDraftField(r.id, 'fridgeNo', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEquipmentPair(r.id); } }}
            placeholder={t('se_add_fridge_placeholder')}
            style={{ border: '1px solid #e1e5ea', borderRadius: 5, padding: '3px 6px', fontSize: 12.5, width: inputWidth || 80 }}
          />
          <input
            value={draft.picoNo}
            onChange={(e) => setPairDraftField(r.id, 'picoNo', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEquipmentPair(r.id); } }}
            placeholder={t('se_add_pico_placeholder')}
            style={{ border: '1px solid #e1e5ea', borderRadius: 5, padding: '3px 6px', fontSize: 12.5, width: inputWidth || 80 }}
          />
          <button
            type="button"
            onClick={() => addEquipmentPair(r.id)}
            title={t('se_add_pair_button')}
            style={{ border: 'none', background: '#2f8f8a', color: '#fff', borderRadius: 5, cursor: 'pointer', fontSize: 13, padding: '4px 8px', lineHeight: 1 }}
          >+</button>
        </div>
      </div>
    );
  }

  const current = filtered[cardIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{t('title_store_equipment')}</strong>
        <div style={{ display: 'flex', gap: 4, background: '#f1f3f5', borderRadius: 8, padding: 3 }}>
          <button
            onClick={() => setViewMode('table')}
            style={{ border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#16233f' : '#6b7684' }}
          >
            {t('common_table')}
          </button>
          <button
            onClick={() => setViewMode('card')}
            style={{ border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: viewMode === 'card' ? '#fff' : 'transparent', color: viewMode === 'card' ? '#16233f' : '#6b7684' }}
          >
            {t('common_card')}
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common_filter_placeholder')}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #d7dce2', fontSize: 13, width: 200 }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        {!readOnly && (
          <p style={{ fontSize: 12, color: '#97a2b0', margin: '0 0 12px' }}>{t('se_source_hint')}</p>
        )}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#fdecea', color: '#c0392b', border: '1px solid #f3c1bb', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} style={{ border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}
        {!readOnly && allKnownStoreNames.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <strong style={{ fontSize: 13, color: '#16233f', display: 'block', marginBottom: 4 }}>{t('se_store_list_title')}</strong>
            <p style={{ fontSize: 12, color: '#97a2b0', margin: '0 0 10px' }}>{t('se_store_list_desc')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allKnownStoreNames.map((name) => (
                renamingName === name ? (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#eef7f6', border: '1px solid #2f8f8a', borderRadius: 8, padding: '4px 4px 4px 8px' }}>
                    <input
                      autoFocus
                      list="qf-rename-datalist"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') cancelRename(); }}
                      style={{ border: '1px solid #d7dce2', borderRadius: 5, padding: '4px 6px', fontSize: 13, width: 220 }}
                    />
                    <button
                      type="button"
                      disabled={merging}
                      onClick={confirmRename}
                      title={t('se_rename_button')}
                      style={{ border: 'none', background: '#2f8f8a', color: '#fff', borderRadius: 5, cursor: merging ? 'default' : 'pointer', fontSize: 13, padding: '5px 9px' }}
                    >✓</button>
                    <button
                      type="button"
                      onClick={cancelRename}
                      title={t('common_cancel')}
                      style={{ border: 'none', background: 'transparent', color: '#6b7684', cursor: 'pointer', fontSize: 13, padding: '5px 6px' }}
                    >✕</button>
                  </div>
                ) : (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f6f8', borderRadius: 8, padding: '5px 4px 5px 12px' }}>
                    <span style={{ fontSize: 13 }}>{name}</span>
                    {!storeOptions.includes(name) && (
                      <span title={t('se_legacy_name_hint')} style={{ fontSize: 10, color: '#c98a1f', fontWeight: 700, background: '#fff8e8', border: '1px solid #eddca6', borderRadius: 4, padding: '1px 5px' }}>
                        {t('se_legacy_name_badge')}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={merging}
                      onClick={() => startRename(name)}
                      title={t('se_rename_button')}
                      style={{ border: 'none', background: 'transparent', cursor: merging ? 'default' : 'pointer', fontSize: 13, color: '#6b7684', padding: '4px 8px' }}
                    >✎</button>
                    <button
                      type="button"
                      disabled={merging}
                      onClick={() => deleteStore(name)}
                      title={t('se_delete_store_button')}
                      style={{ border: 'none', background: 'transparent', cursor: merging ? 'default' : 'pointer', fontSize: 13, color: '#c0392b', padding: '4px 8px' }}
                    >🗑</button>
                  </div>
                )
              ))}
            </div>
            {renamingName && (
              <>
                <datalist id="qf-rename-datalist">
                  {allKnownStoreNames.filter((n) => n !== renamingName).map((n) => <option key={n} value={n} />)}
                </datalist>
                <p style={{ fontSize: 11, color: '#97a2b0', margin: '8px 0 0' }}>{t('se_rename_datalist_hint')}</p>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #eef1f4' }}>
              <input
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addNewStore(); }}
                placeholder={t('se_new_store_placeholder')}
                style={{ border: '1px solid #d7dce2', borderRadius: 6, padding: '6px 8px', fontSize: 13, width: 240 }}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={merging || !newStoreName.trim()}
                onClick={addNewStore}
                style={{ padding: '6px 14px', fontSize: 12.5 }}
              >
                {t('se_new_store_button')}
              </button>
            </div>
          </div>
        )}
        {!readOnly && duplicateGroups.length > 0 && (
          <div style={{ background: '#fff8e8', border: '1px solid #eddca6', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <strong style={{ fontSize: 13, color: '#8a6116' }}>{t('se_merge_title')}</strong>
              {duplicateGroups.length > 1 && (
                <button className="btn-primary" disabled={merging} onClick={mergeAllGroups} style={{ padding: '5px 12px', fontSize: 12 }}>
                  {t('se_merge_apply_all')}
                </button>
              )}
            </div>
            <p style={{ fontSize: 12, color: '#8a6116', margin: '0 0 12px' }}>{t('se_merge_desc')}</p>
            {duplicateGroups.map((group) => (
              <div key={group.canonical} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #f0e3bb' }}>
                <div style={{ fontSize: 13 }}>
                  {group.variants.map((v, i) => (
                    <span key={v.name}>
                      {i > 0 && ' / '}
                      <span style={{ fontWeight: v.name === group.canonical ? 700 : 400 }}>{v.name}</span>
                      <span style={{ color: '#97a2b0', fontSize: 11 }}> ({v.count})</span>
                    </span>
                  ))}
                  <span style={{ color: '#6b7684', fontSize: 12 }}> → <strong>{group.canonical}</strong></span>
                </div>
                <button className="btn-primary" disabled={merging} onClick={() => mergeGroup(group)} style={{ padding: '5px 12px', fontSize: 12 }}>
                  {t('se_merge_button')}
                </button>
              </div>
            ))}
          </div>
        )}
        {loading ? (
          <p style={{ color: '#97a2b0' }}>{t('d_loading')}</p>
        ) : viewMode === 'table' ? (
          <>
            {filtered.length === 0 ? (
              <p style={{ color: '#97a2b0' }}>{t('se_no_records')}</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 11.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        title={t('common_sort_hint')}
                        style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        {col.label}
                        {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                    {!readOnly && <th style={{ padding: '10px 12px' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid #eef1f4' }}>
                      <td style={{ padding: '6px 12px' }}>
                        {readOnly ? (r.store || '—') : (
                          <select
                            value={r.store || ''}
                            onChange={(e) => handleFieldChange(r.id, 'store', e.target.value)}
                            style={{ width: '100%', border: '1px solid #e1e5ea', borderRadius: 6, padding: '5px 6px', fontSize: 13 }}
                          >
                            <option value="">{t('common_select_placeholder')}</option>
                            {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '6px 12px' }}>
                        {renderEquipmentPairs(r)}
                      </td>
                      {!readOnly && (
                        <td style={{ padding: '6px 12px' }}>
                          <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => handleDelete(r.id)}>{t('common_delete')}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!readOnly && (
              <button className="btn-primary" style={{ marginTop: 14 }} onClick={handleCreate}>{t('common_new')}</button>
            )}
          </>
        ) : (
          <div style={{ maxWidth: 420, margin: '0 auto' }}>
            {filtered.length === 0 ? (
              <p style={{ color: '#97a2b0' }}>{t('se_no_records')}</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <button
                    onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
                    disabled={cardIndex === 0}
                    style={{ border: '1px solid #d7dce2', background: '#fff', borderRadius: 6, padding: '6px 12px', cursor: cardIndex === 0 ? 'default' : 'pointer', opacity: cardIndex === 0 ? 0.4 : 1 }}
                  >‹</button>
                  <span style={{ fontSize: 12.5, color: '#6b7684' }}>{cardIndex + 1} / {filtered.length}</span>
                  <button
                    onClick={() => setCardIndex((i) => Math.min(filtered.length - 1, i + 1))}
                    disabled={cardIndex === filtered.length - 1}
                    style={{ border: '1px solid #d7dce2', background: '#fff', borderRadius: 6, padding: '6px 12px', cursor: cardIndex === filtered.length - 1 ? 'default' : 'pointer', opacity: cardIndex === filtered.length - 1 ? 0.4 : 1 }}
                  >›</button>
                </div>
                {current && (
                  <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 10, padding: 20 }}>
                    <div className="field" style={{ marginBottom: 14 }}>
                      <label>{t('se_col_store')}</label>
                      <select
                        disabled={readOnly}
                        value={current.store || ''}
                        onChange={(e) => handleFieldChange(current.id, 'store', e.target.value)}
                      >
                        <option value="">{t('common_select_placeholder')}</option>
                        {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 18 }}>
                      <label>{t('se_col_fridgeNo')} / {t('se_col_picoNo')}</label>
                      {renderEquipmentPairs(current, 110)}
                    </div>
                    {!readOnly && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-primary" onClick={handleCreate}>{t('common_new')}</button>
                        <button className="btn-danger" onClick={() => handleDelete(current.id)}>{t('common_delete')}</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
