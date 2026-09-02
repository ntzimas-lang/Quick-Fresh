import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.error(
    'Λείπουν τα VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Βάλε τα σε client/.env (τοπικά) ή στα Environment variables του Netlify site (production).'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function rowToRecord(row) {
  return { ...row.data, id: row.id };
}

// Παλιά προϊόντα είχαν ένα μόνο barcode (πεδίο "barcode"). Μερικά προϊόντα
// έχουν παραπάνω από ένα, οπότε το μοντέλο δεδομένων χρησιμοποιεί πλέον λίστα
// "barcodes". Εδώ μετατρέπουμε αυτόματα τα παλιά δεδομένα την πρώτη φορά που
// φορτώνονται, ώστε να μη χαθεί τίποτα.
function normalizeProduct(p) {
  if (Array.isArray(p.barcodes)) return p;
  return { ...p, barcodes: p.barcode ? [p.barcode] : [] };
}

function defaultProduct(overrides) {
  const id = newId();
  return {
    id,
    categoryGr: '',
    categoryEn: '',
    itemCode: '',
    barcodes: [],
    descriptionErp: '',
    unitsPerMachine: null,
    descriptionGr: '',
    descriptionEn: '',
    detailedDescriptionGr: '',
    detailedDescriptionEn: '',
    status: 'ΕΝΤΟΣ',
    region: '',
    activeOnMachine: 'YES',
    activeStores: [],
    images365: [],
    imagesPromo: [],
    cost: { sellingPrice: 0, ptk: 0, quantity: 0, vatPercent: 13 },
    stores: [
      { name: 'DEMO', sellingPriceStore: null, sellingPriceQF: null },
      { name: 'Plaisio', sellingPriceStore: null, sellingPriceQF: null },
      { name: 'Novibet', sellingPriceStore: null, sellingPriceQF: null },
      { name: 'Kryoneri', sellingPriceStore: null, sellingPriceQF: null },
      { name: 'Nestle', sellingPriceStore: null, sellingPriceQF: null },
      { name: 'AIA', sellingPriceStore: null, sellingPriceQF: null },
      { name: 'Metlen', sellingPriceStore: null, sellingPriceQF: null },
      { name: 'ACS Courier', sellingPriceStore: null, sellingPriceQF: null }
    ],
    ...overrides,
    id
  };
}

function defaultContact(overrides) {
  const id = newId();
  return {
    id,
    company: '',
    department: '',
    phone: '',
    emailInfo: '',
    status: '',
    autoSeller: '',
    interest: '',
    people: [],
    responsible: '',
    email: '',
    phone2: '',
    // Λίστες ημερομηνιών (όχι πια σταθερός αριθμός "1η/2η") — μπορεί να έχει όσες
    // χρειάζεται, καμία, ή πολλές.
    callDates: [],
    mailDates: [],
    visitDates: [],
    notes: '',
    ...overrides,
    id
  };
}

export const Products = {
  async list() {
    const { data, error } = await supabase.from('products').select('*').order('updated_at', { ascending: true });
    if (error) throw error;
    return data.map(rowToRecord).map(normalizeProduct);
  },
  async get(id) {
    const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error) throw error;
    return normalizeProduct(rowToRecord(data));
  },
  async create(body) {
    const record = defaultProduct(body);
    const { data, error } = await supabase
      .from('products')
      .insert({ id: record.id, data: record })
      .select()
      .single();
    if (error) throw error;
    return normalizeProduct(rowToRecord(data));
  },
  async update(id, body) {
    const record = { ...body, id };
    const { data, error } = await supabase
      .from('products')
      .update({ data: record, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return normalizeProduct(rowToRecord(data));
  },
  async remove(id) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
  }
};

export const Contacts = {
  async list() {
    const { data, error } = await supabase.from('contacts').select('*').order('updated_at', { ascending: true });
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async get(id) {
    const { data, error } = await supabase.from('contacts').select('*').eq('id', id).single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async create(body) {
    const record = defaultContact(body);
    const { data, error } = await supabase
      .from('contacts')
      .insert({ id: record.id, data: record })
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async update(id, body) {
    const record = { ...body, id };
    const { data, error } = await supabase
      .from('contacts')
      .update({ data: record, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async remove(id) {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) throw error;
  }
};

export const Entries = {
  async list() {
    const { data, error } = await supabase.from('product_entries').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async create({ productId, productItemCode, productDescription, store, expiryDate, quantity }) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    const id = newId();
    const record = {
      id,
      productId,
      productItemCode: productItemCode || '',
      productDescription: productDescription || '',
      store,
      expiryDate,
      quantity: quantity === '' || quantity === undefined || quantity === null ? null : Number(quantity),
      enteredBy: user?.id || null,
      enteredByEmail: user?.email || null,
      createdAt: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('product_entries')
      .insert({ id, data: record })
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async remove(id) {
    const { error } = await supabase.from('product_entries').delete().eq('id', id);
    if (error) throw error;
  },
  async update(id, body) {
    const record = { ...body, id };
    const { data, error } = await supabase
      .from('product_entries')
      .update({ data: record, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  }
};

export const SalesDaily = {
  async list() {
    const { data, error } = await supabase.from('sales_daily').select('*');
    if (error) throw error;
    return data.map(rowToRecord);
  },
  // rows: [{ id, ...fields }] — id = `${date}|${store}` ώστε το ξαναανέβασμα μιας
  // περιόδου που επικαλύπτεται να κάνει update, όχι διπλή καταχώρηση.
  async upsertMany(rows) {
    if (!rows.length) return [];
    const payload = rows.map((r) => ({ id: r.id, data: r, updated_at: new Date().toISOString() }));
    const { data, error } = await supabase.from('sales_daily').upsert(payload, { onConflict: 'id' }).select();
    if (error) throw error;
    return data.map(rowToRecord);
  }
};

export const SalesProducts = {
  async list() {
    const { data, error } = await supabase.from('sales_products').select('*');
    if (error) throw error;
    return data.map(rowToRecord);
  },
  // Κάθε upload είναι μία "παρτίδα" (batchId) — κρατάμε το ιστορικό, το Dashboard
  // χρησιμοποιεί μόνο την πιο πρόσφατη παρτίδα ανά κατάστημα.
  async insertBatch(rows) {
    if (!rows.length) return [];
    const payload = rows.map((r) => ({ id: newId(), data: r }));
    const { data, error } = await supabase.from('sales_products').insert(payload).select();
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async removeBatch(batchId) {
    const { error } = await supabase.from('sales_products').delete().eq('data->>batchId', batchId);
    if (error) throw error;
  },
  // Διόρθωση καταστήματος σε ήδη ανεβασμένη παρτίδα (π.χ. όταν η αυτόματη αναγνώριση
  // απέτυχε και αποθηκεύτηκε ως "—") — ξαναγράφει το πεδίο store σε όλες τις γραμμές
  // της παρτίδας χωρίς να πειράξει τίποτα άλλο.
  async updateBatchStore(batchId, store) {
    const { data: rows, error: selErr } = await supabase.from('sales_products').select('*').eq('data->>batchId', batchId);
    if (selErr) throw selErr;
    if (!rows.length) return [];
    const payload = rows.map((r) => ({ id: r.id, data: { ...r.data, store }, updated_at: new Date().toISOString() }));
    const { data, error } = await supabase.from('sales_products').upsert(payload, { onConflict: 'id' }).select();
    if (error) throw error;
    return data.map(rowToRecord);
  }
};

// Πωλήσεις ανά μισάωρο της ημέρας, ΣΥΝΟΛΙΚΑ (χωρίς κατάστημα) — από το report
// "Sales By 30 Minutes" (ή "Sales By 15 Minutes") — τροφοδοτεί το γράφημα "Ώρες Αιχμής".
export const SalesTimeBuckets = {
  async list() {
    const { data, error } = await supabase.from('sales_time_buckets').select('*');
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async insertBatch(rows) {
    if (!rows.length) return [];
    const payload = rows.map((r) => ({ id: newId(), data: r }));
    const { data, error } = await supabase.from('sales_time_buckets').insert(payload).select();
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async removeBatch(batchId) {
    const { error } = await supabase.from('sales_time_buckets').delete().eq('data->>batchId', batchId);
    if (error) throw error;
  }
};

// Πωλήσεις ανά ΚΑΤΑΣΤΗΜΑ, σπασμένες σε 4 βάρδιες της ημέρας — από το report
// "Sales Time Details".
export const SalesShiftBreakdown = {
  async list() {
    const { data, error } = await supabase.from('sales_shift_breakdown').select('*');
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async insertBatch(rows) {
    if (!rows.length) return [];
    const payload = rows.map((r) => ({ id: newId(), data: r }));
    const { data, error } = await supabase.from('sales_shift_breakdown').insert(payload).select();
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async removeBatch(batchId) {
    const { error } = await supabase.from('sales_shift_breakdown').delete().eq('data->>batchId', batchId);
    if (error) throw error;
  }
};

export const Destructions = {
  async list() {
    const { data, error } = await supabase.from('destructions').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return data.map(rowToRecord);
  },
  // Καταγράφει την καταστροφή ΚΑΙ αφαιρεί αυτόματα τυχόν καταχωρήσεις "Ληγμένα"
  // (product_entries) για το ίδιο προϊόν στο ίδιο κατάστημα — δεν έχει νόημα να
  // συνεχίζει να εμφανίζεται ως "λήγει" κάτι που μόλις καταστράφηκε.
  async create({ productId, productItemCode, productDescription, store, quantity, reason, date }) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    const id = newId();
    const record = {
      id,
      productId,
      productItemCode: productItemCode || '',
      productDescription: productDescription || '',
      store,
      quantity: quantity === '' || quantity === undefined || quantity === null ? null : Number(quantity),
      reason: reason || '',
      // Ημερομηνία καταστροφής (επιλέξιμη από τον χρήστη, προεπιλογή σήμερα) — ξεχωριστή
      // από το createdAt που είναι το πραγματικό timestamp καταχώρησης στο σύστημα.
      date: date || new Date().toISOString().slice(0, 10),
      destroyedBy: user?.id || null,
      destroyedByEmail: user?.email || null,
      createdAt: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('destructions')
      .insert({ id, data: record })
      .select()
      .single();
    if (error) throw error;

    // Χρησιμοποιούμε RPC σε συνάρτηση (security definer) αντί για απευθείας delete —
    // το RLS delete policy του product_entries επιτρέπει διαγραφή μόνο σε super_user,
    // οπότε ένα απευθείας delete εδώ αποτύγχανε σιωπηλά (χωρίς error) όταν την
    // καταστροφή την έκανε Οδηγός ή ο ρόλος "Χρήστης" — η καταχώρηση Ληγμένα ποτέ δεν
    // έφευγε. Η συνάρτηση κάνει ΑΚΡΙΒΩΣ την ίδια στοχευμένη διαγραφή (by productId+store)
    // αλλά δουλεύει για όλους τους ρόλους. Βλ. supabase/fix_destruction_removes_entry.sql.
    let removedEntries = 0;
    if (productId && store) {
      const { data: removedCount, error: removeError } = await supabase.rpc('remove_entries_after_destruction', {
        p_product_id: productId,
        p_store: store
      });
      if (!removeError && typeof removedCount === 'number') removedEntries = removedCount;
    }

    return { record: rowToRecord(data), removedEntries };
  },
  async remove(id) {
    const { error } = await supabase.from('destructions').delete().eq('id', id);
    if (error) throw error;
  },
  async update(id, body) {
    const record = { ...body, id };
    const { data, error } = await supabase
      .from('destructions')
      .update({ data: record, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  }
};

// Γραμμές από Δελτίο Αποστολής (PDF) που παραγγέλθηκαν αλλά ΔΕΝ παραλήφθηκαν
// (checkbox "include" απενεργοποιημένο κατά την ολοκλήρωση μιας μαζικής καταχώρησης)
// — καταγράφονται εδώ αντί να χάνονται σιωπηλά, ώστε να φαίνονται και να μπορούν
// να διαγραφούν αργότερα (Super User ή ρόλος "Χρήστης").
export const DeliveryShortages = {
  async list() {
    const { data, error } = await supabase.from('delivery_shortages').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async insertMany(rows) {
    if (!rows || !rows.length) return [];
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    const createdAt = new Date().toISOString();
    const date = createdAt.slice(0, 10);
    const payload = rows.map((r) => {
      const id = newId();
      const record = {
        id,
        sku: r.sku || '',
        pdfName: r.pdfName || '',
        productId: r.productId || null,
        productItemCode: r.productItemCode || '',
        productDescription: r.productDescription || '',
        qty: r.qty === '' || r.qty === undefined || r.qty === null ? null : Number(r.qty),
        store: r.store || '',
        orderNumber: r.orderNumber || '',
        shipDate: r.shipDate || '',
        date,
        createdBy: user?.id || null,
        createdByEmail: user?.email || null,
        createdAt
      };
      return { id, data: record };
    });
    const { data, error } = await supabase.from('delivery_shortages').insert(payload).select();
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async remove(id) {
    const { error } = await supabase.from('delivery_shortages').delete().eq('id', id);
    if (error) throw error;
  }
};

export const NewCustomers = {
  async list() {
    const { data, error } = await supabase.from('new_customers').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async create(body) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    const id = newId();
    const record = {
      id,
      businessName: '',
      phone: '',
      visitDate: new Date().toISOString().slice(0, 10),
      placeType: '',
      outcome: '',
      nextStep: '',
      nextContactDate: '',
      notes: '',
      sketch: '',
      ...body,
      id,
      createdBy: user?.id || null,
      createdByEmail: user?.email || null,
      createdAt: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('new_customers')
      .insert({ id, data: record })
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async update(id, body) {
    const record = { ...body, id };
    const { data, error } = await supabase
      .from('new_customers')
      .update({ data: record, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async remove(id) {
    const { error } = await supabase.from('new_customers').delete().eq('id', id);
    if (error) throw error;
  }
};

export const PricingScenarios = {
  async list() {
    const { data, error } = await supabase.from('pricing_scenarios').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async create(body) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    const id = newId();
    const record = {
      id,
      name: '',
      notes: '',
      globalPricePercent: 0,
      globalQtyPercent: 0,
      categoryPercents: {},
      productOverrides: {},
      ...body,
      id,
      createdBy: user?.id || null,
      createdByEmail: user?.email || null,
      createdAt: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('pricing_scenarios')
      .insert({ id, data: record })
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async update(id, body) {
    const record = { ...body, id };
    const { data, error } = await supabase
      .from('pricing_scenarios')
      .update({ data: record, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async remove(id) {
    const { error } = await supabase.from('pricing_scenarios').delete().eq('id', id);
    if (error) throw error;
  }
};

export const PendingDeliveries = {
  async list() {
    const { data, error } = await supabase.from('pending_deliveries').select('*').order('updated_at', { ascending: true });
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async create(body) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    const id = newId();
    const record = {
      id,
      status: 'pending',
      orderNumber: '',
      shipDate: '',
      storeHint: '',
      store: '',
      rows: [],
      ...body,
      id,
      createdBy: user?.id || null,
      createdByEmail: user?.email || null,
      createdAt: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('pending_deliveries')
      .insert({ id, data: record })
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async update(id, body) {
    const record = { ...body, id };
    const { data, error } = await supabase
      .from('pending_deliveries')
      .update({ data: record, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async remove(id) {
    const { error } = await supabase.from('pending_deliveries').delete().eq('id', id);
    if (error) throw error;
  }
};

export const StoreEquipment = {
  async list() {
    const { data, error } = await supabase.from('store_equipment').select('*').order('updated_at', { ascending: true });
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async create(body) {
    const id = newId();
    const record = { id, store: '', equipment: [], ...body, id };
    const { data, error } = await supabase
      .from('store_equipment')
      .insert({ id: record.id, data: record })
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async update(id, body) {
    const record = { ...body, id };
    const { data, error } = await supabase
      .from('store_equipment')
      .update({ data: record, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async remove(id) {
    const { error } = await supabase.from('store_equipment').delete().eq('id', id);
    if (error) throw error;
  }
};

export const History = {
  async list(limit = 300) {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },
  // Επαναφορά μιας διαγραμμένης εγγραφής: ξαναγράφει το old_data (που ήδη κρατάει
  // το audit_log) στον αρχικό πίνακα, με το ίδιο id. Λειτουργεί γενικά για ΟΛΟΥΣ
  // τους πίνακες που ακολουθούν το μοτίβο {id, data jsonb, updated_at} — δηλαδή
  // όλους τους πίνακες που έχουν το audit trigger. Χρησιμοποιεί upsert (όχι insert)
  // ώστε να μην πετάει σφάλμα αν η εγγραφή έχει ήδη επαναφερθεί ξανά.
  async restore(entry) {
    if (!entry || !entry.table_name || !entry.record_id) throw new Error('invalid_entry');
    if (!entry.old_data) throw new Error('no_old_data');
    const { error } = await supabase
      .from(entry.table_name)
      .upsert({ id: entry.record_id, data: entry.old_data, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
  }
};

export const Profiles = {
  async list() {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },
  async updateRole(id, role) {
    const { data, error } = await supabase.from('profiles').update({ role }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
};

export async function upload(file) {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `${newId()}.${ext}`;
  const { error } = await supabase.storage.from('images').upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('images').getPublicUrl(path);
  return { url: data.publicUrl };
}

export { supabase };

export const Auth = {
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },
  onAuthStateChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
    return data.subscription;
  },
  async getMyProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    return data;
  }
};
