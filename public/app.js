const API = '/api';
const STORE_CANDIDATES = ['DEMO', 'Plaisio', 'Novibet', 'Kryoneri', 'Nestle', 'AIA', 'Metlen', 'ACS Courier'];

let products = [];
let contacts = [];
let currentProduct = null;
let currentContact = null;

// ---------------- Navigation ----------------
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
  });
});

document.querySelectorAll('.tabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const container = tab.closest('.detail');
    container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    container.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
  });
});

// ---------------- API helpers ----------------
async function apiGet(url) { const r = await fetch(url); return r.json(); }
async function apiPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function apiPut(url, body) {
  const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function apiDelete(url) { await fetch(url, { method: 'DELETE' }); }

// ================= PRODUCTS =================
async function loadProducts() {
  products = await apiGet(`${API}/products`);
  renderProductList();
}

function renderProductList() {
  const q = document.getElementById('product-search').value.trim().toLowerCase();
  const wrap = document.getElementById('product-list');
  wrap.innerHTML = '';
  products
    .filter(p => !q || (p.descriptionGr || '').toLowerCase().includes(q) || (p.itemCode || '').toLowerCase().includes(q) || (p.barcode || '').includes(q))
    .forEach(p => {
      const el = document.createElement('div');
      el.className = 'list-item' + (currentProduct && currentProduct.id === p.id ? ' selected' : '');
      el.innerHTML = `<div class="list-item-title">${escapeHtml(p.descriptionGr || '(χωρίς όνομα)')}</div>
                       <div class="list-item-sub">${escapeHtml(p.itemCode || '')} · ${escapeHtml(p.categoryGr || '')}</div>`;
      el.addEventListener('click', () => selectProduct(p.id));
      wrap.appendChild(el);
    });
}

document.getElementById('product-search').addEventListener('input', renderProductList);

document.getElementById('btn-new-product').addEventListener('click', async () => {
  const p = await apiPost(`${API}/products`, { descriptionGr: 'Νέο προϊόν' });
  products.push(p);
  renderProductList();
  selectProduct(p.id);
});

async function selectProduct(id) {
  currentProduct = await apiGet(`${API}/products/${id}`);
  renderProductList();
  document.getElementById('product-empty').classList.add('hidden');
  document.getElementById('product-detail').classList.remove('hidden');
  fillProductForm(currentProduct);
}

function fillProductForm(p) {
  document.getElementById('f-categoryGr').value = p.categoryGr || '';
  document.getElementById('f-categoryEn').value = p.categoryEn || '';
  document.getElementById('f-itemCode').value = p.itemCode || '';
  document.getElementById('f-barcode').value = p.barcode || '';
  document.getElementById('f-descriptionErp').value = p.descriptionErp || '';
  document.getElementById('f-unitsPerMachine').value = p.unitsPerMachine ?? '';
  document.getElementById('f-descriptionGr').value = p.descriptionGr || '';
  document.getElementById('f-descriptionEn').value = p.descriptionEn || '';
  document.getElementById('f-detailedDescriptionGr').value = p.detailedDescriptionGr || '';
  document.getElementById('f-detailedDescriptionEn').value = p.detailedDescriptionEn || '';
  document.getElementById('f-status').value = p.status || 'ΕΝΤΟΣ';
  document.getElementById('f-activeOnMachine').value = p.activeOnMachine || 'YES';

  renderActiveStoresChips(p.activeStores || []);
  renderImages('f-images365', p.images365 || []);
  renderImages('f-imagesPromo', p.imagesPromo || []);

  const cost = p.cost || { sellingPrice: 0, ptk: 0, quantity: 0, vatPercent: 13 };
  document.getElementById('c-sellingPrice').value = cost.sellingPrice ?? '';
  document.getElementById('c-vatPercent').value = cost.vatPercent ?? 13;
  document.getElementById('c-ptk').value = cost.ptk ?? '';
  document.getElementById('c-quantity').value = cost.quantity ?? '';

  renderStoresTable(p.stores || []);
  recomputeCost();
}

function renderActiveStoresChips(active) {
  const wrap = document.getElementById('f-activeStores');
  wrap.innerHTML = '';
  STORE_CANDIDATES.forEach(name => {
    const on = active.includes(name);
    const chip = document.createElement('div');
    chip.className = 'chip clickable' + (on ? '' : ' off');
    chip.textContent = name;
    chip.addEventListener('click', () => {
      const idx = active.indexOf(name);
      if (idx === -1) active.push(name); else active.splice(idx, 1);
      renderActiveStoresChips(active);
      currentProduct._activeStoresDraft = active;
    });
    wrap.appendChild(chip);
  });
  currentProduct && (currentProduct._activeStoresDraft = active);
}

function renderImages(boxId, urls) {
  const box = document.getElementById(boxId);
  const thumbs = box.querySelector('.image-thumbs');
  thumbs.innerHTML = '';
  urls.forEach(u => {
    const img = document.createElement('img');
    img.src = u;
    thumbs.appendChild(img);
  });
  const input = box.querySelector('.image-input');
  input.onchange = async () => {
    if (!input.files[0] || !currentProduct) return;
    const fd = new FormData();
    fd.append('image', input.files[0]);
    const r = await fetch(`${API}/upload`, { method: 'POST', body: fd });
    const { url } = await r.json();
    const key = boxId === 'f-images365' ? 'images365' : 'imagesPromo';
    currentProduct[key] = currentProduct[key] || [];
    currentProduct[key].push(url);
    renderImages(boxId, currentProduct[key]);
    await saveCurrentProductSilently();
  };
}

function renderStoresTable(stores) {
  const tbody = document.getElementById('stores-tbody');
  tbody.innerHTML = '';
  stores.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="store-name">${escapeHtml(s.name)}</div></td>
      <td><input type="number" step="0.01" class="store-price" data-idx="${i}" data-field="sellingPriceStore" value="${s.sellingPriceStore ?? ''}"></td>
      <td><div class="fc-cell" id="fc-store-${i}">-</div></td>
      <td><input type="number" step="0.01" class="store-price" data-idx="${i}" data-field="sellingPriceQF" value="${s.sellingPriceQF ?? ''}"></td>
      <td><div class="fc-cell" id="fc-qf-${i}">-</div></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.store-price').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.idx;
      const field = inp.dataset.field;
      currentProduct.stores[i][field] = inp.value === '' ? null : parseFloat(inp.value);
      recomputeCost();
    });
  });
}

function fmtEuro(n) { return isFinite(n) ? n.toFixed(2) + ' €' : '-'; }
function fmtPct(n) { return isFinite(n) ? Math.round(n) + ' %' : '∞ %'; }

function recomputeCost() {
  if (!currentProduct) return;
  const sellingPrice = parseFloat(document.getElementById('c-sellingPrice').value) || 0;
  const vat = parseFloat(document.getElementById('c-vatPercent').value) || 0;
  const ptk = parseFloat(document.getElementById('c-ptk').value) || 0;
  const qty = parseFloat(document.getElementById('c-quantity').value) || 0;

  const net = sellingPrice / (1 + vat / 100);
  const profit = net - ptk;
  const fc = net > 0 ? (ptk / net) * 100 : NaN;
  const gross = net * qty;
  const profitSum = profit * qty;

  document.getElementById('c-fc').textContent = fmtPct(fc);
  document.getElementById('c-profit').textContent = fmtEuro(profit);
  document.getElementById('c-gross').textContent = fmtEuro(gross);
  document.getElementById('c-profitSum').textContent = fmtEuro(profitSum);

  (currentProduct.stores || []).forEach((s, i) => {
    const netStore = s.sellingPriceStore ? s.sellingPriceStore / (1 + vat / 100) : null;
    const netQF = s.sellingPriceQF ? s.sellingPriceQF / (1 + vat / 100) : null;
    const fcStore = netStore ? (ptk / netStore) * 100 : NaN;
    const fcQF = netQF ? (ptk / netQF) * 100 : NaN;
    const elStore = document.getElementById(`fc-store-${i}`);
    const elQF = document.getElementById(`fc-qf-${i}`);
    if (elStore) elStore.textContent = fmtPct(fcStore);
    if (elQF) elQF.textContent = fmtPct(fcQF);
  });
}

['c-sellingPrice', 'c-vatPercent', 'c-ptk', 'c-quantity'].forEach(id => {
  document.getElementById(id).addEventListener('input', recomputeCost);
});

function gatherProductFromForm() {
  return {
    categoryGr: document.getElementById('f-categoryGr').value,
    categoryEn: document.getElementById('f-categoryEn').value,
    itemCode: document.getElementById('f-itemCode').value,
    barcode: document.getElementById('f-barcode').value,
    descriptionErp: document.getElementById('f-descriptionErp').value,
    unitsPerMachine: document.getElementById('f-unitsPerMachine').value ? +document.getElementById('f-unitsPerMachine').value : null,
    descriptionGr: document.getElementById('f-descriptionGr').value,
    descriptionEn: document.getElementById('f-descriptionEn').value,
    detailedDescriptionGr: document.getElementById('f-detailedDescriptionGr').value,
    detailedDescriptionEn: document.getElementById('f-detailedDescriptionEn').value,
    status: document.getElementById('f-status').value,
    activeOnMachine: document.getElementById('f-activeOnMachine').value,
    activeStores: currentProduct._activeStoresDraft || currentProduct.activeStores || [],
    images365: currentProduct.images365 || [],
    imagesPromo: currentProduct.imagesPromo || [],
    cost: {
      sellingPrice: parseFloat(document.getElementById('c-sellingPrice').value) || 0,
      vatPercent: parseFloat(document.getElementById('c-vatPercent').value) || 0,
      ptk: parseFloat(document.getElementById('c-ptk').value) || 0,
      quantity: parseFloat(document.getElementById('c-quantity').value) || 0
    },
    stores: currentProduct.stores || []
  };
}

async function saveCurrentProductSilently() {
  if (!currentProduct) return;
  const body = gatherProductFromForm();
  const updated = await apiPut(`${API}/products/${currentProduct.id}`, body);
  currentProduct = updated;
  const idx = products.findIndex(x => x.id === updated.id);
  if (idx !== -1) products[idx] = updated;
}

document.getElementById('btn-save-product').addEventListener('click', async () => {
  await saveCurrentProductSilently();
  renderProductList();
  const btn = document.getElementById('btn-save-product');
  const original = btn.textContent;
  btn.textContent = 'Αποθηκεύτηκε ✓';
  setTimeout(() => (btn.textContent = original), 1200);
});

document.getElementById('btn-delete-product').addEventListener('click', async () => {
  if (!currentProduct) return;
  if (!confirm('Διαγραφή προϊόντος;')) return;
  await apiDelete(`${API}/products/${currentProduct.id}`);
  products = products.filter(p => p.id !== currentProduct.id);
  currentProduct = null;
  document.getElementById('product-detail').classList.add('hidden');
  document.getElementById('product-empty').classList.remove('hidden');
  renderProductList();
});

// ================= CONTACTS =================
async function loadContacts() {
  contacts = await apiGet(`${API}/contacts`);
  renderContactList();
}

function renderContactList() {
  const q = document.getElementById('contact-search').value.trim().toLowerCase();
  const wrap = document.getElementById('contact-list');
  wrap.innerHTML = '';
  contacts
    .filter(c => !q || (c.company || '').toLowerCase().includes(q))
    .forEach(c => {
      const el = document.createElement('div');
      el.className = 'list-item' + (currentContact && currentContact.id === c.id ? ' selected' : '');
      el.innerHTML = `<div class="list-item-title">${escapeHtml(c.company || '(χωρίς όνομα)')}</div>
                       <div class="list-item-sub">${escapeHtml(c.status || '')}</div>`;
      el.addEventListener('click', () => selectContact(c.id));
      wrap.appendChild(el);
    });
}

document.getElementById('contact-search').addEventListener('input', renderContactList);

document.getElementById('btn-new-contact').addEventListener('click', async () => {
  const c = await apiPost(`${API}/contacts`, { company: 'Νέα εταιρεία' });
  contacts.push(c);
  renderContactList();
  selectContact(c.id);
});

async function selectContact(id) {
  currentContact = await apiGet(`${API}/contacts/${id}`);
  renderContactList();
  document.getElementById('contact-empty').classList.add('hidden');
  document.getElementById('contact-detail').classList.remove('hidden');
  fillContactForm(currentContact);
}

function fillContactForm(c) {
  document.getElementById('k-company').value = c.company || '';
  document.getElementById('k-department').value = c.department || '';
  document.getElementById('k-phone').value = c.phone || '';
  document.getElementById('k-emailInfo').value = c.emailInfo || '';
  document.getElementById('k-status').value = c.status || '';
  document.getElementById('k-autoSeller').value = c.autoSeller || '';
  document.getElementById('k-interest').value = c.interest || '';
  document.getElementById('k-responsible').value = c.responsible || '';
  document.getElementById('k-email').value = c.email || '';
  document.getElementById('k-phone2').value = c.phone2 || '';
  document.getElementById('k-firstCallDate').value = c.firstCallDate || '';
  document.getElementById('k-firstMailDate').value = c.firstMailDate || '';
  document.getElementById('k-firstVisitDate').value = c.firstVisitDate || '';
  document.getElementById('k-secondCallDate').value = c.secondCallDate || '';
  document.getElementById('k-secondMailDate').value = c.secondMailDate || '';
  document.getElementById('k-secondVisitDate').value = c.secondVisitDate || '';
  document.getElementById('k-notes').value = c.notes || '';
  renderPeopleChips(c.people || []);
}

function renderPeopleChips(people) {
  const wrap = document.getElementById('k-people');
  wrap.innerHTML = '';
  people.forEach((name, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>${escapeHtml(name)}</span><span class="x">✕</span>`;
    chip.querySelector('.x').addEventListener('click', () => {
      people.splice(i, 1);
      renderPeopleChips(people);
    });
    wrap.appendChild(chip);
  });
  currentContact._peopleDraft = people;
}

document.getElementById('k-people-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    e.preventDefault();
    const people = currentContact._peopleDraft || currentContact.people || [];
    people.push(e.target.value.trim());
    e.target.value = '';
    renderPeopleChips(people);
  }
});

function gatherContactFromForm() {
  return {
    company: document.getElementById('k-company').value,
    department: document.getElementById('k-department').value,
    phone: document.getElementById('k-phone').value,
    emailInfo: document.getElementById('k-emailInfo').value,
    status: document.getElementById('k-status').value,
    autoSeller: document.getElementById('k-autoSeller').value,
    interest: document.getElementById('k-interest').value,
    people: currentContact._peopleDraft || currentContact.people || [],
    responsible: document.getElementById('k-responsible').value,
    email: document.getElementById('k-email').value,
    phone2: document.getElementById('k-phone2').value,
    firstCallDate: document.getElementById('k-firstCallDate').value || null,
    firstMailDate: document.getElementById('k-firstMailDate').value || null,
    firstVisitDate: document.getElementById('k-firstVisitDate').value || null,
    secondCallDate: document.getElementById('k-secondCallDate').value || null,
    secondMailDate: document.getElementById('k-secondMailDate').value || null,
    secondVisitDate: document.getElementById('k-secondVisitDate').value || null,
    notes: document.getElementById('k-notes').value
  };
}

document.getElementById('btn-save-contact').addEventListener('click', async () => {
  if (!currentContact) return;
  const body = gatherContactFromForm();
  const updated = await apiPut(`${API}/contacts/${currentContact.id}`, body);
  currentContact = updated;
  const idx = contacts.findIndex(x => x.id === updated.id);
  if (idx !== -1) contacts[idx] = updated;
  renderContactList();
  const btn = document.getElementById('btn-save-contact');
  const original = btn.textContent;
  btn.textContent = 'Αποθηκεύτηκε ✓';
  setTimeout(() => (btn.textContent = original), 1200);
});

document.getElementById('btn-delete-contact').addEventListener('click', async () => {
  if (!currentContact) return;
  if (!confirm('Διαγραφή επαφής;')) return;
  await apiDelete(`${API}/contacts/${currentContact.id}`);
  contacts = contacts.filter(c => c.id !== currentContact.id);
  currentContact = null;
  document.getElementById('contact-detail').classList.add('hidden');
  document.getElementById('contact-empty').classList.remove('hidden');
  renderContactList();
});

// ---------------- utils ----------------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ---------------- init ----------------
loadProducts();
loadContacts();
