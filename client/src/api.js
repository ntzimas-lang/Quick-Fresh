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

function defaultProduct(overrides) {
  const id = newId();
  return {
    id,
    categoryGr: '',
    categoryEn: '',
    itemCode: '',
    barcode: '',
    descriptionErp: '',
    unitsPerMachine: null,
    descriptionGr: '',
    descriptionEn: '',
    detailedDescriptionGr: '',
    detailedDescriptionEn: '',
    status: 'ΕΝΤΟΣ',
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
    firstCallDate: null,
    firstMailDate: null,
    firstVisitDate: null,
    secondCallDate: null,
    secondMailDate: null,
    secondVisitDate: null,
    notes: '',
    ...overrides,
    id
  };
}

export const Products = {
  async list() {
    const { data, error } = await supabase.from('products').select('*').order('updated_at', { ascending: true });
    if (error) throw error;
    return data.map(rowToRecord);
  },
  async get(id) {
    const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error) throw error;
    return rowToRecord(data);
  },
  async create(body) {
    const record = defaultProduct(body);
    const { data, error } = await supabase
      .from('products')
      .insert({ id: record.id, data: record })
      .select()
      .single();
    if (error) throw error;
    return rowToRecord(data);
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
    return rowToRecord(data);
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
  async create({ productId, productItemCode, productDescription, store, expiryDate }) {
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
