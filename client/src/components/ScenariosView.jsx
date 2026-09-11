import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PricingScenarios, Products, SalesProducts } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';
import { SCENARIO_BASELINE_PRODUCTS } from '../data/scenarioBaseline.js';
import { DEJAVU_SANS_BASE64 } from '../dejavu-font.js';
import { QUICKFRESH_LOGO_BASE64 } from '../quickfresh-logo.js';

function fmtEuro(n) {
  const v = isFinite(n) ? n : 0;
  return '€' + v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct1(n) {
  return isFinite(n) ? (n * 100).toFixed(1) + '%' : '—';
}
function fmtNum(n, digits = 2) {
  const v = isFinite(n) ? n : 0;
  return v.toLocaleString('el-GR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
// Για ποσά όπου το πρόσημο μπορεί να αντιστρέψει νόημα (π.χ. erosion): θετικό = κόστος (−),
// αρνητικό = όφελος (+). Αποφεύγει το μπερδεμένο "−€-51,95".
function fmtSignedCost(n) {
  const v = isFinite(n) ? n : 0;
  return v >= 0 ? '−' + fmtEuro(v) : '+' + fmtEuro(-v);
}
// Ημερομηνία δημιουργίας ενός αποθηκευμένου σεναρίου (createdAt) — χρησιμοποιείται στη
// λίστα ώστε ένα αντίγραφο (clone) και το πρωτότυπό του να ξεχωρίζουν εύκολα.
function fmtDate(iso, lang) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'el-GR');
}

// --- Μηνιαίο breakdown σεναρίου Επιδότησης, με βάση πραγματικές μηνιαίες ποσότητες ---
// Ίδια λογική proration (καταμερισμός περιόδου σε ημερολογιακούς μήνες) με το
// DashboardView.jsx ("Πωλήσεις Τεμάχια ανά Κατηγορία — ανά Μήνα"). Το φύλλο "Summary" του
// Sales Analysis Report έχει στήλη "Userkey" — είναι ο ΙΔΙΟΣ κωδικός προϊόντος (Item Code,
// π.χ. "15.0915") με το SCENARIO_BASELINE_PRODUCTS.code / products.itemCode. Ο parser
// (SalesView.jsx) τον αποθηκεύει στο πεδίο p.itemCode — ΑΥΤΟ είναι η πρωτεύουσα, πιο
// αξιόπιστη βάση αντιστοίχισης (άμεσο ταίριασμα κωδικού, όχι μέσω ονόματος/barcode).
// Ως δεύτερη γραμμή άμυνας (για γραμμές χωρίς Userkey, π.χ. παλαιότερα uploads πριν
// προστεθεί αυτό το πεδίο) χρησιμοποιούμε scancode (barcode) -> products.barcodes[] ->
// itemCode. Ό,τι δεν ταιριάξει με ΚΑΝΕΝΑΝ από τους δύο τρόπους παίρνει ως τελευταία
// εναλλακτική τον γενικό λόγο (συνολικός όγκος μήνα / συνολικό juneQty βάσης), εφαρμοσμένο
// ομοιόμορφα. Κάθε γραμμή του Μηνιαίου Breakdown δείχνει καθαρά αν η ποσότητά της είναι
// ΠΡΑΓΜΑΤΙΚΗ (matched, μέσω itemCode ή barcode) ή ΕΚΤΙΜΗΣΗ (fallback).
function daysBetweenInclusive(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}
function extractPeriodRange(label) {
  const matches = [...String(label || '').matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (!matches.length) return null;
  const first = matches[0];
  const last = matches[matches.length - 1];
  const start = new Date(`${first[3]}-${first[2]}-${first[1]}T00:00:00`);
  const end = new Date(`${last[3]}-${last[2]}-${last[1]}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;
  return { start, end };
}
const MONTH_LABELS_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(key, lang) {
  const [y, m] = key.split('-');
  const labels = lang === 'en' ? MONTH_LABELS_EN : MONTH_LABELS_EL;
  return `${labels[Number(m) - 1]} ${y}`;
}
// Επιστρέφει [{ monthKey, periodTexts, totalQty, byItemCode, byScancode }], ταξινομημένα
// χρονολογικά, από το ΠΙΟ ΠΡΟΣΦΑΤΟ batch ανά κατάστημα (ίδιο dedup με το Dashboard —
// αποφεύγει διπλομέτρημα σωρευτικών reports). byItemCode: { itemCode -> qty εκείνου του
// μήνα } (από τη στήλη Userkey — πρωτεύον κλειδί). byScancode: { scancode -> qty } (barcode
// — δευτερεύον κλειδί, για γραμμές/uploads χωρίς Userkey).
function computeMonthlyQtyByScancode(salesProducts) {
  const latestBatchByStore = {};
  salesProducts.forEach((p) => {
    const cur = latestBatchByStore[p.store];
    if (!cur || new Date(p.uploadedAt) > new Date(cur)) latestBatchByStore[p.store] = p.uploadedAt;
  });
  const currentProducts = salesProducts.filter((p) => p.uploadedAt === latestBatchByStore[p.store]);

  const monthQty = {};
  const monthPeriodTexts = {};
  const monthScancodeQty = {}; // monthKey -> { scancode -> qty }
  const monthItemCodeQty = {}; // monthKey -> { itemCode -> qty }
  currentProducts.forEach((p) => {
    if (!(p.sold > 0)) return;
    const range = extractPeriodRange(p.periodLabel);
    if (!range) return;
    const { start, end } = range;
    const totalDays = daysBetweenInclusive(start, end);
    if (totalDays <= 0) return;
    const scancode = (p.scancode || '').trim();
    const itemCode = (p.itemCode || '').trim();
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const lastMonthStart = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= lastMonthStart) {
      const monthStart = cursor;
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const overlapStart = start > monthStart ? start : monthStart;
      const overlapEnd = end < monthEnd ? end : monthEnd;
      if (overlapStart <= overlapEnd) {
        const overlapDays = daysBetweenInclusive(overlapStart, overlapEnd);
        const weight = overlapDays / totalDays;
        const qty = p.sold * weight;
        const mk = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
        monthQty[mk] = (monthQty[mk] || 0) + qty;
        if (!monthPeriodTexts[mk]) monthPeriodTexts[mk] = new Set();
        if (p.periodLabel) monthPeriodTexts[mk].add(p.periodLabel);
        if (scancode) {
          if (!monthScancodeQty[mk]) monthScancodeQty[mk] = {};
          monthScancodeQty[mk][scancode] = (monthScancodeQty[mk][scancode] || 0) + qty;
        }
        if (itemCode) {
          if (!monthItemCodeQty[mk]) monthItemCodeQty[mk] = {};
          monthItemCodeQty[mk][itemCode] = (monthItemCodeQty[mk][itemCode] || 0) + qty;
        }
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  });
  return Object.keys(monthQty)
    .sort()
    .map((mk) => ({
      monthKey: mk,
      totalQty: monthQty[mk],
      periodTexts: Array.from(monthPeriodTexts[mk] || []),
      byItemCode: monthItemCodeQty[mk] || {},
      byScancode: monthScancodeQty[mk] || {}
    }));
}

// Χτίζει την "κλιμακωμένη" εκδοχή της βάσης τιμοκαταλόγου για έναν συγκεκριμένο μήνα:
// κάθε προϊόν παίρνει την ΠΡΑΓΜΑΤΙΚΗ ποσότητα εκείνου του μήνα αν ταιριάζει (πρώτα μέσω
// itemCode/Userkey, μετά μέσω scancode->barcode), αλλιώς εκτίμηση με τον γενικό λόγο
// όγκου. Κοινή λογική, χρησιμοποιείται τόσο για το Μηνιαίο Breakdown ενός σεναρίου όσο
// και για την κάρτα "BASIC (Χωρίς Επιδότηση)" της αρχικής οθόνης.
function buildScaledBaselineForMonth(mergedBaseline, ratio, byItemCode, byScancode, barcodeToItemCode) {
  // (1) Πρωτεύον: itemCode απευθείας (Userkey == κωδικός τιμοκαταλόγου).
  const realQtyByCode = {};
  Object.entries(byItemCode || {}).forEach(([code, qty]) => {
    realQtyByCode[code] = (realQtyByCode[code] || 0) + qty;
  });
  // (2) Δευτερεύον: scancode -> barcode -> itemCode, ΜΟΝΟ για κωδικούς που δεν
  // καλύφθηκαν ήδη από το (1) — αποφεύγει διπλομέτρημα όταν ένα προϊόν έχει και
  // Userkey και ταιριαστό barcode.
  Object.entries(byScancode || {}).forEach(([scancode, qty]) => {
    const code = barcodeToItemCode[scancode];
    if (code && realQtyByCode[code] === undefined) realQtyByCode[code] = qty;
  });
  const scaledBaseline = mergedBaseline.map((p) => {
    const real = realQtyByCode[p.code];
    const isRealQty = real !== undefined;
    const juneQty = isRealQty ? real : (Number(p.juneQty) || 0) * ratio;
    return { ...p, juneQty, basicValue: (p.basicPrice / 1.13) * juneQty, isRealQty };
  });
  const matchedCount = scaledBaseline.filter((p) => p.isRealQty).length;
  return { scaledBaseline, matchedCount, totalCount: scaledBaseline.length };
}

// Ανιχνεύει αν ΟΛΟΙ οι μήνες του Μηνιαίου Breakdown προέρχονται στην πραγματικότητα από
// ΕΝΑ ΚΑΙ ΜΟΝΟ ενιαίο upload (μία periodLabel, π.χ. "01/05/2026 έως 09/09/2026") που καλύπτει
// πάνω από έναν μήνα. Σε αυτή την περίπτωση ο επιμερισμός ανά μήνα είναι ΚΑΘΑΡΑ αναλογία
// ημερών πάνω σε ΕΝΑ σύνολο (όχι ξεχωριστό πραγματικό στοιχείο ανά μήνα) — μήνες με το ίδιο
// πλήθος ημερολογιακών ημερών (π.χ. Μάιος/Ιούλιος/Αύγουστος, όλοι 31 μέρες) θα βγουν
// πανομοιότυποι. Επιστρέφει το κοινό periodLabel αν ισχύει, αλλιώς null.
function detectSingleConsolidatedPeriod(monthlyQtyList) {
  if (!monthlyQtyList.length) return null;
  const allTexts = new Set();
  for (const m of monthlyQtyList) {
    const texts = m.periodTexts || [];
    if (texts.length !== 1) return null; // κάποιος μήνας έχει 0 ή >1 πηγές — όχι το απλό σενάριο
    allTexts.add(texts[0]);
  }
  return allTexts.size === 1 ? [...allTexts][0] : null;
}

// --- Στατικό σύνολο αναφοράς (τιμοκατάλογος BASIC), από το ανεβασμένο Excel -----
// ΣΗΜΕΙΩΣΗ: αυτό είναι πλέον μόνο η ΣΤΑΤΙΚΗ βάση/fallback (κωδικός + ποσότητα Ιουνίου).
// Μέσα στο component, η τιμή (basicPrice), το κόστος (ptk) και η κατηγορία (cat) αντικαθίστανται
// ΖΩΝΤΑΝΑ από το Προϊόντα (πίνακας products, μέσω itemCode) — δες mergedBaseline παρακάτω.
// Η βάση πάνω στην οποία υπολογίζεται η %έκπτωση είναι ο ΠΡΑΓΜΑΤΙΚΟΣ μηνιαίος τζίρος
// Ιουνίου (μόνο ό,τι όντως πουλήθηκε — juneQty ανά προϊόν, τιμολογημένο σε τιμή BASIC).
// ΔΕΝ γίνεται καμία εκτίμηση/πρόσθεση ποσότητας για προϊόντα που δεν πουλήθηκαν, ώστε η
// βάση να μείνει ρεαλιστική και να αφορά ΕΝΑΝ μήνα. Η έκπτωση % που προκύπτει εφαρμόζεται
// όμως σε ΟΛΑ τα 128 προϊόντα του τιμοκαταλόγου (δηλαδή κάθε προϊόν παίρνει νέα προτεινόμενη
// τιμή, ακόμα κι αν δεν πουλήθηκε τον Ιούνιο) — απλά η ΒΑΣΗ υπολογισμού του ποσοστού είναι ο
// πραγματικός τζίρος, όχι μια φουσκωμένη εκτίμηση.
// Υπολογίζει τα ίδια αθροίσματα αναφοράς (αξία, κόστος, μικτό κέρδος, F.C.) πάνω σε ΟΠΟΙΟΔΗΠΟΤΕ
// υποσύνολο προϊόντων — χρησιμοποιείται τόσο για ολόκληρο τον τιμοκατάλογο όσο και για μόνο τις
// επιλεγμένες κατηγορίες όταν ένα σενάριο περιορίζεται σε συγκεκριμένες κατηγορίες.
function computeBaselineTotals(products) {
  const totalValue = products.reduce((s, p) => s + p.basicValue, 0);
  const cogs = products.reduce((s, p) => s + p.ptk * p.juneQty, 0);
  const grossProfit = totalValue - cogs;
  const grossProfitPct = totalValue ? grossProfit / totalValue : 0;
  // F.C. = ΠΤΚ (κόστος) / καθαρή τιμή (χωρίς ΦΠΑ) × 100 — ίδιος τύπος με το computeFC() του
  // ProductsView.jsx. Στο σύνολο, F.C.% = 100 − Μικτό Κέρδος% (COGS/Revenue = 1 − GrossProfit/Revenue).
  const fcPct = 100 - grossProfitPct * 100;
  return { totalValue, cogs, grossProfit, grossProfitPct, fcPct };
}

const BASIC_TOTALS = computeBaselineTotals(SCENARIO_BASELINE_PRODUCTS);
const BASIC_TOTAL_VALUE = BASIC_TOTALS.totalValue;
const BASIC_COGS = BASIC_TOTALS.cogs;
const BASIC_GROSS_PROFIT = BASIC_TOTALS.grossProfit;
const BASIC_GROSS_PROFIT_PCT = BASIC_TOTALS.grossProfitPct;
const BASIC_FC_PCT = BASIC_TOTALS.fcPct;

// Λίστα κατηγοριών του τιμοκαταλόγου — για το multi-select "εφαρμογή μόνο σε κατηγορίες".
const ALL_CATEGORIES = Array.from(new Set(SCENARIO_BASELINE_PRODUCTS.map((p) => p.cat))).sort((a, b) => a.localeCompare(b, 'el'));

// Εκτιμώμενος αριθμός ατόμων στα κεντρικά γραφεία (Gefsinus Kryoneri Q&F) — το κατάστημα από
// όπου προέρχονται οι ΠΡΑΓΜΑΤΙΚΕΣ ποσότητες Ιουνίου (juneQty) που χρησιμοποιούνται σαν βάση σε
// όλα τα σενάρια. Χρησιμεύει ΜΟΝΟ ως σημείο αναφοράς: ένα κτίριο νέου πελάτη με περισσότερα ή
// λιγότερα άτομα αναμένεται λογικά να έχει ανάλογα μεγαλύτερη ή μικρότερη ζήτηση.
const REFERENCE_BUILDING_PEOPLE = 200;

const DEFAULT_CUSTOMER_MESSAGE_EL =
  'Η εταιρία σας φροντίζει για εσάς! Απολαύστε φρέσκα, ποιοτικά γεύματα σε προνομιακές τιμές, κάθε μέρα στον χώρο εργασίας σας.';

function emptyDraft() {
  return {
    name: '',
    notes: '',
    mode: 'subsidy', // 'subsidy' | 'discount'
    subsidyAmount: 0,
    volumeGrowthPct: 0,
    destructionPct: 0,
    buildingPeople: REFERENCE_BUILDING_PEOPLE,
    discountPct: 0,
    selectedCategories: [],
    categoryDiscounts: {},
    productPriceOverrides: {},
    customerCompanyName: '',
    customerMessage: DEFAULT_CUSTOMER_MESSAGE_EL
  };
}

// Στρογγυλοποίηση ΠΑΝΤΑ προς τα πάνω, στο κοντινότερο 0,10€ (π.χ. 1,73€ → 1,80€).
function roundUpToDime(x) {
  return Math.ceil(x * 10 - 1e-6) / 10;
}

// Μία ενιαία λογική, σε μηνιαία βάση: η επιδότηση (σε €) που παίρνεις ΚΑΘΕ ΜΗΝΑ μετατρέπεται
// σε ΕΝΑ ποσοστό έκπτωσης πάνω στον πραγματικό μηνιαίο τζίρο Ιουνίου (BASIC_TOTAL_VALUE), και
// το ποσοστό αυτό εφαρμόζεται εξίσου σε ΟΛΕΣ τις τιμές BASIC — και των 128 προϊόντων, ακόμα κι
// αυτών που δεν πουλήθηκαν τον Ιούνιο. Κάθε νέα τιμή στρογγυλοποιείται προς τα πάνω στο
// κοντινότερο 0,10€.
//
// Αύξηση Πωλήσεων % (volumeGrowthPct): αν περιμένεις οι πωλήσεις να αυξηθούν λόγω της
// χαμηλότερης τιμής, η ΣΤΑΘΕΡΗ επιδότηση δεν αρκεί πια να καλύψει την ίδια % έκπτωση σε
// μεγαλύτερο όγκο. Γι' αυτό, όταν δίνεις ποσοστό αύξησης, η βάση υπολογισμού της έκπτωσης
// προσαρμόζεται αναλογικά προς τα ΠΑΝΩ (σαν να μοιράζεις την ίδια επιδότηση σε μεγαλύτερο
// τζίρο) — αποτέλεσμα: μικρότερη % έκπτωση, άρα ΨΗΛΟΤΕΡΗ προτεινόμενη τιμή, ακριβώς όσο
// χρειάζεται ώστε η σταθερή επιδότηση να συνεχίζει να καλύπτει ΠΛΗΡΩΣ την έκπτωση στον νέο
// όγκο — δεν χάνεις χρήματα όσο μεγαλώνουν οι πωλήσεις. Η στρογγυλοποίηση προς τα πάνω στο
// 0,10€ δίνει μάλιστα ένα μικρό επιπλέον περιθώριο υπέρ σου (το "erosion" παρακάτω βγαίνει
// μηδέν ή ελαφρώς αρνητικό, δηλαδή μικρό όφελος, ποτέ πραγματική απώλεια).
//
// Καταστροφές % (destructionPct): εκτιμώμενο ποσοστό του κόστους πωλήσεων (BASIC_COGS) που
// χάνεται κάθε μήνα σε ληγμένα/καταστραμμένα προϊόντα — πραγματικό κόστος χωρίς αντίστοιχο
// τζίρο. Δεν υπάρχουν αξιόπιστα πραγματικά δεδομένα καταστροφών Ιουνίου (ούτε στη βάση, ούτε
// στο Excel του σεναρίου), οπότε είναι ΧΕΙΡΟΚΙΝΗΤΗ εκτίμηση του χρήστη. Αντιμετωπίζεται ΑΚΡΙΒΩΣ
// όπως η Αύξηση Πωλήσεων: η επιδότηση πρέπει πρώτα να καλύψει το εκτιμώμενο κόστος καταστροφών
// και ό,τι απομείνει χρηματοδοτεί την έκπτωση τιμής — άρα ΜΙΚΡΟΤΕΡΗ έκπτωση, ΨΗΛΟΤΕΡΗ τιμή, όσο
// μεγαλώνει το ποσοστό καταστροφών. Έτσι η σταθερή επιδότηση συνεχίζει να καλύπτει ΠΛΗΡΩΣ και
// την έκπτωση και το εκτιμώμενο κόστος καταστροφών.
//
// Άτομα στο Κτίριο Πελάτη (buildingPeople): σε σχέση με τα κεντρικά γραφεία (πηγή του juneQty,
// ~REFERENCE_BUILDING_PEOPLE άτομα). ΠΡΟΣΟΧΗ — αντίθετα από την Αύξηση Πωλήσεων % και τις
// Καταστροφές %, αυτός ο παράγοντας ΔΕΝ αλλάζει την υπόθεση για τον πραγματικό όγκο πωλήσεων
// (grownQty) — μόνο πόσο απ' την επιδότηση "ξεκλειδώνεται" για την έκπτωση τιμής. Λιγότερα
// άτομα → μικρότερο κτίριο/πελάτης → πιο ΣΥΝΤΗΡΗΤΙΚΗ (μικρότερη) έκπτωση, ΨΗΛΟΤΕΡΗ τιμή.
// Περισσότερα άτομα → μεγαλύτερος πελάτης → μεγαλύτερη έκπτωση, χαμηλότερη τιμή. Επειδή αυτό
// ΔΕΝ συνδέεται με απόδειξη πραγματικού όγκου, η κάρτα "Επιβεβαίωση Κάλυψης Επιδότησης" θα
// δείξει ΕΙΛΙΚΡΙΝΑ πραγματικό κόστος (θετικό erosion) αν δώσεις μεγαλύτερη έκπτωση σε μεγάλο
// κτίριο χωρίς να έχεις υποθέσει αντίστοιχη Αύξηση Πωλήσεων % — έτσι βλέπεις τον πραγματικό
// κίνδυνο αντί να κρύβεται.
function computeSubsidyScenario(subsidyAmount, volumeGrowthPct, destructionPct, buildingPeople, selectedCategories, baselineProducts = SCENARIO_BASELINE_PRODUCTS, basicTotals = BASIC_TOTALS) {
  const BASIC_COGS_ACTIVE = basicTotals.cogs;
  const BASIC_TOTAL_VALUE_ACTIVE = basicTotals.totalValue;
  const amount = Number(subsidyAmount) || 0;
  const growthPct = Number(volumeGrowthPct) || 0;
  const growthFactor = 1 + growthPct / 100;
  const destrPct = Number(destructionPct) || 0;
  // Εκτιμώμενο μηνιαίο κόστος καταστροφών, ως ποσοστό επί του (σταθερού) κόστους πωλήσεων.
  const destructionCost = BASIC_COGS_ACTIVE * (destrPct / 100);
  // Ό,τι απομένει από την επιδότηση ΑΦΟΥ αφαιρεθεί το κόστος καταστροφών, χρηματοδοτεί την έκπτωση.
  const effectiveAmount = amount - destructionCost;

  const people = Number(buildingPeople) || REFERENCE_BUILDING_PEOPLE;
  const peopleFactor = REFERENCE_BUILDING_PEOPLE ? people / REFERENCE_BUILDING_PEOPLE : 1;
  // Το κτίριο ΔΕΝ επηρεάζει τη βάση όγκου — μόνο πόσο απ' την επιδότηση "ξεκλειδώνεται" εδώ.
  const unlockedAmount = effectiveAmount * peopleFactor;

  // Επιλογή κατηγοριών: αν ο πελάτης θέλει επιδότηση μόνο σε συγκεκριμένες κατηγορίες, η
  // βάση υπολογισμού της έκπτωσης περιορίζεται ΜΟΝΟ στην αξία αυτών των κατηγοριών — η ίδια
  // επιδότηση "απλώνεται" σε μικρότερο τζίρο, άρα μεγαλύτερη % έκπτωση εκεί μέσα. Τα προϊόντα
  // εκτός επιλεγμένων κατηγοριών ΔΕΝ επηρεάζονται — μένουν στην κανονική (BASIC) τιμή.
  const categoryList = Array.isArray(selectedCategories) ? selectedCategories.filter(Boolean) : [];
  const hasCategoryFilter = categoryList.length > 0;
  const categorySet = new Set(categoryList);
  const scopeTotals = hasCategoryFilter
    ? computeBaselineTotals(baselineProducts.filter((p) => categorySet.has(p.cat)))
    : basicTotals;

  // Βάση προσαρμοσμένη στην αναμενόμενη αύξηση όγκου — η ίδια επιδότηση "απλώνεται" σε
  // μεγαλύτερο τζίρο, άρα η % έκπτωση μικραίνει (η τιμή ανεβαίνει) όσο μεγαλώνει η αύξηση.
  const growthAdjustedBase = scopeTotals.totalValue * growthFactor;
  const rawDiscountPct = growthAdjustedBase ? unlockedAmount / growthAdjustedBase : 0;
  // Όταν η επιδότηση περιορίζεται σε λίγες κατηγορίες μικρής αξίας, το ποσό μπορεί να είναι
  // δυσανάλογα μεγάλο για εκείνη τη "μικρή πίτα" — χωρίς όριο, η έκπτωση θα ξεπερνούσε το 100%
  // και οι τιμές θα γίνονταν αρνητικές. Περιορίζουμε στο 90% ώστε οι τιμές να μένουν πάντα θετικές.
  const MAX_DISCOUNT_PCT = 0.9;
  const discountPct = Math.min(rawDiscountPct, MAX_DISCOUNT_PCT);
  const discountCapped = rawDiscountPct > MAX_DISCOUNT_PCT;

  let soldNetRevenue = 0;
  let grownNetRevenue = 0;
  let grownCOGS = 0;
  let grownRevenueNoDiscount = 0;

  const rows = baselineProducts.map((p) => {
    const inScope = !hasCategoryFilter || categorySet.has(p.cat);
    const newPrice = inScope ? roundUpToDime(p.basicPrice * (1 - discountPct)) : p.basicPrice;
    const newValue = (newPrice / 1.13) * p.juneQty;
    const diff = newValue - p.basicValue;
    soldNetRevenue += newValue;

    if (inScope) {
      const grownQty = p.juneQty * growthFactor;
      grownNetRevenue += (newPrice / 1.13) * grownQty;
      grownCOGS += p.ptk * grownQty;
      grownRevenueNoDiscount += (p.basicPrice / 1.13) * grownQty;
    }

    const fcBasic = p.basicPrice ? (p.ptk / (p.basicPrice / 1.13)) * 100 : NaN;
    const fcNew = newPrice ? (p.ptk / (newPrice / 1.13)) * 100 : NaN;
    // Πραγματικό % μείωσης ΑΝΑ προϊόν (μετά τη στρογγυλοποίηση προς τα πάνω στο 0,10€ —
    // γι' αυτό διαφέρει ελαφρώς προϊόν προς προϊόν από το γενικό ποσοστό discountPct).
    const pctOff = inScope && p.basicPrice ? ((p.basicPrice - newPrice) / p.basicPrice) * 100 : 0;

    return { ...p, newPrice, newValue, diff, fcBasic, fcNew, pctOff, inScope };
  });

  const grossProfit = soldNetRevenue - BASIC_COGS_ACTIVE;
  const grossProfitPct = soldNetRevenue ? grossProfit / soldNetRevenue : 0;
  const fcNewPct = 100 - grossProfitPct * 100;
  const revenueDrop = BASIC_TOTAL_VALUE_ACTIVE - soldNetRevenue; // πραγματική μείωση τζίρου, μετά τη στρογγυλοποίηση

  // F.C. Με Επιδότηση: το ίδιο κόστος (BASIC_COGS), αλλά η επιδότηση προστίθεται σαν να
  // ήταν κι αυτή τζίρος — δείχνει την ΠΡΑΓΜΑΤΙΚΗ εικόνα κόστους/εσόδων, αφού η επιδότηση
  // είναι πραγματικά χρήματα που μπαίνουν στην επιχείρηση κάθε μήνα μαζί με τις πωλήσεις.
  const revenueWithSubsidy = soldNetRevenue + amount;
  const fcWithSubsidyPct = revenueWithSubsidy ? (BASIC_COGS_ACTIVE / revenueWithSubsidy) * 100 : NaN;

  const grownGrossProfit = grownNetRevenue - grownCOGS; // μικτό κέρδος στον ΝΕΟ (αυξημένο) όγκο, με τη μειωμένη τιμή — μόνο εντός εύρους κατηγοριών
  // + η ΠΛΗΡΗΣ επιδότηση (πραγματικά χρήματα που μπαίνουν) − το εκτιμώμενο κόστος καταστροφών
  // (πραγματικό κόστος που φεύγει, χωρίς αντίστοιχο τζίρο).
  const totalWithSubsidy = grownGrossProfit + amount - destructionCost;
  const noDiscountGrownProfit = grownRevenueNoDiscount - grownCOGS; // υποθετικό: ίδιος αυξημένος όγκος, ΧΩΡΙΣ έκπτωση (εντός εύρους)
  const erosion = noDiscountGrownProfit - totalWithSubsidy; // πόσο "τρώει" η αύξηση όγκου/καταστροφές από την επιδότηση
  const netBenefitVsToday = totalWithSubsidy - scopeTotals.grossProfit; // vs το σημερινό μικτό κέρδος ΤΗΣ ΙΔΙΑΣ εμβέλειας (χωρίς σενάριο)

  return {
    rows,
    discountPct,
    netRevenue: soldNetRevenue,
    cogs: BASIC_COGS_ACTIVE,
    grossProfit,
    grossProfitPct,
    fcNewPct,
    fcWithSubsidyPct,
    revenueDrop,
    volumeGrowthPct: growthPct,
    destructionPct: destrPct,
    destructionCost,
    buildingPeople: people,
    peopleFactor,
    grownGrossProfit,
    totalWithSubsidy,
    erosion,
    netBenefitVsToday,
    hasCategoryFilter,
    selectedCategories: categoryList,
    scopeTotalValue: scopeTotals.totalValue,
    scopeGrossProfit: scopeTotals.grossProfit,
    discountCapped
  };
}

// Απλό μοντέλο "Ποσοστό Έκπτωσης" — χωρίς έννοια επιδότησης: ο χρήστης δίνει ένα ΓΕΝΙΚΟ
// ποσοστό έκπτωσης που εφαρμόζεται σε ΟΛΟ τον τιμοκατάλογο, με τη δυνατότητα να ορίσει
// ΔΙΑΦΟΡΕΤΙΚΟ ποσοστό για συγκεκριμένες κατηγορίες (categoryDiscounts) — οι κατηγορίες χωρίς
// δικό τους ποσοστό παίρνουν απλά το γενικό. Η εφαρμογή υπολογίζει όλη την υπόλοιπη
// πληροφορία (νέα τιμή, νέα αξία, F.C., μικτό κέρδος) όπως ακριβώς στο μοντέλο επιδότησης,
// απλά χωρίς αύξηση όγκου / καταστροφές / άτομα κτιρίου / κάλυψη επιδότησης.
function computeDiscountScenario(discountPctInput, categoryDiscounts, baselineProducts = SCENARIO_BASELINE_PRODUCTS, basicTotals = BASIC_TOTALS, productPriceOverrides = {}) {
  const BASIC_COGS_ACTIVE = basicTotals.cogs;
  const BASIC_TOTAL_VALUE_ACTIVE = basicTotals.totalValue;
  const MAX_DISCOUNT_PCT = 90;
  const rawGeneralPct = Number(discountPctInput) || 0;
  const generalPctClamped = Math.min(Math.max(rawGeneralPct, 0), MAX_DISCOUNT_PCT);
  const overrides = categoryDiscounts && typeof categoryDiscounts === 'object' ? categoryDiscounts : {};
  const priceOverrides = productPriceOverrides && typeof productPriceOverrides === 'object' ? productPriceOverrides : {};
  let discountCapped = rawGeneralPct > MAX_DISCOUNT_PCT || rawGeneralPct < 0;

  let soldNetRevenue = 0;
  let pctOffSum = 0;

  const rows = baselineProducts.map((p) => {
    // Καρφωτή τιμή ανά προϊόν (extra επιλογή) — αν υπάρχει, παρακάμπτει ΕΝΤΕΛΩΣ το γενικό/
    // ανά κατηγορία ποσοστό για αυτό το συγκεκριμένο προϊόν: η νέα τιμή είναι ΑΚΡΙΒΩΣ αυτή
    // που όρισε ο χρήστης, χωρίς στρογγυλοποίηση προς τα πάνω (είναι ήδη ρητή απόφαση).
    const priceOverrideRaw = priceOverrides[p.code];
    const hasPriceOverride = priceOverrideRaw !== undefined && priceOverrideRaw !== null && priceOverrideRaw !== '' && isFinite(Number(priceOverrideRaw)) && Number(priceOverrideRaw) > 0;

    const overrideRaw = overrides[p.cat];
    const hasOverride = overrideRaw !== undefined && overrideRaw !== null && overrideRaw !== '';
    const rawPct = hasOverride ? Number(overrideRaw) : rawGeneralPct;
    if (!hasPriceOverride && hasOverride && (rawPct > MAX_DISCOUNT_PCT || rawPct < 0 || !isFinite(rawPct))) discountCapped = true;
    const catPct = Math.min(Math.max(isFinite(rawPct) ? rawPct : 0, 0), MAX_DISCOUNT_PCT);
    const discountFrac = catPct / 100;

    const newPrice = hasPriceOverride ? Number(priceOverrideRaw) : roundUpToDime(p.basicPrice * (1 - discountFrac));
    const newValue = (newPrice / 1.13) * p.juneQty;
    const diff = newValue - p.basicValue;
    soldNetRevenue += newValue;

    const fcBasic = p.basicPrice ? (p.ptk / (p.basicPrice / 1.13)) * 100 : NaN;
    const fcNew = newPrice ? (p.ptk / (newPrice / 1.13)) * 100 : NaN;
    const pctOff = p.basicPrice ? ((p.basicPrice - newPrice) / p.basicPrice) * 100 : 0;
    pctOffSum += pctOff;

    return { ...p, newPrice, newValue, diff, fcBasic, fcNew, pctOff, inScope: true, appliedPct: catPct, hasOverride, hasPriceOverride };
  });

  const grossProfit = soldNetRevenue - BASIC_COGS_ACTIVE;
  const grossProfitPct = soldNetRevenue ? grossProfit / soldNetRevenue : 0;
  const fcNewPct = 100 - grossProfitPct * 100;
  const revenueDrop = BASIC_TOTAL_VALUE_ACTIVE - soldNetRevenue;
  const avgPctOff = rows.length ? pctOffSum / rows.length : 0;

  return {
    mode: 'discount',
    rows,
    discountPct: generalPctClamped / 100,
    avgPctOff,
    netRevenue: soldNetRevenue,
    cogs: BASIC_COGS_ACTIVE,
    grossProfit,
    grossProfitPct,
    fcNewPct,
    fcWithSubsidyPct: NaN,
    revenueDrop,
    hasCategoryFilter: Object.keys(overrides).some((k) => overrides[k] !== undefined && overrides[k] !== null && overrides[k] !== ''),
    categoryDiscounts: overrides,
    productPriceOverrides: priceOverrides,
    discountCapped
  };
}

// Dispatcher: επιλέγει το σωστό μοντέλο υπολογισμού βάσει του πεδίου mode του σεναρίου
// (παλιά αποθηκευμένα σενάρια δεν έχουν mode — θεωρούνται 'subsidy' για συμβατότητα).
function computeScenario(sc, baselineProducts = SCENARIO_BASELINE_PRODUCTS, basicTotals = BASIC_TOTALS) {
  if (sc && sc.mode === 'discount') {
    return computeDiscountScenario(sc.discountPct, sc.categoryDiscounts, baselineProducts, basicTotals, sc.productPriceOverrides);
  }
  return computeSubsidyScenario(sc.subsidyAmount, sc.volumeGrowthPct, sc.destructionPct, sc.buildingPeople, sc.selectedCategories, baselineProducts, basicTotals);
}

export default function ScenariosView({ readOnly = false, canDelete = false, active = true }) {
  const { t, lang } = useLanguage();
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | draft object (μπορεί να έχει id)
  const [search, setSearch] = useState('');
  const [listSearch, setListSearch] = useState(''); // αναζήτηση στη λίστα σεναρίων (όχι στα προϊόντα)
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [liveProducts, setLiveProducts] = useState([]);

  // Το App.jsx κρατάει ΟΛΑ τα views "mounted" πάντα (εναλλαγή με CSS, όχι unmount) — χωρίς αυτό
  // το flag, τα 3 fetches παρακάτω (Σενάρια/Προϊόντα/Sales Analysis, το τελευταίο ~1450+ γραμμές)
  // θα έτρεχαν σε ΚΑΘΕ login/refresh, ακόμα κι αν ο χρήστης δεν άνοιξε ποτέ το tab "Σενάρια" —
  // αυτό επιβάρυνε αισθητά τη γενική ταχύτητα φόρτωσης της εφαρμογής. Το `active` (view ===
  // 'scenarios' από το App.jsx) ενεργοποιεί τα fetches ΜΟΝΟ την πρώτη φορά που πραγματικά
  // ανοίγει κανείς αυτό το tab· μετά μένει ενεργό (hasActivated), ώστε η εναλλαγή tabs να μην
  // ξαναφορτώνει τα δεδομένα από την αρχή.
  const [hasActivated, setHasActivated] = useState(active);
  useEffect(() => { if (active) setHasActivated(true); }, [active]);

  function load() {
    setLoading(true);
    PricingScenarios.list()
      .then((rows) => { setScenarios(rows); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }

  useEffect(() => { if (hasActivated) load(); }, [hasActivated]);

  // Κόστος (cost.ptk) και κατηγορία (categoryGr) τραβιούνται ΖΩΝΤΑΝΑ από το Προϊόντα (πίνακας
  // products), όχι πια από το στατικό snapshot Excel. Η ΤΙΜΗ όμως (basicPrice) ΔΕΝ τραβιέται
  // ζωντανά — μένει ΠΑΝΤΑ η στατική τιμή του τιμοκαταλόγου BASIC (δες mergedBaseline παρακάτω
  // για το γιατί). Η ποσότητα αναφοράς (juneQty) παραμένει στατική για το "τρέχον" σενάριο (ο
  // πραγματικός τζίρος Ιουνίου) — το "Μηνιαίο Breakdown" παρακάτω χρησιμοποιεί ΠΡΑΓΜΑΤΙΚΕΣ
  // μηνιαίες ποσότητες ανά προϊόν (μέσω scancode/barcode, δες computeMonthlyQtyByScancode) για
  // ΟΣΑ προϊόντα ταιριάζουν, με εκτίμηση (γενικός λόγος όγκου) μόνο για όσα δεν ταιριάζουν. Αν
  // λείπει κόστος από ένα live προϊόν, γίνεται fallback στο στατικό.
  useEffect(() => {
    if (!hasActivated) return;
    Products.list()
      .then(setLiveProducts)
      .catch(() => setLiveProducts([])); // σιωπηλό fallback στο στατικό αρχείο αν αποτύχει
  }, [hasActivated]);

  // Για το "Μηνιαίο Breakdown" του σεναρίου Επιδότησης — πραγματικές μηνιαίες ποσότητες
  // από το ίδιο Sales Analysis Report που τροφοδοτεί τον Πίνακα Ελέγχου.
  const [salesProductsData, setSalesProductsData] = useState([]);
  useEffect(() => {
    if (!hasActivated) return;
    SalesProducts.list()
      .then(setSalesProductsData)
      .catch(() => setSalesProductsData([]));
  }, [hasActivated]);

  const mergedBaseline = useMemo(() => {
    if (!liveProducts.length) return SCENARIO_BASELINE_PRODUCTS;
    // Χαρτογράφηση με κωδικό (trim, γιατί μερικοί κωδικοί στο Προϊόντα έχουν κενά) — αν υπάρχουν
    // διπλότυπες καταχωρήσεις για τον ίδιο κωδικό, προτιμάται αυτή που έχει πραγματικό κόστος (ptk).
    const byCode = new Map();
    liveProducts.forEach((p) => {
      const key = (p.itemCode || '').trim();
      if (!key) return;
      const existing = byCode.get(key);
      const hasPtk = Number(p.cost?.ptk) > 0;
      if (!existing || (hasPtk && !(Number(existing.cost?.ptk) > 0))) {
        byCode.set(key, p);
      }
    });
    return SCENARIO_BASELINE_PRODUCTS.map((p) => {
      const live = byCode.get(p.code);
      if (!live) return p;
      const liveCost = live.cost || {};
      // Η ΤΙΜΗ (basicPrice) ΔΕΝ αντικαθίσταται από το ζωντανό Προϊόντα -> Cost -> Τιμή: σε
      // αρκετά προϊόντα εκείνο το πεδίο έχει ενημερωθεί ώστε να δείχνει την πραγματική τιμή σε
      // ΕΝΑ συγκεκριμένο κατάστημα (π.χ. Τιμή Store/Q&F ενός καταστήματος), όχι τον ουδέτερο
      // τιμοκατάλογο BASIC — αν το τραβούσαμε ζωντανά, ο "Καθ. Τζίρος" των Σεναρίων θα άλλαζε
      // ανάλογα με το ποιο κατάστημα ενημερώθηκε τελευταίο. Το κόστος (ptk) και η κατηγορία
      // παραμένουν ζωντανά, γιατί δεν εμφανίζουν το ίδιο πρόβλημα.
      const ptk = Number(liveCost.ptk) > 0 ? Number(liveCost.ptk) : p.ptk;
      const cat = live.categoryGr || p.cat;
      const desc = live.descriptionGr || p.desc;
      const basicValue = (p.basicPrice / 1.13) * p.juneQty;
      return { ...p, ptk, cat, desc, basicValue };
    });
  }, [liveProducts]);

  const mergedTotals = useMemo(() => computeBaselineTotals(mergedBaseline), [mergedBaseline]);

  const mergedCategories = useMemo(
    () => Array.from(new Set(mergedBaseline.map((p) => p.cat))).sort((a, b) => a.localeCompare(b, 'el')),
    [mergedBaseline]
  );

  const preview = useMemo(
    () => (editing ? computeScenario(editing, mergedBaseline, mergedTotals) : null),
    [editing, mergedBaseline, mergedTotals]
  );

  // --- Μηνιαίο Breakdown (μόνο mode 'subsidy') ---------------------------------
  // Χαρτογράφηση Scancode (Sales Analysis Report) -> itemCode (τιμοκατάλογος), μέσω
  // των barcodes[] του κάθε live προϊόντος — ίδιο πεδίο που ήδη χρησιμοποιεί η
  // Καταχώρηση/Καταστροφή για αναγνώριση προϊόντος από σκαναρισμένο barcode.
  const barcodeToItemCode = useMemo(() => {
    const map = {};
    liveProducts.forEach((p) => {
      const code = (p.itemCode || '').trim();
      if (!code) return;
      (p.barcodes || []).forEach((b) => {
        const bc = (b || '').trim();
        if (bc && !map[bc]) map[bc] = code;
      });
    });
    return map;
  }, [liveProducts]);

  // Για κάθε μήνα που έχει πραγματικά δεδομένα ποσότητας στο Sales Analysis Report,
  // ξαναϋπολογίζουμε ΟΛΟΚΛΗΡΟ το σενάριο σαν να είχε γίνει εκείνον τον μήνα. Σειρά
  // προτεραιότητας ανά προϊόν: (1) itemCode (Userkey, άμεσο ταίριασμα κωδικού — πιο
  // αξιόπιστο), (2) scancode -> barcode -> itemCode (για γραμμές χωρίς Userkey), (3)
  // εκτίμηση με τον γενικό λόγο όγκου (συνολικός πραγματικός όγκος μήνα / συνολικό
  // juneQty βάσης), όταν δεν ταιριάζει τίποτα. isRealQty: true μόνο για (1)/(2).
  const monthlyQtyList = useMemo(() => computeMonthlyQtyByScancode(salesProductsData), [salesProductsData]);
  // Αν όλοι οι μήνες προέρχονται στην πραγματικότητα από ΕΝΑ upload/period (π.χ. το πιο
  // πρόσφατο Sales Analysis Report καλύπτει μόνο του "01/05 έως 09/09"), δείχνουμε σαφή
  // προειδοποίηση στο Μηνιαίο Breakdown — δες detectSingleConsolidatedPeriod παραπάνω.
  const singleConsolidatedPeriod = useMemo(() => detectSingleConsolidatedPeriod(monthlyQtyList), [monthlyQtyList]);
  const baselineJuneQtyTotal = useMemo(
    () => mergedBaseline.reduce((s, p) => s + (Number(p.juneQty) || 0), 0),
    [mergedBaseline]
  );
  const monthlyBreakdown = useMemo(() => {
    if (!editing || editing.mode === 'discount' || !baselineJuneQtyTotal || !monthlyQtyList.length) return [];
    return monthlyQtyList.map(({ monthKey, totalQty, periodTexts, byItemCode, byScancode }) => {
      const ratio = totalQty / baselineJuneQtyTotal;
      const { scaledBaseline, matchedCount, totalCount } = buildScaledBaselineForMonth(mergedBaseline, ratio, byItemCode, byScancode, barcodeToItemCode);
      const scaledTotals = computeBaselineTotals(scaledBaseline);
      const result = computeSubsidyScenario(
        editing.subsidyAmount,
        editing.volumeGrowthPct,
        editing.destructionPct,
        editing.buildingPeople,
        editing.selectedCategories,
        scaledBaseline,
        scaledTotals
      );
      return { monthKey, totalQty: Math.round(totalQty), ratio, periodTexts, result, matchedCount, totalCount };
    });
  }, [editing, mergedBaseline, baselineJuneQtyTotal, monthlyQtyList, barcodeToItemCode]);

  // Ποιος μήνας προβάλλεται αυτή τη στιγμή στον πίνακα τιμοκαταλόγου παρακάτω —
  // null σημαίνει "τρέχον" (η στατική βάση Ιουνίου, όπως πριν).
  const [viewMonthKey, setViewMonthKey] = useState(null);
  const activeMonthEntry = useMemo(
    () => (viewMonthKey ? monthlyBreakdown.find((m) => m.monthKey === viewMonthKey) : null),
    [viewMonthKey, monthlyBreakdown]
  );
  const activePreview = activeMonthEntry ? activeMonthEntry.result : preview;

  // --- Ίδιο Μηνιαίο Breakdown, αλλά για την κάρτα "BASIC (Χωρίς Επιδότηση)" της αρχικής
  // οθόνης (πριν ανοίξει κανένα σενάριο) — δεν χρειάζεται computeSubsidyScenario, μόνο τα
  // σύνολα (τζίρος/κόστος/μικτό κέρδος/F.C.) πάνω στην κλιμακωμένη βάση κάθε μήνα.
  const baselineMonthlyBreakdown = useMemo(() => {
    if (!baselineJuneQtyTotal || !monthlyQtyList.length) return [];
    return monthlyQtyList.map(({ monthKey, totalQty, periodTexts, byItemCode, byScancode }) => {
      const ratio = totalQty / baselineJuneQtyTotal;
      const { scaledBaseline, matchedCount, totalCount } = buildScaledBaselineForMonth(mergedBaseline, ratio, byItemCode, byScancode, barcodeToItemCode);
      const totals = computeBaselineTotals(scaledBaseline);
      return { monthKey, totalQty: Math.round(totalQty), ratio, periodTexts, totals, matchedCount, totalCount };
    });
  }, [mergedBaseline, baselineJuneQtyTotal, monthlyQtyList, barcodeToItemCode]);

  const [baselineViewMonthKey, setBaselineViewMonthKey] = useState(null);
  const activeBaselineMonthEntry = useMemo(
    () => (baselineViewMonthKey ? baselineMonthlyBreakdown.find((m) => m.monthKey === baselineViewMonthKey) : null),
    [baselineViewMonthKey, baselineMonthlyBreakdown]
  );
  const activeBaselineTotals = activeBaselineMonthEntry ? activeBaselineMonthEntry.totals : mergedTotals;

  function startNew() {
    setSaveError('');
    setSearch('');
    setViewMonthKey(null);
    setEditing(emptyDraft());
  }

  function startEdit(sc) {
    setSaveError('');
    setSearch('');
    setViewMonthKey(null);
    setEditing({ ...emptyDraft(), ...sc });
  }

  // Αντιγραφή ενός ήδη αποθηκευμένου σεναρίου (π.χ. μιας προσφοράς που έχει ήδη
  // σταλεί) σε ένα ΝΕΟ σενάριο — ίδιες τιμές αρχικά, αλλά χωρίς id/createdAt, ώστε το
  // save() να δημιουργήσει ξεχωριστή εγγραφή αντί να ενημερώσει το πρωτότυπο. Έτσι
  // μένουν και τα δύο στη λίστα, το καθένα με τη δική του ημερομηνία δημιουργίας, και
  // το αντίγραφο μπορεί να αλλάξει ελεύθερα τιμές χωρίς να πειράξει το αρχικό.
  function startClone(sc) {
    setSaveError('');
    setSearch('');
    setViewMonthKey(null);
    const { id, createdAt, createdBy, createdByEmail, ...rest } = sc;
    setEditing({
      ...emptyDraft(),
      ...rest,
      name: `${sc.name || ''} ${t('sc_clone_suffix')}`.trim()
    });
  }

  function cancelEdit() {
    setEditing(null);
    setSaveError('');
    setViewMonthKey(null);
  }

  async function save() {
    if (!editing.name || !editing.name.trim()) {
      setSaveError(t('sc_name_required_error'));
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        name: editing.name,
        notes: editing.notes || '',
        mode: editing.mode === 'discount' ? 'discount' : 'subsidy',
        subsidyAmount: Number(editing.subsidyAmount) || 0,
        volumeGrowthPct: Number(editing.volumeGrowthPct) || 0,
        destructionPct: Number(editing.destructionPct) || 0,
        buildingPeople: Number(editing.buildingPeople) || REFERENCE_BUILDING_PEOPLE,
        discountPct: Number(editing.discountPct) || 0,
        selectedCategories: Array.isArray(editing.selectedCategories) ? editing.selectedCategories : [],
        categoryDiscounts: (editing.categoryDiscounts && typeof editing.categoryDiscounts === 'object')
          ? Object.fromEntries(
              Object.entries(editing.categoryDiscounts).filter(([, v]) => v !== '' && v !== null && v !== undefined)
            )
          : {},
        productPriceOverrides: (editing.productPriceOverrides && typeof editing.productPriceOverrides === 'object')
          ? Object.fromEntries(
              Object.entries(editing.productPriceOverrides).filter(([, v]) => v !== '' && v !== null && v !== undefined)
            )
          : {},
        customerCompanyName: editing.customerCompanyName || '',
        customerMessage: editing.customerMessage || DEFAULT_CUSTOMER_MESSAGE_EL
      };
      if (editing.id) {
        await PricingScenarios.update(editing.id, body);
      } else {
        await PricingScenarios.create(body);
      }
      setEditing(null);
      load();
    } catch (err) {
      setSaveError((t('sc_save_error_prefix') || '') + ' ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm(t('sc_delete_confirm'))) return;
    try {
      await PricingScenarios.remove(id);
      load();
    } catch (err) {
      alert(err.message || err);
    }
  }

  // Εξαγωγή τιμοκαταλόγου σε PDF, έτοιμο να σταλεί σε πελάτη — ΜΟΝΟ πληροφορίες τιμής
  // (Παλιά/Νέα Τιμή, % Μείωσης), ΚΑΝΕΝΑ εσωτερικό στοιχείο κόστους/περιθωρίου/F.C.
  function exportCustomerPDF() {
    if (!preview) return;
    const doc = new jsPDF({ orientation: 'portrait' });
    doc.addFileToVFS('DejaVuSans.ttf', DEJAVU_SANS_BASE64);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.setFont('DejaVuSans', 'normal');

    const pageWidth = doc.internal.pageSize.getWidth();
    const logoSize = 30;
    doc.addImage(QUICKFRESH_LOGO_BASE64, 'PNG', 14, 10, logoSize, logoSize);

    doc.setFontSize(13);
    doc.setTextColor(22, 35, 63);
    doc.text(t('sc_pdf_title'), 14, logoSize + 18);

    const dateText = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'el-GR');
    const companyName = (editing.customerCompanyName || '').trim();

    // Επωνυμία πελάτη — εμφανίζεται πρώτη και πιο έντονα, με το όνομα σεναρίου/ημερομηνία δίπλα.
    doc.setFontSize(18);
    doc.setTextColor(47, 143, 138);
    doc.text(companyName || editing.name || '', 14, logoSize + 28);

    doc.setFontSize(9.5);
    doc.setTextColor(107, 118, 132);
    doc.text(`${editing.name || ''} — ${dateText}`, 14, logoSize + 34);

    let cursorY = logoSize + 42;

    // Δύο καλά λόγια για την υπηρεσία — μήνυμα προς τους υπαλλήλους του πελάτη.
    const message = (editing.customerMessage || DEFAULT_CUSTOMER_MESSAGE_EL).trim();
    if (message) {
      doc.setFontSize(10);
      doc.setTextColor(22, 35, 63);
      const messageLines = doc.splitTextToSize(message, pageWidth - 28);
      doc.text(messageLines, 14, cursorY);
      cursorY += messageLines.length * 4.6 + 4;
    }

    // Ποσό Επιδότησης + Μέσος Όρος Μείωσης Τιμής — δύο κουτιά δίπλα-δίπλα.
    // Ο Μ.Ο. υπολογίζεται ΜΟΝΟ στα προϊόντα που πραγματικά επηρεάζονται από την επιδότηση
    // (inScope) — αν υπάρχει φίλτρο κατηγοριών, τα εκτός κατηγορίας δεν "αραιώνουν" το ποσοστό.
    const inScopeRowsForAvg = preview.rows.filter((r) => r.inScope);
    const avgPctOff = inScopeRowsForAvg.length
      ? inScopeRowsForAvg.reduce((s, r) => s + r.pctOff, 0) / inScopeRowsForAvg.length
      : 0;
    const boxHeight = 14;
    const isDiscountMode = editing.mode === 'discount';
    if (isDiscountMode) {
      const boxWidth = pageWidth - 28;
      doc.setFillColor(240, 248, 247);
      doc.roundedRect(14, cursorY, boxWidth, boxHeight, 2, 2, 'F');
      doc.setFontSize(9.5);
      doc.setTextColor(47, 143, 138);
      doc.text(t('sc_discount_pct_label'), 18, cursorY + 6);
      doc.setFontSize(13);
      doc.setTextColor(22, 35, 63);
      doc.text('−' + fmtNum(avgPctOff, 1) + '%', 18, cursorY + 11.5);
    } else {
      const boxGap = 6;
      const boxWidth = (pageWidth - 28 - boxGap) / 2;
      doc.setFillColor(240, 248, 247);
      doc.roundedRect(14, cursorY, boxWidth, boxHeight, 2, 2, 'F');
      doc.roundedRect(14 + boxWidth + boxGap, cursorY, boxWidth, boxHeight, 2, 2, 'F');
      doc.setFontSize(9.5);
      doc.setTextColor(47, 143, 138);
      doc.text(t('sc_pdf_subsidy_amount_label'), 18, cursorY + 6);
      doc.text(t('sc_pdf_avg_discount_label'), 18 + boxWidth + boxGap, cursorY + 6);
      doc.setFontSize(13);
      doc.setTextColor(22, 35, 63);
      doc.text(fmtEuro(Number(editing.subsidyAmount) || 0), 18, cursorY + 11.5);
      doc.text('−' + fmtNum(avgPctOff, 1) + '%', 18 + boxWidth + boxGap, cursorY + 11.5);
    }
    cursorY += boxHeight + 6;

    doc.setFontSize(9.5);
    doc.setTextColor(22, 35, 63);
    const noteLines = doc.splitTextToSize(t(isDiscountMode ? 'sc_pdf_note_discount' : 'sc_pdf_note'), pageWidth - 28);
    doc.text(noteLines, 14, cursorY);
    cursorY += noteLines.length * 4.4 + 4;

    const sortedRows = [...preview.rows].sort((a, b) => {
      if (a.cat !== b.cat) return a.cat.localeCompare(b.cat, 'el');
      return a.desc.localeCompare(b.desc, 'el');
    });

    autoTable(doc, {
      startY: cursorY,
      head: [[t('sc_col_code'), t('sc_col_desc'), t('sc_col_cat'), t('sc_pdf_col_old_price'), t('sc_pdf_col_new_price'), t('sc_col_pct_off')]],
      body: sortedRows.map((r) => [
        r.code,
        r.desc,
        r.cat,
        fmtEuro(r.basicPrice),
        fmtEuro(r.newPrice),
        r.inScope ? '−' + fmtNum(r.pctOff, 1) + '%' : '—'
      ]),
      styles: { fontSize: 8, cellPadding: 2, font: 'DejaVuSans' },
      headStyles: { fillColor: [47, 143, 138], font: 'DejaVuSans' },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right', textColor: [47, 143, 138], fontStyle: 'bold' },
        5: { halign: 'right', textColor: [47, 143, 138] }
      },
      didDrawPage: () => {
        doc.setFont('DejaVuSans', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(151, 162, 176);
        doc.text('Quick & Fresh smart store by gefsinus', 14, doc.internal.pageSize.getHeight() - 8);
      }
    });

    const slug = (companyName || editing.name || 'senario')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'senario';
    doc.save(`quick-fresh-timokatalogos-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // Εξαγωγή PDF ΜΟΝΟ για εσωτερική χρήση — προς έγκριση από διευθυντή πριν σταλεί οτιδήποτε
  // στον πελάτη. Δείχνει ΟΛΑ τα εσωτερικά οικονομικά στοιχεία (κόστος, περιθώριο, F.C.,
  // κάλυψη επιδότησης) — ΔΕΝ προορίζεται για τον πελάτη.
  function exportManagerPDF() {
    if (!preview) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.addFileToVFS('DejaVuSans.ttf', DEJAVU_SANS_BASE64);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.setFont('DejaVuSans', 'normal');

    const pageWidth = doc.internal.pageSize.getWidth();
    const logoSize = 24;
    doc.addImage(QUICKFRESH_LOGO_BASE64, 'PNG', 14, 10, logoSize, logoSize);

    const isDiscountModeMgr = editing.mode === 'discount';

    doc.setFontSize(13);
    doc.setTextColor(22, 35, 63);
    doc.text(t(isDiscountModeMgr ? 'sc_pdf_manager_title_discount' : 'sc_pdf_manager_title'), 14, logoSize + 16);

    const dateText = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'el-GR');
    const companyName = (editing.customerCompanyName || '').trim();
    doc.setFontSize(10);
    doc.setTextColor(107, 118, 132);
    doc.text(`${editing.name || ''}${companyName ? ' — ' + companyName : ''} — ${dateText}`, 14, logoSize + 23);

    doc.setFontSize(8.5);
    doc.setTextColor(192, 57, 43);
    doc.text(t('sc_pdf_manager_internal_note'), 14, logoSize + 29);

    let cursorY = logoSize + 38;

    const catsLabel = Array.isArray(editing.selectedCategories) && editing.selectedCategories.length
      ? editing.selectedCategories.join(', ')
      : t('sc_pdf_manager_all_categories');

    // Σε discount mode: γενικό ποσοστό + μία γραμμή ανά κατηγορία που έχει δικό της
    // ξεχωριστό ποσοστό (override) — οι υπόλοιπες κατηγορίες παίρνουν σιωπηρά το γενικό.
    const categoryDiscountEntries = Object.entries(editing.categoryDiscounts || {}).filter(
      ([, v]) => v !== '' && v !== null && v !== undefined && isFinite(Number(v))
    );

    const paramRows = isDiscountModeMgr
      ? [
          [t('sc_discount_general_pct_label'), fmtNum(Number(editing.discountPct) || 0, 0) + '%'],
          ...categoryDiscountEntries.map(([cat, v]) => [cat, fmtNum(Number(v) || 0, 0) + '%'])
        ]
      : [
          [t('sc_subsidy_amount_label'), fmtEuro(Number(editing.subsidyAmount) || 0)],
          [t('sc_volume_growth_label'), fmtNum(preview.volumeGrowthPct, 0) + '%'],
          [t('sc_destruction_pct_label'), fmtNum(preview.destructionPct, 0) + '%'],
          [t('sc_building_people_label'), fmtNum(preview.buildingPeople, 0)],
          [t('sc_categories_label'), catsLabel]
        ];

    doc.setFontSize(10.5);
    doc.setTextColor(22, 35, 63);
    doc.text(t('sc_pdf_manager_params_title'), 14, cursorY);
    cursorY += 4;

    autoTable(doc, {
      startY: cursorY,
      body: paramRows,
      theme: 'plain',
      styles: { fontSize: 9.5, cellPadding: 1.5, font: 'DejaVuSans' },
      columnStyles: { 0: { textColor: [107, 118, 132], cellWidth: 70 }, 1: { textColor: [22, 35, 63], fontStyle: 'bold' } }
    });
    cursorY = doc.lastAutoTable.finalY + 8;

    // Μ.Ο. Μείωσης Τιμής — μόνο στα προϊόντα που πραγματικά επηρεάζονται (inScope), ίδιος
    // υπολογισμός με το PDF πελάτη, ώστε τα δύο PDF να συμφωνούν.
    const inScopeRowsForAvg = preview.rows.filter((r) => r.inScope);
    const avgPctOff = inScopeRowsForAvg.length
      ? inScopeRowsForAvg.reduce((s, r) => s + r.pctOff, 0) / inScopeRowsForAvg.length
      : 0;

    const resultRows = isDiscountModeMgr
      ? [
          [t('sc_net_revenue_label'), fmtEuro(preview.netRevenue)],
          [t('sc_pdf_avg_discount_label'), '−' + fmtNum(avgPctOff, 1) + '%'],
          [t('sc_actual_drop_label'), fmtEuro(preview.revenueDrop)],
          [t('sc_cogs_label'), fmtEuro(preview.cogs)],
          [t('sc_gross_profit_label') + ' (' + fmtPct1(preview.grossProfitPct) + ')', fmtEuro(preview.grossProfit)],
          [t('sc_fc_new_label') + ' (' + t('sc_fc_basic_label') + ': ' + fmtNum(mergedTotals.fcPct, 1) + '%)', fmtNum(preview.fcNewPct, 1) + '%']
        ]
      : [
          [t('sc_net_revenue_label'), fmtEuro(preview.netRevenue)],
          [t('sc_subsidy_label') + ' (−' + fmtPct1(preview.discountPct) + ')', fmtEuro(Number(editing.subsidyAmount) || 0)],
          [t('sc_pdf_avg_discount_label'), '−' + fmtNum(avgPctOff, 1) + '%'],
          [t('sc_actual_drop_label'), fmtEuro(preview.revenueDrop)],
          [t('sc_cogs_label'), fmtEuro(preview.cogs)],
          [t('sc_gross_profit_label') + ' (' + fmtPct1(preview.grossProfitPct) + ')', fmtEuro(preview.grossProfit)],
          [t('sc_fc_new_label') + ' (' + t('sc_fc_basic_label') + ': ' + fmtNum(mergedTotals.fcPct, 1) + '%)', fmtNum(preview.fcNewPct, 1) + '%'],
          [t('sc_fc_with_subsidy_label'), isFinite(preview.fcWithSubsidyPct) ? fmtNum(preview.fcWithSubsidyPct, 1) + '%' : '—']
        ];

    doc.setFontSize(10.5);
    doc.setTextColor(22, 35, 63);
    doc.text(t('sc_live_summary_title'), 14, cursorY);
    cursorY += 4;

    autoTable(doc, {
      startY: cursorY,
      body: resultRows,
      theme: 'plain',
      styles: { fontSize: 9.5, cellPadding: 1.5, font: 'DejaVuSans' },
      columnStyles: { 0: { textColor: [107, 118, 132], cellWidth: 110 }, 1: { textColor: [22, 35, 63], fontStyle: 'bold', halign: 'right' } }
    });
    cursorY = doc.lastAutoTable.finalY + 8;

    if (!isDiscountModeMgr) {
      const coverageRows = [
        [t('sc_destruction_cost_label') + ' (' + fmtNum(preview.destructionPct, 0) + '%)', fmtEuro(preview.destructionCost)],
        [t('sc_grown_profit_label'), fmtEuro(preview.totalWithSubsidy)],
        [t('sc_erosion_label'), fmtSignedCost(preview.erosion)],
        [t('sc_net_benefit_label'), fmtEuro(preview.netBenefitVsToday)]
      ];

      doc.setFontSize(10.5);
      doc.setTextColor(22, 35, 63);
      doc.text(t('sc_sensitivity_title'), 14, cursorY);
      cursorY += 4;

      autoTable(doc, {
        startY: cursorY,
        body: coverageRows,
        theme: 'plain',
        styles: { fontSize: 9.5, cellPadding: 1.5, font: 'DejaVuSans' },
        columnStyles: { 0: { textColor: [107, 118, 132], cellWidth: 110 }, 1: { textColor: [22, 35, 63], fontStyle: 'bold', halign: 'right' } },
        didDrawPage: () => {
          doc.setFont('DejaVuSans', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(151, 162, 176);
          doc.text('Quick & Fresh smart store by gefsinus — ' + t('sc_pdf_manager_internal_note'), 14, doc.internal.pageSize.getHeight() - 8);
        }
      });
      cursorY = doc.lastAutoTable.finalY + 16;
    } else {
      cursorY += 16;
    }

    // Γραμμές έγκρισης — υπογραφή/ημερομηνία.
    if (cursorY > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      cursorY = 20;
    }
    doc.setDrawColor(200, 205, 212);
    doc.setFontSize(9.5);
    doc.setTextColor(107, 118, 132);
    doc.text(t('sc_pdf_manager_approval_label'), 14, cursorY);
    doc.line(14, cursorY + 14, 90, cursorY + 14);
    doc.text(t('sc_pdf_manager_signature_label'), 14, cursorY + 19);
    doc.line(pageWidth - 76, cursorY + 14, pageWidth - 14, cursorY + 14);
    doc.text(t('sc_pdf_manager_date_label'), pageWidth - 76, cursorY + 19);

    // Αναλυτικός τιμοκατάλογος — ΟΛΕΣ οι στήλες, ίδιες με τη φόρμα επεξεργασίας σεναρίου
    // (128 προϊόντα, ό,τι εσωτερικό στοιχείο βλέπεις κι εκεί) — σε νέα σελίδα, για τον διευθυντή.
    doc.addPage();
    let tableY = 16;
    doc.setFontSize(12);
    doc.setTextColor(22, 35, 63);
    doc.text(t('sc_pdf_manager_pricelist_title'), 14, tableY);
    tableY += 6;

    const sortedRowsFull = [...preview.rows].sort((a, b) => {
      if (a.cat !== b.cat) return a.cat.localeCompare(b.cat, 'el');
      return a.desc.localeCompare(b.desc, 'el');
    });

    autoTable(doc, {
      startY: tableY,
      head: [[
        t('sc_col_code'), t('sc_col_desc'), t('sc_col_cat'), t('sc_col_june_qty'),
        t('sc_col_basic_price'), t('sc_col_basic_value'), t('sc_col_fc_basic'),
        t('sc_col_new_price'), t('sc_col_pct_off'), t('sc_col_new_value'), t('sc_col_fc_new'), t('sc_col_diff')
      ]],
      body: sortedRowsFull.map((r) => [
        r.code,
        r.desc,
        r.cat,
        fmtNum(r.juneQty, 0),
        fmtEuro(r.basicPrice),
        fmtEuro(r.basicValue),
        isFinite(r.fcBasic) ? fmtNum(r.fcBasic, 1) + '%' : '—',
        fmtEuro(r.newPrice),
        r.inScope ? '−' + fmtNum(r.pctOff, 1) + '%' : '—',
        fmtEuro(r.newValue),
        isFinite(r.fcNew) ? fmtNum(r.fcNew, 1) + '%' : '—',
        fmtEuro(r.diff)
      ]),
      styles: { fontSize: 6.8, cellPadding: 1.3, font: 'DejaVuSans' },
      headStyles: { fillColor: [47, 143, 138], font: 'DejaVuSans', fontSize: 6.8 },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right', textColor: [47, 143, 138], fontStyle: 'bold' },
        8: { halign: 'right', textColor: [47, 143, 138] },
        9: { halign: 'right' },
        10: { halign: 'right' },
        11: { halign: 'right', textColor: [192, 57, 43] }
      },
      didDrawPage: () => {
        doc.setFont('DejaVuSans', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(151, 162, 176);
        doc.text('Quick & Fresh smart store by gefsinus — ' + t('sc_pdf_manager_internal_note'), 14, doc.internal.pageSize.getHeight() - 8);
      }
    });

    const slug = (editing.name || 'senario')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'senario';
    doc.save(`quick-fresh-egkrisi-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const filteredRows = useMemo(() => {
    if (!activePreview) return [];
    const q = search.trim().toLowerCase();
    if (!q) return activePreview.rows;
    return activePreview.rows.filter((r) => r.desc.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  }, [activePreview, search]);

  const savedComputed = useMemo(
    () => scenarios.map((sc) => ({ sc, result: computeScenario(sc, mergedBaseline, mergedTotals) })),
    [scenarios, mergedBaseline, mergedTotals]
  );

  // Φίλτρο ονόματος για τη λίστα σεναρίων — απαραίτητο όταν υπάρχουν πολλές δεκάδες σενάρια.
  const filteredSavedComputed = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return savedComputed;
    return savedComputed.filter(({ sc }) => (sc.name || '').toLowerCase().includes(q));
  }, [savedComputed, listSearch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_scenarios')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        {!editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 12.5, color: '#97a2b0', margin: 0, maxWidth: 800 }}>{t('sc_intro_hint')}</p>

            {!readOnly && (
              <div>
                <button type="button" className="btn-primary" onClick={startNew}>{t('sc_new_button')}</button>
              </div>
            )}

            {activeBaselineMonthEntry && (
              <div style={{ background: '#eef7f6', border: '1px solid #bfe1de', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#16233f' }}>
                  {t('sc_viewing_month_prefix')} <strong>{monthLabel(activeBaselineMonthEntry.monthKey, lang)}</strong> — {activeBaselineMonthEntry.matchedCount}/{activeBaselineMonthEntry.totalCount} {t('sc_viewing_month_matched_suffix')}
                </span>
                <button type="button" onClick={() => setBaselineViewMonthKey(null)} style={{ border: '1px solid #2f8f8a', background: '#fff', color: '#2f8f8a', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
                  {t('sc_back_to_current_button')}
                </button>
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>{t('sc_baseline_label')}</div>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16233f' }}>{fmtEuro(activeBaselineTotals.totalValue)}</div>
                  <div style={{ fontSize: 12, color: '#6b7684' }}>{activeBaselineMonthEntry ? t('sc_col_net_revenue') : t('sc_net_revenue_label')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16233f' }}>{fmtEuro(activeBaselineTotals.cogs)}</div>
                  <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_cogs_label')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16233f' }}>{fmtEuro(activeBaselineTotals.grossProfit)}</div>
                  <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_gross_profit_label')} ({fmtPct1(activeBaselineTotals.grossProfitPct)})</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#c0392b' }}>{fmtNum(activeBaselineTotals.fcPct, 1)}%</div>
                  <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_fc_label')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16233f' }}>{fmtNum(REFERENCE_BUILDING_PEOPLE, 0)}</div>
                  <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_building_people_ref_hint')}</div>
                </div>
              </div>
            </div>

            {baselineMonthlyBreakdown.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t('sc_monthly_breakdown_title')}</div>
                <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 12px', maxWidth: 760 }}>{t('sc_baseline_monthly_breakdown_hint')}</p>
                {singleConsolidatedPeriod && (
                  <p style={{ fontSize: 11.5, color: '#c98a1f', background: '#fdf6e8', border: '1px solid #f0dfb0', borderRadius: 8, padding: '8px 12px', margin: '0 0 12px', maxWidth: 760 }}>
                    ⚠ {t('sc_single_period_warning_prefix')} «{singleConsolidatedPeriod}» {t('sc_single_period_warning_suffix')}
                  </p>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 10.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                        <th style={{ padding: '7px 8px' }}>{t('sc_col_month')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_month_qty_ratio')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_match_rate')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_net_revenue')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_cogs_label')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_gross_profit_label')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_fc_label')}</th>
                        <th style={{ padding: '7px 8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {baselineMonthlyBreakdown.map(({ monthKey, totalQty, ratio, totals, matchedCount, totalCount }) => {
                        const isActive = baselineViewMonthKey === monthKey;
                        return (
                          <tr
                            key={monthKey}
                            onClick={() => setBaselineViewMonthKey(isActive ? null : monthKey)}
                            style={{ borderTop: '1px solid #eef1f4', cursor: 'pointer', background: isActive ? '#eef7f6' : 'transparent' }}
                          >
                            <td style={{ padding: '6px 8px', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{monthLabel(monthKey, lang)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7684' }}>{fmtNum(totalQty, 0)} ({fmtNum(ratio * 100, 0)}%)</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7684' }}>{matchedCount}/{totalCount}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(totals.totalValue)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(totals.cogs)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#16233f' }}>{fmtEuro(totals.grossProfit)} ({fmtPct1(totals.grossProfitPct)})</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c0392b' }}>{fmtNum(totals.fcPct, 1)}%</td>
                            <td style={{ padding: '6px 8px', color: '#2f8f8a', fontSize: 11, whiteSpace: 'nowrap' }}>{isActive ? t('sc_month_row_active_label') : t('sc_month_row_view_label')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {loading ? (
              <p style={{ color: '#97a2b0' }}>{t('sc_loading')}</p>
            ) : error ? (
              <p style={{ color: '#c0392b' }}>{error}</p>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: '#97a2b0' }}>
                    {filteredSavedComputed.length}{listSearch.trim() ? ` / ${savedComputed.length}` : ''} {t('sc_list_count_suffix')}
                  </span>
                  <input
                    type="text"
                    placeholder={t('sc_list_search_placeholder')}
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 12.5, minWidth: 240 }}
                  />
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 980 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 10.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                        <th style={{ padding: '8px 10px', minWidth: 180 }}>{t('sc_col_list_name')}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>{t('sc_col_list_subsidy')}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>{t('sc_col_list_discount')}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>{t('sc_col_list_fc')}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>{t('sc_col_list_growth')}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>{t('sc_col_list_destruction')}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>{t('sc_col_list_people')}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>{t('sc_col_list_erosion')}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>{t('sc_col_list_benefit')}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{t('sc_col_list_date')}</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', minWidth: 84 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSavedComputed.map(({ sc, result }) => (
                        <tr key={sc.id} style={{ borderTop: '1px solid #eef1f4' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }}>{sc.name || '—'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#c0392b', fontWeight: 600 }}>{sc.mode === 'discount' ? '—' : '−' + fmtEuro(Number(sc.subsidyAmount) || 0)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16233f' }}>−{sc.mode === 'discount' ? fmtNum(result.avgPctOff, 1) + '%' : fmtPct1(result.discountPct)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#c0392b' }}>{fmtNum(result.fcNewPct, 1)}%</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16233f' }}>{sc.mode === 'discount' ? '—' : '+' + fmtNum(result.volumeGrowthPct, 0) + '%'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16233f' }}>{sc.mode === 'discount' ? '—' : fmtNum(result.destructionPct, 0) + '%'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16233f' }}>{sc.mode === 'discount' ? '—' : fmtNum(result.buildingPeople, 0)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: sc.mode === 'discount' ? '#16233f' : (result.erosion >= 0 ? '#c0392b' : '#2f8f8a'), fontWeight: 600 }}>{sc.mode === 'discount' ? '—' : fmtSignedCost(result.erosion)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#2f8f8a', fontWeight: 600 }}>{sc.mode === 'discount' ? '—' : '+' + fmtEuro(result.netBenefitVsToday)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#97a2b0', whiteSpace: 'nowrap' }}>{fmtDate(sc.createdAt, lang)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {!readOnly && (
                              <button type="button" onClick={() => startEdit(sc)} title={t('sc_edit_button')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2f8f8a', fontSize: 13, marginRight: 6 }}>✎</button>
                            )}
                            {!readOnly && (
                              <button type="button" onClick={() => startClone(sc)} title={t('sc_clone_button')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7684', fontSize: 13, marginRight: 6 }}>⧉</button>
                            )}
                            {canDelete && (
                              <button type="button" onClick={() => remove(sc.id)} title={t('sc_delete_button')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#c0392b', fontSize: 13 }}>✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {savedComputed.length === 0 && (
                  <p style={{ fontSize: 12.5, color: '#97a2b0', marginTop: 14, marginBottom: 0 }}>{t('sc_empty_list')}</p>
                )}
                {savedComputed.length > 0 && filteredSavedComputed.length === 0 && (
                  <p style={{ fontSize: 12.5, color: '#97a2b0', marginTop: 14, marginBottom: 0 }}>{t('sc_list_no_match')}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 14 }}>
              {!readOnly && (
                <button type="button" className="btn-primary" onClick={save} disabled={saving}>
                  {t('sc_save_button')}
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={exportCustomerPDF}>{t('sc_pdf_export_button')}</button>
              <button type="button" className="btn-secondary" onClick={exportManagerPDF}>{t('sc_pdf_manager_export_button')}</button>
              <button type="button" className="btn-secondary" onClick={cancelEdit}>{t('sc_cancel_button')}</button>
              {saveError && <span style={{ color: '#c0392b', fontSize: 12.5 }}>{saveError}</span>}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#16233f', marginBottom: 14, textTransform: 'uppercase' }}>
                {editing.id ? t('sc_editing_title_edit') : (editing.mode === 'discount' ? t('sc_editing_title_new_discount') : t('sc_editing_title_new'))}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 6 }}>{t('sc_mode_label')}</label>
                <div style={{ display: 'inline-flex', border: '1px solid #dde2e8', borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => setEditing((prev) => ({ ...prev, mode: 'subsidy' }))}
                    style={{
                      padding: '7px 14px', fontSize: 12.5, border: 'none', cursor: readOnly ? 'default' : 'pointer',
                      background: editing.mode === 'discount' ? '#fff' : '#2f8f8a',
                      color: editing.mode === 'discount' ? '#6b7684' : '#fff',
                      fontWeight: editing.mode === 'discount' ? 400 : 700
                    }}
                  >
                    {t('sc_mode_subsidy')}
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => setEditing((prev) => ({ ...prev, mode: 'discount' }))}
                    style={{
                      padding: '7px 14px', fontSize: 12.5, border: 'none', cursor: readOnly ? 'default' : 'pointer',
                      background: editing.mode === 'discount' ? '#2f8f8a' : '#fff',
                      color: editing.mode === 'discount' ? '#fff' : '#6b7684',
                      fontWeight: editing.mode === 'discount' ? 700 : 400
                    }}
                  >
                    {t('sc_mode_discount')}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ flex: '2 1 300px' }}>
                  <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_name_label')}</label>
                  <input
                    type="text"
                    value={editing.name}
                    placeholder={t('sc_name_placeholder')}
                    disabled={readOnly}
                    onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                  />
                </div>
                {editing.mode === 'discount' ? (
                  <div style={{ flex: '1 1 180px' }}>
                    <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_discount_general_pct_label')}</label>
                    <input
                      type="number" step="1" min="0" max="90"
                      value={editing.discountPct ?? 0}
                      disabled={readOnly}
                      onChange={(e) => setEditing((prev) => ({ ...prev, discountPct: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                    />
                  </div>
                ) : (
                  <>
                    <div style={{ flex: '1 1 180px' }}>
                      <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_subsidy_amount_label')}</label>
                      <input
                        type="number" step="1" min="0"
                        value={editing.subsidyAmount}
                        disabled={readOnly}
                        onChange={(e) => setEditing((prev) => ({ ...prev, subsidyAmount: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                      />
                    </div>
                    <div style={{ flex: '1 1 180px' }}>
                      <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_volume_growth_label')}</label>
                      <input
                        type="number" step="1"
                        value={editing.volumeGrowthPct ?? 0}
                        disabled={readOnly}
                        onChange={(e) => setEditing((prev) => ({ ...prev, volumeGrowthPct: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                      />
                    </div>
                    <div style={{ flex: '1 1 180px' }}>
                      <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_destruction_pct_label')}</label>
                      <input
                        type="number" step="1" min="0"
                        value={editing.destructionPct ?? 0}
                        disabled={readOnly}
                        onChange={(e) => setEditing((prev) => ({ ...prev, destructionPct: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                      />
                    </div>
                    <div style={{ flex: '1 1 180px' }}>
                      <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_building_people_label')}</label>
                      <input
                        type="number" step="1" min="0"
                        value={editing.buildingPeople ?? REFERENCE_BUILDING_PEOPLE}
                        disabled={readOnly}
                        onChange={(e) => setEditing((prev) => ({ ...prev, buildingPeople: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                      />
                    </div>
                  </>
                )}
              </div>
              {editing.mode === 'discount' ? (
                <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 14px' }}>{t('sc_discount_pct_hint')}</p>
              ) : (
                <>
                  <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 6px' }}>{t('sc_subsidy_hint')}</p>
                  <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 6px' }}>{t('sc_volume_growth_hint')}</p>
                  <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 6px' }}>{t('sc_destruction_pct_hint')}</p>
                  <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 14px' }}>{t('sc_building_people_hint')}</p>
                </>
              )}

              {editing.mode === 'discount' ? (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 6 }}>{t('sc_category_discounts_label')}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) 90px', gap: '6px 14px', maxWidth: 420 }}>
                    {mergedCategories.map((cat) => {
                      const raw = editing.categoryDiscounts && editing.categoryDiscounts[cat];
                      const value = raw === undefined || raw === null ? '' : raw;
                      return (
                        <React.Fragment key={cat}>
                          <div style={{ fontSize: 12.5, color: '#2b3644', alignSelf: 'center' }}>{cat}</div>
                          <input
                            type="number" step="1" min="0" max="90"
                            placeholder={String(editing.discountPct ?? 0)}
                            value={value}
                            disabled={readOnly}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditing((prev) => {
                                const next = { ...(prev.categoryDiscounts || {}) };
                                if (v === '') delete next[cat]; else next[cat] = v;
                                return { ...prev, categoryDiscounts: next };
                              });
                            }}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 12.5 }}
                          />
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '6px 0 0' }}>{t('sc_category_discounts_hint')}</p>
                  {preview && preview.discountCapped && (
                    <div style={{ marginTop: 8, background: '#fff6e6', border: '1px solid #f0d59a', borderRadius: 6, padding: '8px 10px', fontSize: 11.5, color: '#8a5a00' }}>
                      {t('sc_discount_pct_capped_warning')}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 6 }}>{t('sc_categories_label')}</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                    {mergedCategories.map((cat) => {
                      const checked = Array.isArray(editing.selectedCategories) && editing.selectedCategories.includes(cat);
                      return (
                        <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#2b3644', cursor: readOnly ? 'default' : 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={readOnly}
                            onChange={(e) => {
                              setEditing((prev) => {
                                const cur = Array.isArray(prev.selectedCategories) ? prev.selectedCategories : [];
                                const next = e.target.checked ? [...cur, cat] : cur.filter((c) => c !== cat);
                                return { ...prev, selectedCategories: next };
                              });
                            }}
                          />
                          {cat}
                        </label>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '6px 0 0' }}>{t('sc_categories_hint')}</p>
                  {preview && preview.discountCapped && (
                    <div style={{ marginTop: 8, background: '#fff6e6', border: '1px solid #f0d59a', borderRadius: 6, padding: '8px 10px', fontSize: 11.5, color: '#8a5a00' }}>
                      {t('sc_discount_capped_warning')}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ flex: '1 1 260px' }}>
                  <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_customer_company_label')}</label>
                  <input
                    type="text"
                    value={editing.customerCompanyName || ''}
                    placeholder={t('sc_customer_company_placeholder')}
                    disabled={readOnly}
                    onChange={(e) => setEditing((prev) => ({ ...prev, customerCompanyName: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13 }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_customer_message_label')}</label>
                <textarea
                  value={editing.customerMessage ?? DEFAULT_CUSTOMER_MESSAGE_EL}
                  disabled={readOnly}
                  onChange={(e) => setEditing((prev) => ({ ...prev, customerMessage: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13, resize: 'vertical' }}
                />
                <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '6px 0 0' }}>{t('sc_customer_message_hint')}</p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 4 }}>{t('sc_notes_label')}</label>
                <textarea
                  value={editing.notes || ''}
                  disabled={readOnly}
                  onChange={(e) => setEditing((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 13, resize: 'vertical' }}
                />
              </div>
            </div>

            {activeMonthEntry && (
              <div style={{ background: '#eef7f6', border: '1px solid #bfe1de', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#16233f' }}>
                  {t('sc_viewing_month_prefix')} <strong>{monthLabel(activeMonthEntry.monthKey, lang)}</strong> — {activeMonthEntry.matchedCount}/{activeMonthEntry.totalCount} {t('sc_viewing_month_matched_suffix')}
                </span>
                <button type="button" onClick={() => setViewMonthKey(null)} style={{ border: '1px solid #2f8f8a', background: '#fff', color: '#2f8f8a', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
                  {t('sc_back_to_current_button')}
                </button>
              </div>
            )}

            {activePreview && (
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>{t('sc_live_summary_title')}</div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#16233f' }}>{fmtEuro(activePreview.netRevenue)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{activeMonthEntry ? t('sc_col_net_revenue') : t('sc_net_revenue_label')}</div>
                  </div>
                  <div>
                    {editing.mode === 'discount' ? (
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#c0392b' }}>
                        −{fmtNum(activePreview.avgPctOff, 1)}%
                      </div>
                    ) : (
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#c0392b' }}>
                        −{fmtEuro(Number(editing.subsidyAmount) || 0)}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#6b7684' }}>
                      {editing.mode === 'discount' ? t('sc_pdf_avg_discount_label') : (t('sc_subsidy_label') + ' (−' + fmtPct1(activePreview.discountPct) + ')')}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c98a1f' }}>−{fmtEuro(activePreview.revenueDrop)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_actual_drop_label')}</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 180 }}>{t('sc_actual_drop_hint')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c98a1f' }}>{fmtEuro(activePreview.cogs)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_cogs_label')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#7a4fc9' }}>{fmtEuro(activePreview.grossProfit)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_gross_profit_label')} ({fmtPct1(activePreview.grossProfitPct)})</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c0392b' }}>{fmtNum(activePreview.fcNewPct, 1)}%</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_fc_new_label')} ({t('sc_fc_basic_label')}: {fmtNum(mergedTotals.fcPct, 1)}%)</div>
                  </div>
                  {editing.mode !== 'discount' && (
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#2f8f8a' }}>{isFinite(activePreview.fcWithSubsidyPct) ? fmtNum(activePreview.fcWithSubsidyPct, 1) + '%' : '—'}</div>
                      <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_fc_with_subsidy_label')}</div>
                      <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 200 }}>{t('sc_fc_with_subsidy_hint')}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activePreview && editing.mode !== 'discount' && (
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t('sc_sensitivity_title')}</div>
                <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 12px', maxWidth: 700 }}>{t('sc_sensitivity_hint')}</p>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c98a1f' }}>−{fmtEuro(activePreview.destructionCost)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_destruction_cost_label')} ({fmtNum(activePreview.destructionPct, 0)}%)</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 200 }}>{t('sc_destruction_cost_hint')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#16233f' }}>{fmtEuro(activePreview.totalWithSubsidy)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_grown_profit_label')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: activePreview.erosion >= 0 ? '#c0392b' : '#2f8f8a' }}>{fmtSignedCost(activePreview.erosion)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_erosion_label')}</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 220 }}>{t('sc_erosion_hint')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#2f8f8a' }}>+{fmtEuro(activePreview.netBenefitVsToday)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_net_benefit_label')}</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 220 }}>{t('sc_net_benefit_hint')}</div>
                  </div>
                </div>
              </div>
            )}

            {monthlyBreakdown.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t('sc_monthly_breakdown_title')}</div>
                <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 12px', maxWidth: 760 }}>{t('sc_monthly_breakdown_hint')}</p>
                {singleConsolidatedPeriod && (
                  <p style={{ fontSize: 11.5, color: '#c98a1f', background: '#fdf6e8', border: '1px solid #f0dfb0', borderRadius: 8, padding: '8px 12px', margin: '0 0 12px', maxWidth: 760 }}>
                    ⚠ {t('sc_single_period_warning_prefix')} «{singleConsolidatedPeriod}» {t('sc_single_period_warning_suffix')}
                  </p>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 10.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                        <th style={{ padding: '7px 8px' }}>{t('sc_col_month')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_month_qty_ratio')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_match_rate')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_discount_pct')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_net_revenue')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_gross_profit_label')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_grown_profit_label')}</th>
                        <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_net_benefit_label')}</th>
                        <th style={{ padding: '7px 8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyBreakdown.map(({ monthKey, totalQty, ratio, result, matchedCount, totalCount }) => {
                        const isActive = viewMonthKey === monthKey;
                        return (
                          <tr
                            key={monthKey}
                            onClick={() => setViewMonthKey(isActive ? null : monthKey)}
                            style={{ borderTop: '1px solid #eef1f4', cursor: 'pointer', background: isActive ? '#eef7f6' : 'transparent' }}
                          >
                            <td style={{ padding: '6px 8px', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{monthLabel(monthKey, lang)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7684' }}>{fmtNum(totalQty, 0)} ({fmtNum(ratio * 100, 0)}%)</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7684' }}>{matchedCount}/{totalCount}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c0392b' }}>−{fmtPct1(result.discountPct)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(result.netRevenue)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(result.grossProfit)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#16233f' }}>{fmtEuro(result.totalWithSubsidy)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: result.netBenefitVsToday >= 0 ? '#2f8f8a' : '#c0392b' }}>
                              {result.netBenefitVsToday >= 0 ? '+' : ''}{fmtEuro(result.netBenefitVsToday)}
                            </td>
                            <td style={{ padding: '6px 8px', color: '#2f8f8a', fontSize: 11, whiteSpace: 'nowrap' }}>{isActive ? t('sc_month_row_active_label') : t('sc_month_row_view_label')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
              {editing.mode === 'discount' && !readOnly && (
                <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 10px' }}>{t('sc_price_override_hint')}</p>
              )}
              {activeMonthEntry && (
                <p style={{ fontSize: 11, color: '#97a2b0', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#2f8f8a', marginRight: 5 }} />{t('sc_qty_real_hint')}</span>
                  <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#c98a1f', marginRight: 5 }} />{t('sc_qty_estimated_hint')}</span>
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#97a2b0' }}>{t('sc_products_count')}</span>
                <input
                  type="text"
                  placeholder={t('sc_search_placeholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: '7px 10px', border: '1px solid #dde2e8', borderRadius: 6, fontSize: 12.5, minWidth: 240 }}
                />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#6b7684', fontSize: 10.5, textTransform: 'uppercase', background: '#f4f6f8' }}>
                      <th style={{ padding: '7px 8px' }}>{t('sc_col_code')}</th>
                      <th style={{ padding: '7px 8px', minWidth: 220 }}>{t('sc_col_desc')}</th>
                      <th style={{ padding: '7px 8px' }}>{t('sc_col_cat')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{activeMonthEntry ? monthLabel(activeMonthEntry.monthKey, lang) : t('sc_col_june_qty')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_basic_price')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_basic_value')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_fc_basic')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_new_price')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_pct_off')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_new_value')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_fc_new')}</th>
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_diff')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => (
                      <tr key={r.code} style={{ borderTop: '1px solid #eef1f4' }}>
                        <td style={{ padding: '6px 8px', color: '#97a2b0', whiteSpace: 'nowrap' }}>{r.code}</td>
                        <td style={{ padding: '6px 8px' }}>{r.desc}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7684', whiteSpace: 'nowrap' }}>{r.cat}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          {fmtNum(r.juneQty, 0)}
                          {activeMonthEntry && (
                            <span
                              title={r.isRealQty ? t('sc_qty_real_hint') : t('sc_qty_estimated_hint')}
                              style={{
                                display: 'inline-block', marginLeft: 6, width: 7, height: 7, borderRadius: '50%',
                                background: r.isRealQty ? '#2f8f8a' : '#c98a1f'
                              }}
                            />
                          )}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(r.basicPrice)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(r.basicValue)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7684' }}>{isFinite(r.fcBasic) ? fmtNum(r.fcBasic, 1) + '%' : '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: r.hasPriceOverride ? '#c98a1f' : '#2f8f8a' }}>
                          {editing.mode === 'discount' && !readOnly ? (
                            <input
                              type="number" step="0.01" min="0"
                              placeholder={fmtEuro(r.newPrice).replace('€', '')}
                              value={(editing.productPriceOverrides && editing.productPriceOverrides[r.code]) ?? ''}
                              title={t('sc_price_override_hint')}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditing((prev) => {
                                  const next = { ...(prev.productPriceOverrides || {}) };
                                  if (v === '') delete next[r.code]; else next[r.code] = v;
                                  return { ...prev, productPriceOverrides: next };
                                });
                              }}
                              style={{ width: 80, padding: '4px 6px', textAlign: 'right', border: r.hasPriceOverride ? '1px solid #c98a1f' : '1px solid #dde2e8', borderRadius: 5, fontSize: 12, fontWeight: 700, color: r.hasPriceOverride ? '#c98a1f' : '#2f8f8a' }}
                            />
                          ) : (
                            fmtEuro(r.newPrice)
                          )}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#2f8f8a' }}>−{fmtNum(r.pctOff, 1)}%</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#16233f' }}>{fmtEuro(r.newValue)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c0392b' }}>{isFinite(r.fcNew) ? fmtNum(r.fcNew, 1) + '%' : '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c0392b' }}>{fmtEuro(r.diff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
