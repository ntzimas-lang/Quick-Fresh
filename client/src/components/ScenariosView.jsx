import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PricingScenarios } from '../api.js';
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

// --- Στατικό σύνολο αναφοράς (τιμοκατάλογος BASIC), από το ανεβασμένο Excel -----
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
    subsidyAmount: 0,
    volumeGrowthPct: 0,
    destructionPct: 0,
    buildingPeople: REFERENCE_BUILDING_PEOPLE,
    selectedCategories: [],
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
function computeSubsidyScenario(subsidyAmount, volumeGrowthPct, destructionPct, buildingPeople, selectedCategories) {
  const amount = Number(subsidyAmount) || 0;
  const growthPct = Number(volumeGrowthPct) || 0;
  const growthFactor = 1 + growthPct / 100;
  const destrPct = Number(destructionPct) || 0;
  // Εκτιμώμενο μηνιαίο κόστος καταστροφών, ως ποσοστό επί του (σταθερού) κόστους πωλήσεων.
  const destructionCost = BASIC_COGS * (destrPct / 100);
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
    ? computeBaselineTotals(SCENARIO_BASELINE_PRODUCTS.filter((p) => categorySet.has(p.cat)))
    : BASIC_TOTALS;

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

  const rows = SCENARIO_BASELINE_PRODUCTS.map((p) => {
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

  const grossProfit = soldNetRevenue - BASIC_COGS;
  const grossProfitPct = soldNetRevenue ? grossProfit / soldNetRevenue : 0;
  const fcNewPct = 100 - grossProfitPct * 100;
  const revenueDrop = BASIC_TOTAL_VALUE - soldNetRevenue; // πραγματική μείωση τζίρου, μετά τη στρογγυλοποίηση

  // F.C. Με Επιδότηση: το ίδιο κόστος (BASIC_COGS), αλλά η επιδότηση προστίθεται σαν να
  // ήταν κι αυτή τζίρος — δείχνει την ΠΡΑΓΜΑΤΙΚΗ εικόνα κόστους/εσόδων, αφού η επιδότηση
  // είναι πραγματικά χρήματα που μπαίνουν στην επιχείρηση κάθε μήνα μαζί με τις πωλήσεις.
  const revenueWithSubsidy = soldNetRevenue + amount;
  const fcWithSubsidyPct = revenueWithSubsidy ? (BASIC_COGS / revenueWithSubsidy) * 100 : NaN;

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
    cogs: BASIC_COGS,
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

export default function ScenariosView({ readOnly = false, canDelete = false }) {
  const { t, lang } = useLanguage();
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | draft object (μπορεί να έχει id)
  const [search, setSearch] = useState('');
  const [listSearch, setListSearch] = useState(''); // αναζήτηση στη λίστα σεναρίων (όχι στα προϊόντα)
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function load() {
    setLoading(true);
    PricingScenarios.list()
      .then((rows) => { setScenarios(rows); setLoading(false); })
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  const preview = useMemo(
    () => (editing ? computeSubsidyScenario(editing.subsidyAmount, editing.volumeGrowthPct, editing.destructionPct, editing.buildingPeople, editing.selectedCategories) : null),
    [editing]
  );

  function startNew() {
    setSaveError('');
    setSearch('');
    setEditing(emptyDraft());
  }

  function startEdit(sc) {
    setSaveError('');
    setSearch('');
    setEditing({ ...emptyDraft(), ...sc });
  }

  function cancelEdit() {
    setEditing(null);
    setSaveError('');
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
        subsidyAmount: Number(editing.subsidyAmount) || 0,
        volumeGrowthPct: Number(editing.volumeGrowthPct) || 0,
        destructionPct: Number(editing.destructionPct) || 0,
        buildingPeople: Number(editing.buildingPeople) || REFERENCE_BUILDING_PEOPLE,
        selectedCategories: Array.isArray(editing.selectedCategories) ? editing.selectedCategories : [],
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
    const boxGap = 6;
    const boxWidth = (pageWidth - 28 - boxGap) / 2;
    const boxHeight = 14;
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
    cursorY += boxHeight + 6;

    doc.setFontSize(9.5);
    doc.setTextColor(22, 35, 63);
    const noteLines = doc.splitTextToSize(t('sc_pdf_note'), pageWidth - 28);
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

    doc.setFontSize(13);
    doc.setTextColor(22, 35, 63);
    doc.text(t('sc_pdf_manager_title'), 14, logoSize + 16);

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

    const paramRows = [
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

    const resultRows = [
      [t('sc_net_revenue_label'), fmtEuro(preview.netRevenue)],
      [t('sc_subsidy_label') + ' (−' + fmtPct1(preview.discountPct) + ')', fmtEuro(Number(editing.subsidyAmount) || 0)],
      [t('sc_pdf_avg_discount_label'), '−' + fmtNum(avgPctOff, 1) + '%'],
      [t('sc_actual_drop_label'), fmtEuro(preview.revenueDrop)],
      [t('sc_cogs_label'), fmtEuro(preview.cogs)],
      [t('sc_gross_profit_label') + ' (' + fmtPct1(preview.grossProfitPct) + ')', fmtEuro(preview.grossProfit)],
      [t('sc_fc_new_label') + ' (' + t('sc_fc_basic_label') + ': ' + fmtNum(BASIC_FC_PCT, 1) + '%)', fmtNum(preview.fcNewPct, 1) + '%'],
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
    if (!preview) return [];
    const q = search.trim().toLowerCase();
    if (!q) return preview.rows;
    return preview.rows.filter((r) => r.desc.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  }, [preview, search]);

  const savedComputed = useMemo(
    () => scenarios.map((sc) => ({ sc, result: computeSubsidyScenario(sc.subsidyAmount, sc.volumeGrowthPct, sc.destructionPct, sc.buildingPeople, sc.selectedCategories) })),
    [scenarios]
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

            <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>{t('sc_baseline_label')}</div>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16233f' }}>{fmtEuro(BASIC_TOTAL_VALUE)}</div>
                  <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_net_revenue_label')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16233f' }}>{fmtEuro(BASIC_COGS)}</div>
                  <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_cogs_label')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16233f' }}>{fmtEuro(BASIC_GROSS_PROFIT)}</div>
                  <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_gross_profit_label')} ({fmtPct1(BASIC_GROSS_PROFIT_PCT)})</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#c0392b' }}>{fmtNum(BASIC_FC_PCT, 1)}%</div>
                  <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_fc_label')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16233f' }}>{fmtNum(REFERENCE_BUILDING_PEOPLE, 0)}</div>
                  <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_building_people_ref_hint')}</div>
                </div>
              </div>
            </div>

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
                        <th style={{ padding: '8px 10px', textAlign: 'center', minWidth: 64 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSavedComputed.map(({ sc, result }) => (
                        <tr key={sc.id} style={{ borderTop: '1px solid #eef1f4' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16233f' }}>{sc.name || '—'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#c0392b', fontWeight: 600 }}>−{fmtEuro(Number(sc.subsidyAmount) || 0)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16233f' }}>−{fmtPct1(result.discountPct)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#c0392b' }}>{fmtNum(result.fcNewPct, 1)}%</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16233f' }}>+{fmtNum(result.volumeGrowthPct, 0)}%</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16233f' }}>{fmtNum(result.destructionPct, 0)}%</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16233f' }}>{fmtNum(result.buildingPeople, 0)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: result.erosion >= 0 ? '#c0392b' : '#2f8f8a', fontWeight: 600 }}>{fmtSignedCost(result.erosion)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#2f8f8a', fontWeight: 600 }}>+{fmtEuro(result.netBenefitVsToday)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {!readOnly && (
                              <button type="button" onClick={() => startEdit(sc)} title={t('sc_edit_button')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2f8f8a', fontSize: 13, marginRight: 6 }}>✎</button>
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
                {editing.id ? t('sc_editing_title_edit') : t('sc_editing_title_new')}
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
              </div>
              <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 6px' }}>{t('sc_subsidy_hint')}</p>
              <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 6px' }}>{t('sc_volume_growth_hint')}</p>
              <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 6px' }}>{t('sc_destruction_pct_hint')}</p>
              <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 14px' }}>{t('sc_building_people_hint')}</p>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11.5, color: '#6b7684', marginBottom: 6 }}>{t('sc_categories_label')}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                  {ALL_CATEGORIES.map((cat) => {
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

            {preview && (
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>{t('sc_live_summary_title')}</div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#16233f' }}>{fmtEuro(preview.netRevenue)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_net_revenue_label')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c0392b' }}>
                      −{fmtEuro(Number(editing.subsidyAmount) || 0)}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_subsidy_label')} (−{fmtPct1(preview.discountPct)})</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c98a1f' }}>−{fmtEuro(preview.revenueDrop)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_actual_drop_label')}</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 180 }}>{t('sc_actual_drop_hint')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c98a1f' }}>{fmtEuro(preview.cogs)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_cogs_label')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#7a4fc9' }}>{fmtEuro(preview.grossProfit)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_gross_profit_label')} ({fmtPct1(preview.grossProfitPct)})</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c0392b' }}>{fmtNum(preview.fcNewPct, 1)}%</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_fc_new_label')} ({t('sc_fc_basic_label')}: {fmtNum(BASIC_FC_PCT, 1)}%)</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#2f8f8a' }}>{isFinite(preview.fcWithSubsidyPct) ? fmtNum(preview.fcWithSubsidyPct, 1) + '%' : '—'}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_fc_with_subsidy_label')}</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 200 }}>{t('sc_fc_with_subsidy_hint')}</div>
                  </div>
                </div>
              </div>
            )}

            {preview && (
              <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t('sc_sensitivity_title')}</div>
                <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 12px', maxWidth: 700 }}>{t('sc_sensitivity_hint')}</p>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c98a1f' }}>−{fmtEuro(preview.destructionCost)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_destruction_cost_label')} ({fmtNum(preview.destructionPct, 0)}%)</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 200 }}>{t('sc_destruction_cost_hint')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#16233f' }}>{fmtEuro(preview.totalWithSubsidy)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_grown_profit_label')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: preview.erosion >= 0 ? '#c0392b' : '#2f8f8a' }}>{fmtSignedCost(preview.erosion)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_erosion_label')}</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 220 }}>{t('sc_erosion_hint')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#2f8f8a' }}>+{fmtEuro(preview.netBenefitVsToday)}</div>
                    <div style={{ fontSize: 12, color: '#6b7684' }}>{t('sc_net_benefit_label')}</div>
                    <div style={{ fontSize: 10.5, color: '#97a2b0', maxWidth: 220 }}>{t('sc_net_benefit_hint')}</div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 20 }}>
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
                      <th style={{ padding: '7px 8px', textAlign: 'right' }}>{t('sc_col_june_qty')}</th>
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
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtNum(r.juneQty, 0)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(r.basicPrice)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtEuro(r.basicValue)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7684' }}>{isFinite(r.fcBasic) ? fmtNum(r.fcBasic, 1) + '%' : '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#2f8f8a' }}>{fmtEuro(r.newPrice)}</td>
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
