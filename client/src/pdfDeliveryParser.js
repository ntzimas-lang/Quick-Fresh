// Ανάλυση Δελτίου Αποστολής (PDF) — φτιαγμένο για τη μορφή που στέλνει ο προμηθευτής
// (πίνακας με στήλες #, SKU, Όνομα, Ποσ., Μονάδα, Σχόλια). Δουλεύει με τις πραγματικές
// συντεταγμένες (x, y) κάθε κομματιού κειμένου μέσα στο PDF — όχι με απλή ανάγνωση σειρά-
// προς-σειρά — γιατί όταν το όνομα ενός προϊόντος "σπάει" σε 2-3 γραμμές, η Ποσότητα και η
// Μονάδα εξακολουθούν να εμφανίζονται στην ΠΡΩΤΗ γραμμή της κάθε γραμμής-προϊόντος (ίδιο ύψος
// με το # και το SKU), ενώ οι επόμενες γραμμές του ονόματος είναι πιο κάτω. Γι' αυτό ομαδοποιούμε
// τα κομμάτια κειμένου ανά "γραμμή προϊόντος" χρησιμοποιώντας το ύψος (y) του νούμερου (#) ως
// σημείο εκκίνησης, και μετά ξεχωρίζουμε τις στήλες με βάση την οριζόντια θέση (x).
//
// Αν στο μέλλον αλλάξει η μορφή του δελτίου (άλλος προμηθευτής/πρότυπο), αυτό το αρχείο είναι
// το μοναδικό σημείο που χρειάζεται προσαρμογή.

let pdfjsLibPromise = null;

async function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const pdfjsLib = await import('pdfjs-dist/build/pdf');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjsLib;
    })();
  }
  return pdfjsLibPromise;
}

function extractMeta(rawText) {
  const meta = {};
  let m;
  if ((m = rawText.match(/Παραγγελία:\s*([\w.\-/]+)/))) meta.orderNumber = m[1];
  if ((m = rawText.match(/Ημ\/\s*νία\s*Αποστολής:\s*([\d\-/]+)/))) meta.shipDate = m[1];
  if ((m = rawText.match(/Υποκατάστημα:\s*(.+?)(?:\s+Επιθυμητή|\s+Στοιχεία|$)/))) meta.storeHint = m[1].trim();
  return meta;
}

// Παίρνει τη λίστα κομματιών κειμένου (str, x, y στρογγυλεμένο) και επιστρέφει τις γραμμές
// προϊόντων του πίνακα.
function extractRows(items) {
  const skuHeader = items.find((i) => i.str.trim() === 'SKU');
  const nameHeader = items.find((i) => i.str.trim() === 'Όνομα');
  const qtyHeader = items.find((i) => i.str.trim().replace(/\./g, '') === 'Ποσ');
  const unitHeader = items.find((i) => i.str.trim() === 'Μονάδα');
  const commentsHeader = items.find((i) => i.str.trim() === 'Σχόλια' && qtyHeader && i.x > qtyHeader.x);

  if (!skuHeader || !qtyHeader) return null;

  const headerY = skuHeader.y;
  const skuColX = skuHeader.x - 8;
  const nameColX = nameHeader ? nameHeader.x - 8 : skuHeader.x + 45;
  const qtyColX = qtyHeader.x - 8;
  const unitColX = unitHeader ? unitHeader.x - 8 : qtyColX + 30;
  const commentsColX = commentsHeader ? commentsHeader.x - 8 : unitColX + 40;

  let bodyItems = items.filter((i) => i.y < headerY - 4);
  const footer = bodyItems.find((i) => i.x < skuColX - 10 && /^Σχόλια/.test(i.str.trim()));
  if (footer) bodyItems = bodyItems.filter((i) => i.y > footer.y);

  const rowStarts = bodyItems
    .filter((i) => i.x < skuColX && /^\d+$/.test(i.str.trim()))
    .sort((a, b) => b.y - a.y);

  const rows = rowStarts
    .map((rs, idx) => {
      const nextY = idx + 1 < rowStarts.length ? rowStarts[idx + 1].y : -Infinity;
      const rowItems = bodyItems.filter((i) => i.y <= rs.y && i.y > nextY);
      const topLine = rowItems.filter((i) => i.y === rs.y);

      const skuItem = topLine.find((i) => i.x >= skuColX && i.x < nameColX && i.str.trim());
      const qtyItem = topLine.find((i) => i.x >= qtyColX && i.x < unitColX && i.str.trim());
      const unitItem = topLine.find((i) => i.x >= unitColX && i.x < commentsColX && i.str.trim());

      const nameItems = rowItems
        .filter((i) => i.x >= nameColX && i.x < qtyColX && i.str.trim())
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const name = nameItems.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();

      const qtyRaw = qtyItem ? qtyItem.str.trim().replace(',', '.') : '';
      const qty = qtyRaw && !Number.isNaN(parseFloat(qtyRaw)) ? parseFloat(qtyRaw) : null;

      return {
        rowNum: parseInt(rs.str.trim(), 10),
        sku: skuItem ? skuItem.str.trim() : '',
        name,
        qty,
        unit: unitItem ? unitItem.str.trim() : ''
      };
    })
    .filter((r) => r.sku);

  return rows;
}

export async function parseDeliveryNotePdf(file) {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  const items = content.items
    .filter((i) => typeof i.str === 'string')
    .map((i) => ({ str: i.str, x: i.transform[4], y: Math.round(i.transform[5]) }));

  const rawText = items.map((i) => i.str).join(' ').replace(/\s+/g, ' ');
  const meta = extractMeta(rawText);
  const rows = extractRows(items);

  if (!rows) return { meta, rows: [], unrecognized: true };
  return { meta, rows, unrecognized: false };
}
