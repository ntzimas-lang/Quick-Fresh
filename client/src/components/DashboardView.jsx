import React, { useEffect, useState } from 'react';
import { Contacts, Entries, SalesDaily, SalesProducts, SalesTimeBuckets, SalesShiftBreakdown, Products } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const SALES_LINE_COLORS = { net: '#2f8f8a', tx: '#c98a1f' };

function monthKey(dateStr) {
  return String(dateStr).slice(0, 7); // 'yyyy-mm-dd' -> 'yyyy-mm'
}

const MONTH_LABELS_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(key, lang) {
  const [y, m] = key.split('-');
  const labels = lang === 'en' ? MONTH_LABELS_EN : MONTH_LABELS_EL;
  return `${labels[Number(m) - 1]} ${y}`;
}

function dayLabel(iso) {
  const [, m, d] = String(iso).split('-');
  return `${d}/${m}`;
}

// Μετατρέπει μια σειρά τιμών σε συντεταγμένες SVG, κανονικοποιημένες 0-100
// ώστε πολλές καμπύλες με διαφορετική κλίμακα να χωράνε στο ίδιο γράφημα.
// Επιστρέφει και την πραγματική τιμή ανά σημείο, για να δείχνουμε νούμερα πάνω στο γράφημα.
function trendCoords(series, width = 360, height = 100, topPad = 20) {
  if (!series.length) return [];
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const n = series.length;
  return series.map((v, i) => {
    const x = n > 1 ? (i * width) / (n - 1) : width / 2;
    const frac = hi !== lo ? (v - lo) / (hi - lo) : 0.5;
    const y = topPad + (1 - frac) * (height - topPad * 1.5);
    return { x, y, value: v };
  });
}

function coordsToPoints(coords) {
  return coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
}

function formatEuro(v) {
  return '€' + Math.round(v).toLocaleString('el-GR');
}

const CONTACT_STATUS_COLORS = {
  'Έκλεισε': '#27ae60',
  'Σε διαδικασία να κλείσει': '#2f80ed',
  'Έχει σταλεί 1ο mail': '#7cb9f2',
  'Έχει σταλεί 2ο mail': '#4a90d9',
  'Έχει σταλεί 3ο mail': '#2c5fa8',
  'Σε αναμονή τηλεφωνικής επικοινωνίας': '#8e5cd9',
  'Ενδιαφέρεται': '#e0a500',
  'Δεν Ενδιαφέρεται': '#c0392b',
  '': '#c7cdd6'
};

function daysDiff(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDateStr + 'T00:00:00');
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
}

function Bar({ label, value, max, color }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <strong style={{ fontSize: 13 }}>{value}</strong>
      </div>
      <div style={{ height: 8, background: '#f1f3f5', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: color }} />
      </div>
    </div>
  );
}

export default function DashboardView({ isDriver = false } = {}) {
  const { t, lang } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [salesDaily, setSalesDaily] = useState([]);
  const [salesProducts, setSalesProducts] = useState([]);
  const [salesTimeBuckets, setSalesTimeBuckets] = useState([]);
  const [salesShiftBreakdown, setSalesShiftBreakdown] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  // Το ανά-κατηγορία breakdown (top20/worst20 μέσα σε ΚΑΘΕ κατηγορία) μπορεί να βγάλει
  // πολλά δεδομένα στην οθόνη (μία κάρτα ανά κατηγορία) — κρυμμένο by default, ο χρήστης
  // το ανοίγει όποτε το χρειάζεται.
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(false);
  // Νέο, ξεχωριστό block: ίδια ιδέα με το Top20/Worst20 (Ποσότητα) παραπάνω, αλλά
  // ταξινομημένο με βάση τη ΜΕΣΗ ΗΜΕΡΗΣΙΑ πώληση (σύνολο / ημέρες που είχε πωλήσεις),
  // ώστε προϊόντα που μπήκαν πρόσφατα να συγκρίνονται δίκαια με παλιά. Κρυμμένο by
  // default, ίδιο pattern με το showCategoryBreakdown.
  const [showActiveDaysBreakdown, setShowActiveDaysBreakdown] = useState(false);
  // Πωλήσεις (τεμάχια) ανά κατηγορία, ομαδοποιημένες ανά μήνα — κρυμμένο by default.
  const [showCategoryMonthlyQty, setShowCategoryMonthlyQty] = useState(false);
  // Ποιες κατηγορίες (ανά μήνα) είναι ανοιχτές για να δείχνουν τα προϊόντα τους
  // από μέσα — key: "monthKey|category".
  const [expandedMonthCategories, setExpandedMonthCategories] = useState(() => new Set());
  function toggleMonthCategory(key) {
    setExpandedMonthCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    // Ο Οδηγός βλέπει μόνο την κάρτα Ληγμένα — δεν χρειάζεται να φορτώσουμε
    // Επαφές/Πωλήσεις γι' αυτόν, ώστε να μην κάνουμε άσκοπα requests.
    const tasks = isDriver
      ? [Entries.list().then(setEntries)]
      : [
          Contacts.list().then(setContacts),
          Entries.list().then(setEntries),
          SalesDaily.list().then(setSalesDaily),
          SalesProducts.list().then(setSalesProducts),
          SalesTimeBuckets.list().then(setSalesTimeBuckets),
          SalesShiftBreakdown.list().then(setSalesShiftBreakdown),
          Products.list().then(setAllProducts)
        ];
    Promise.all(tasks)
      .then(() => setLoading(false))
      .catch((err) => { setError(err.message || t('common_load_error')); setLoading(false); });
  }, [isDriver]);

  if (loading) {
    return <div style={{ padding: 20, color: '#97a2b0' }}>{t('d_loading')}</div>;
  }
  if (error) {
    return <div style={{ padding: 20, color: '#c0392b' }}>{error}</div>;
  }

  // Μετράμε τεμάχια (ποσότητα) αντί για αριθμό καταχωρήσεων — μία καταχώρηση
  // μπορεί να αντιπροσωπεύει πολλά τεμάχια. Χωρίς ποσότητα, θεωρούμε 1 τεμάχιο.
  function entryQty(e) {
    const q = Number(e.quantity);
    return Number.isFinite(q) && q > 0 ? q : 1;
  }
  const entryDiffs = entries.map((e) => ({ ...e, diff: daysDiff(e.expiryDate), qty: entryQty(e) }));
  const expiredQty = entryDiffs.filter((e) => e.diff < 0).reduce((sum, e) => sum + e.qty, 0);
  const soonEntries = entryDiffs.filter((e) => e.diff >= 0 && e.diff <= 7);
  const soonQty = soonEntries.reduce((sum, e) => sum + e.qty, 0);
  const totalQty = entryDiffs.reduce((sum, e) => sum + e.qty, 0);

  // Ανάλυση ειδικά για όσα λήγουν εντός 7 ημερών: ανά ημέρες-απόσταση και ανά κατάστημα.
  const bucketToday = soonEntries.filter((e) => e.diff === 0).reduce((s, e) => s + e.qty, 0);
  const bucket1_3 = soonEntries.filter((e) => e.diff >= 1 && e.diff <= 3).reduce((s, e) => s + e.qty, 0);
  const bucket4_7 = soonEntries.filter((e) => e.diff >= 4 && e.diff <= 7).reduce((s, e) => s + e.qty, 0);
  const maxBucket = Math.max(bucketToday, bucket1_3, bucket4_7, 1);

  // Ανά κατάστημα: ΟΛΑ τα προϊόντα του καταστήματος (όχι μόνο όσα λήγουν σύντομα),
  // με σύνθεση Ληγμένα / Σήμερα / 1-3 / 4-7 ημέρες / >7 ημέρες στην ίδια γραμμή.
  const storeFullMap = {};
  entryDiffs.forEach((e) => {
    const key = e.store || '—';
    if (!storeFullMap[key]) storeFullMap[key] = { expired: 0, today: 0, d1_3: 0, d4_7: 0, rest: 0, total: 0 };
    let bucket;
    if (e.diff < 0) bucket = 'expired';
    else if (e.diff === 0) bucket = 'today';
    else if (e.diff <= 3) bucket = 'd1_3';
    else if (e.diff <= 7) bucket = 'd4_7';
    else bucket = 'rest';
    storeFullMap[key][bucket] += e.qty;
    storeFullMap[key].total += e.qty;
  });
  const storeBreakdown = Object.entries(storeFullMap).sort((a, b) => b[1].total - a[1].total);

  const statusGroups = {};
  contacts.forEach((c) => {
    const key = c.status || '';
    statusGroups[key] = (statusGroups[key] || 0) + 1;
  });
  const statusOrder = [
    'Έκλεισε', 'Σε διαδικασία να κλείσει', 'Έχει σταλεί 1ο mail', 'Έχει σταλεί 2ο mail',
    'Έχει σταλεί 3ο mail', 'Σε αναμονή τηλεφωνικής επικοινωνίας', 'Ενδιαφέρεται', 'Δεν Ενδιαφέρεται', ''
  ];
  const statusLabelKeys = {
    'Έκλεισε': 'c_status_closed',
    'Σε διαδικασία να κλείσει': 'c_status_in_progress',
    'Έχει σταλεί 1ο mail': 'c_status_mail1',
    'Έχει σταλεί 2ο mail': 'c_status_mail2',
    'Έχει σταλεί 3ο mail': 'c_status_mail3',
    'Σε αναμονή τηλεφωνικής επικοινωνίας': 'c_status_awaiting_call',
    'Ενδιαφέρεται': 'c_status_interested',
    'Δεν Ενδιαφέρεται': 'c_status_not_interested'
  };

  // --- Πωλήσεις ---------------------------------------------------------
  // KPIs — καθαρά ποσά, χωρίς ΦΠΑ (η στήλη netSales έχει ήδη αφαιρέσει τον φόρο).
  const salesTx = salesDaily.reduce((s, r) => s + (r.transactions || 0), 0);
  const salesItems = salesDaily.reduce((s, r) => s + (r.itemCount || 0), 0);
  const salesNet = salesDaily.reduce((s, r) => s + (r.netSales || 0), 0);
  const avgTicket = salesTx ? salesNet / salesTx : 0;
  const avgBasket = salesTx ? salesItems / salesTx : 0;

  // Τάση ανά μήνα (καθαρές πωλήσεις / συναλλαγές / μέσο καλάθι).
  const monthMap = {};
  salesDaily.forEach((r) => {
    if (!r.date) return;
    const mk = monthKey(r.date);
    if (!monthMap[mk]) monthMap[mk] = { tx: 0, net: 0, items: 0 };
    monthMap[mk].tx += r.transactions || 0;
    monthMap[mk].net += r.netSales || 0;
    monthMap[mk].items += r.itemCount || 0;
  });
  const monthKeys = Object.keys(monthMap).sort();
  const monthNet = monthKeys.map((k) => monthMap[k].net);
  const monthTx = monthKeys.map((k) => monthMap[k].tx);
  const monthAvgBasket = monthKeys.map((k) => (monthMap[k].tx ? monthMap[k].items / monthMap[k].tx : 0));
  const monthAvgTicket = monthKeys.map((k) => (monthMap[k].tx ? monthMap[k].net / monthMap[k].tx : 0));
  const netCoords = trendCoords(monthNet);
  const txCoords = trendCoords(monthTx);

  // Τάση ανά ημέρα (καθαρές πωλήσεις / συναλλαγές) — ίδια λογική με το μηνιαίο γράφημα,
  // αλλά με ένα σημείο ανά ημερομηνία. Το πλάτος του γραφήματος μεγαλώνει ανάλογα με τον
  // αριθμό ημερών ώστε να μη στριμώχνονται οι ετικέτες, μέσα σε οριζόντια scrollable θήκη.
  const dayMap = {};
  salesDaily.forEach((r) => {
    if (!r.date) return;
    if (!dayMap[r.date]) dayMap[r.date] = { tx: 0, net: 0 };
    dayMap[r.date].tx += r.transactions || 0;
    dayMap[r.date].net += r.netSales || 0;
  });
  const dayKeys = Object.keys(dayMap).sort();
  const dayNet = dayKeys.map((k) => dayMap[k].net);
  const dayTx = dayKeys.map((k) => dayMap[k].tx);
  const dayChartWidth = Math.max(360, dayKeys.length * 42);
  const dayNetCoords = trendCoords(dayNet, dayChartWidth);
  const dayTxCoords = trendCoords(dayTx, dayChartWidth);

  // Top 5 προϊόντα + κατηγορίες: το Sales Analysis Report δίνει ΕΝΑ συγκεντρωτικό
  // σύνολο ανά προϊόν για ΟΛΗ την περίοδο που ζητήθηκε κατά την εξαγωγή (δεν έχει
  // per-row ημερομηνία μέσα στο αρχείο) — άρα δεν μπορεί να "σπάσει" σε ξεχωριστούς
  // ημερολογιακούς μήνες με αξιοπιστία. Δείχνουμε λοιπόν την πιο πρόσφατη παρτίδα ανά
  // κατάστημα ως ΕΝΑ ενιαίο μπλοκ, με τίτλο ακριβώς την περίοδο που δηλώνει το ίδιο το
  // αρχείο (π.χ. "01/05/2026 – 25/07/2026") — τίμιο ως προς το τι πραγματικά ξέρουμε.
  const latestBatchByStore = {};
  salesProducts.forEach((p) => {
    const cur = latestBatchByStore[p.store];
    if (!cur || new Date(p.uploadedAt) > new Date(cur)) latestBatchByStore[p.store] = p.uploadedAt;
  });
  const currentProducts = salesProducts.filter((p) => p.uploadedAt === latestBatchByStore[p.store]);

  const productTotals = {};
  const categoryTotals = {};
  let periodStart = null;
  let periodEnd = null;
  currentProducts.forEach((p) => {
    const name = p.productName || '—';
    if (!productTotals[name]) productTotals[name] = { sold: 0, netRevenue: 0 };
    productTotals[name].sold += p.sold || 0;
    productTotals[name].netRevenue += p.netRevenue || 0;

    const cat = p.cat1 || t('d_category_uncategorized_label');
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (p.netRevenue || 0);

    const label = p.periodLabel || '';
    const matches = [...label.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
    if (matches.length) {
      const first = matches[0];
      const last = matches[matches.length - 1];
      const firstText = `${first[1]}/${first[2]}/${first[3]}`;
      const firstDate = new Date(`${first[3]}-${first[2]}-${first[1]}`);
      const lastText = `${last[1]}/${last[2]}/${last[3]}`;
      const lastDate = new Date(`${last[3]}-${last[2]}-${last[1]}`);
      if (!periodStart || firstDate < periodStart.date) periodStart = { date: firstDate, text: firstText };
      if (!periodEnd || lastDate > periodEnd.date) periodEnd = { date: lastDate, text: lastText };
    }
  });
  const periodRangeText = periodStart && periodEnd
    ? (periodStart.text === periodEnd.text ? periodStart.text : `${periodStart.text} – ${periodEnd.text}`)
    : '';

  const productTotalsList = Object.entries(productTotals).map(([name, v]) => ({ name, ...v }));
  const topProducts = [...productTotalsList].sort((a, b) => b.sold - a.sold).slice(0, 20);
  const worstProducts = [...productTotalsList].sort((a, b) => a.sold - b.sold).slice(0, 20);
  const categoryBreakdown = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const categoryMax = categoryBreakdown.length ? categoryBreakdown[0][1] : 1;

  // Top 20 / Χειρότερα 20 ΜΕΣΑ σε κάθε κατηγορία (ποσότητα) — πάνω στα ίδια
  // currentProducts (πιο πρόσφατη παρτίδα ανά κατάστημα) που χρησιμοποιεί ήδη το
  // παραπάνω flat Top20/Worst20 block, ομαδοποιημένα κατά Cat1.
  const categoryProductTotals = {};
  currentProducts.forEach((p) => {
    const cat = p.cat1 || t('d_category_uncategorized_label');
    const name = p.productName || '—';
    if (!categoryProductTotals[cat]) categoryProductTotals[cat] = {};
    categoryProductTotals[cat][name] = (categoryProductTotals[cat][name] || 0) + (p.sold || 0);
  });
  const categoryTopWorst20 = Object.entries(categoryProductTotals)
    .map(([cat, totals]) => {
      const list = Object.entries(totals).map(([name, sold]) => ({ name, sold }));
      const top20 = [...list].sort((a, b) => b.sold - a.sold).slice(0, 20);
      const worst20 = [...list].sort((a, b) => a.sold - b.sold).slice(0, 20);
      const categoryTotal = list.reduce((s, p) => s + p.sold, 0);
      return { cat, top20, worst20, categoryTotal };
    })
    .sort((a, b) => b.categoryTotal - a.categoryTotal);

  // --- Top20/Worst20 ΜΕ ΒΑΣΗ ΤΗ ΜΕΣΗ ΗΜΕΡΗΣΙΑ ΠΩΛΗΣΗ (ημέρες "ενεργό") ---------
  // Το Sales Analysis Report δεν έχει per-day γραμμές ανά προϊόν, μόνο ένα σύνολο
  // ανά batch/period. Ορίζουμε λοιπόν "ενεργή" ημέρα ενός προϊόντος ως κάθε ημέρα
  // μέσα στο period του batch όπου το προϊόν είχε sold > 0.
  // ΣΗΜΑΝΤΙΚΟ: χρησιμοποιούμε ΜΟΝΟ currentProducts (το πιο πρόσφατο batch ανά
  // κατάστημα — ίδιο dedup με το flat Top20/Worst20 παραπάνω), ΟΧΙ όλο το ιστορικό
  // salesProducts. Τα Sales Analysis Reports είναι συνήθως ΣΩΡΕΥΤΙΚΑ (κάθε νέο
  // ανέβασμα ξανακαλύπτει όλη την περίοδο από την αρχή) — αν χρησιμοποιούσαμε όλα
  // τα ιστορικά batches, οι επικαλυπτόμενες περίοδοι θα μετρούσαν τις ίδιες
  // πωλήσεις πολλαπλές φορές και θα φούσκωναν τους αριθμούς.
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

  const activeDaysByProduct = {}; // name -> Set('yyyy-mm-dd')
  const soldByProductAllTime = {}; // name -> σύνολο πωλήσεων στις ενεργές ημέρες
  const activeDaysByCategoryProduct = {}; // cat -> name -> Set
  const soldByCategoryProduct = {}; // cat -> name -> σύνολο

  currentProducts.forEach((p) => {
    if (!(p.sold > 0)) return;
    const range = extractPeriodRange(p.periodLabel);
    if (!range) return;
    const name = p.productName || '—';
    const cat = p.cat1 || t('d_category_uncategorized_label');

    if (!activeDaysByProduct[name]) activeDaysByProduct[name] = new Set();
    soldByProductAllTime[name] = (soldByProductAllTime[name] || 0) + (p.sold || 0);

    if (!activeDaysByCategoryProduct[cat]) activeDaysByCategoryProduct[cat] = {};
    if (!activeDaysByCategoryProduct[cat][name]) activeDaysByCategoryProduct[cat][name] = new Set();
    if (!soldByCategoryProduct[cat]) soldByCategoryProduct[cat] = {};
    soldByCategoryProduct[cat][name] = (soldByCategoryProduct[cat][name] || 0) + (p.sold || 0);

    const cursor = new Date(range.start);
    while (cursor <= range.end) {
      const iso = cursor.toISOString().slice(0, 10);
      activeDaysByProduct[name].add(iso);
      activeDaysByCategoryProduct[cat][name].add(iso);
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  const dailyRateList = Object.keys(activeDaysByProduct).map((name) => {
    const activeDays = activeDaysByProduct[name].size;
    const sold = soldByProductAllTime[name] || 0;
    return { name, activeDays, sold, rate: activeDays ? sold / activeDays : 0 };
  });
  const topByDailyRate = [...dailyRateList].sort((a, b) => b.rate - a.rate).slice(0, 20);
  const worstByDailyRate = [...dailyRateList].sort((a, b) => a.rate - b.rate).slice(0, 20);

  const categoryDailyRateTopWorst20 = Object.entries(activeDaysByCategoryProduct)
    .map(([cat, byName]) => {
      const list = Object.entries(byName).map(([name, daysSet]) => {
        const activeDays = daysSet.size;
        const sold = soldByCategoryProduct[cat][name] || 0;
        return { name, activeDays, sold, rate: activeDays ? sold / activeDays : 0 };
      });
      const top20 = [...list].sort((a, b) => b.rate - a.rate).slice(0, 20);
      const worst20 = [...list].sort((a, b) => a.rate - b.rate).slice(0, 20);
      const categoryTotal = list.reduce((s, p) => s + p.sold, 0);
      return { cat, top20, worst20, categoryTotal };
    })
    .sort((a, b) => b.categoryTotal - a.categoryTotal);

  // --- Πωλήσεις (τεμάχια) ανά Κατηγορία, ανά ΜΗΝΑ (01–31) ---------------------
  // Το Sales Analysis Report δίνει ένα σύνολο ανά batch/period (όχι per-day). Στην
  // πράξη οι περίοδοι που ανεβάζει ο χρήστης καλύπτουν συχνά πάνω από έναν μήνα
  // (π.χ. 01/05–27/07), οπότε δεν υπάρχει καθόλου "καθαρό" μηνιαίο batch να δείξουμε
  // — αυτό δοκιμάστηκε και δεν επέστρεφε τίποτα. Αντ' αυτού, καταμερίζουμε (prorate)
  // το σύνολο κάθε προϊόντος ΑΝΑΛΟΓΙΚΑ στους μήνες που καλύπτει η περίοδός του, με
  // βάση το πλήθος ημερών που πέφτουν σε κάθε μήνα (π.χ. αν η περίοδος έχει 88 μέρες
  // και 27 απ' αυτές είναι μέσα στον Ιούλιο, ο Ιούλιος παίρνει 27/88 του συνόλου).
  // Αυτό δίνει μια λογική εκτίμηση ανά μήνα (υποθέτοντας σταθερό ρυθμό πωλήσεων μέσα
  // στην περίοδο) αντί για μηδενικά ή ολόκληρο το σύνολο σε έναν μήνα. Χρησιμοποιούμε
  // ΜΟΝΟ currentProducts (πιο πρόσφατο batch ανά κατάστημα) ώστε να μη διπλομετρηθούν
  // σωρευτικά reports.
  function daysBetweenInclusive(a, b) {
    return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  }
  const monthCategoryQty = {}; // monthKey -> { cat -> qty }
  const monthCategoryProductQty = {}; // monthKey -> { cat -> { productName -> qty } }
  const monthPeriodTexts = {}; // monthKey -> Set(periodText) — για το hint
  currentProducts.forEach((p) => {
    if (!(p.sold > 0)) return;
    const range = extractPeriodRange(p.periodLabel);
    if (!range) return;
    const { start, end } = range;
    const totalDays = daysBetweenInclusive(start, end);
    if (totalDays <= 0) return;
    const cat = p.cat1 || t('d_category_uncategorized_label');
    const productName = p.productName || '—';

    // Σπάσιμο της περιόδου σε ημερολογιακούς μήνες.
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
        if (!monthCategoryQty[mk]) monthCategoryQty[mk] = {};
        monthCategoryQty[mk][cat] = (monthCategoryQty[mk][cat] || 0) + qty;
        if (!monthCategoryProductQty[mk]) monthCategoryProductQty[mk] = {};
        if (!monthCategoryProductQty[mk][cat]) monthCategoryProductQty[mk][cat] = {};
        monthCategoryProductQty[mk][cat][productName] = (monthCategoryProductQty[mk][cat][productName] || 0) + qty;
        if (!monthPeriodTexts[mk]) monthPeriodTexts[mk] = new Set();
        if (p.periodLabel) monthPeriodTexts[mk].add(p.periodLabel);
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  });
  const categoryMonthlyQtyList = Object.keys(monthCategoryQty)
    .sort()
    .map((mk) => {
      const categories = Object.entries(monthCategoryQty[mk])
        .map(([cat, qty]) => ({
          cat,
          qty: Math.round(qty),
          products: Object.entries(monthCategoryProductQty[mk][cat] || {})
            .map(([name, pqty]) => ({ name, qty: Math.round(pqty) }))
            .sort((a, b) => b.qty - a.qty)
        }))
        .sort((a, b) => b.qty - a.qty);
      const totalQty = categories.reduce((s, c) => s + c.qty, 0);
      return { monthKey: mk, periodTexts: Array.from(monthPeriodTexts[mk] || []), categories, totalQty };
    });

  // --- Ώρες Αιχμής (peak hours) --------------------------------------------
  // Ένα report "Sales By 30/15 Minutes" καλύπτει όλη την εφαρμογή μαζί (όχι ανά
  // κατάστημα) — κρατάμε μόνο την πιο πρόσφατη ανεβασμένη παρτίδα.
  const latestTimeBucketUploadedAt = salesTimeBuckets.reduce((max, r) => (!max || new Date(r.uploadedAt) > new Date(max) ? r.uploadedAt : max), null);
  const peakHoursBuckets = salesTimeBuckets
    .filter((r) => r.uploadedAt === latestTimeBucketUploadedAt)
    .sort((a, b) => (a.bucketStart > b.bucketStart ? 1 : a.bucketStart < b.bucketStart ? -1 : 0));
  const peakHoursMax = peakHoursBuckets.length ? Math.max(...peakHoursBuckets.map((b) => b.grossSales)) : 0;
  const peakHoursPeriodLabel = peakHoursBuckets.length ? peakHoursBuckets[0].periodLabel : '';
  const peakHourBucket = peakHoursBuckets.reduce((best, b) => (!best || b.grossSales > best.grossSales ? b : best), null);

  // --- Βάρδιες ανά κατάστημα -------------------------------------------------
  // Μόνο καταστήματα από την κεντρική λίστα (Προϊόντα → Cost → Κατάστημα) — το report
  // περιέχει και μη-πραγματικά "καταστήματα" όπως "Inventory Units", που δεν έχει νόημα
  // να εμφανιστούν εδώ.
  const knownStoreNames = new Set();
  allProducts.forEach((p) => (p.stores || []).forEach((s) => s && s.name && knownStoreNames.add(s.name)));
  const latestShiftUploadedAt = salesShiftBreakdown.reduce((max, r) => (!max || new Date(r.uploadedAt) > new Date(max) ? r.uploadedAt : max), null);
  const shiftRowsLatest = salesShiftBreakdown.filter((r) => r.uploadedAt === latestShiftUploadedAt && knownStoreNames.has(r.store));
  const shiftPeriodLabel = shiftRowsLatest.length ? shiftRowsLatest[0].periodLabel : '';
  const shiftLabelsOrder = [];
  const shiftByStore = {};
  shiftRowsLatest.forEach((r) => {
    if (!shiftLabelsOrder.includes(r.shiftLabel)) shiftLabelsOrder.push(r.shiftLabel);
    if (!shiftByStore[r.store]) shiftByStore[r.store] = {};
    shiftByStore[r.store][r.shiftLabel] = r;
  });
  const shiftStoreRows = Object.entries(shiftByStore).sort((a, b) => {
    const totalA = Object.values(a[1]).reduce((s, r) => s + (r.sales || 0), 0);
    const totalB = Object.values(b[1]).reduce((s, r) => s + (r.sales || 0), 0);
    return totalB - totalA;
  });

  const hasSalesData = salesDaily.length > 0 || salesProducts.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e5ea', background: '#fff', flexShrink: 0 }}>
        <strong style={{ fontSize: 15 }}>{t('title_dashboard')}</strong>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f9fafb' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 1. Πωλήσεις — καθαρά ποσά (χωρίς ΦΠΑ), από τα uploads στο πεδίο "Πωλήσεις" */}
          {!isDriver && (
          <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 22, overflow: 'hidden' }}>
            <div style={{ margin: '-22px -22px 16px', padding: '14px 22px', background: '#2f8f8a', color: '#fff', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', borderRadius: '12px 12px 0 0' }}>
              {t('d_sales_title')}
            </div>
            {!hasSalesData ? (
              <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_sales_empty')}</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: '#16233f' }}>€{salesNet.toFixed(0)}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_sales_net')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: '#2f8f8a' }}>{salesTx}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_sales_tx')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: '#c98a1f' }}>€{avgTicket.toFixed(2)}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_sales_avg_ticket')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: '#7a4fc9' }}>{avgBasket.toFixed(2)}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_sales_avg_basket')}</div>
                  </div>
                </div>

                {monthKeys.length > 1 && (
                  <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18, marginBottom: 22 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>{t('d_sales_trend_title')}</span>
                      <div style={{ display: 'flex', gap: 12, fontSize: 10.5, color: '#6b7684' }}>
                        <span><span style={{ display: 'inline-block', width: 14, height: 2.5, background: SALES_LINE_COLORS.net, marginRight: 4, verticalAlign: 'middle' }} />{t('d_sales_net')}</span>
                        <span><span style={{ display: 'inline-block', width: 14, height: 2.5, background: SALES_LINE_COLORS.tx, marginRight: 4, verticalAlign: 'middle' }} />{t('d_sales_tx')}</span>
                      </div>
                    </div>
                    <svg viewBox="0 0 360 110" style={{ width: '100%', height: 160 }}>
                      <polyline points={coordsToPoints(netCoords)} fill="none" stroke={SALES_LINE_COLORS.net} strokeWidth="2.5" />
                      <polyline points={coordsToPoints(txCoords)} fill="none" stroke={SALES_LINE_COLORS.tx} strokeWidth="2" strokeDasharray="4,3" />
                      {netCoords.map((c, i) => (
                        <g key={'net' + i}>
                          <circle cx={c.x} cy={c.y} r="3" fill={SALES_LINE_COLORS.net} />
                          <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill={SALES_LINE_COLORS.net}>
                            {formatEuro(c.value)}
                          </text>
                        </g>
                      ))}
                      {txCoords.map((c, i) => (
                        <g key={'tx' + i}>
                          <circle cx={c.x} cy={c.y} r="3" fill={SALES_LINE_COLORS.tx} />
                          <text x={c.x} y={c.y + 16} textAnchor="middle" fontSize="9" fontWeight="700" fill={SALES_LINE_COLORS.tx}>
                            {Math.round(c.value)}
                          </text>
                        </g>
                      ))}
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#97a2b0', marginTop: 4 }}>
                      {monthKeys.map((k) => <span key={k}>{monthLabel(k, lang)}</span>)}
                    </div>
                  </div>
                )}

                {dayKeys.length > 1 && (
                  <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18, marginBottom: 22 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>{t('d_sales_daily_trend_title')}</span>
                      <div style={{ display: 'flex', gap: 12, fontSize: 10.5, color: '#6b7684' }}>
                        <span><span style={{ display: 'inline-block', width: 14, height: 2.5, background: SALES_LINE_COLORS.net, marginRight: 4, verticalAlign: 'middle' }} />{t('d_sales_net')}</span>
                        <span><span style={{ display: 'inline-block', width: 14, height: 2.5, background: SALES_LINE_COLORS.tx, marginRight: 4, verticalAlign: 'middle' }} />{t('d_sales_tx')}</span>
                      </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <svg viewBox={`0 0 ${dayChartWidth} 110`} style={{ width: dayChartWidth, height: 160, display: 'block' }}>
                        <polyline points={coordsToPoints(dayNetCoords)} fill="none" stroke={SALES_LINE_COLORS.net} strokeWidth="2.5" />
                        <polyline points={coordsToPoints(dayTxCoords)} fill="none" stroke={SALES_LINE_COLORS.tx} strokeWidth="2" strokeDasharray="4,3" />
                        {dayNetCoords.map((c, i) => (
                          <g key={'net' + i}>
                            <circle cx={c.x} cy={c.y} r="2.5" fill={SALES_LINE_COLORS.net} />
                            <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="8" fontWeight="700" fill={SALES_LINE_COLORS.net}>
                              {formatEuro(c.value)}
                            </text>
                          </g>
                        ))}
                        {dayTxCoords.map((c, i) => (
                          <g key={'tx' + i}>
                            <circle cx={c.x} cy={c.y} r="2.5" fill={SALES_LINE_COLORS.tx} />
                            <text x={c.x} y={c.y + 15} textAnchor="middle" fontSize="8" fontWeight="700" fill={SALES_LINE_COLORS.tx}>
                              {Math.round(c.value)}
                            </text>
                          </g>
                        ))}
                      </svg>
                      <div style={{ display: 'flex', width: dayChartWidth, justifyContent: 'space-between', fontSize: 9.5, color: '#97a2b0', marginTop: 4 }}>
                        {dayKeys.map((k) => <span key={k}>{dayLabel(k)}</span>)}
                      </div>
                    </div>
                  </div>
                )}

                {monthKeys.length > 0 && (
                  <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18, marginBottom: 22 }}>
                    <div style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                      {t('d_sales_monthly_kpi_title')}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 480 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #eef1f4' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('d_month')}</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('d_sales_net')}</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('d_sales_tx')}</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('d_sales_avg_ticket')}</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('d_sales_avg_basket')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthKeys.map((k, i) => (
                            <tr key={k} style={{ borderTop: '1px solid #eef1f4' }}>
                              <td style={{ padding: '7px 8px', fontWeight: 600 }}>{monthLabel(k, lang)}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#16233f', fontWeight: 700 }}>{formatEuro(monthNet[i])}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#2f8f8a' }}>{monthTx[i]}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#c98a1f' }}>€{monthAvgTicket[i].toFixed(2)}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#7a4fc9' }}>{monthAvgBasket[i].toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('d_sales_by_category_monthly_title')}
                    </span>
                    {periodRangeText && (
                      <span style={{ fontSize: 11.5, color: '#97a2b0' }}>{t('d_sales_period_label')} {periodRangeText}</span>
                    )}
                  </div>
                  {categoryBreakdown.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_sales_no_products')}</p>
                  ) : (
                    <div style={{ maxWidth: 420 }}>
                      {categoryBreakdown.map(([cat, val]) => (
                        <Bar key={cat} label={cat} value={Math.round(val)} max={categoryMax} color="#2f8f8a" />
                      ))}
                    </div>
                  )}
                </div>

                {peakHoursBuckets.length > 0 && (
                  <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18, marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>
                        {t('d_peak_hours_title')}
                      </span>
                      {peakHoursPeriodLabel && (
                        <span style={{ fontSize: 11.5, color: '#97a2b0' }}>{t('d_sales_period_label')} {peakHoursPeriodLabel}</span>
                      )}
                      {peakHourBucket && (
                        <span style={{ fontSize: 11.5, color: '#2f8f8a', fontWeight: 700 }}>
                          {t('d_peak_hours_peak_prefix')} {peakHourBucket.bucketStart} ({formatEuro(peakHourBucket.grossSales)})
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 100, overflowX: 'auto' }}>
                      {peakHoursBuckets.map((b) => {
                        const pct = peakHoursMax ? Math.max(2, Math.round((b.grossSales / peakHoursMax) * 100)) : 2;
                        const isPeak = peakHourBucket && b.bucketStart === peakHourBucket.bucketStart;
                        return (
                          <div
                            key={b.bucketStart}
                            title={`${b.bucketLabel}: ${formatEuro(b.grossSales)} (${b.transactions} ${t('d_sales_tx')})`}
                            style={{ flex: '1 0 4px', minWidth: 4, height: pct + '%', background: isPeak ? '#c98a1f' : '#2f8f8a', borderRadius: '2px 2px 0 0' }}
                          />
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#97a2b0', marginTop: 4 }}>
                      {peakHoursBuckets.filter((b, i) => i % Math.ceil(peakHoursBuckets.length / 12) === 0).map((b) => (
                        <span key={b.bucketStart}>{b.bucketStart}</span>
                      ))}
                    </div>
                  </div>
                )}

                {shiftStoreRows.length > 0 && (
                  <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18, marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>
                        {t('d_shift_breakdown_title')}
                      </span>
                      {shiftPeriodLabel && (
                        <span style={{ fontSize: 11.5, color: '#97a2b0' }}>{t('d_sales_period_label')} {shiftPeriodLabel}</span>
                      )}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #eef1f4' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#97a2b0', fontWeight: 700 }}>{t('sales_col_store')}</th>
                            {shiftLabelsOrder.map((label) => (
                              <th key={label} style={{ textAlign: 'right', padding: '6px 8px', color: '#97a2b0', fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {shiftStoreRows.map(([store, shifts]) => {
                            const busiestSales = Math.max(...shiftLabelsOrder.map((l) => (shifts[l] ? shifts[l].sales : 0)));
                            return (
                              <tr key={store} style={{ borderTop: '1px solid #eef1f4' }}>
                                <td style={{ padding: '7px 8px', fontWeight: 600 }}>{store}</td>
                                {shiftLabelsOrder.map((label) => {
                                  const r = shifts[label];
                                  const isBusiest = r && busiestSales > 0 && r.sales === busiestSales;
                                  return (
                                    <td key={label} style={{ padding: '7px 8px', textAlign: 'right', color: isBusiest ? '#16233f' : '#6b7684', fontWeight: isBusiest ? 700 : 400 }}>
                                      {r ? formatEuro(r.sales) : '—'}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('d_sales_top_products_monthly_title')}
                    </span>
                    {periodRangeText && (
                      <span style={{ fontSize: 11.5, color: '#97a2b0' }}>{t('d_sales_period_label')} {periodRangeText}</span>
                    )}
                  </div>
                  {topProducts.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_sales_no_products')}</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 480 }}>
                        <div style={{ fontSize: 11.5, color: '#2f8f8a', fontWeight: 700, marginBottom: 8 }}>
                          {t('d_sales_top20_label')}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                          <tbody>
                            {topProducts.map((p) => (
                              <tr key={p.name} style={{ borderTop: '1px solid #eef1f4' }}>
                                <td style={{ padding: '6px 0' }}>{p.name}</td>
                                <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{p.sold} {t('d_pieces_abbr')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 480 }}>
                        <div style={{ fontSize: 11.5, color: '#c0392b', fontWeight: 700, marginBottom: 8 }}>
                          {t('d_sales_worst20_label')}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                          <tbody>
                            {worstProducts.map((p) => (
                              <tr key={p.name} style={{ borderTop: '1px solid #eef1f4' }}>
                                <td style={{ padding: '6px 0' }}>{p.name}</td>
                                <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{p.sold} {t('d_pieces_abbr')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18, marginTop: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: showCategoryBreakdown ? 12 : 0 }}>
                    <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('d_category_breakdown_title')}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '5px 12px', fontSize: 11.5 }}
                      onClick={() => setShowCategoryBreakdown((v) => !v)}
                    >
                      {showCategoryBreakdown ? t('d_category_breakdown_hide') : t('d_category_breakdown_show')}
                    </button>
                  </div>
                  {showCategoryBreakdown && (
                    categoryTopWorst20.length === 0 ? (
                      <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_sales_no_products')}</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {categoryTopWorst20.map(({ cat, top20, worst20 }) => (
                          <div key={cat} style={{ border: '1px solid #eef1f4', borderRadius: 8, padding: 14 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16233f', marginBottom: 10 }}>{cat}</div>
                            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                              <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 420 }}>
                                <div style={{ fontSize: 11, color: '#2f8f8a', fontWeight: 700, marginBottom: 8 }}>{t('d_category_top20_label')}</div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                  <tbody>
                                    {top20.map((p) => (
                                      <tr key={p.name} style={{ borderTop: '1px solid #eef1f4' }}>
                                        <td style={{ padding: '5px 0' }}>{p.name}</td>
                                        <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{p.sold} {t('d_pieces_abbr')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 420 }}>
                                <div style={{ fontSize: 11, color: '#c0392b', fontWeight: 700, marginBottom: 8 }}>{t('d_category_worst20_label')}</div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                  <tbody>
                                    {worst20.map((p) => (
                                      <tr key={p.name} style={{ borderTop: '1px solid #eef1f4' }}>
                                        <td style={{ padding: '5px 0' }}>{p.name}</td>
                                        <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{p.sold} {t('d_pieces_abbr')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>

                <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18, marginTop: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: showActiveDaysBreakdown ? 6 : 0 }}>
                    <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('d_active_days_breakdown_title')}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '5px 12px', fontSize: 11.5 }}
                      onClick={() => setShowActiveDaysBreakdown((v) => !v)}
                    >
                      {showActiveDaysBreakdown ? t('d_category_breakdown_hide') : t('d_category_breakdown_show')}
                    </button>
                  </div>
                  {showActiveDaysBreakdown && (
                    <>
                      <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 14px' }}>{t('d_active_days_breakdown_hint')}</p>

                      {dailyRateList.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_sales_no_products')}</p>
                      ) : (
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
                          <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 480 }}>
                            <div style={{ fontSize: 11.5, color: '#2f8f8a', fontWeight: 700, marginBottom: 8 }}>
                              {t('d_sales_top20_label')}
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                              <tbody>
                                {topByDailyRate.map((p) => (
                                  <tr key={p.name} style={{ borderTop: '1px solid #eef1f4' }}>
                                    <td style={{ padding: '6px 0' }}>{p.name}</td>
                                    <td style={{ padding: '6px 0', textAlign: 'right', color: '#97a2b0', whiteSpace: 'nowrap', fontSize: 11 }}>{p.activeDays} {t('d_active_days_abbr')}</td>
                                    <td style={{ padding: '6px 0 6px 10px', textAlign: 'right', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{p.rate.toFixed(1)} {t('d_active_days_rate_abbr')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 480 }}>
                            <div style={{ fontSize: 11.5, color: '#c0392b', fontWeight: 700, marginBottom: 8 }}>
                              {t('d_sales_worst20_label')}
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                              <tbody>
                                {worstByDailyRate.map((p) => (
                                  <tr key={p.name} style={{ borderTop: '1px solid #eef1f4' }}>
                                    <td style={{ padding: '6px 0' }}>{p.name}</td>
                                    <td style={{ padding: '6px 0', textAlign: 'right', color: '#97a2b0', whiteSpace: 'nowrap', fontSize: 11 }}>{p.activeDays} {t('d_active_days_abbr')}</td>
                                    <td style={{ padding: '6px 0 6px 10px', textAlign: 'right', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{p.rate.toFixed(1)} {t('d_active_days_rate_abbr')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {categoryDailyRateTopWorst20.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                          {categoryDailyRateTopWorst20.map(({ cat, top20, worst20 }) => (
                            <div key={cat} style={{ border: '1px solid #eef1f4', borderRadius: 8, padding: 14 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16233f', marginBottom: 10 }}>{cat}</div>
                              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 420 }}>
                                  <div style={{ fontSize: 11, color: '#2f8f8a', fontWeight: 700, marginBottom: 8 }}>{t('d_category_top20_label')}</div>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                    <tbody>
                                      {top20.map((p) => (
                                        <tr key={p.name} style={{ borderTop: '1px solid #eef1f4' }}>
                                          <td style={{ padding: '5px 0' }}>{p.name}</td>
                                          <td style={{ padding: '5px 0', textAlign: 'right', color: '#97a2b0', whiteSpace: 'nowrap', fontSize: 11 }}>{p.activeDays} {t('d_active_days_abbr')}</td>
                                          <td style={{ padding: '5px 0 5px 10px', textAlign: 'right', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{p.rate.toFixed(1)} {t('d_active_days_rate_abbr')}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 420 }}>
                                  <div style={{ fontSize: 11, color: '#c0392b', fontWeight: 700, marginBottom: 8 }}>{t('d_category_worst20_label')}</div>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                    <tbody>
                                      {worst20.map((p) => (
                                        <tr key={p.name} style={{ borderTop: '1px solid #eef1f4' }}>
                                          <td style={{ padding: '5px 0' }}>{p.name}</td>
                                          <td style={{ padding: '5px 0', textAlign: 'right', color: '#97a2b0', whiteSpace: 'nowrap', fontSize: 11 }}>{p.activeDays} {t('d_active_days_abbr')}</td>
                                          <td style={{ padding: '5px 0 5px 10px', textAlign: 'right', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{p.rate.toFixed(1)} {t('d_active_days_rate_abbr')}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18, marginTop: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: showCategoryMonthlyQty ? 6 : 0 }}>
                    <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('d_category_monthly_qty_title')}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '5px 12px', fontSize: 11.5 }}
                      onClick={() => setShowCategoryMonthlyQty((v) => !v)}
                    >
                      {showCategoryMonthlyQty ? t('d_category_breakdown_hide') : t('d_category_breakdown_show')}
                    </button>
                  </div>
                  {showCategoryMonthlyQty && (
                    <>
                      <p style={{ fontSize: 11.5, color: '#97a2b0', margin: '0 0 14px' }}>{t('d_category_monthly_qty_hint')}</p>
                      {categoryMonthlyQtyList.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_sales_no_products')}</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                          {categoryMonthlyQtyList.map(({ monthKey: mk, periodTexts, categories, totalQty }) => (
                            <div key={mk} style={{ border: '1px solid #eef1f4', borderRadius: 8, padding: 14 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#16233f' }}>{monthLabel(mk, lang)}</span>
                                {periodTexts.length > 0 && (
                                  <span style={{ fontSize: 11, color: '#97a2b0' }}>({periodTexts.join(', ')})</span>
                                )}
                              </div>
                              <div style={{ fontSize: 12.5, color: '#2f8f8a', fontWeight: 700, marginBottom: 10 }}>
                                {t('d_category_monthly_qty_total_label')}: {totalQty} {t('d_pieces_abbr')}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {categories.map((c) => {
                                  const key = `${mk}|${c.cat}`;
                                  const isOpen = expandedMonthCategories.has(key);
                                  return (
                                    <div key={c.cat} style={{ borderTop: '1px solid #eef1f4' }}>
                                      <div
                                        onClick={() => toggleMonthCategory(key)}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
                                      >
                                        <span style={{ fontSize: 12.5 }}>
                                          <span style={{ display: 'inline-block', width: 12, color: '#97a2b0', fontSize: 10 }}>{isOpen ? '▾' : '▸'}</span>
                                          {c.cat}
                                        </span>
                                        <span style={{ fontSize: 12.5, textAlign: 'right', fontWeight: 700, color: '#16233f', whiteSpace: 'nowrap' }}>{c.qty} {t('d_pieces_abbr')}</span>
                                      </div>
                                      {isOpen && (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
                                          <tbody>
                                            {c.products.map((p) => (
                                              <tr key={p.name}>
                                                <td style={{ padding: '3px 0 3px 20px', color: '#6b7684' }}>{p.name}</td>
                                                <td style={{ padding: '3px 0', textAlign: 'right', color: '#3a4353', whiteSpace: 'nowrap' }}>{p.qty} {t('d_pieces_abbr')}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          )}

          {/* 2. Ληγμένα */}
          <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 22, overflow: 'hidden' }}>
            <div style={{ margin: '-22px -22px 16px', padding: '14px 22px', background: '#c0392b', color: '#fff', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', borderRadius: '12px 12px 0 0' }}>
              {t('d_expired_title')}
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#c0392b' }}>{expiredQty}</div>
                <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_expired_pieces')}</div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#e0703a' }}>{bucketToday}</div>
                <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_today_pieces')}</div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#c98a1f' }}>{soonQty}</div>
                <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_soon_pieces')}</div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#16233f' }}>{totalQty}</div>
                <div style={{ fontSize: 12.5, color: '#6b7684' }}>{t('d_total_pieces')}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18 }}>
              <div style={{ fontSize: 13.5, color: '#16233f', fontWeight: 700, marginBottom: 14 }}>
                {t('d_soon_analysis_title')}
              </div>
              {totalQty === 0 ? (
                <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_no_soon')}</p>
              ) : (
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                    {soonQty === 0 ? (
                      <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_no_soon')}</p>
                    ) : (
                      <>
                        <Bar label={t('d_bucket_today')} value={bucketToday} max={maxBucket} color="#c0392b" />
                        <Bar label={t('d_bucket_1_3')} value={bucket1_3} max={maxBucket} color="#e0703a" />
                        <Bar label={t('d_bucket_4_7')} value={bucket4_7} max={maxBucket} color="#c98a1f" />
                      </>
                    )}
                  </div>
                  <div style={{ flex: '1 1 300px', minWidth: 260 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: '#97a2b0', fontWeight: 700, textTransform: 'uppercase' }}>
                        {t('d_by_store_soon')}
                      </span>
                      <div style={{ display: 'flex', gap: 10, fontSize: 10.5, color: '#6b7684', flexWrap: 'wrap' }}>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#7a1f1f', marginRight: 3 }} />{t('d_expired_title')}</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#c0392b', marginRight: 3 }} />{t('d_bucket_today')}</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#e0703a', marginRight: 3 }} />{t('d_bucket_1_3')}</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#c98a1f', marginRight: 3 }} />{t('d_bucket_4_7')}</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#b9c3d6', marginRight: 3 }} />{t('d_bucket_rest')}</span>
                      </div>
                    </div>
                    {storeBreakdown.map(([store, s]) => {
                      const pctExpired = s.total ? Math.round((s.expired / s.total) * 100) : 0;
                      const pctToday = s.total ? Math.round((s.today / s.total) * 100) : 0;
                      const pct1_3 = s.total ? Math.round((s.d1_3 / s.total) * 100) : 0;
                      const pct4_7 = s.total ? Math.round((s.d4_7 / s.total) * 100) : 0;
                      const pctRest = s.total ? Math.max(0, 100 - pctExpired - pctToday - pct1_3 - pct4_7) : 0;
                      return (
                        <div key={store} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13 }}>{store}</span>
                            <strong style={{ fontSize: 13 }}>{s.total} {t('d_pieces_abbr')}</strong>
                          </div>
                          <div style={{ display: 'flex', height: 20, borderRadius: 5, overflow: 'hidden', background: '#f1f3f5' }}>
                            {s.expired > 0 && (
                              <div
                                style={{ width: pctExpired + '%', background: '#7a1f1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>{s.expired}</span>
                              </div>
                            )}
                            {s.today > 0 && (
                              <div
                                style={{ width: pctToday + '%', background: '#c0392b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>{s.today}</span>
                              </div>
                            )}
                            {s.d1_3 > 0 && (
                              <div
                                style={{ width: pct1_3 + '%', background: '#e0703a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>{s.d1_3}</span>
                              </div>
                            )}
                            {s.d4_7 > 0 && (
                              <div
                                style={{ width: pct4_7 + '%', background: '#c98a1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>{s.d4_7}</span>
                              </div>
                            )}
                            {s.rest > 0 && (
                              <div
                                style={{ width: pctRest + '%', background: '#b9c3d6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16233f', textShadow: '0 1px 1px rgba(255,255,255,0.35)' }}>{s.rest}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Επαφές ανά Status — κάτω, σε πλήρες πλάτος */}
          {!isDriver && (
          <div style={{ background: '#fff', border: '1px solid #e1e5ea', borderRadius: 12, padding: 22, overflow: 'hidden' }}>
            <div style={{ margin: '-22px -22px 16px', padding: '14px 22px', background: '#7a4fc9', color: '#fff', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', borderRadius: '12px 12px 0 0' }}>
              {t('d_contacts_by_status')}
            </div>
            {contacts.length === 0 ? (
              <p style={{ fontSize: 13, color: '#97a2b0', margin: 0 }}>{t('d_no_contacts')}</p>
            ) : (
              statusOrder.map((key) => {
                const count = statusGroups[key] || 0;
                if (count === 0) return null;
                const pct = contacts.length ? Math.round((count / contacts.length) * 100) : 0;
                return (
                  <div key={key || 'none'} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{key ? t(statusLabelKeys[key]) : t('d_no_status')}</span>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>
                        {count} <span style={{ fontSize: 12.5, color: '#97a2b0', fontWeight: 400 }}>({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 12, background: '#f1f3f5', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', background: CONTACT_STATUS_COLORS[key] || '#c7cdd6' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
