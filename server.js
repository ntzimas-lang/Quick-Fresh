const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
// Allow overriding storage locations via env vars so a persistent disk
// (e.g. Render Disk mounted at /var/data) can be used in production.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'db.json');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');

if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
if (!fs.existsSync(DB_PATH)) {
  // Seed a fresh persistent disk with the bundled starter data (if present),
  // otherwise start from an empty database.
  const SEED_DB = path.join(__dirname, 'data', 'db.json');
  if (SEED_DB !== DB_PATH && fs.existsSync(SEED_DB)) {
    fs.copyFileSync(SEED_DB, DB_PATH);
  } else {
    fs.writeFileSync(DB_PATH, JSON.stringify({ products: [], contacts: [] }, null, 2));
  }
}
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

const CLIENT_DIST = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
} else {
  app.use(express.static(path.join(__dirname, 'public')));
}

// ---------- storage helpers ----------
function readDb() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}
function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

// ---------- multer (image uploads) ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ---------- PRODUCTS ----------
app.get('/api/products', (req, res) => {
  const db = readDb();
  res.json(db.products);
});

app.get('/api/products/:id', (req, res) => {
  const db = readDb();
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

app.post('/api/products', (req, res) => {
  const db = readDb();
  const newProduct = Object.assign({
    id: uuidv4(),
    categoryGr: '', categoryEn: '', itemCode: '', barcode: '',
    descriptionErp: '', unitsPerMachine: null,
    descriptionGr: '', descriptionEn: '',
    detailedDescriptionGr: '', detailedDescriptionEn: '',
    status: 'ΕΝΤΟΣ', activeOnMachine: 'YES', activeStores: [],
    images365: [], imagesPromo: [],
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
    ]
  }, req.body);
  db.products.push(newProduct);
  writeDb(db);
  res.status(201).json(newProduct);
});

app.put('/api/products/:id', (req, res) => {
  const db = readDb();
  const idx = db.products.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  db.products[idx] = Object.assign({}, db.products[idx], req.body, { id: req.params.id });
  writeDb(db);
  res.json(db.products[idx]);
});

app.delete('/api/products/:id', (req, res) => {
  const db = readDb();
  db.products = db.products.filter(x => x.id !== req.params.id);
  writeDb(db);
  res.status(204).end();
});

// ---------- CONTACTS ----------
app.get('/api/contacts', (req, res) => {
  const db = readDb();
  res.json(db.contacts);
});

app.get('/api/contacts/:id', (req, res) => {
  const db = readDb();
  const c = db.contacts.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

app.post('/api/contacts', (req, res) => {
  const db = readDb();
  const newContact = Object.assign({
    id: uuidv4(),
    company: '', department: '', phone: '', emailInfo: '',
    status: '', autoSeller: '', interest: '', people: [],
    responsible: '', email: '', phone2: '',
    firstCallDate: null, firstMailDate: null, firstVisitDate: null,
    secondCallDate: null, secondMailDate: null, secondVisitDate: null,
    notes: ''
  }, req.body);
  db.contacts.push(newContact);
  writeDb(db);
  res.status(201).json(newContact);
});

app.put('/api/contacts/:id', (req, res) => {
  const db = readDb();
  const idx = db.contacts.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  db.contacts[idx] = Object.assign({}, db.contacts[idx], req.body, { id: req.params.id });
  writeDb(db);
  res.json(db.contacts[idx]);
});

app.delete('/api/contacts/:id', (req, res) => {
  const db = readDb();
  db.contacts = db.contacts.filter(x => x.id !== req.params.id);
  writeDb(db);
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Quick & Fresh app running at http://localhost:${PORT}`);
});
