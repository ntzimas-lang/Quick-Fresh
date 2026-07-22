import { useState } from "react";

const STORE_CANDIDATES = ["DEMO", "Plaisio", "Novibet", "Kryoneri", "Nestle", "AIA", "Metlen", "ACS Courier"];

const CATEGORIES = [
  { gr: "THREPSIS ΓΕΥΜΑΤΑ", en: "THREPSIS MAIN DISHES" },
  { gr: "ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ", en: "SODA – WATER" },
  { gr: "ΓΑΛΑΚΤΟΚΟΜΙΚΑ", en: "YOGURTS" },
  { gr: "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ", en: "NUTS & SWEETS" },
  { gr: "ΣΑΛΑΤΕΣ", en: "SALADS" },
  { gr: "ΦΡΟΥΤΑ", en: "FRUITS" },
  { gr: "ΧΥΜΟΙ - ΤΣΑΪ", en: "BEVERAGES" },
  { gr: "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich", en: "SANDWICHES - G.S." },
  { gr: "PARMA", en: "PARMA" },
  { gr: "ΡΟΦΗΜΑΤΑ", en: "COFFEE" }
];

const ALL_COLUMNS = [
  { key: "categoryGr", label: "Κατηγορία GR" },
  { key: "categoryEn", label: "Κατηγορία EN" },
  { key: "itemCode", label: "Κωδικός είδους" },
  { key: "barcode", label: "Barcode" },
  { key: "descriptionErp", label: "Περιγραφή είδους ERP" },
  { key: "descriptionGr", label: "Περιγραφή είδους GR" },
  { key: "descriptionEn", label: "Περιγραφή είδους EN" },
  { key: "detailedDescriptionGr", label: "Αναλυτική Περιγραφή GR" },
  { key: "detailedDescriptionEn", label: "Αναλυτική Περιγραφή EN" },
  { key: "unitsPerMachine", label: "ΤΕΜ στο μηχάνημα" },
  { key: "status", label: "Status" },
  { key: "activeOnMachine", label: "Ενεργό Στο Μηχάνημα" },
  { key: "activeStores", label: "Ενεργό Σε Κατάστημα" },
  { key: "sellingPrice", label: "Τιμή Πώλησης" },
  { key: "vatPercent", label: "ΦΠΑ %" },
  { key: "ptk", label: "ΠΤΚ" },
  { key: "fc", label: "F.C." },
  { key: "images365", label: "Image - 365" },
  { key: "imagesPromo", label: "Image - Promo" }
];

const DEFAULT_VISIBLE_COLUMNS = ["categoryGr", "itemCode", "barcode", "descriptionErp", "status", "images365"];

function computeFC(p) {
  const vat = p.cost?.vatPercent || 0;
  const price = p.cost?.sellingPrice || 0;
  const ptk = p.cost?.ptk || 0;
  const net = price ? price / (1 + vat / 100) : 0;
  return net > 0 ? (ptk / net) * 100 : NaN;
}

function parseStoreColKey(key) {
  if (!key.startsWith("store:")) return null;
  const parts = key.split(":");
  return { storeName: parts[1], field: parts[2] };
}

function getStoreColumnValue(p, storeName, field) {
  const s = (p.stores || []).find((x) => x.name === storeName);
  if (!s) return null;
  const vat = p.cost?.vatPercent || 0;
  const ptk = p.cost?.ptk || 0;
  if (field === "price") return s.sellingPriceStore;
  if (field === "priceQF") return s.sellingPriceQF;
  if (field === "fc") {
    const net = s.sellingPriceStore ? s.sellingPriceStore / (1 + vat / 100) : null;
    return net ? (ptk / net) * 100 : NaN;
  }
  if (field === "fcQF") {
    const net = s.sellingPriceQF ? s.sellingPriceQF / (1 + vat / 100) : null;
    return net ? (ptk / net) * 100 : NaN;
  }
  return null;
}

function getColumnValue(p, key) {
  const storeCol = parseStoreColKey(key);
  if (storeCol) return getStoreColumnValue(p, storeCol.storeName, storeCol.field);
  if (key === "sellingPrice") return p.cost?.sellingPrice ?? null;
  if (key === "vatPercent") return p.cost?.vatPercent ?? null;
  if (key === "ptk") return p.cost?.ptk ?? null;
  if (key === "fc") return computeFC(p);
  if (key === "activeStores") return (p.activeStores || []).join(", ");
  return p[key];
}

function getFilterText(p, key) {
  const storeCol = parseStoreColKey(key);
  if (storeCol) {
    const v = getStoreColumnValue(p, storeCol.storeName, storeCol.field);
    if (storeCol.field === "fc" || storeCol.field === "fcQF") return isFinite(v) ? Math.round(v) + "" : "";
    return v === null || v === undefined ? "" : String(v);
  }
  if (key === "images365" || key === "imagesPromo") return (p[key] || []).length ? "έχει εικόνα" : "";
  if (key === "fc") {
    const v = computeFC(p);
    return isFinite(v) ? Math.round(v) + "" : "";
  }
  const v = getColumnValue(p, key);
  return v === null || v === undefined ? "" : String(v);
}

function makeEmptyProduct(id) {
  return {
    id,
    categoryGr: "",
    categoryEn: "",
    itemCode: "",
    barcode: "",
    descriptionErp: "",
    unitsPerMachine: null,
    descriptionGr: "Νέο προϊόν",
    descriptionEn: "",
    detailedDescriptionGr: "",
    detailedDescriptionEn: "",
    status: "ΕΝΤΟΣ",
    activeOnMachine: "YES",
    activeStores: [],
    images365: [],
    imagesPromo: [],
    cost: { sellingPrice: 0, ptk: 0, quantity: 0, vatPercent: 13 },
    stores: STORE_CANDIDATES.map((name) => ({ name, sellingPriceStore: null, sellingPriceQF: null }))
  };
}

function makeEmptyBulkRow() {
  return { categoryGr: "", itemCode: "", barcode: "", descriptionGr: "", descriptionEn: "", sellingPrice: "", ptk: "", quantity: "" };
}

const initialProducts = [
  {
    "id": "p1",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0603",
    "barcode": "5213009200301",
    "descriptionErp": "ΜΟΥΣΑΚΑΣ",
    "unitsPerMachine": 10,
    "descriptionGr": "Μoυσακάς",
    "descriptionEn": "Moussaka",
    "detailedDescriptionGr": "Παραδοσιακή συνταγή με αφράτη μπεσαμέλ αρωματισμένη με μοσχοκάρυδο, φρεσκοκομμένο μοσχαρίσιο κιμά, σιγομαγειρεμένο με φρέσκια τομάτα, πατάτες και μελιτζάνες",
    "detailedDescriptionEn": "Traditional recipe with fluffy béchamel flavored with nutmeg, freshly cut minced beef, slow-cooked with fresh tomato, potatoes and eggplants",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [
      "DEMO",
      "Plaisio",
      "Novibet",
      "Kryoneri"
    ],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 6.9,
      "ptk": 3.35,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 5.4,
        "sellingPriceQF": 5.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 6.0,
        "sellingPriceQF": 5.8
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.7,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 3.9,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 5.85,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 6.0,
        "sellingPriceQF": 5.0
      }
    ]
  },
  {
    "id": "p2",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0604",
    "barcode": "5213009200349",
    "descriptionErp": "ΜΠΙΦΤΕΚΙ ΣΧΑΡΑΣ ΜΕ ΠΑΤΑΤΕΣ ΚΑΙ ΛΑΧΑΝΙΚΑ ΨΗΤΑ",
    "unitsPerMachine": 10,
    "descriptionGr": "Μπιφτέκια Σχάρας με ψητά λαχανικά",
    "descriptionEn": "Grilled patties with grilled vegetables",
    "detailedDescriptionGr": "Με φρεσκοκομμένο μοσχαρίσιο κιμά Angus, αρωματισμένο με ρίγανη και ψητά λαχανικά & baby πατάτες φούρνου με ελαιόλαδο Κρήτης",
    "detailedDescriptionEn": "With freshly cut Angus ground beef, flavored with oregano and roasted vegetables & baby baked potatoes with Cretan olive oil",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 6.9,
      "ptk": 3.21,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 5.25,
        "sellingPriceQF": 5.3
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 5.9,
        "sellingPriceQF": 5.7
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.6,
        "sellingPriceQF": 3.9
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 4.3,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 5.85,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 5.9,
        "sellingPriceQF": 4.9
      }
    ]
  },
  {
    "id": "p3",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0609",
    "barcode": "5213011450206",
    "descriptionErp": "ΚΟΤΟΠΟΥΛΟ ΜΠΙΦΤΕΚΙ ΣΧΑΡΑΣ ΚΑΙ ΔΙΧΡΩΜΗ ΚΙΝΟΑ ΜΕ ΛΑΧΑΝΙΚΑ",
    "unitsPerMachine": 10,
    "descriptionGr": "Μπιφτέκι κοτόπουλο με κινόα",
    "descriptionEn": "Chicken patty with quinoa",
    "detailedDescriptionGr": "Με φροσκοκομμένο κιμά από κοτόπουλο, αρωματισμένο με κουρκουμά, ρίγανη, μαϊντανό & δυόσμο, συνοδεύεται με κόκκινη και λευκή κινόα & λαχανικά.",
    "detailedDescriptionEn": "With freshly minced chicken, flavored with turmeric, oregano, parsley & mint, accompanied by red and white quinoa & vegetables",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 6.5,
      "ptk": 2.28,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 4.95,
        "sellingPriceQF": 5.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 5.3,
        "sellingPriceQF": 5.1
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 4.1,
        "sellingPriceQF": 4.25
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 4.3,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 5.4,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 5.3,
        "sellingPriceQF": 4.5
      }
    ]
  },
  {
    "id": "p4",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0611",
    "barcode": "5213011450220",
    "descriptionErp": "ΛΑΖΑΝΙΑ ΦΟΥΡΝΟΥ ΜΕ ΚΟΤΟΠΟΥΛΟ ΣΠΑΝΑΚΙ ΓΡΑΒΙΕΡΑ ΚΙ ΕΣΤΡΑΓΚΟΝ",
    "unitsPerMachine": 10,
    "descriptionGr": "Λαζάνια φούρνου με κοτόπουλο",
    "descriptionEn": "Oven Lasagna with chicken",
    "detailedDescriptionGr": "Με αφράτη μπεσαμέλ αρωματισμένη με μοσχοκάρυδο, κοτόπουλο μπούτι, φρέσκο σπανάκι, εστραγκόν & τυρί γραβιέρα.",
    "detailedDescriptionEn": "With fluffy béchamel flavored with nutmeg, chicken thigh, fresh spinach, tarragon & gruyere cheese",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 6.8,
      "ptk": 3.17,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 5.7,
        "sellingPriceQF": 5.8
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 6.5,
        "sellingPriceQF": 6.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 4.3,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 4.95,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 6.3,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 6.5,
        "sellingPriceQF": 5.0
      }
    ]
  },
  {
    "id": "p5",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0601",
    "barcode": "5213009200295",
    "descriptionErp": "ΠΑΣΤΙΤΣΙΟ",
    "unitsPerMachine": 10,
    "descriptionGr": "ΠΑΣΤΙΤΣΙΟ",
    "descriptionEn": "Pastitsio",
    "detailedDescriptionGr": "Παραδοσιακή συνταγή με αφράτη μπεσαμέλ αρωματισμένη με μοσχοκάρυδο και φρεσκοκομμένο μοσχαρίσιο κιμά, σιγομαγειρεμένο με φρέσκια τομάτα",
    "detailedDescriptionEn": "Traditional recipe with fluffy béchamel flavored with nutmeg and freshly cut minced beef, slow-cooked with fresh tomato",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 6.5,
      "ptk": 3.08,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 4.9,
        "sellingPriceQF": 5.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 5.8,
        "sellingPriceQF": 5.6
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.4,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 3.7,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 5.4,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 5.8,
        "sellingPriceQF": 5.0
      }
    ]
  },
  {
    "id": "p6",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0602",
    "barcode": "5213009200370",
    "descriptionErp": "ΤΟΜΑΤΕΣ-ΠΙΠΕΡΙΕΣ ΓΕΜΙΣΤΕΣ",
    "unitsPerMachine": 10,
    "descriptionGr": "Γεμιστές ντομάτες κα πιπεριές",
    "descriptionEn": "Stuffed tomatoes and peppers",
    "detailedDescriptionGr": "Παραδοσιακή συνταγή με τομάτες και πιπεριές γεμιστές με ρύζι, φρέσκια τομάτα, δυόσμο και πατάτες φούρνου, με ελαιόλαδο Κρήτης",
    "detailedDescriptionEn": "Traditional recipe with tomatoes and peppers stuffed with rice, fresh tomato, mint and baked potatoes, with Cretan olive oil",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.8,
      "ptk": 2.37,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 5.3,
        "sellingPriceQF": 5.4
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 5.5,
        "sellingPriceQF": 5.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.0,
        "sellingPriceQF": 3.2
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 3.7,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 5.85,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 5.5,
        "sellingPriceQF": 4.9
      }
    ]
  },
  {
    "id": "p7",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0607",
    "barcode": "5213011450183",
    "descriptionErp": "ΓΙΓΑΝΤΕΣ ΦΟΥΡΝΟΥ",
    "unitsPerMachine": 10,
    "descriptionGr": "Γίγαντες Φούρνου",
    "descriptionEn": "Oven Giats",
    "detailedDescriptionGr": "Παραδοσιακή συνταγή με φασόλια γίγαντες και σάλτσα τομάτας, αρωματισμένη με σελινόσπορο, κουρκουμά και πιπέρι.",
    "detailedDescriptionEn": "Traditional recipe with giant beans and tomato sauce, flavored with celery seed, turmeric and pepper",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.9,
      "ptk": 1.66,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 3.85,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 3.8,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 2.6,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 3.45,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 4.05,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 3.8,
        "sellingPriceQF": 3.0
      }
    ]
  },
  {
    "id": "p8",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0608",
    "barcode": "5213011450190",
    "descriptionErp": "ΚΕΦΤΕΔΑΚΙΑ ΜΕ ΣΑΛΤΣΑ ΔΥΟΣΜΟΥ ΚΑΙ ΛΙΓΚΟΥΙΝΙ",
    "unitsPerMachine": 10,
    "descriptionGr": "Λιγκουίνι με κεφτεδάκια",
    "descriptionEn": "Linguine with meatballs",
    "detailedDescriptionGr": "Ζυμαρικά λιγκουίνι με κεφτεδάκια από φρεσκοκομμένο μοσχαρίσιο & χοιρινό κιμά, με σάλτσα τομάτας & άρωμα δυόσμου.",
    "detailedDescriptionEn": "Linguine pasta with meatballs made from freshly cut beef & pork minced meat, with tomato sauce & mint flavor",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 6.4,
      "ptk": 2.42,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 4.65,
        "sellingPriceQF": 4.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 5.2,
        "sellingPriceQF": 5.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.9,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 4.05,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 4.95,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 5.2,
        "sellingPriceQF": 4.5
      }
    ]
  },
  {
    "id": "p9",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0884",
    "barcode": "5212056200173",
    "descriptionErp": "ΚΟΝΤΟΣΟΥΒΛΙ ΚΟΤΟΠΟΥΛΟΥ ΜΕ ΧΩΡΙΑΤΙΚΟ ΚΟΥΣ ΚΟΥΣ ΚΑΙ DΙΡ ΓΙΑΟΥΡΤΙΟΥ (Α.Σ)",
    "unitsPerMachine": 10,
    "descriptionGr": "Κοντοσούβλι Κοτόπουλο με χωριάτικο κους-κους",
    "descriptionEn": "Chicken Kontosouvli with cous-cous",
    "detailedDescriptionGr": "Με χωριάτικο κους – κους, πιπεριές Φλωρίνης & πράσινες, καρότο, dip γιαουρτιού",
    "detailedDescriptionEn": "Chicken Kontosouvli\nWith cous – cous, Florina & green peppers, carrot & yogurt dip",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 7.2,
      "ptk": 3.0,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 6.5,
        "sellingPriceQF": 6.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 6.5,
        "sellingPriceQF": 6.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.9,
        "sellingPriceQF": 4.1
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 5.4,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 6.5,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 6.5,
        "sellingPriceQF": 5.0
      }
    ]
  },
  {
    "id": "p10",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0885",
    "barcode": "5212056200180",
    "descriptionErp": "ΚΟΤΟΠΟΥΛΟ ΓΛΥΚΟΞΙΝΟ ΜΕ ΡΥΖΙ ΜΠΑΣΜΑΤΙ (Α.Σ)",
    "unitsPerMachine": 10,
    "descriptionGr": "Γλυκόξινο Κοτόπουλο με ρύζι μπασμάτι",
    "descriptionEn": "Sweat & Sour chicken with basmati rice",
    "detailedDescriptionGr": "Με ρύζι μπασμάτι, πιπεριές Φλωρίνης, πιπεριές κόκκινες – πράσινες & κίτρινες, κρεμμύδι, κολοκυθάκια, sweet chili & teriyaki sauce",
    "detailedDescriptionEn": "With basmati rice, Florina peppers, red – green & yellow peppers, onion, zucchini, sweet chili & teriyaki sauce",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 6.5,
      "ptk": 2.95,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 6.5,
        "sellingPriceQF": 6.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 6.5,
        "sellingPriceQF": 6.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.9,
        "sellingPriceQF": 4.1
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 5.4,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 6.5,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 6.5,
        "sellingPriceQF": 5.0
      }
    ]
  },
  {
    "id": "p11",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0886",
    "barcode": "5212056200197",
    "descriptionErp": "ΤΣΙΠΟΥΡΑ ΦΙΛΕΤΟ ΜΕ ΣΑΛΤΣΑ ΛΕΜΟΝΙ,ΛΟΥΙΖΑ ΚΑΙ ΚΟΥΣ ΚΟΥΣ ΑΡΩΜΑΤΙΚΟ (Α.Σ)",
    "unitsPerMachine": 10,
    "descriptionGr": "Τσιπούρα Φιλέτο με λαχανικά & κους-κους",
    "descriptionEn": "Sea Bream Fillet with vegetables & cous – cous",
    "detailedDescriptionGr": "Με σάλτσα λεμονιού, πιπεριές κόκκινες & πράσινες, καρότο, κρεμμύδι, μουστάρδα, λουίζα & κους – κους",
    "detailedDescriptionEn": "With lemon sauce, red & green peppers, carrot, onion, mustard, lemon verbena & cous – cous",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 8.0,
      "ptk": 3.44,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 7.5,
        "sellingPriceQF": 7.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 7.5,
        "sellingPriceQF": 7.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 4.5,
        "sellingPriceQF": 4.7
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 6.2,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 7.5,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 7.5,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p12",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0887",
    "barcode": "5212056200203",
    "descriptionErp": "ΛΑΧΑΝΟΝΤΟΛΜΑΔΕΣ",
    "unitsPerMachine": 10,
    "descriptionGr": "Λαχανοντολμάδες με μοσχαρίσιο κρέας & ρύζι",
    "descriptionEn": "Cabbage Rolls with beef meat & rice",
    "detailedDescriptionGr": "Με Λάχανο, Κρεμμύδι, Μοσχαρίσιο Κρέας, Κιμά Σόγιας, Ρύζι & Αυγολέμονο\nCabbage rolls",
    "detailedDescriptionEn": "With Cabbage, Onion, Beef Meat, Minced Soy, Rice & Egg-Lemon Sauce",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.6,
      "ptk": 2.26,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 6.1,
        "sellingPriceQF": 6.1
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 6.1,
        "sellingPriceQF": 5.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.5,
        "sellingPriceQF": 3.6
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 5.1,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 6.1,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 6.1,
        "sellingPriceQF": 5.0
      }
    ]
  },
  {
    "id": "p13",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0612",
    "barcode": "5213009200356",
    "descriptionErp": "ΜΠΑΚΑΛΙΑΡΟΣ ΠΑΝΕ ΜΕ ΛΑΧΑΝΙΚΑ ΑΤΜΟΥ 400ΓΡ (Α.Σ.)",
    "unitsPerMachine": 10,
    "descriptionGr": "Φιλέτο Μπακαλιάρου Πανέ",
    "descriptionEn": "Cod Fillet in Butter",
    "detailedDescriptionGr": "Παναρισμένο φιλέτο μπακαλιάρου με εποχιακά λαχανικά",
    "detailedDescriptionEn": "With seasonal vegetables",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.9,
      "ptk": 2.68,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 5.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 5.5,
        "sellingPriceQF": 5.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.15,
        "sellingPriceQF": 3.25
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 4.2,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 5.95,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 5.5,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p14",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0605",
    "barcode": "5213009200332",
    "descriptionErp": "ΜΟΣΧΑΡΙ ΓΙΟΥΒΕΤΣΙ 400ΓΡ (Α.Σ)",
    "unitsPerMachine": null,
    "descriptionGr": "Μοσχάρι Γιουβέτσι",
    "descriptionEn": "Beef \"Youvetsi\"",
    "detailedDescriptionGr": "Σιγομαγειρεμένο μοσχάρι, αρωματισμένο με κανέλα και μπαχάρι, με φρέσκια τομάτα και κριθαράκι",
    "detailedDescriptionEn": "Slowly cooked beef with fresh tomato & orzo",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 6.9,
      "ptk": 3.45,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 6.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 6.4,
        "sellingPriceQF": 6.1
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 4.0,
        "sellingPriceQF": 4.2
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 4.5,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 6.3,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 6.4,
        "sellingPriceQF": 5.0
      }
    ]
  },
  {
    "id": "p15",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0606",
    "barcode": "5213009200400",
    "descriptionErp": "CΑSΑRΕCCΕ ΚΟΤΟΠΟΥΛΟ ΡΑΓΟΥ 400ΓΡ (Α.Σ)",
    "unitsPerMachine": 10,
    "descriptionGr": "Casarecce Κοτόπουλο Ραγού",
    "descriptionEn": "Casarecce with Chicken Ragout",
    "detailedDescriptionGr": "Ζυμαρικά casarecceμε σιγομαγειρεμένο ραγού κοτόπουλο, κόκκινη πιπεριά, καρότο, πράσο, ΄σλερι και φρέσκο θυμάρι",
    "detailedDescriptionEn": "Casarecce pasta with slowly cooked chicken ragout & fresh thyme",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.2,
      "ptk": 1.9,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 5.2,
        "sellingPriceQF": 5.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 2.6,
        "sellingPriceQF": 3.2
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 3.8,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 5.4,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 5.2,
        "sellingPriceQF": 4.5
      }
    ]
  },
  {
    "id": "p16",
    "categoryGr": "THREPSIS ΓΕΥΜΑΤΑ",
    "categoryEn": "THREPSIS MAIN DISHES",
    "itemCode": "15.0610",
    "barcode": "5213011450213",
    "descriptionErp": "ΚΟΤΟΠΟΥΛΟ ΜΠΟΥΤΙ ΦΙΛΕΤΟ ΣΧΑΡΑΣ ΜΕ ΠΑΤΑΤΕΣ ΒΑΒΥ ΦΟΥΡΝΟΥ 350ΓΡ (Α.Σ)",
    "unitsPerMachine": 10,
    "descriptionGr": "Κοτόπουλο Μπούτι με Πατάτες Baby",
    "descriptionEn": "Chicken Leg with Baby Potatoes",
    "detailedDescriptionGr": "Φιλέτο κοτόπουλο σχάρας με μουστάρδα & λευκό κρασί, συνοδεύεται με πατάτες baby.",
    "detailedDescriptionEn": "Grilled fillet with baby potatoes",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 6.7,
      "ptk": 2.95,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 6.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 5.5,
        "sellingPriceQF": 5.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 4.4,
        "sellingPriceQF": 4.6
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 4.5,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 5.65,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": 5.5,
        "sellingPriceQF": 4.9
      }
    ]
  },
  {
    "id": "p17",
    "categoryGr": "ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ",
    "categoryEn": "SODA - WATER",
    "itemCode": "30.0271",
    "barcode": "13179730013193",
    "descriptionErp": "ΝΕΡΟ ΡΕRRΙΕR ΦΙΑΛΗ 330 ΜL",
    "unitsPerMachine": 7,
    "descriptionGr": "Νερό Perrier φιάλη 3300ml",
    "descriptionEn": "Perrier water bottle 330 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.0,
      "ptk": 0.79,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 1.3,
        "sellingPriceQF": 1.3
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 1.6,
        "sellingPriceQF": 1.6
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 1.45,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 1.45,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.2
      }
    ]
  },
  {
    "id": "p18",
    "categoryGr": "ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ",
    "categoryEn": "SODA - WATER",
    "itemCode": "30.0092",
    "barcode": "5449000214799",
    "descriptionErp": "CΟCΑ CΟLΑ ΖΕRΟ CΑΝ 330 ΜL",
    "unitsPerMachine": 9,
    "descriptionGr": "Coca-Cola Zero 330 ml",
    "descriptionEn": "Coca-Cola Zero can 330 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.5,
      "ptk": 0.72,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.1
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 1.1,
        "sellingPriceQF": 1.1
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 0.9,
        "sellingPriceQF": 1.1
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 0.95,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 1.1,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p19",
    "categoryGr": "ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ",
    "categoryEn": "SODA - WATER",
    "itemCode": "30.1168",
    "barcode": "5942326400018",
    "descriptionErp": "ΝΕΡΟ ΑQUΑ CΑRΡΑΤΙCΑ ΡΕΤ 500ΜL",
    "unitsPerMachine": 11,
    "descriptionGr": "Aqua Carpatica Νερό 500 ml",
    "descriptionEn": "Aqua Carpatica water PET 500 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.0,
      "ptk": 0.3,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 0.5,
        "sellingPriceQF": 0.5
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.5
      }
    ]
  },
  {
    "id": "p20",
    "categoryGr": "ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ",
    "categoryEn": "SODA - WATER",
    "itemCode": "30.0762",
    "barcode": "90162800",
    "descriptionErp": "RED BULL  CAN250",
    "unitsPerMachine": null,
    "descriptionGr": "Red Bull Light 250 ml",
    "descriptionEn": "Red Bull Light can 250 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.5,
      "ptk": 1.11,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 2.1,
        "sellingPriceQF": 2.1
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.2
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 2.3,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 2.4,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      }
    ]
  },
  {
    "id": "p21",
    "categoryGr": "ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ",
    "categoryEn": "SODA - WATER",
    "itemCode": "30.1613",
    "barcode": "5942326402050",
    "descriptionErp": "AQUA CARPATICA FLAVOURS PEACH & MANGO ΚΟΥΤΙ 330ml",
    "unitsPerMachine": null,
    "descriptionGr": "Aqua Carpatica Flavours Peach & Mango 330 ml",
    "descriptionEn": "Aqua Carpatica Flavours Peach & Mango 330 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.8,
      "ptk": 0.68,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p22",
    "categoryGr": "ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ",
    "categoryEn": "SODA - WATER",
    "itemCode": "30.1614",
    "barcode": "5942326402043",
    "descriptionErp": "AQUA CARPATICA FLAVOURS LIME & MINT ΚΟΥΤΙ 330ml",
    "unitsPerMachine": null,
    "descriptionGr": "Aqua Carpatica Flavours Lime & Mint 330 ml",
    "descriptionEn": "Aqua Carpatica Flavours Lime & Mint 330 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.8,
      "ptk": 0.68,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.3
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p23",
    "categoryGr": "ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ",
    "categoryEn": "SODA - WATER",
    "itemCode": "30.1615",
    "barcode": "5942326402036",
    "descriptionErp": "AQUA CARPATICA FLAVOURS RASPBERRY ΚΟΥΤΙ 330ml",
    "unitsPerMachine": null,
    "descriptionGr": "Aqua Carpatica Flavours Raspberry 330 ml",
    "descriptionEn": "Aqua Carpatica Flavours Raspberry 330 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.8,
      "ptk": 0.68,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p24",
    "categoryGr": "ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ",
    "categoryEn": "SODA - WATER",
    "itemCode": "30.1616",
    "barcode": "5942326402968",
    "descriptionErp": "AQUA CARPATICA FLAVOURS PINK GRAPEFRUIT ΚΟΥΤΙ 330ml",
    "unitsPerMachine": null,
    "descriptionGr": "Aqua Carpatica Flavours Pink Grapefruit 330 ml",
    "descriptionEn": "Aqua Carpatica Flavours Pink Grapefruit 330 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.8,
      "ptk": 0.68,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.3
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p25",
    "categoryGr": "ΑΝΑΨΥΚΤΙΚΑ - ΝΕΡΑ",
    "categoryEn": "SODA - WATER",
    "itemCode": "30.1617",
    "barcode": "5942326403019",
    "descriptionErp": "AQUA CARPATICA FLAVOURS APPLE ΚΟΥΤΙ 330ml",
    "unitsPerMachine": null,
    "descriptionGr": "Aqua Carpatica Flavours Apple 330 ml",
    "descriptionEn": "Aqua Carpatica Flavours Apple 330 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.8,
      "ptk": 0.68,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p26",
    "categoryGr": "ΓΑΛΑΚΤΟΚΟΜΙΚΑ",
    "categoryEn": "YOGURTS",
    "itemCode": "10.4870",
    "barcode": "5201083352108",
    "descriptionErp": "ACTIVIA FIBERS ΝΙΦΑΔΕΣ ΔΗΜΗΤΡΙΑΚΩΝ 163g",
    "unitsPerMachine": null,
    "descriptionGr": "Activia Fibers cereal flakes 163 gr",
    "descriptionEn": "Activia Fibers cereal flakes 163 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.2,
      "ptk": 0.94,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p27",
    "categoryGr": "ΓΑΛΑΚΤΟΚΟΜΙΚΑ",
    "categoryEn": "YOGURTS",
    "itemCode": "10.4871",
    "barcode": "5201083351446",
    "descriptionErp": "ACTIVIA FIBERS ΝΙΦΑΔΕΣ ΓΚΡΑΝΟΛΑ & ΜΕΛΙ 165g",
    "unitsPerMachine": null,
    "descriptionGr": "Activia Fibers granola & honey 165 gr",
    "descriptionEn": "Activia Fibers granola & honey 165 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.2,
      "ptk": 0.94,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.8
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p28",
    "categoryGr": "ΓΑΛΑΚΤΟΚΟΜΙΚΑ",
    "categoryEn": "YOGURTS",
    "itemCode": "10.4872",
    "barcode": "5202353000590",
    "descriptionErp": "HARM.GOURMET ΚΑΡΥΔΑ & ΝΙΦ. ΣΟΚΟΛ. 160gr",
    "unitsPerMachine": null,
    "descriptionGr": "Harmony Gourmet coconut & chocolate flakes 160 gr",
    "descriptionEn": "Harmony Gourmet coconut & chocolate flakes 160 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.0,
      "ptk": 1.27,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.1
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p29",
    "categoryGr": "ΓΑΛΑΚΤΟΚΟΜΙΚΑ",
    "categoryEn": "YOGURTS",
    "itemCode": "10.4873",
    "barcode": "5202353000569",
    "descriptionErp": "HARMONY GOURMET CHOCO & BROWNIES 160gr",
    "unitsPerMachine": null,
    "descriptionGr": "Harmony Gourmet choco & brownies 160 gr",
    "descriptionEn": "Harmony Gourmet choco & brownies 160 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.0,
      "ptk": 1.27,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p30",
    "categoryGr": "ΓΑΛΑΚΤΟΚΟΜΙΚΑ",
    "categoryEn": "YOGURTS",
    "itemCode": "10.4874",
    "barcode": "8001630010904",
    "descriptionErp": "HIPRO ΕΠΙΔΟΡΠΙΟ ΜΠΑΝΑΝΑ-ΦΥΣΤΙΚΟΒΟΥΤΥΡΟ 160g",
    "unitsPerMachine": null,
    "descriptionGr": "HiPRO banana & peanut butter dessert 160 gr",
    "descriptionEn": "HiPRO banana & peanut butter dessert 160 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.5,
      "ptk": 0.97,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p31",
    "categoryGr": "ΓΑΛΑΚΤΟΚΟΜΙΚΑ",
    "categoryEn": "YOGURTS",
    "itemCode": "10.4875",
    "barcode": "8001630011710",
    "descriptionErp": "HIPRO ΕΠΙΔΟΡΠΙΟ ΓΙΑΟΥΡΤΙΟΥ ΣΤΡΑΤΣΙΑΤΕΛΛΑ 160g",
    "unitsPerMachine": null,
    "descriptionGr": "HiPRO stracciatella yogurt dessert 160 gr",
    "descriptionEn": "HiPRO stracciatella yogurt dessert 160 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.5,
      "ptk": 0.97,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p32",
    "categoryGr": "ΓΑΛΑΚΤΟΚΟΜΙΚΑ",
    "categoryEn": "YOGURTS",
    "itemCode": "10.4320",
    "barcode": "5201083325850",
    "descriptionErp": "ΓΙΑΟΥΡΤΙ ΑΓΕΛΑΔΟΣ ΜΕΒΓΑΛ 2% 200ΓΡ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "MEVGAL Cows Yogurt 2% Fat 200g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 0.0,
      "ptk": 0.0,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.25
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p33",
    "categoryGr": "ΓΑΛΑΚΤΟΚΟΜΙΚΑ",
    "categoryEn": "YOGURTS",
    "itemCode": "10.4286",
    "barcode": "5201083251395",
    "descriptionErp": "ΓΙΑΟΥΡΤΙ ΑΓΕΛΑΔΟΣ ΜΕΒΓΑΛ 3,85% 200ΓΡ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 0.0,
      "ptk": 0.0,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.25
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p34",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.1685",
    "barcode": "5200305810563",
    "descriptionErp": "ΞΗΡΟΙ ΚΑΡΠΟΙ-ΚΕΛΥΦΩΤΟ ΨΗΜΕΝΟ ΜΕ ΑΛΑΤΙ ΓΥΑΛΙΝΟ ΒΑΖΑΚΙ 90ΓΡ",
    "unitsPerMachine": 5,
    "descriptionGr": "Roasted salted nuts (glass jar) 90 gr",
    "descriptionEn": "Roasted salted nuts (glass jar) 90 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.8,
      "ptk": 3.0,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 5.0,
        "sellingPriceQF": 5.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 5.0,
        "sellingPriceQF": 5.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 4.15,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 5.2,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p35",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.1686",
    "barcode": "5200305810594",
    "descriptionErp": "ΞΗΡΟΙ ΚΑΡΠΟΙ-ΕΝΕRGΥ ΜΙΧ ΓΥΑΛΙΝΟ ΒΑΖΑΚΙ 100ΓΡ",
    "unitsPerMachine": 5,
    "descriptionGr": "Energy mix nuts (glass jar) 100 gr",
    "descriptionEn": "Energy mix nuts (glass jar) 100 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.5,
      "ptk": 2.4,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 4.7,
        "sellingPriceQF": 4.7
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 4.7,
        "sellingPriceQF": 4.7
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 4.2,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 4.9,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p36",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.1687",
    "barcode": "5200305810600",
    "descriptionErp": "ΞΗΡΟΙ ΚΑΡΠΟΙ-ΕΑRΤΗ ΜΙΧ ΓΥΑΛΙΝΟ ΒΑΖΑΚΙ 100ΓΡ",
    "unitsPerMachine": null,
    "descriptionGr": "Earth mix nuts (glass jar) 100 gr",
    "descriptionEn": "Earth mix nuts (glass jar) 100 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.5,
      "ptk": 2.7,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 4.7,
        "sellingPriceQF": 4.7
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 4.7,
        "sellingPriceQF": 4.7
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 4.2,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 4.9,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p37",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.1568",
    "barcode": "5214002160050",
    "descriptionErp": "ΜΠΙΣΚΟΤΟ ΣΟΚΟΛΑΤΑ 100GR",
    "unitsPerMachine": 8,
    "descriptionGr": "Chocolate biscuit 100 gr",
    "descriptionEn": "Chocolate biscuit 100 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.5,
      "ptk": 1.55,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 3.1,
        "sellingPriceQF": 3.1
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 2.95,
        "sellingPriceQF": 2.95
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.1
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 2.95,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p38",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.1567",
    "barcode": "5214002160067",
    "descriptionErp": "ΜΠΙΣΚΟΤΟ ΒΟΥΤΥΡΟ 100GR",
    "unitsPerMachine": 8,
    "descriptionGr": "Butter biscuit 100 gr",
    "descriptionEn": "Butter biscuit 100 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.5,
      "ptk": 1.55,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 3.1,
        "sellingPriceQF": 3.1
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 2.95,
        "sellingPriceQF": 2.95
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.1
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 2.95,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p39",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.0072",
    "barcode": "5012501081049",
    "descriptionErp": "ΣΟΚΟΦΡΕΤΑ ΙΟΝ ΓΑΛΑΚΤΟΣ 38GR",
    "unitsPerMachine": 22,
    "descriptionGr": "ION milk chocolate wafer 38 gr",
    "descriptionEn": "ION milk chocolate wafer 38 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.5,
      "ptk": 0.58,
      "quantity": 20,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 0.9,
        "sellingPriceQF": 1.1
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 1.0,
        "sellingPriceQF": 1.2
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.95
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 0.85,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 0.75,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.9
      }
    ]
  },
  {
    "id": "p40",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.0073",
    "barcode": "5012501081100",
    "descriptionErp": "ΣΟΚΟΦΡΕΤΑ ΙΟΝ ΦΟΥΝΤΟΥΚΙ (ΠΡΑΣΙΝΗ) 38GR",
    "unitsPerMachine": 22,
    "descriptionGr": "ION hazelnut wafer 38 gr",
    "descriptionEn": "ION hazelnut wafer 38 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.5,
      "ptk": 0.58,
      "quantity": 20,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 0.9,
        "sellingPriceQF": 1.1
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 1.0,
        "sellingPriceQF": 1.2
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.95
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 0.85,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 0.75,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.9
      }
    ]
  },
  {
    "id": "p41",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.0178",
    "barcode": "5012501081148",
    "descriptionErp": "ΣΟΚΟΦΡΕΤΑ ΙΟΝ ΥΓΕΙΑΣ 38 ΓΡ",
    "unitsPerMachine": 22,
    "descriptionGr": "ION dark chocolate wafer 38 gr",
    "descriptionEn": "ION dark chocolate wafer 38 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.5,
      "ptk": 0.58,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 0.9,
        "sellingPriceQF": 1.1
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 1.0,
        "sellingPriceQF": 1.2
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.95
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 0.85,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 0.75,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.9
      }
    ]
  },
  {
    "id": "p42",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "70.0215",
    "barcode": "5213005450854",
    "descriptionErp": "ΤΣΙΠΣ ΚΟΚΚΙΝΟΥ ΜΗΛΟΥ 40ΓΡ",
    "unitsPerMachine": 5,
    "descriptionGr": "Red apple chips 40 gr",
    "descriptionEn": "Red apple chips 40 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.6,
      "ptk": 1.18,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.2
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.1
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.8
      }
    ]
  },
  {
    "id": "p43",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "70.0216",
    "barcode": "5213005450861",
    "descriptionErp": "ΤΣΙΠΣ ΠΡΑΣΙΝΟΥ ΜΗΛΟΥ 40ΓΡ",
    "unitsPerMachine": 5,
    "descriptionGr": "Green apple chips 40 gr",
    "descriptionEn": "Green apple chips 40 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.6,
      "ptk": 1.18,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.2
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.8
      }
    ]
  },
  {
    "id": "p44",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.2041",
    "barcode": "5201044011563",
    "descriptionErp": "PEANUT CHOCOLATE CUBES",
    "unitsPerMachine": null,
    "descriptionGr": "Peanut chocolate cubes",
    "descriptionEn": "Peanut chocolate cubes",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.0,
      "ptk": 0.91,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      }
    ]
  },
  {
    "id": "p45",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.2042",
    "barcode": "5201044011204",
    "descriptionErp": "LOV OAT BANANA CHOCOLATE & ALMOND BITES",
    "unitsPerMachine": 6,
    "descriptionGr": "lOV Oat banana chocolate & almond bites",
    "descriptionEn": "lOV Oat banana chocolate & almond bites",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.0,
      "ptk": 0.4,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.9
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      }
    ]
  },
  {
    "id": "p46",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.2043",
    "barcode": "5201044011839",
    "descriptionErp": "LOV OAT WITH STRAWBERRY, ALMOND & CHOCOLATE BITES",
    "unitsPerMachine": 6,
    "descriptionGr": "Oat strawberry almond & chocolate bites",
    "descriptionEn": "Oat strawberry almond & chocolate bites",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.0,
      "ptk": 0.4,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      }
    ]
  },
  {
    "id": "p47",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.2044",
    "barcode": "5201044011228",
    "descriptionErp": "LOV OAT RASPBERRY & ALMOND BITES",
    "unitsPerMachine": 8,
    "descriptionGr": "Oat raspberry & almond bites",
    "descriptionEn": "Oat raspberry & almond bites",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.0,
      "ptk": 0.4,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      }
    ]
  },
  {
    "id": "p48",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.2045",
    "barcode": "5201044009904",
    "descriptionErp": "INSTABAR Cranberry Almond bar",
    "unitsPerMachine": null,
    "descriptionGr": "Instabar cranberry almond bar",
    "descriptionEn": "Instabar cranberry almond bar",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.9,
      "ptk": 0.65,
      "quantity": 20,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p49",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.2046",
    "barcode": "5201044009935",
    "descriptionErp": "INSTABAR Dark Chocolate Almond Coconut bar",
    "unitsPerMachine": null,
    "descriptionGr": "Instabar dark chocolate almond coconut bar",
    "descriptionEn": "Instabar dark chocolate almond coconut bar",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.9,
      "ptk": 0.65,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p50",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.2047",
    "barcode": "5201044009928",
    "descriptionErp": "INSTABAR Hazelnut Chocolate Bar",
    "unitsPerMachine": null,
    "descriptionGr": "Instabar hazelnut chocolate bar",
    "descriptionEn": "Instabar hazelnut chocolate bar",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.9,
      "ptk": 0.65,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p51",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.2048",
    "barcode": "5201044012041",
    "descriptionErp": "INSTABAR Protein 20%",
    "unitsPerMachine": null,
    "descriptionGr": "Instabar protein 20%",
    "descriptionEn": "Instabar protein 20%",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.2,
      "ptk": 0.81,
      "quantity": 20,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.8
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.8
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.3
      }
    ]
  },
  {
    "id": "p52",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "52.2049",
    "barcode": "59701000088",
    "descriptionErp": "PEANUT CARAMEL CUBES",
    "unitsPerMachine": 8,
    "descriptionGr": "Peanut caramel cubes",
    "descriptionEn": "Peanut caramel cubes",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.0,
      "ptk": 0.59,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p53",
    "categoryGr": "ΕΙΔΗ ΠΕΡΙΠΤΕΡΟΥ",
    "categoryEn": "NUTS & SWEETS",
    "itemCode": "60.6885",
    "barcode": "2",
    "descriptionErp": "ΕΧΤRΑΟRDΙΝΑRΥ GRΑΝΟLΑ 35GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Εxtraordinary Granola 35g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 0.0,
      "ptk": 0.53,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.75
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p54",
    "categoryGr": "ΣΑΛΑΤΕΣ",
    "categoryEn": "SALADS",
    "itemCode": "15.0939",
    "barcode": "5213011450459",
    "descriptionErp": "SUΡΕRCRΕΤΑΝ (QΝF)",
    "unitsPerMachine": 6,
    "descriptionGr": "Super Cretan Σαλάτα",
    "descriptionEn": "Super Cretan Salad",
    "detailedDescriptionGr": "Πράσινη & κόκκινη λόλα, παντζαρόφυλλα, babby σπανάκι, ρόκα, ψητό απάκιΚρήτης, γραβιέρα Κρήτης ωρίμανσης, καβουρδισμένο πλιγούρι, κοκκινη κινόα, κάπαρη, φρέσκια ρίγανη & δυόσμος",
    "detailedDescriptionEn": "Green & red curly..",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 6.0,
      "ptk": 2.72,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 4.1,
        "sellingPriceQF": 4.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 4.9,
        "sellingPriceQF": 4.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p55",
    "categoryGr": "ΣΑΛΑΤΕΣ",
    "categoryEn": "SALADS",
    "itemCode": "60.5878",
    "barcode": "5213011450466",
    "descriptionErp": "ΝΤΑΚΟS 4LΕVΕL (Τ.Α) QΝF",
    "unitsPerMachine": 4,
    "descriptionGr": "Ntakos 4 Levels Σαλάτα",
    "descriptionEn": "Ntakos 4 Levels Salad",
    "detailedDescriptionGr": "Σαλάτα με κρίθινο παξιμάδι & οξύμελι, κρέμα φέτας με σχοινόπρασι, φρέσκο δυόσμο & ντομάτα",
    "detailedDescriptionEn": "Salad with barley rusk, balsamic with honey, feta cheese cream, fresh spearmint & tomato",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.0,
      "ptk": 2.2,
      "quantity": 12,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 3.65,
        "sellingPriceQF": 3.75
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 4.2,
        "sellingPriceQF": 4.1
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 2.1,
        "sellingPriceQF": 4.1
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 3.7,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p56",
    "categoryGr": "ΣΑΛΑΤΕΣ",
    "categoryEn": "SALADS",
    "itemCode": "60.5879",
    "barcode": "5213011450473",
    "descriptionErp": "GRΕΕΚSΑLΑD (Τ.Α) QΝF",
    "unitsPerMachine": 8,
    "descriptionGr": "Ελληνική σαλάτα",
    "descriptionEn": "Greek salad",
    "detailedDescriptionGr": "Παραδοσιακλη ελληνική σαλάτα με ντοματίνια, αγγούρι, πολύχρωμες πιπερίες, φρέσκια ρίγανη, σχοινόπρασο, ελιές &φέτα Π.Ο.Π.",
    "detailedDescriptionEn": "Traditional Greek salad with cherry tomatoes, cucumber, multicolored peppers,fresh oregano, chives & feta cheese P.D.O.",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.5,
      "ptk": 1.99,
      "quantity": 9,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 3.75,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 3.2,
        "sellingPriceQF": 3.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 1.3,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 3.05,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p57",
    "categoryGr": "ΣΑΛΑΤΕΣ",
    "categoryEn": "SALADS",
    "itemCode": "60.6780",
    "barcode": "5213011450480",
    "descriptionErp": "CΗΙCΚΕΝ FUSΙLLΙ (Τ.Α) QΝF",
    "unitsPerMachine": 8,
    "descriptionGr": "Chicken fusilli σαλάτα",
    "descriptionEn": "Chicken fusilli salad",
    "detailedDescriptionGr": "Σαλάτα με τριχρωμες βίδες, κοτόπουλο, ντοματίνια, πέστο & μοτσαρέλα",
    "detailedDescriptionEn": "Salad with three-color fusilli pasta, chicken, tomato cherries, pesto & mozzarella",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.5,
      "ptk": 2.03,
      "quantity": 9,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 4.5,
        "sellingPriceQF": 4.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 4.7,
        "sellingPriceQF": 4.7
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.75,
        "sellingPriceQF": 4.2
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p58",
    "categoryGr": "ΣΑΛΑΤΕΣ",
    "categoryEn": "SALADS",
    "itemCode": "60.6907",
    "barcode": "5213011450497",
    "descriptionErp": "ΤΗΑΙ SΑLΑD (Τ.Α) QΝF",
    "unitsPerMachine": 8,
    "descriptionGr": "Thai σαλάτα",
    "descriptionEn": "Thai salad",
    "detailedDescriptionGr": "Σαλάτα με Μακαρόνια Σπαγγέτι, Σάλτσα Σόγιας, Κοτόπουλο, Γλυκιά Σάλτσα Τσίλι & Φρέσκες Πιπεριές",
    "detailedDescriptionEn": "Salad with Spaggheti Pasta, Soy Sauce, Chciken, Sweet Chilli Sauce & Fresh Peppers",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.5,
      "ptk": 2.2,
      "quantity": 9,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.3
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p59",
    "categoryGr": "ΣΑΛΑΤΕΣ",
    "categoryEn": "SALADS",
    "itemCode": "60.6908",
    "barcode": "5213011450503",
    "descriptionErp": "ΡRΙΜΑVΕRΑ SΑLΑD (Τ.Α) QΝF",
    "unitsPerMachine": 8,
    "descriptionGr": "Primavera σαλάτα",
    "descriptionEn": "Primavera salad",
    "detailedDescriptionGr": "Σαλάτα με Μαρούλι Άισμπεργκ, Τοματίνια, Παρμεζάνα & Ρόκα",
    "detailedDescriptionEn": "Salad with Iceberg, Cherry Tomatoes, Parmesan Cheese & Arugula",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.3,
      "ptk": 1.78,
      "quantity": 9,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p60",
    "categoryGr": "ΣΑΛΑΤΕΣ",
    "categoryEn": "SALADS",
    "itemCode": "15.0945",
    "barcode": "5213011450510",
    "descriptionErp": "ΜΙΝΙ SΗRΙΜΡS SΑLΑD (QΝF)",
    "unitsPerMachine": null,
    "descriptionGr": "Mini shrimps σαλάτα",
    "descriptionEn": "Mini shrimps salad",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.8,
      "ptk": 2.3,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 4.7,
        "sellingPriceQF": 4.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 4.7,
        "sellingPriceQF": 4.8
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.9
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p61",
    "categoryGr": "ΣΑΛΑΤΕΣ",
    "categoryEn": "SALADS",
    "itemCode": "60.5877",
    "barcode": "5213011450527",
    "descriptionErp": "CΑΕSΑR'S SΑLΑD ΓΕΥΣΗΝΟΥΣ (Τ.Α) (QΝF)",
    "unitsPerMachine": 6,
    "descriptionGr": "Caesar’s σαλάτα",
    "descriptionEn": "Caesars Salad",
    "detailedDescriptionGr": "σαλάτα με φιλέτο κοτοπουλο, μπέικον, καλαμπόκι & κρουτόν",
    "detailedDescriptionEn": "Salad with chicken fillet, bacon,corn&crouton",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.5,
      "ptk": 2.28,
      "quantity": 9,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 4.55,
        "sellingPriceQF": 4.7
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 4.8,
        "sellingPriceQF": 4.8
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 3.0,
        "sellingPriceQF": 4.3
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 4.4,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p62",
    "categoryGr": "ΣΑΛΑΤΕΣ",
    "categoryEn": "SALADS",
    "itemCode": "10.4164",
    "barcode": "1",
    "descriptionErp": "CΑΕSΑRS SΑUCΕ 40ΓΡ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Caesars Sauce 40g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 0.0,
      "ptk": 0.21,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 0.05
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p63",
    "categoryGr": "ΣΑΛΑΤΕΣ",
    "categoryEn": "SALADS",
    "itemCode": "0",
    "barcode": "10",
    "descriptionErp": "Croutons",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Croutons",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 0.0,
      "ptk": 0.0,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p64",
    "categoryGr": "ΦΡΟΥΤΑ",
    "categoryEn": "FRUITS",
    "itemCode": "60.4082",
    "barcode": "604082",
    "descriptionErp": "ΦΡΟΥΤΟΣΑΛΑΤΑ ΑΝΑΝΑΣ-ΑΚΤΙΝΙΔΙΟ-ΡΟΔΑΚΙΝΟ-ΣΤΑΦΥΛΙ 160ΓΡ ΓΕΥΣΗΝΟΥΣ",
    "unitsPerMachine": 9,
    "descriptionGr": "Φρουτοσαλάτα (ανανάς, ακτινίδιο, ροδάκινο, σταφύλια) 160 γρ.",
    "descriptionEn": "Fruit salad (pineapple, kiwi, peach, grapes) 160 g",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.0,
      "ptk": 1.37,
      "quantity": 8,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 1.6,
        "sellingPriceQF": 2.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": 1.0,
        "sellingPriceQF": 1.2
      },
      {
        "name": "Nestle",
        "sellingPriceStore": 1.4,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 1.6,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p65",
    "categoryGr": "ΧΥΜΟΙ - ΤΣΑΪ",
    "categoryEn": "BEVERAGES",
    "itemCode": "30.1375",
    "barcode": "5214001936298",
    "descriptionErp": "ΤΗΑΜΜΑ ΡΕΑCΗ ΒLΑCΚ ΤΕΑ ΒΙΟ 300ΜL",
    "unitsPerMachine": null,
    "descriptionGr": "Thamma peach black tea BIO 300 ml",
    "descriptionEn": "Thamma peach black tea BIO 300 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.2,
      "ptk": 1.34,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 2.5,
        "sellingPriceQF": 2.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 2.5,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 2.8,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p66",
    "categoryGr": "ΧΥΜΟΙ - ΤΣΑΪ",
    "categoryEn": "BEVERAGES",
    "itemCode": "30.1376",
    "barcode": "5214001936304",
    "descriptionErp": "ΤΗΑΜΜΑ LΕΜΟΝ GRΕΕΝ ΤΕΑ ΒΙΟ 300ΜL",
    "unitsPerMachine": null,
    "descriptionGr": "Thamma lemon green tea BIO 300 ml",
    "descriptionEn": "Thamma lemon green tea BIO 300 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.2,
      "ptk": 1.34,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 2.5,
        "sellingPriceQF": 2.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 2.5,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 2.8,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p67",
    "categoryGr": "ΧΥΜΟΙ - ΤΣΑΪ",
    "categoryEn": "BEVERAGES",
    "itemCode": "30.1378",
    "barcode": "5214001936328",
    "descriptionErp": "ΤΗΑΜΜΑ ΡΙΝΚ GRΑΡΕFRUΙΤ ΤΕΑ ΒΙΟ 300ΜL",
    "unitsPerMachine": null,
    "descriptionGr": "Thamma pink grapefruit tea BIO 300 ml",
    "descriptionEn": "Thamma pink grapefruit tea BIO 300 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.2,
      "ptk": 1.34,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 2.5,
        "sellingPriceQF": 2.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": 2.5,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 2.8,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p68",
    "categoryGr": "ΧΥΜΟΙ - ΤΣΑΪ",
    "categoryEn": "BEVERAGES",
    "itemCode": "30.0705",
    "barcode": "5206769233030",
    "descriptionErp": "ΧΥΜΟΣ ΧΡΙΣΤΟΔΟΥΛΟΥ ΒΙΟ ΠΟΡΤΟΚΑΛΙ-ΜΗΛΟ-ΚΑΡΟΤΟ 250ΜL",
    "unitsPerMachine": 10,
    "descriptionGr": "Χυμός Χριστοδούλου (πορτοκάλι-μήλο-καρότο) 250 ml",
    "descriptionEn": "Christodoulou juice (orange-apple-carrot) 250 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.8,
      "ptk": 0.64,
      "quantity": 20,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 1.7,
        "sellingPriceQF": 1.8
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.3
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 1.65,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.2
      }
    ]
  },
  {
    "id": "p69",
    "categoryGr": "ΧΥΜΟΙ - ΤΣΑΪ",
    "categoryEn": "BEVERAGES",
    "itemCode": "30.0787",
    "barcode": "5206254000147",
    "descriptionErp": "ΧΥΜΟΣ ΡΟΔΙ ΖΩΗ 330ΜL",
    "unitsPerMachine": null,
    "descriptionGr": "Χυμός ροδιού 330 ml",
    "descriptionEn": "Pomegranate juice 330 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.5,
      "ptk": 1.5,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 2.4,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.2
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": 2.7,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p70",
    "categoryGr": "ΧΥΜΟΙ - ΤΣΑΪ",
    "categoryEn": "BEVERAGES",
    "itemCode": "30.1537",
    "barcode": "5213005573782",
    "descriptionErp": "ΒFRΕSΗ RΤD ΒΙΟΛΟΓΙΚΗ ΛΕΜΟΝΑΔΑ ΜΕ ΑΓΑΥΗ & GΙΝGΕR 250ΜL",
    "unitsPerMachine": null,
    "descriptionGr": "Φρέσκια βιολογική λεμονάδα με αγαύη & τζίντζερ 250 ml",
    "descriptionEn": "Fresh BIO lemonade with agave & ginger 250 ml",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.0,
      "ptk": 0.55,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.4
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      }
    ]
  },
  {
    "id": "p71",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0755",
    "barcode": "5206854081102",
    "descriptionErp": "ΦΡΑΝΤΖΟΛΑΚΙ ΜΕΓΑΛΟ ΜΠΙΦΤΕΚΙ, ΜΠΕΙΚΟΝ, ΣΑΛΑΤΑ ΚΗΠΟΥΡΟΥ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Large bun with beef burger, bacon & garden salad",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.6,
      "ptk": 1.01,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.6
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p72",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0756",
    "barcode": "5206854001216",
    "descriptionErp": "ΚΟΥΛΟΥΡΙ ΣΟΥΣΑΜΕΝΙΟ ΓΑΛΟΠΟΥΛΑ,ΕDΑΜ & ΜΑΓΙΟΝΕΖΑ LΙGΗΤ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Sesame koulouri with turkey, edam & light mayo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.8,
      "ptk": 1.1,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.3
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p73",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0757",
    "barcode": "5206854021023",
    "descriptionErp": "ΜΠΑΓΚΕΤΑ ΛΕΥΚΗ ΒΗ ΓΑΛΟΠΟΥΛΑ,ΕDΑΜ, ΜΑΓΙΟΝΈΖΑ LΙGΗΤ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "White baguette with turkey, edam & light mayo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.0,
      "ptk": 1.35,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 2.1,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p74",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0769",
    "barcode": "5206854000585",
    "descriptionErp": "ΤΟΣΤ ΛΕΥΚΟ ΖΑΜΠΟΝ, ΤΥΡΙ ΕDΑΜ",
    "unitsPerMachine": null,
    "descriptionGr": "Tοστ με ζαμπόν & τυρί ένταμ",
    "descriptionEn": "White toast with ham & edam cheese",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.4,
      "ptk": 0.7,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.1
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.0
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      }
    ]
  },
  {
    "id": "p75",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0770",
    "barcode": "5206854000905",
    "descriptionErp": "ΤΟΣΤ ΛΕΥΚΟ ΓΑΛΟΠΟΥΛΑ,ΤΥΡΙ ΕDΑΜ",
    "unitsPerMachine": null,
    "descriptionGr": "Τοστ Γαλοπούλα, τυρί ένταμ",
    "descriptionEn": "White toast with turkey & edam cheese",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 1.4,
      "ptk": 0.75,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.1
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.3
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 1.5
      }
    ]
  },
  {
    "id": "p76",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0896",
    "barcode": "5206854021078",
    "descriptionErp": "ΜΠΑΓΚΕΤΑ ΛΕΥΚΗ ΒΗ ΖΑΜΠΟΝ, ΤΥΡΙ ΕDΑΜ,ΜΑΓΙΟΝΕΖΑ LΙGΗΤ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "White baguette with ham, edam & light mayo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 2.9,
      "ptk": 1.25,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p77",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0759",
    "barcode": "5206854021436",
    "descriptionErp": "ΜΠΑΓΚΕΤΑ ΛΕΥΚΗ ΒΗ ΜΟΡΤΑΔΕΛΑ, ΜΠΕΙΚΟΝ, ΖΑΜΠΟΝ, ΣΑΛ. ΜΠΥΡΑΣ,CRΕΑΜ CΗΕΕSΕ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "White baguette with mortadella, bacon, ham, beer salad & cream cheese",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.6,
      "ptk": 1.3,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p78",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0758",
    "barcode": "5206854021405",
    "descriptionErp": "ΜΠΑΓΚΈΤΑ ΛΕΥΚΗ ΒΗ ΣΑΛΑΜΙ ΑΕΡΟΣ, ΓΡΑΒΙΕΡΑ, ΜΑΓΙΟΝΕΖΑ LΙGΗΤ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "White baguette with salami, graviera cheese & light mayo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.1,
      "ptk": 1.35,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.1
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p79",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0760",
    "barcode": "5206854031107",
    "descriptionErp": "ΜΠΑΓΚΕΤΑ ΛΕΥΚΗ ΒΗ ΚΟΤΟΠΟΥΛΟ, ΤΥΡΙ ΕDΑΜ, CΗΙCΚΕΝ DRΕSSΙΝG",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "White baguette with chicken, edam cheese & chicken dressing",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.2,
      "ptk": 1.45,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p80",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0761",
    "barcode": "5206854021085",
    "descriptionErp": "ΜΠΑΓΚΕΤΑ ΟΛΙΚΗΣ ΑG ΓΑΛΟΠΟΥΛΑ, ΕDΑΜ, ΜΑΓΙΟΝΕΖΑ LΙGΗΤ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Wholegrain baguette with turkey, edam cheese & light mayo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.2,
      "ptk": 1.4,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p81",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0764",
    "barcode": "5206854025182",
    "descriptionErp": "ΑΡΑΒΙΚΗ ΠΙΤΑ ΣΚΑΦΑΚΙ ΓΑΛΟΠΟΥΛΑ, ΕDΑΜ, ΣΑΛΑΤΑ ΚΗΠΟΥΡΟΥ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Wrap with turkey, edam cheese & garden salad",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.2,
      "ptk": 1.4,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 2.5,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.8
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.4
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p82",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0765",
    "barcode": "5206854031466",
    "descriptionErp": "ΑΡΑΒΙΚΗ ΠΙΤΑ ΣΚΑΦΑΚΙ ΚΟΤΟΠΟΥΛΟ, ΙCΕΒΕRG, CΗΙCΚΕΝ DRΕSSΙΝG",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Wrap with chicken, iceberg & chicken dressing",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.1,
      "ptk": 1.35,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.8
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.3
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p83",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0767",
    "barcode": "5206854002473",
    "descriptionErp": "ΑΡΑΒΙΚΗ ΠΙΤΑ ΣΚΑΦΑΚΙ ΚΟΤΟΠΟΥΛΟ, ΠΑΡΜΕΖΑΝΑ, ΚΑΛΑΜΠΟΚΙ, ΣΩΣ ΚΑΙΣΑΡΑ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Wrap with chicken, parmesan cheese, corn & Caesar's sauce",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.3,
      "ptk": 1.45,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": 2.7,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p84",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0768",
    "barcode": "5206854022488",
    "descriptionErp": "ΑΡΑΒΙΚΗ ΠΙΤΑ ΣΚΑΦΑΚΙ ΚΟΤΟΜΠΟΥΚΙΕΣ, DΙRΟLLΟ ΚΙΤΡΙΝΟ, FRΕΝCΗ ΣΩΣ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Wrap with chicken nuggets, cheese & French sauce",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.3,
      "ptk": 1.45,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p85",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0772",
    "barcode": "5206854000837",
    "descriptionErp": "CLUΒ ΟΛΙΚΗΣ ΤΡΙΓΩΝΟ ΤΟΝΟΣ, ΙCΕΒΕRG, ΜΑΓΙΟΝΕΖΑ LΙGΗΤ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Wholegrain club sandwich with tuna, iceberg & light mayo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.2,
      "ptk": 1.2,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.6
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p86",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0773",
    "barcode": "5206854000844",
    "descriptionErp": "CLUΒ ΟΛΙΚΗΣ ΤΡΙΓΩΝΟ ΓΑΛΟΠΟΥΛΑ, ΕDΑΜ, ΜΑΓΙΟΝΕΖΑ LΙGΗΤ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Wholegrain club sandwich with turkey, edam cheese & light mayo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.0,
      "ptk": 1.25,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.6
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.2
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p87",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0774",
    "barcode": "5206854000868",
    "descriptionErp": "CLUΒ ΟΛΙΚΗΣ ΤΡΙΓΩΝΟ ΣΟΛΟΜΟΣ, ΣΩΣ ΓΙΑΟΥΡΤΙΟΥ ΑΡΩΜΑΤΙΣΜΕΝΗ ΜΕ ΒΟΤΑΝΑ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Wholegrain club sandwich with salmon & herb yogurt sauce",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.4,
      "ptk": 1.45,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.4
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p88",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0775",
    "barcode": "5206854000875",
    "descriptionErp": "CLUΒ ΛΕΥΚΟ ΤΡΙΓΩΝΟ ΚΟΤΟΠΟΥΛΟ, GΟLDΕΝ ΣΩΣ",
    "unitsPerMachine": null,
    "descriptionGr": "Club sandwich τρόγωνο κοτόπουλο",
    "descriptionEn": "White club sandwich with chicken & golden sauce",
    "detailedDescriptionGr": "Κοτόπουλο με σως μαγιονέζας, λεπτοκομμένο καρότο & αγγούρι σε φέτες",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.0,
      "ptk": 1.25,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.6
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.8
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p89",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0776",
    "barcode": "5206854004118",
    "descriptionErp": "ΑΡΑΒΙΚΗ ΠΙΤΑ ΣΚΑΦΑΚΙ ΦΑΛΑΦΕΛ, ΣΑΛΑΤΑ ΚΗΠΟΥΡΟΥ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Wrap with falafel & garden salad",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.2,
      "ptk": 1.4,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.9
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.8
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.5
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p90",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0778",
    "barcode": "5206854004132",
    "descriptionErp": "ΜΠΑΓΚΕΤΑ ΛΕΥΚΗ ΒΗ ΜΕ ΦΕΤΑ, ΚΟΚΚΙΝΗ ΠΙΠΕΡΙΑ & ΠΑΤΕ ΕΛΙΑΣ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "White baguette with feta cheese, red pepper & olive paste",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.4,
      "ptk": 1.35,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.4
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p91",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0779",
    "barcode": "5206854001339",
    "descriptionErp": "ΦΕΤΕΣ ΟΛΙΚΗΣ ΓΑΛΟΠΟΥΛΑ, ΓΡΑΒΙΕΡΑ, ΣΩΣ ΜΑΓΙΟΝΕΖΑΣ ΜΕ ΜΟΥΣΤΑΡΔΑ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Wholegrain bread with turkey, graviera cheese  & mustard mayo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.5,
      "ptk": 1.3,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.3
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p92",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0780",
    "barcode": "5206854001292",
    "descriptionErp": "ΚΡΟΥΑΣΑΝ ΓΑΛΟΠΟΥΛΑ, ΕDΑΜ, ΜΑΓΙΟΝΕΖΑ LΙGΗΤ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Croissant with turkey, edam cheese & light mayo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.6,
      "ptk": 1.5,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.6
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.7
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p93",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0781",
    "barcode": "5206854011260",
    "descriptionErp": "ΒRΙΟCΗΕ ΒURGΕR ΒΗ ΜΠΙΦΤΕΚΙ, CΗΕDDΑR, ΜΠΕΙΚΟΝ, ΒURGΕR ΣΩΣ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Brioche burger with beef patty, cheddar cheese, bacon & burger sauce",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.7,
      "ptk": 1.45,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.7
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.6
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p94",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0782",
    "barcode": "5206854010003",
    "descriptionErp": "ΒΙΕΝΝΕΖΙΚΗ ΜΠΑΓΚΕΤΑ DΕLΙFRΑΝCΕ ΓΑΛΟΠΟΥΛΑ, ΕDΑΜ, ΜΑΓΙΟΝΕΖΑ LΙGΗΤ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Viennese baguette with turkey, edam cheese & light mayo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.3,
      "ptk": 1.5,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.3
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p95",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0785",
    "barcode": "5206854021245",
    "descriptionErp": "ΡΑΝΙΝΙ ΒΗ ΚΟΤΟΠΟΥΛΟ, ΜΠΕΙΚΟΝ, ΠΑΡΜΕΖΑΝΑ, CΑΕSΑR'S ΣΩΣ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Panini with chicken, bacon, parmesan cheese & Caesar sauce",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "YES",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.8,
      "ptk": 1.65,
      "quantity": 10,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.1
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p96",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0789",
    "barcode": "5206854020538",
    "descriptionErp": "ΡRΕΤΖΕL ΖΕΟ ΜΟΡΤΑΔΕΛΑ ΕΝ ΕΛΛΑΔΙ, ΠΑΡΜΕΖΑΝΑ, ΡΟΚΑ, ΡΕSΤΟ ΒΑΣΙΛΙΚΟΥ & ΦΥΣΤΙΚΙ ΑΙΓΙΝΗΣ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Pretzel with mortadella, parmesan cheese, rocket, pesto & pistachio",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.5,
      "ptk": 1.5,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.0
      }
    ]
  },
  {
    "id": "p97",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0790",
    "barcode": "5206854021313",
    "descriptionErp": "ΡΑΝΙΝΙ ΜΕ ΠΡΟΖΥΜΙ ΖΕΟ ΦΙΛΕΤΟ ΚΟΤΟΠΟΥΛΟΥ, ΠΙΠΕΡΙΕΣ, ΣΩΣ ΦΕΤΑΣ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Panini with chicken fillet, peppers & feta cheese sauce",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.8,
      "ptk": 1.65,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.4
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p98",
    "categoryGr": "ΣΑΝΤΟΥΙΤΣ - Golden Sandwich",
    "categoryEn": "SANDWICHES - G.S.",
    "itemCode": "15.0794",
    "barcode": "5206854021351",
    "descriptionErp": "ΡΑΝΙΝΙ ΠΡΟΖΥΜΙ ΖΕΟ ΠΡΟΣΟΥΤΟ, FLΑΚΕS ΠΑΡΜΕΖΑΝΑΣ, CRΕΑΜ CΗΕΕSΕ, ΡΟΚΑ, ΣΩΣ ΜΟΥΣΤΑΡΔΑΣ",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Panini with prosciutto, parmesan cheese flakes, cream cheese, rocket & mustard sauce",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.8,
      "ptk": 1.75,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p99",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0897",
    "barcode": "8056459023963",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ SQUΙSΙΤΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Il Squisito",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.2,
      "ptk": 1.86,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p100",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0898",
    "barcode": "8056459023956",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ SFΙΖΙΟSΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "il Pagnotto Sfizioso",
    "descriptionEn": "il Pagnotto Sfizioso",
    "detailedDescriptionGr": "Σάντουιτς με Προσούτο κότο, Κολοκυθάκια & Πικάντικο Τυρί Provolone",
    "detailedDescriptionEn": "Sandwich with Prosciutto Coto, Zucchini & Spicy Provolone Sandwich",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.2,
      "ptk": 1.86,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.95
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p101",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0899",
    "barcode": "8056459021228",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ L'ΙΤΑLΙΑΝΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "il Pagnotto Italiano",
    "descriptionEn": "il Pagnotto Italiano",
    "detailedDescriptionGr": "Σάντουιτς με Προσούτο Κρούντο & Τυρί Parmigiano Reggiano",
    "detailedDescriptionEn": "Sandwich with Proscuitto Crudo & Parmigiano Reggiano Cheese",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.2,
      "ptk": 1.86,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.95
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p102",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0900",
    "barcode": "8056459025974",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ L'ΑLΡΙΝΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "il Pagnotto Alpino",
    "descriptionEn": "il Pagnotto Alpino",
    "detailedDescriptionGr": "Σάντουιτς με Μπρεζάολα, Τυρί & Κρέμα Αγκινάρας",
    "detailedDescriptionEn": "Sandwich with Bresaola, Cheese & Artichoke Cream",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.8,
      "ptk": 1.64,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.85
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p103",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0901",
    "barcode": "8056459022355",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ  ΙL ΤΙRΟLΕSΕ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Il Tirolese",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.2,
      "ptk": 1.81,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p104",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0902",
    "barcode": "8056459022041",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ ΙL ΝΟRVΕGΕSΕ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "il Pagnotto Norvegese",
    "descriptionEn": "il Pagnotto Norvegese",
    "detailedDescriptionGr": "Σάντουιτς με Sολομό, Aβοκάντο & Kολοκυθάκια",
    "detailedDescriptionEn": "Sandwich with Salmon, Avocado & Zucchini",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.2,
      "ptk": 1.86,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.95
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p105",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0903",
    "barcode": "8056459023475",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ L'ΟRΤΟLΑΝΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "L’Ortolano",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.8,
      "ptk": 1.68,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p106",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0904",
    "barcode": "8056459021235",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ ΙL ΡRΙΜΑVΕRΑ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Il Primavera",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.8,
      "ptk": 1.61,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p107",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0905",
    "barcode": "8056459021181",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ ΙL ΤΟSCΑΝΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "il Pagnotto Toscano",
    "descriptionEn": "il Pagnotto Toscano",
    "detailedDescriptionGr": "Σάντουτς με Πορκέτα & Μανιτάρια",
    "detailedDescriptionEn": "Sandwich with Porchetta & Mushrooms",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.2,
      "ptk": 1.63,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.85
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p108",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0906",
    "barcode": "8056459021198",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ ΙL ΜΕDΙΤΕRRΑΝΕΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Il Mediterraneo",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.2,
      "ptk": 1.61,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.2
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p109",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0907",
    "barcode": "8056459025349",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ CΑΡRΙ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Capri",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.5,
      "ptk": 1.97,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p110",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0908",
    "barcode": "8056459025332",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ FUSΙΟΝ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Fusion",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.5,
      "ptk": 1.83,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p111",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0909",
    "barcode": "8056459024946",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ ΜULΤΙGRΑΙΝ SCΗΑCCΙΑΤΑ ΒRΕΑD WΙΤΗ CΟΟΚΕD ΗΑΜ, CRΕΑΜ CΗΕΕSΕ, ΑΝD SΑUΤΕΕD ΜUSΗRΟΟΜ 180GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Il Pagnotto Multigrain Schiacciata bread with cooked ham, cream cheese and sautéed mushrooms (180 g)",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.5,
      "ptk": 1.85,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p112",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0910",
    "barcode": "8056459024939",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ ΡΟΡΡΥ ΑΝD SΕSΑΜΕ SΕΕDS ΒRΕΑD WΙΤΗ ΜΟΤΑDΕLLΑ, ΡRΟVΟLΑ CΗΕΕSΕ ΑΝD GRΙLLΕD CΟURGΕΤΤΕS 180GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Il Pagnotto poppy & sesame seeds bread with mortadella, provola cheese and grilled courgettes (180 g)",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.5,
      "ptk": 2.19,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p113",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0911",
    "barcode": "8056459025233",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ GLUΤΕΝ FRΕΕ SΑLΜΟΝ & ΑVΟCΑDΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Il Pagnotto gluten-free salmon & avocado (160 g)",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.5,
      "ptk": 2.18,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p114",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0912",
    "barcode": "8056459025240",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ GLUΤΕΝ FRΕΕ CURΕD ΗΑΜ & ΡΑRΜΙGΙΑΝΟ RΕGGΙΑΝΟ FLΑΚΕS 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Il Pagnotto gluten-free cured ham & Parmigiano Reggiano flakes (160 g)",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.5,
      "ptk": 2.27,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p115",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0913",
    "barcode": "8056459025257",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ GLUΤΕΝ FRΕΕ ΤUΝΑ & ΕGGS 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Il Pagnotto gluten-free tuna & eggs (160 g)",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.5,
      "ptk": 2.09,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p116",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0914",
    "barcode": "8056459025264",
    "descriptionErp": "ΙL ΡΑGΝΟΤΤΟ GLUΤΕΝ FRΕΕ ΒRΕSΑΟLΑ & ΜΟUΝΤΑΙΝ CΗΕΕSΕ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Il Pagnotto gluten-free bresaola & mountain cheese (160 g)",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 4.5,
      "ptk": 2.07,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p117",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0915",
    "barcode": "8056459024427",
    "descriptionErp": "SΑΝDWΙCΗ WΙΤΗ CΟΟΚΕD ΗΑΜ, ΜΟΖΖΑRΕLLΑ CΗΕΕSΕ ΑΝD ΤΟΜΑΤΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "Prosciutto Cotto Mozzarella Pomodoro",
    "descriptionEn": "Prosciutto Cotto Mozzarella Pomodoro",
    "detailedDescriptionGr": "Σάντουιτς με Προσούτο, Μοτσαρέλα & Τομάτα",
    "detailedDescriptionEn": "Sandwich with Prosciutto, Mozzarella Cheese & Tomato",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.5,
      "ptk": 1.41,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.75
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p118",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0916",
    "barcode": "8056459024434",
    "descriptionErp": "SΑΝDWΙCΗ WΙΤΗ ΡRΑWΝS, ΑVΟCΑDΟ ΑΝD CΟURGΕΤΤΕS 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "Gamberi Avocado Zucchine",
    "descriptionEn": "Gamberi Avocado Zucchine",
    "detailedDescriptionGr": "Σαντουιτς με Γαρίδες, Αβοκάντο & Κολοκύθι",
    "detailedDescriptionEn": "Sandwich with Shrimp, Avocado & Zucchini",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.5,
      "ptk": 1.36,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.75
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p119",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0917",
    "barcode": "8056459024441",
    "descriptionErp": "SΑΝDWΙCΗ WΙΤΗ ΤUΝΑ, ΟLΙVΕS ΑΝD ΕGG 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "",
    "descriptionEn": "Sandwich with tuna, olives and egg (160 g)",
    "detailedDescriptionGr": "",
    "detailedDescriptionEn": "",
    "status": "ΟΧΙ ΑΚΟΜΑ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.5,
      "ptk": 1.43,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.5
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.0
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p120",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0918",
    "barcode": "8056459024458",
    "descriptionErp": "SΑΝDWΙCΗ WΙΤΗ ΤURΚΕΥ, ΡRΟVΟLΑ CΗΕΕSΕ ΑΝD CΟURGΕΤΤΕS 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "Tachino Provola Zucchine",
    "descriptionEn": "Tachino Provola Zucchine",
    "detailedDescriptionGr": "Σάντουιτς με Γαλοπούλα, Τυρί Προβόλα & Κολοκύθι",
    "detailedDescriptionEn": "Sandwich with Turkey, Provola Cheese & Zucchini",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 3.8,
      "ptk": 1.53,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.8
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 3.2
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.75
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p121",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0919",
    "barcode": "8056459021723",
    "descriptionErp": "FΟCΑCCΕ ΙL CΟΝΤΑDΙΝΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "il Pagnotto Contadino",
    "descriptionEn": "il Pagnotto Contadino",
    "detailedDescriptionGr": "Focaccia με Σαλάμι & Μοτσαρέλα",
    "detailedDescriptionEn": "Focaccia with Salami & Mozzarella Cheese",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.0,
      "ptk": 1.78,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 5.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.95
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  },
  {
    "id": "p122",
    "categoryGr": "PARMA",
    "categoryEn": "PARMA",
    "itemCode": "15.0920",
    "barcode": "8056459021730",
    "descriptionErp": "FΟCΑCCΕ ΙL RΟΜΑGΝΟLΟ 160GR",
    "unitsPerMachine": null,
    "descriptionGr": "il Pagnotto Romagnolo",
    "descriptionEn": "il Pagnotto Romagnolo",
    "detailedDescriptionGr": "Focaccia με Μορταδέλα & Τυρί Provola",
    "detailedDescriptionEn": "Focaccia with Mortadella & Provola Cheese",
    "status": "ΕΝΤΟΣ",
    "activeOnMachine": "NO",
    "activeStores": [],
    "images365": [],
    "imagesPromo": [],
    "cost": {
      "sellingPrice": 5.0,
      "ptk": 1.96,
      "quantity": 0,
      "vatPercent": 13
    },
    "stores": [
      {
        "name": "DEMO",
        "sellingPriceStore": null,
        "sellingPriceQF": 5.0
      },
      {
        "name": "Plaisio",
        "sellingPriceStore": null,
        "sellingPriceQF": 4.5
      },
      {
        "name": "Novibet",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Kryoneri",
        "sellingPriceStore": null,
        "sellingPriceQF": 2.95
      },
      {
        "name": "Nestle",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "AIA",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "Metlen",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      },
      {
        "name": "ACS Courier",
        "sellingPriceStore": null,
        "sellingPriceQF": null
      }
    ]
  }
];

const CONTACT_COLUMNS = [
  { key: "company", label: "Εταιρεία" },
  { key: "department", label: "Αρμόδιο Τμήμα" },
  { key: "phone", label: "Phone" },
  { key: "emailInfo", label: "Email - Info" },
  { key: "status", label: "Status" },
  { key: "autoSeller", label: "Αυτόματος Πωλητής/Κυλικείο" },
  { key: "interest", label: "Ενδιαφέρον" },
  { key: "people", label: "Άτομα" },
  { key: "responsible", label: "Υπεύθυνος" },
  { key: "email", label: "Email" },
  { key: "phone2", label: "Phone (Υπεύθυνος)" },
  { key: "firstCallDate", label: "1η Τηλεφωνική Επικοινωνία" },
  { key: "firstMailDate", label: "1η Αποστολή Mail" },
  { key: "firstVisitDate", label: "1η Επίσκεψη" },
  { key: "secondCallDate", label: "2η Τηλεφωνική Επικοινωνία" },
  { key: "secondMailDate", label: "2η Αποστολή Mail" },
  { key: "secondVisitDate", label: "2η Επίσκεψη" },
  { key: "notes", label: "Παρατηρήσεις" }
];

const DEFAULT_VISIBLE_CONTACT_COLUMNS = CONTACT_COLUMNS.map((col) => col.key);

function getContactColumnValue(c, key) {
  if (key === "people") return (c.people || []).join(", ");
  return c[key];
}
function getContactFilterText(c, key) {
  const v = getContactColumnValue(c, key);
  return v === null || v === undefined ? "" : String(v);
}

function makeEmptyContact(id) {
  return {
    id,
    company: "Νέα εταιρεία",
    department: "",
    phone: "",
    emailInfo: "",
    status: "",
    autoSeller: "",
    interest: "",
    people: [],
    responsible: "",
    email: "",
    phone2: "",
    firstCallDate: null,
    firstMailDate: null,
    firstVisitDate: null,
    secondCallDate: null,
    secondMailDate: null,
    secondVisitDate: null,
    notes: ""
  };
}

const initialContacts = [
  {
    "id": "c1",
    "company": "ΠΛΑΙΣΙΟ",
    "department": "Head of Cost Control | Cost Control department",
    "phone": "",
    "emailInfo": "",
    "status": "Ενδιαφέρεται",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "Υψηλό",
    "people": [
      "Sissy Ploubi"
    ],
    "responsible": "Sissy Ploubi",
    "email": "cploubi@plaisio.gr",
    "phone2": "6988186201",
    "firstCallDate": null,
    "firstMailDate": "2026-03-18",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Πένυ"
  },
  {
    "id": "c2",
    "company": "DEMO",
    "department": "HR Business Partner",
    "phone": "",
    "emailInfo": "",
    "status": "Ενδιαφέρεται",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "Υψηλό",
    "people": [
      "Vivi Liberopoulou"
    ],
    "responsible": "Vivi Liberopoulou",
    "email": "vliberopoulou@demo.gr",
    "phone2": "2111813506",
    "firstCallDate": null,
    "firstMailDate": "2026-04-15",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Τιμοκατάλογος οκ / Πένυ"
  },
  {
    "id": "c3",
    "company": "IKHOWHOW",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "Δεν Ενδιαφέρει",
    "autoSeller": "",
    "interest": "Χαμηλό",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-04-16",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": "2026-06-12",
    "secondVisitDate": null,
    "notes": "Εστάλει mail από Πένυ 2 φορές"
  },
  {
    "id": "c4",
    "company": "NOVIBET",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "Ενδιαφέρεται",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "Υψηλό",
    "people": [
      "Κωνσταντίνος Ανδρής"
    ],
    "responsible": "Κωνσταντίνος Ανδρής",
    "email": "kandris@qualityinvest.gr",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-04-16",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Θέλει μόνο τα 2 ψυγεία - Δεν θέλει καφέ και Φούρνους / Πένυ"
  },
  {
    "id": "c5",
    "company": "RELEVANCE",
    "department": "Founder - CEO",
    "phone": "",
    "emailInfo": "",
    "status": "Δεν Ενδιαφέρει",
    "autoSeller": "",
    "interest": "Χαμηλό",
    "people": [
      "Thanassis Sofianos"
    ],
    "responsible": "Thanassis Sofianos",
    "email": "sofianos@relevancedigital.com",
    "phone2": "210 3210577",
    "firstCallDate": null,
    "firstMailDate": "2026-04-16",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": "2026-06-12",
    "secondVisitDate": null,
    "notes": "Εστάλει mail από Πένυ 2 φορές"
  },
  {
    "id": "c6",
    "company": "ΚΩΤΣΟΒΟΛΟΣ Κεντρικά",
    "department": "EVP & EMPLOYER BRANDING MANAGER",
    "phone": "",
    "emailInfo": "",
    "status": "Ενδιαφέρεται",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "Υψηλό",
    "people": [
      "Levanti, Konstantina"
    ],
    "responsible": "Levanti, Konstantina",
    "email": "LevantiK@kotsovolos.gr",
    "phone2": "2102899999",
    "firstCallDate": null,
    "firstMailDate": "2026-04-17",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Πένυ"
  },
  {
    "id": "c7",
    "company": "ΚΩΤΣΟΒΟΛΟΣ Παραγωγή",
    "department": "HREVP & EMPLOYER BRANDING MANAGER",
    "phone": "",
    "emailInfo": "",
    "status": "Ενδιαφέρεται",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "Υψηλό",
    "people": [
      "Levanti, Konstantina"
    ],
    "responsible": "Levanti, Konstantina",
    "email": "LevantiK@kotsovolos.gr",
    "phone2": "2102899999",
    "firstCallDate": null,
    "firstMailDate": "2026-04-17",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Με επιδότηση - τους παρέχουν 1 S/W την ημέρα δωρεάν / Πένυ"
  },
  {
    "id": "c8",
    "company": "NESTLE Γέρακας",
    "department": "Regional Security Advisor SEC/Facilities & Fleet Manager",
    "phone": "",
    "emailInfo": "",
    "status": "Σε Επικοινωνία",
    "autoSeller": "",
    "interest": "Υψηλό",
    "people": [
      "Chatzelias,Dimitris"
    ],
    "responsible": "Chatzelias,Dimitris",
    "email": "dimitris.chatzelias@gr.nestle.com",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-04-22",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Υπάρχει θέμα με τις τιμές / Πένυ"
  },
  {
    "id": "c9",
    "company": "NESTLE Οιν.",
    "department": "Regional Security Advisor SEC/Facilities & Fleet Manager",
    "phone": "",
    "emailInfo": "",
    "status": "Σε Επικοινωνία",
    "autoSeller": "",
    "interest": "Μέτριο",
    "people": [
      "Chatzelias,Dimitris"
    ],
    "responsible": "Chatzelias,Dimitris",
    "email": "dimitris.chatzelias@gr.nestle.com",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-04-22",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Υπάρχει θέμα με τις τιμές / Πένυ"
  },
  {
    "id": "c10",
    "company": "OTE Πάρνηθα",
    "department": "Υποδιεύθυνση Ασφάλειας & Υγείας Ομίλου ΟΤΕ",
    "phone": "",
    "emailInfo": "",
    "status": "Πελάτης",
    "autoSeller": "Κυλικείο",
    "interest": "Μέτριο",
    "people": [
      "Παναγιωτακοπούλου Βασιλική"
    ],
    "responsible": "Παναγιωτακοπούλου Βασιλική",
    "email": "vpanagiot@ote.gr",
    "phone2": "6982783524",
    "firstCallDate": null,
    "firstMailDate": "2026-04-24",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Δεν θέλουμε εμείς, πολύ λίγα άτομα / Πένυ"
  },
  {
    "id": "c11",
    "company": "FRANMAN",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "Σε Επικοινωνία",
    "autoSeller": "",
    "interest": "",
    "people": [
      "Vicky P. Zois"
    ],
    "responsible": "Vicky P. Zois",
    "email": "vpz@franman.gr",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-05-05",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": "2026-07-06",
    "secondVisitDate": null,
    "notes": "Πένυ"
  },
  {
    "id": "c12",
    "company": "METLEN Θεσσαλονίκη 01",
    "department": "Facilities Manager Chief Administration Office ,  Central Functions Metlen Energy & Metals",
    "phone": "",
    "emailInfo": "",
    "status": "Σε Επικοινωνία",
    "autoSeller": "Κυλικείο",
    "interest": "Υψηλό",
    "people": [
      "Ioannis Ntelipanagiotis ​​​​"
    ],
    "responsible": "Ioannis Ntelipanagiotis ​​​​",
    "email": "ioannis.ntelipanagiotis@metlengroup.com",
    "phone2": "6949478514",
    "firstCallDate": null,
    "firstMailDate": "2026-05-06",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Θεσσαλονίκη / Πένυ"
  },
  {
    "id": "c13",
    "company": "METLEN Θεσσαλονίκη 02",
    "department": "Facilities Manager Chief Administration Office ,  Central Functions Metlen Energy & Metals",
    "phone": "",
    "emailInfo": "",
    "status": "Σε Επικοινωνία",
    "autoSeller": "Κυλικείο",
    "interest": "Υψηλό",
    "people": [
      "Ioannis Ntelipanagiotis ​​​​"
    ],
    "responsible": "Ioannis Ntelipanagiotis ​​​​",
    "email": "ioannis.ntelipanagiotis@metlengroup.com",
    "phone2": "6949478514",
    "firstCallDate": null,
    "firstMailDate": "2026-05-06",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Θεσσαλονίκη / Πένυ"
  },
  {
    "id": "c14",
    "company": "ΙΑΣΩ",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "Πελάτης",
    "autoSeller": "",
    "interest": "",
    "people": [
      "Βιτάλη"
    ],
    "responsible": "Βιτάλη",
    "email": "evitali@iaso.gr",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-05-21",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Μέσο Κελεπούρη"
  },
  {
    "id": "c15",
    "company": "FSC - Pfizer",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [
      "Πατρικά"
    ],
    "responsible": "Πατρικά",
    "email": "pfizer@patrikas.net",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-05-21",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": "2026-07-06",
    "secondVisitDate": null,
    "notes": "Πένυ"
  },
  {
    "id": "c16",
    "company": "ANFARM",
    "department": "",
    "phone": "6986418756",
    "emailInfo": "msiarkou@anfarm.com",
    "status": "Σε Επικοινωνία",
    "autoSeller": "Κυλικείο",
    "interest": "Υψηλό",
    "people": [
      "K.ΜΕΛΙΝΑ ΣΙΑΡΚΟΥ"
    ],
    "responsible": "K.ΜΕΛΙΝΑ ΣΙΑΡΚΟΥ",
    "email": "",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-05-22",
    "firstVisitDate": null,
    "secondCallDate": "2026-07-02",
    "secondMailDate": "2026-07-03",
    "secondVisitDate": null,
    "notes": "Έχω μιλήσει μαζί της, της έστειλα εκ νέου την παρουσίαση και τον τιμοκατάλογο"
  },
  {
    "id": "c17",
    "company": "ACS Courier",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "Μέτριο",
    "people": [
      "Roussos Vaggelis"
    ],
    "responsible": "Roussos Vaggelis",
    "email": "roussos@acscourier.gr",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-06-04",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Τζίμας"
  },
  {
    "id": "c18",
    "company": "OTE",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "tkalogerop@ote.gr",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-06-10",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Τζαγκαράκης"
  },
  {
    "id": "c19",
    "company": "Sarafidis Group",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "sg@sarafidisgroup.gr",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-06-10",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Τζαγκαράκης"
  },
  {
    "id": "c20",
    "company": "Howden Group",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [
      "John Tsaoussis"
    ],
    "responsible": "John Tsaoussis",
    "email": "john.tsaoussis@howdengroup.com",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-06-12",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Τζαγκαράκης"
  },
  {
    "id": "c21",
    "company": "ΕΛΤΑ",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [
      "Tempos Marios"
    ],
    "responsible": "Tempos Marios",
    "email": "m.tempos@elta-net.gr",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-06-15",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Πρόταση ανανέωση σύμβασης Γευσήνους &amp; Quick - Fresh Smart Store"
  },
  {
    "id": "c22",
    "company": "Νovonordisk",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [
      "κ. Τσούτσα, κ. Μπλάτσιου,"
    ],
    "responsible": "κ. Τσούτσα, κ. Μπλάτσιου,",
    "email": "dtou@novonordisk.com",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-06-15",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Πένυ"
  },
  {
    "id": "c23",
    "company": "GENEPHARM",
    "department": "HR",
    "phone": "2106039336",
    "emailInfo": "info@genepharm.com",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [
      "κ.Γεωργατου"
    ],
    "responsible": "κ.Γεωργατου",
    "email": "hr.@genepharm.com",
    "phone2": "",
    "firstCallDate": "2026-06-17",
    "firstMailDate": "2026-06-17",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Q&amp;F"
  },
  {
    "id": "c24",
    "company": "WURTH",
    "department": "HR",
    "phone": "2106290800",
    "emailInfo": "info@wurth.gr/hr@wurth.gr",
    "status": "",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "",
    "people": [
      "'hr@wurth.gr'"
    ],
    "responsible": "'hr@wurth.gr'",
    "email": "'Vasilis.giakoumis@wurth.gr'",
    "phone2": "",
    "firstCallDate": "2026-06-18",
    "firstMailDate": "2026-06-18",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "O αυτοματος πωλητης εχει μονο σνακ ,πατατακια ,αναψυκτικα και 4 σαντουιτς FRESH τιμες 2ευρω[ megavend]"
  },
  {
    "id": "c25",
    "company": "Tottis-Bingo ΑΕΒΕ - Παραγωγή",
    "department": "Τμήμα Προμηθειών",
    "phone": "",
    "emailInfo": "",
    "status": "Σε Επικοινωνία",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "Υψηλό",
    "people": [
      "Γιαγτζή Ασημίνα"
    ],
    "responsible": "Γιαγτζή Ασημίνα",
    "email": "a.giagtzi@tottis-bingo.com",
    "phone2": "6936735900",
    "firstCallDate": null,
    "firstMailDate": "2026-06-22",
    "firstVisitDate": "2026-06-29",
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Προμηθειών"
  },
  {
    "id": "c26",
    "company": "Tottis-Bingo ΑΕΒΕ - Διοίκηση",
    "department": "Τμήμα Προμηθειών",
    "phone": "",
    "emailInfo": "",
    "status": "Σε Επικοινωνία",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "Υψηλό",
    "people": [
      "Γιαγτζή Ασημίνα"
    ],
    "responsible": "Γιαγτζή Ασημίνα",
    "email": "a.giagtzi@tottis-bingo.com",
    "phone2": "6936735900",
    "firstCallDate": null,
    "firstMailDate": "2026-06-22",
    "firstVisitDate": "2026-06-29",
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Προμηθειών"
  },
  {
    "id": "c27",
    "company": "Baker Master",
    "department": "Διευθυντής Πωλήσεων",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [
      "Κ. Μάρκου Νίκος"
    ],
    "responsible": "Κ. Μάρκου Νίκος",
    "email": "nmarkos@bakermaster.gr",
    "phone2": "6947002313",
    "firstCallDate": null,
    "firstMailDate": "2026-06-22",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Προμηθειών"
  },
  {
    "id": "c28",
    "company": "ΔΗΜΙΟΥΡΓΙΚΗ ΑΝΘΡΩΠΙΝΩΝ ΠΟΡΩΝ Ε.Π.Ε.",
    "department": "HR",
    "phone": "2103259380",
    "emailInfo": "info@optimalhrgroup.com",
    "status": "",
    "autoSeller": "Κυλικείο",
    "interest": "Μέτριο",
    "people": [],
    "responsible": "",
    "email": "info@optimalhrgroup.com",
    "phone2": "",
    "firstCallDate": "2026-06-23",
    "firstMailDate": "2026-06-23",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Q&amp;F"
  },
  {
    "id": "c29",
    "company": "DOTSOFT Α.Ε",
    "department": "ΗΡ",
    "phone": "2310500181",
    "emailInfo": "info@dotsoft.gr",
    "status": "",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "Χαμηλό",
    "people": [],
    "responsible": "",
    "email": "info@dotsoft.gr",
    "phone2": "",
    "firstCallDate": "2026-06-25",
    "firstMailDate": "2026-06-25",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Q&amp;F"
  },
  {
    "id": "c30",
    "company": "COGNITY Α.Ε",
    "department": "HR",
    "phone": "2106194400",
    "emailInfo": "info@cognity.gr",
    "status": "Σε Επικοινωνία",
    "autoSeller": "Κυλικείο",
    "interest": "Μέτριο",
    "people": [],
    "responsible": "",
    "email": "info@cognity.gr",
    "phone2": "",
    "firstCallDate": "2026-06-25",
    "firstMailDate": "2026-06-25",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Νεο κτηριο / Q&amp;F"
  },
  {
    "id": "c31",
    "company": "ΣΤΑΘΜΟΣ ΕΜΠΟΡΕΥΜΑΤΟΚΙΒΩΤΙΩΝ ΠΕΙΡΑΙΑ ΜΟΝΟΠΡΟΣΩΠΗ Α.Ε.",
    "department": "HR",
    "phone": "2104099100",
    "emailInfo": "info@pct.com.gr",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-06-25",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "δεν σταλθηκε mail,μεγαλο αρχειο"
  },
  {
    "id": "c32",
    "company": "SKY MAR",
    "department": "HR",
    "phone": "2106085051",
    "emailInfo": "hr.cordia.gr",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "info@skymarservice.gr",
    "phone2": "2106085030",
    "firstCallDate": "2026-06-25",
    "firstMailDate": "2026-06-25",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Q&amp;F"
  },
  {
    "id": "c33",
    "company": "M.S.P.S Α.Ε",
    "department": "HR",
    "phone": "2106194400",
    "emailInfo": "info@msps.net",
    "status": "Σε Επικοινωνία",
    "autoSeller": "Κυλικείο",
    "interest": "Υψηλό",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "2109604200",
    "firstCallDate": "2026-06-26",
    "firstMailDate": "2026-06-25",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": "2026-07-03",
    "secondVisitDate": null,
    "notes": "Με πήρε τηλ και θέλει να της στείλω τον τιμοκατάλογο και να δούμε λίγο το θέμα με φρούτα. Που έχουν τώρα με δική τους παροχή / Q&amp;FΤης έστειλα εκ νέου την παρουσίαση και τον τιμοκατάλογο"
  },
  {
    "id": "c34",
    "company": "ΗΛΕΚΤΡΟΙΝΒΕΣΤ Α.Ε.",
    "department": "HR",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "accounting@meidanis.gr",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-06-25",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Q&amp;F"
  },
  {
    "id": "c35",
    "company": "COGNITY Α.Ε.",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "info@cognity.gr",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-06-25",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Q&amp;F"
  },
  {
    "id": "c36",
    "company": "MENARINI HELLAS Α.Ε.",
    "department": "Τμήμα Ανθρώπινου Δυναμικού (HR)",
    "phone": "2108316111-3",
    "emailInfo": "info@menarini.gr",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [
      "κ.Τζακου"
    ],
    "responsible": "κ.Τζακου",
    "email": "info@menarini.gr",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-06-25",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Q&amp;F"
  },
  {
    "id": "c37",
    "company": "MΥΛΟΙ ΘΡΑΚΗΣ",
    "department": "HR",
    "phone": "2551026474",
    "emailInfo": "axdmills@thracemills.gr",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-06-26",
    "firstMailDate": "2026-06-25",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Q&amp;F"
  },
  {
    "id": "c38",
    "company": "CROWN HELLAS",
    "department": "HR",
    "phone": "2106799100",
    "emailInfo": "solcrowe@solcrowe.gr",
    "status": "",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "2106799100",
    "firstCallDate": "2026-06-26",
    "firstMailDate": "2026-06-25",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Q&amp;F"
  },
  {
    "id": "c39",
    "company": "ΙΔΙΩΤΙΚΟ ΙΝΣΤΙΤΟΥΤΟ ΕΠΑΓΓΕΛΜΑΤΙΚΗΣ ΚΑΤΑΡΤΙΣΗΣ ΣΥΓΧΡΟΝΩΝ ΒΙΟΙΑΤΡΙΚΩΝ ΕΠΑΓΓΕΛΜΑΤΩΝ Α.Ε.",
    "department": "HR",
    "phone": "HR",
    "emailInfo": "info@sbie.edu.gr",
    "status": "Σε Επικοινωνία",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "",
    "people": [
      "ΠΑΠΑΒΑΣΙΛΕΙΟΥ ΓΙΩΤΑ"
    ],
    "responsible": "ΠΑΠΑΒΑΣΙΛΕΙΟΥ ΓΙΩΤΑ",
    "email": "",
    "phone2": "2103247480",
    "firstCallDate": "2026-06-30",
    "firstMailDate": "2026-06-30",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "ΕΧΕΙ ΚΥΛΙΚΕΙΟ"
  },
  {
    "id": "c40",
    "company": "ΜΕΝΝΕΑ A.E{EBGA}",
    "department": "HR",
    "phone": "2103487400",
    "emailInfo": "info@mennefoods.gr",
    "status": "",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "",
    "people": [
      "ΠΑΠΑΔΟΠΟΥΛΟΥ"
    ],
    "responsible": "ΠΑΠΑΔΟΠΟΥΛΟΥ",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-06-30",
    "firstMailDate": "2026-06-30",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": ""
  },
  {
    "id": "c41",
    "company": "GALENICA A.Ε",
    "department": "ΗR",
    "phone": "2105281700",
    "emailInfo": "contact@galenica.gr",
    "status": "",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-06-30",
    "firstMailDate": "2026-06-30",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "ΕΧΕΙ ΑΥΤΟΜΑΤΟ ΠΩΛΗΤΗ"
  },
  {
    "id": "c42",
    "company": "UNI-PHARMA",
    "department": "MARKETING",
    "phone": "2106253905",
    "emailInfo": "farmakis@uni-pharma.gr",
    "status": "",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "",
    "people": [
      "Mαριος Φαρμακης"
    ],
    "responsible": "Mαριος Φαρμακης",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-07-02",
    "firstMailDate": "2026-07-02",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Η εταιρια εχει αυτοματους και κυλικειο"
  },
  {
    "id": "c43",
    "company": "VENMAN",
    "department": "Γραμματεια διοικησης",
    "phone": "2310788700",
    "emailInfo": "'info@venman.gr'",
    "status": "",
    "autoSeller": "Κυλικείο",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-07-02",
    "firstMailDate": "2026-07-02",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "ΔΕΝ ΥΠΑΡΧΕΙ ΑΥΤΟΜΑΤΟΣ Η ΚΥΛΙΚΕΙΟ"
  },
  {
    "id": "c44",
    "company": "ASTRAZENECA",
    "department": "HR",
    "phone": "2106871500",
    "emailInfo": "azgcontactus@astrazeneca.com",
    "status": "",
    "autoSeller": "Κυλικείο",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-07-02",
    "firstMailDate": "2026-07-02",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": ""
  },
  {
    "id": "c45",
    "company": "KNAUF",
    "department": "HR",
    "phone": "2109310567",
    "emailInfo": "knauf@knauf.gr",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-07-02",
    "firstMailDate": "2026-07-02",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "να καλεσω τη Δευτερα6/7"
  },
  {
    "id": "c46",
    "company": "ADACOM",
    "department": "HR",
    "phone": "2105193740",
    "emailInfo": "info@adacom.com",
    "status": "",
    "autoSeller": "Αυτόματος Πωλητής",
    "interest": "",
    "people": [
      "K.Mαρτζιος"
    ],
    "responsible": "K.Mαρτζιος",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-07-03",
    "firstMailDate": "2026-07-03",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "ΕΧΕΙ ΑΥΤΟΜΑΤΟ Κ ΚΥΛΙΚΕΙΟ ,ΞΕΡΕΙ ΤΗΝ ΓΕΥΣΗΝΟΥΣ Η ΓΡΑΜΜΑΤΕΑΣ ΘΑ ΠΡΟΩΘΗΣΕΙ ΤΗΝ ΠΡΟΣΦΟΡΑ"
  },
  {
    "id": "c47",
    "company": "ΙΝΤΕΡΠΛΑΣΤ Α.Ε",
    "department": "HR",
    "phone": "2531038811",
    "emailInfo": "info@interplast.gr",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-07-03",
    "firstMailDate": "2026-07-03",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "ΝΑ ΚΑΛΕΣΩ ΤΗ ΔΕΥΤΕΡΑ"
  },
  {
    "id": "c48",
    "company": "ΦΑΡΜΑΣΕΡΒΙΣ",
    "department": "HR",
    "phone": "2105120520",
    "emailInfo": "info@pharmaservice.gr",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-07-03",
    "firstMailDate": "2026-07-03",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": ""
  },
  {
    "id": "c49",
    "company": "Welcomepickups",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [
      "Νικος Μανεσης - Βίκυ Σιαμπανου"
    ],
    "responsible": "Νικος Μανεσης - Βίκυ Σιαμπανου",
    "email": "nmanessis@welcomepickups.com",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": "2026-07-07",
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": ""
  },
  {
    "id": "c50",
    "company": "PATRIKAS",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": null,
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Να ρωτήσω την Πένυ"
  },
  {
    "id": "c51",
    "company": "WEBHELP",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": null,
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Να ρωτήσω την Πένυ"
  },
  {
    "id": "c52",
    "company": "ΑΔΜΗΕ",
    "department": "",
    "phone": "",
    "emailInfo": "",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": null,
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Ανανέωση Σύμβασης / Πένυ"
  },
  {
    "id": "c53",
    "company": "frezyderm",
    "department": "hr",
    "phone": "2105246900",
    "emailInfo": "'info@frezyderm.gr'",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [
      "Μελισσαρη Κατερινα"
    ],
    "responsible": "Μελισσαρη Κατερινα",
    "email": "",
    "phone2": "",
    "firstCallDate": null,
    "firstMailDate": null,
    "firstVisitDate": null,
    "secondCallDate": null,
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": ""
  },
  {
    "id": "c54",
    "company": "COWA HELLAS Α.Ε",
    "department": "HR",
    "phone": "2109324806",
    "emailInfo": "info@cowa.gr",
    "status": "",
    "autoSeller": "",
    "interest": "",
    "people": [],
    "responsible": "",
    "email": "",
    "phone2": "",
    "firstCallDate": "2026-07-03",
    "firstMailDate": null,
    "firstVisitDate": null,
    "secondCallDate": "2026-07-03",
    "secondMailDate": null,
    "secondVisitDate": null,
    "notes": "Επικοινωνια με κ.Ζαχαρακη"
  }
];

function fmtEuro(n) {
  return isFinite(n) ? n.toFixed(2) + " €" : "-";
}
function fmtPct(n) {
  return isFinite(n) ? Math.round(n) + " %" : "∞ %";
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-md border border-slate-300 bg-slate-100 text-sm text-slate-800 focus:outline-none focus:border-teal-600 focus:bg-white";

export default function QuickFreshApp() {
  const [view, setView] = useState("products");
  const [products, setProducts] = useState(initialProducts);
  const [selectedId, setSelectedId] = useState(initialProducts[0].id);
  const [bulkMode, setBulkMode] = useState(false);
  const [viewMode, setViewMode] = useState("table");
  const [tableViews, setTableViews] = useState([{ id: "data", name: "Data", columns: DEFAULT_VISIBLE_COLUMNS }]);
  const [activeViewId, setActiveViewId] = useState("data");
  const [showColPicker, setShowColPicker] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});
  const [bulkRows, setBulkRows] = useState([makeEmptyBulkRow(), makeEmptyBulkRow(), makeEmptyBulkRow()]);
  const [contacts, setContacts] = useState(initialContacts);
  const [selectedContactId, setSelectedContactId] = useState(initialContacts[0].id);
  const [contactViewMode, setContactViewMode] = useState("table");
  const [contactVisibleColumns, setContactVisibleColumns] = useState(DEFAULT_VISIBLE_CONTACT_COLUMNS);
  const [showContactColPicker, setShowContactColPicker] = useState(false);
  const [contactColumnFilters, setContactColumnFilters] = useState({});
  const contact = contacts.find((c) => c.id === selectedContactId) || null;
  const [tab, setTab] = useState("info");
  const [personInput, setPersonInput] = useState("");
  const [storeOptions, setStoreOptions] = useState(STORE_CANDIDATES);

  const product = products.find((p) => p.id === selectedId) || null;
  const activeView = tableViews.find((v) => v.id === activeViewId) || tableViews[0];
  const visibleColumns = activeView.columns;

  function updateProduct(id, updater) {
    setProducts((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
  }
  function toggleColumn(key) {
    setTableViews((prev) =>
      prev.map((v) =>
        v.id === activeViewId
          ? { ...v, columns: v.columns.includes(key) ? v.columns.filter((k) => k !== key) : [...v.columns, key] }
          : v
      )
    );
  }
  function addTableView() {
    const name = window.prompt("Όνομα νέου tab πίνακα:");
    if (!name || !name.trim()) return;
    const id = "view-" + Date.now();
    setTableViews((prev) => [...prev, { id, name: name.trim(), columns: activeView.columns }]);
    setActiveViewId(id);
  }
  function renameTableView(id) {
    const existing = tableViews.find((v) => v.id === id);
    const name = window.prompt("Νέο όνομα tab:", existing ? existing.name : "");
    if (!name || !name.trim()) return;
    setTableViews((prev) => prev.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)));
  }
  function removeTableView(id) {
    if (tableViews.length === 1) return;
    if (!window.confirm("Διαγραφή αυτού του tab πίνακα;")) return;
    setTableViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId(tableViews.find((v) => v.id !== id)?.id || tableViews[0].id);
  }
  function updateField(key, value) {
    updateProduct(selectedId, (p) => ({ ...p, [key]: value }));
  }
  function updateCost(key, value) {
    updateProduct(selectedId, (p) => ({ ...p, cost: { ...p.cost, [key]: value } }));
  }
  function updateStore(idx, field, value) {
    updateProduct(selectedId, (p) => {
      const stores = p.stores.map((s, i) => (i === idx ? { ...s, [field]: value === "" ? null : parseFloat(value) } : s));
      return { ...p, stores };
    });
  }
  function addStore() {
    const name = window.prompt("Όνομα καταστήματος:");
    if (!name || !name.trim()) return;
    updateProduct(selectedId, (p) => ({ ...p, stores: [...p.stores, { name: name.trim(), sellingPriceStore: null, sellingPriceQF: null }] }));
  }
  function removeStore(idx) {
    updateProduct(selectedId, (p) => ({ ...p, stores: p.stores.filter((_, i) => i !== idx) }));
  }
  function toggleActiveStore(name) {
    updateProduct(selectedId, (p) => {
      const active = p.activeStores.includes(name) ? p.activeStores.filter((n) => n !== name) : [...p.activeStores, name];
      return { ...p, activeStores: active };
    });
  }
  function addStoreOption() {
    const name = window.prompt("Όνομα καταστήματος:");
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    setStoreOptions((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    updateProduct(selectedId, (p) => (p.activeStores.includes(trimmed) ? p : { ...p, activeStores: [...p.activeStores, trimmed] }));
  }
  function removeStoreOption(name) {
    if (!window.confirm(`Αφαίρεση καταστήματος "${name}" από τη λίστα;`)) return;
    setStoreOptions((prev) => prev.filter((n) => n !== name));
    setProducts((prev) => prev.map((p) => ({ ...p, activeStores: p.activeStores.filter((n) => n !== name) })));
  }
  function handleImageUpload(key, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateProduct(selectedId, (p) => ({ ...p, [key]: [...(p[key] || []), reader.result] }));
    };
    reader.readAsDataURL(file);
  }
  function removeImage(key, idx) {
    updateProduct(selectedId, (p) => ({ ...p, [key]: p[key].filter((_, i) => i !== idx) }));
  }
  function downloadImage(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }
  function handleNewProduct() {
    const id = "p" + Date.now();
    setProducts((prev) => [...prev, makeEmptyProduct(id)]);
    setSelectedId(id);
    setBulkMode(false);
    setTab("info");
  }
  function handleDeleteProduct() {
    setProducts((prev) => {
      const next = prev.filter((p) => p.id !== selectedId);
      setSelectedId(next.length ? next[0].id : null);
      return next;
    });
  }

  function updateBulkRow(idx, field, value) {
    setBulkRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }
  function addBulkRow() {
    setBulkRows((prev) => [...prev, makeEmptyBulkRow()]);
  }
  function removeBulkRow(idx) {
    setBulkRows((prev) => prev.filter((_, i) => i !== idx));
  }
  function saveBulkRows() {
    const validRows = bulkRows.filter((r) => r.descriptionGr.trim());
    if (!validRows.length) return;
    const created = validRows.map((row, i) => {
      const pair = CATEGORIES.find((c) => c.gr === row.categoryGr);
      const base = makeEmptyProduct("p" + Date.now() + "-" + i);
      return {
        ...base,
        categoryGr: row.categoryGr,
        categoryEn: pair ? pair.en : "",
        itemCode: row.itemCode,
        barcode: row.barcode,
        descriptionGr: row.descriptionGr,
        descriptionEn: row.descriptionEn,
        cost: {
          sellingPrice: parseFloat(row.sellingPrice) || 0,
          ptk: parseFloat(row.ptk) || 0,
          quantity: parseFloat(row.quantity) || 0,
          vatPercent: 13
        }
      };
    });
    setProducts((prev) => [...prev, ...created]);
    setBulkMode(false);
    setBulkRows([makeEmptyBulkRow(), makeEmptyBulkRow(), makeEmptyBulkRow()]);
    setSelectedId(created[created.length - 1].id);
  }

  function updateContactRecord(id, updater) {
    setContacts((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  }
  function updateContact(key, value) {
    updateContactRecord(selectedContactId, (c) => ({ ...c, [key]: value }));
  }
  function addPerson() {
    const name = personInput.trim();
    if (!name) return;
    updateContactRecord(selectedContactId, (c) => ({ ...c, people: [...(c.people || []), name] }));
    setPersonInput("");
  }
  function removePerson(idx) {
    updateContactRecord(selectedContactId, (c) => ({ ...c, people: c.people.filter((_, i) => i !== idx) }));
  }
  function handleNewContact() {
    const id = "c" + Date.now();
    setContacts((prev) => [...prev, makeEmptyContact(id)]);
    setSelectedContactId(id);
    setContactViewMode("card");
  }
  function handleDeleteContact() {
    setContacts((prev) => {
      const next = prev.filter((c) => c.id !== selectedContactId);
      setSelectedContactId(next.length ? next[0].id : null);
      return next;
    });
  }
  function toggleContactColumn(key) {
    setContactVisibleColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const cost = product ? product.cost : { sellingPrice: 0, ptk: 0, quantity: 0, vatPercent: 13 };
  const vat = cost.vatPercent || 0;
  const net = cost.sellingPrice ? cost.sellingPrice / (1 + vat / 100) : 0;
  const profit = net - (cost.ptk || 0);
  const fc = net > 0 ? ((cost.ptk || 0) / net) * 100 : NaN;
  const gross = net * (cost.quantity || 0);
  const profitSum = profit * (cost.quantity || 0);

  const storeColumnDefs = storeOptions.flatMap((name) => [
    { key: `store:${name}:price`, label: `${name} Τιμή Store` },
    { key: `store:${name}:fc`, label: `${name} F.C. Store` },
    { key: `store:${name}:priceQF`, label: `${name} Τιμή Q&F` },
    { key: `store:${name}:fcQF`, label: `${name} F.C. Q&F` }
  ]);
  const allColumnDefs = [...ALL_COLUMNS, ...storeColumnDefs];
  const visibleColumnDefs = allColumnDefs.filter((col) => visibleColumns.includes(col.key));
  const filteredProducts = products.filter((p) =>
    visibleColumnDefs.every((col) => {
      const f = (columnFilters[col.key] || "").trim().toLowerCase();
      if (!f) return true;
      return getFilterText(p, col.key).toLowerCase().includes(f);
    })
  );

  const contactVisibleColumnDefs = CONTACT_COLUMNS.filter((col) => contactVisibleColumns.includes(col.key));
  const filteredContacts = contacts.filter((c) =>
    contactVisibleColumnDefs.every((col) => {
      const f = (contactColumnFilters[col.key] || "").trim().toLowerCase();
      if (!f) return true;
      return getContactFilterText(c, col.key).toLowerCase().includes(f);
    })
  );

  return (
    <div className="flex h-screen w-full bg-white text-slate-800">
      <aside className="w-56 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center font-bold text-xs">QF</div>
          <div className="font-semibold text-sm">Quick &amp; Fresh</div>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          <button
            onClick={() => setView("products")}
            className={`text-left text-sm px-3 py-2 rounded-lg ${view === "products" ? "bg-teal-600" : "text-slate-300 hover:bg-white/10"}`}
          >
            Product List
          </button>
          <button
            onClick={() => setView("contacts")}
            className={`text-left text-sm px-3 py-2 rounded-lg ${view === "contacts" ? "bg-teal-600" : "text-slate-300 hover:bg-white/10"}`}
          >
            Αρχείο Επικοινωνίας
          </button>
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-50">
        {view === "products" && bulkMode && (
          <div className="p-5 space-y-3">
            <div className="text-center text-white font-semibold text-sm py-2 rounded-md bg-blue-900">Γρήγορη καταχώριση πολλών προϊόντων</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-separate" style={{ borderSpacing: "0 6px", minWidth: 800 }}>
                <thead>
                  <tr className="text-slate-500">
                    <th className="font-medium text-left">Κατηγορία GR</th>
                    <th className="font-medium text-left">Κωδικός</th>
                    <th className="font-medium text-left">Barcode</th>
                    <th className="font-medium text-left">Περιγραφή GR</th>
                    <th className="font-medium text-left">Περιγραφή EN</th>
                    <th className="font-medium text-left">Τιμή</th>
                    <th className="font-medium text-left">ΠΤΚ</th>
                    <th className="font-medium text-left">Ποσότ.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <select className={inputCls} value={row.categoryGr} onChange={(e) => updateBulkRow(i, "categoryGr", e.target.value)}>
                          <option value="">—</option>
                          {CATEGORIES.map((c) => <option key={c.gr} value={c.gr}>{c.gr}</option>)}
                        </select>
                      </td>
                      <td><input className={inputCls} value={row.itemCode} onChange={(e) => updateBulkRow(i, "itemCode", e.target.value)} /></td>
                      <td><input className={inputCls} value={row.barcode} onChange={(e) => updateBulkRow(i, "barcode", e.target.value)} /></td>
                      <td><input className={inputCls} value={row.descriptionGr} onChange={(e) => updateBulkRow(i, "descriptionGr", e.target.value)} /></td>
                      <td><input className={inputCls} value={row.descriptionEn} onChange={(e) => updateBulkRow(i, "descriptionEn", e.target.value)} /></td>
                      <td><input type="number" step="0.01" className={inputCls} value={row.sellingPrice} onChange={(e) => updateBulkRow(i, "sellingPrice", e.target.value)} /></td>
                      <td><input type="number" step="0.01" className={inputCls} value={row.ptk} onChange={(e) => updateBulkRow(i, "ptk", e.target.value)} /></td>
                      <td><input type="number" step="1" className={inputCls} value={row.quantity} onChange={(e) => updateBulkRow(i, "quantity", e.target.value)} /></td>
                      <td>
                        <button
                          onClick={() => removeBulkRow(i)}
                          disabled={bulkRows.length === 1}
                          className="text-red-600 text-xs px-2 py-1 disabled:opacity-30"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button onClick={addBulkRow} className="text-xs px-3 py-1.5 rounded-md bg-slate-200 text-slate-700">+ Γραμμή</button>
              <button onClick={saveBulkRows} className="text-xs px-3 py-1.5 rounded-md bg-teal-600 text-white font-medium">
                Αποθήκευση όλων ({bulkRows.filter((r) => r.descriptionGr.trim()).length})
              </button>
              <button onClick={() => setBulkMode(false)} className="text-xs px-3 py-1.5 rounded-md border border-slate-300 text-slate-600">Άκυρο</button>
            </div>
          </div>
        )}

        {view === "products" && !bulkMode && (
          <div className="flex items-center gap-2 bg-white border-b border-slate-200 px-4 sticky top-0 z-10 py-2">
            <button
              onClick={() => setViewMode("table")}
              className={`text-xs px-3 py-1.5 rounded-md ${viewMode === "table" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Πίνακας
            </button>
            <button
              onClick={() => setViewMode("card")}
              className={`text-xs px-3 py-1.5 rounded-md ${viewMode === "card" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Κάρτα
            </button>
            {viewMode === "table" && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowColPicker((v) => !v)}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-100 text-slate-600 flex items-center gap-1"
                >
                  Στήλες ({visibleColumns.length})
                </button>
                {showColPicker && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-2 max-h-72 overflow-y-auto">
                    {allColumnDefs.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(col.key)}
                          onChange={() => toggleColumn(col.key)}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {view === "products" && !bulkMode && viewMode === "table" && (
          <div className="flex items-center gap-1 bg-white border-b border-slate-200 px-4">
            {tableViews.map((v) => (
              <div key={v.id} className="group relative flex items-center">
                <button
                  onClick={() => setActiveViewId(v.id)}
                  onDoubleClick={() => renameTableView(v.id)}
                  className={`px-3 py-2 text-xs ${activeViewId === v.id ? "text-slate-900 font-semibold border-b-2 border-teal-600" : "text-slate-500"}`}
                  title="Διπλό κλικ για μετονομασία"
                >
                  {v.name}
                </button>
                {tableViews.length > 1 && (
                  <span
                    onClick={() => removeTableView(v.id)}
                    className="hidden group-hover:inline text-slate-400 hover:text-red-600 text-xs cursor-pointer pr-1"
                  >
                    ✕
                  </span>
                )}
              </div>
            ))}
            <button onClick={addTableView} className="px-2 py-2 text-sm text-slate-400 hover:text-teal-600" title="Νέο tab πίνακα">
              +
            </button>
          </div>
        )}

        {view === "products" && !bulkMode && viewMode === "table" && (
          <div className="p-4">
            <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-slate-500">
                    <th className="text-left font-medium px-3 py-2">#</th>
                    {visibleColumnDefs.map((col) => (
                      <th key={col.key} className="text-left font-medium px-3 py-2">{col.label}</th>
                    ))}
                  </tr>
                  <tr className="border-t border-slate-200">
                    <th className="px-3 py-1.5"></th>
                    {visibleColumnDefs.map((col) => (
                      <th key={col.key} className="px-2 py-1.5">
                        <input
                          value={columnFilters[col.key] || ""}
                          onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                          placeholder="Φίλτρο..."
                          className="w-full text-xs font-normal px-2 py-1 rounded border border-slate-200 bg-white"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p, i) => (
                    <tr
                      key={p.id}
                      onClick={() => { setSelectedId(p.id); setViewMode("card"); setTab("info"); }}
                      className="border-b border-slate-100 hover:bg-teal-50 cursor-pointer"
                    >
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      {visibleColumnDefs.map((col) => {
                        const value = getColumnValue(p, col.key);
                        if (col.key === "status") {
                          return (
                            <td key={col.key} className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${value === "ΕΝΤΟΣ" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                                {value}
                              </span>
                            </td>
                          );
                        }
                        if (col.key === "images365") {
                          return (
                            <td key={col.key} className="px-3 py-2">
                              {value && value[0] ? (
                                <img src={value[0]} alt="" className="w-8 h-8 object-cover rounded" />
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        }
                        if (col.key === "sellingPrice" || col.key === "ptk") {
                          return <td key={col.key} className="px-3 py-2">{value ? fmtEuro(value) : "—"}</td>;
                        }
                        if (col.key === "fc") {
                          return <td key={col.key} className="px-3 py-2">{isFinite(value) ? fmtPct(value) : "—"}</td>;
                        }
                        const storeCol = parseStoreColKey(col.key);
                        if (storeCol) {
                          if (storeCol.field === "price" || storeCol.field === "priceQF") {
                            return <td key={col.key} className="px-3 py-2">{value ? fmtEuro(value) : "—"}</td>;
                          }
                          return <td key={col.key} className="px-3 py-2">{isFinite(value) ? fmtPct(value) : "—"}</td>;
                        }
                        return <td key={col.key} className="px-3 py-2">{value || "—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-400"># {filteredProducts.length}{filteredProducts.length !== products.length ? ` / ${products.length}` : ""}</p>
              <button onClick={handleNewProduct} className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white">+ Νέο</button>
            </div>
          </div>
        )}

        {view === "products" && !bulkMode && viewMode === "card" && !product && (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">Επίλεξε ή δημιούργησε ένα προϊόν</div>
        )}

        {view === "products" && !bulkMode && viewMode === "card" && product && (
          <div>
            <div className="flex items-center gap-2 bg-white border-b border-slate-200 px-4 sticky top-0 z-10">
              {["info", "cost"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm ${tab === t ? "text-slate-900 font-semibold border-b-2 border-teal-600" : "text-slate-500"}`}
                >
                  {t === "info" ? "Product List" : "Cost"}
                </button>
              ))}
              <button onClick={handleDeleteProduct} className="ml-auto text-xs text-red-600 px-3 py-1.5">Διαγραφή</button>
            </div>

            {tab === "info" && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Κατηγορία GR">
                    <select
                      className={inputCls}
                      value={product.categoryGr}
                      onChange={(e) => {
                        const val = e.target.value;
                        const pair = CATEGORIES.find((c) => c.gr === val);
                        updateField("categoryGr", val);
                        if (pair) updateField("categoryEn", pair.en);
                      }}
                    >
                      <option value="">—</option>
                      {CATEGORIES.map((c) => <option key={c.gr} value={c.gr}>{c.gr}</option>)}
                    </select>
                  </Field>
                  <Field label="Κατηγορία EN">
                    <select
                      className={inputCls}
                      value={product.categoryEn}
                      onChange={(e) => {
                        const val = e.target.value;
                        const pair = CATEGORIES.find((c) => c.en === val);
                        updateField("categoryEn", val);
                        if (pair) updateField("categoryGr", pair.gr);
                      }}
                    >
                      <option value="">—</option>
                      {CATEGORIES.map((c) => <option key={c.en} value={c.en}>{c.en}</option>)}
                    </select>
                  </Field>
                  <Field label="Κωδικός είδους">
                    <input className={inputCls} value={product.itemCode} onChange={(e) => updateField("itemCode", e.target.value)} />
                  </Field>
                  <Field label="Barcode">
                    <input className={inputCls} value={product.barcode} onChange={(e) => updateField("barcode", e.target.value)} />
                  </Field>
                  <Field label="Περιγραφή είδους ERP">
                    <input className={inputCls} value={product.descriptionErp} onChange={(e) => updateField("descriptionErp", e.target.value)} />
                  </Field>
                  <Field label="ΤΕΜ στο μηχάνημα">
                    <input type="number" className={inputCls} value={product.unitsPerMachine ?? ""} onChange={(e) => updateField("unitsPerMachine", e.target.value ? +e.target.value : null)} />
                  </Field>
                  <Field label="Περιγραφή είδους GR">
                    <input className={inputCls} value={product.descriptionGr} onChange={(e) => updateField("descriptionGr", e.target.value)} />
                  </Field>
                  <Field label="Περιγραφή είδους EN">
                    <input className={inputCls} value={product.descriptionEn} onChange={(e) => updateField("descriptionEn", e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Αναλυτική Περιγραφή είδους GR">
                    <textarea rows={3} className={inputCls} value={product.detailedDescriptionGr} onChange={(e) => updateField("detailedDescriptionGr", e.target.value)} />
                  </Field>
                  <Field label="Αναλυτική Περιγραφή είδους EN">
                    <textarea rows={3} className={inputCls} value={product.detailedDescriptionEn} onChange={(e) => updateField("detailedDescriptionEn", e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Status">
                    <select className={inputCls} value={product.status} onChange={(e) => updateField("status", e.target.value)}>
                      <option>ΕΝΤΟΣ</option>
                      <option>ΕΚΤΟΣ</option>
                    </select>
                  </Field>
                  <Field label="Ενεργό Στο Μηχάνημα">
                    <select className={inputCls} value={product.activeOnMachine} onChange={(e) => updateField("activeOnMachine", e.target.value)}>
                      <option value="YES">YES</option>
                      <option value="NO">NO</option>
                    </select>
                  </Field>
                </div>
                <Field label="Ενεργό Σε Κατάστημα">
                  <div className="flex flex-wrap gap-2">
                    {storeOptions.map((name) => {
                      const on = product.activeStores.includes(name);
                      return (
                        <div key={name} className="group relative inline-flex items-center">
                          <button
                            onClick={() => toggleActiveStore(name)}
                            className={`text-xs pl-3 pr-5 py-1.5 rounded-full ${on ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500"}`}
                          >
                            {name}
                          </button>
                          <span
                            onClick={() => removeStoreOption(name)}
                            className={`hidden group-hover:flex absolute right-1 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${on ? "text-slate-300 hover:text-red-400" : "text-slate-400 hover:text-red-600"}`}
                          >
                            ✕
                          </span>
                        </div>
                      );
                    })}
                    <button
                      onClick={addStoreOption}
                      className="text-xs px-3 py-1.5 rounded-full border border-dashed border-slate-300 text-slate-400 hover:text-teal-600 hover:border-teal-600"
                    >
                      + Κατάστημα
                    </button>
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Image - 365">
                    <div className="border border-dashed border-slate-300 rounded-lg p-3 bg-white">
                      <input type="file" accept="image/*" className="text-xs mb-2" onChange={(e) => handleImageUpload("images365", e.target.files[0])} />
                      <div className="flex flex-wrap gap-2">
                        {product.images365.map((url, i) => (
                          <div key={i} className="relative group">
                            <img src={url} alt="" className="w-16 h-16 object-cover rounded-md border border-slate-200" />
                            <div className="absolute inset-0 hidden group-hover:flex items-center justify-center gap-1 bg-black/40 rounded-md">
                              <button type="button" onClick={() => downloadImage(url, `images365-${i}.png`)} className="text-white text-xs bg-slate-900/70 rounded px-1.5 py-0.5">⬇</button>
                              <button type="button" onClick={() => removeImage("images365", i)} className="text-white text-xs bg-slate-900/70 rounded px-1.5 py-0.5">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Field>
                  <Field label="Image - Promo">
                    <div className="border border-dashed border-slate-300 rounded-lg p-3 bg-white">
                      <input type="file" accept="image/*" className="text-xs mb-2" onChange={(e) => handleImageUpload("imagesPromo", e.target.files[0])} />
                      <div className="flex flex-wrap gap-2">
                        {product.imagesPromo.map((url, i) => (
                          <div key={i} className="relative group">
                            <img src={url} alt="" className="w-16 h-16 object-cover rounded-md border border-slate-200" />
                            <div className="absolute inset-0 hidden group-hover:flex items-center justify-center gap-1 bg-black/40 rounded-md">
                              <button type="button" onClick={() => downloadImage(url, `imagesPromo-${i}.png`)} className="text-white text-xs bg-slate-900/70 rounded px-1.5 py-0.5">⬇</button>
                              <button type="button" onClick={() => removeImage("imagesPromo", i)} className="text-white text-xs bg-slate-900/70 rounded px-1.5 py-0.5">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Field>
                </div>
              </div>
            )}

            {tab === "cost" && (
              <div className="p-5 space-y-4">
                <div className="text-center text-white font-semibold text-sm py-2 rounded-md bg-teal-700">General Cost</div>
                <div className="grid grid-cols-4 gap-3">
                  <Field label="Τιμή Πώλησης">
                    <input type="number" step="0.01" className={`${inputCls} text-center font-semibold`} value={cost.sellingPrice} onChange={(e) => updateCost("sellingPrice", parseFloat(e.target.value) || 0)} />
                  </Field>
                  <Field label="ΦΠΑ %">
                    <input type="number" step="1" className={`${inputCls} text-center font-semibold`} value={cost.vatPercent} onChange={(e) => updateCost("vatPercent", parseFloat(e.target.value) || 0)} />
                  </Field>
                  <Field label="ΠΤΚ (κόστος)">
                    <input type="number" step="0.01" className={`${inputCls} text-center font-semibold`} value={cost.ptk} onChange={(e) => updateCost("ptk", parseFloat(e.target.value) || 0)} />
                  </Field>
                  <div className="rounded-md bg-teal-700 text-white text-center py-2 flex flex-col justify-center">
                    <p className="text-xs text-teal-100">F.C.</p>
                    <p className="font-semibold">{fmtPct(fc)}</p>
                  </div>
                </div>

                <div className="text-center text-white font-semibold text-sm py-2 rounded-md bg-blue-900">Stores</div>
                <table className="w-full text-sm border-separate" style={{ borderSpacing: "0 6px" }}>
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="font-medium text-left px-3">Κατάστημα</th>
                      <th className="font-medium">Τιμή Store</th>
                      <th className="font-medium">F.C. Store</th>
                      <th className="font-medium">Τιμή Q&amp;F</th>
                      <th className="font-medium">F.C. Q&amp;F</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.stores.map((s, i) => {
                      const netStore = s.sellingPriceStore ? s.sellingPriceStore / (1 + vat / 100) : null;
                      const netQF = s.sellingPriceQF ? s.sellingPriceQF / (1 + vat / 100) : null;
                      const fcStore = netStore ? ((cost.ptk || 0) / netStore) * 100 : NaN;
                      const fcQF = netQF ? ((cost.ptk || 0) / netQF) * 100 : NaN;
                      return (
                        <tr key={i}>
                          <td className="bg-blue-900 text-white text-xs font-semibold px-3 py-2 rounded-md whitespace-nowrap">{s.name}</td>
                          <td className="px-2">
                            <input type="number" step="0.01" className={`${inputCls} text-center`} value={s.sellingPriceStore ?? ""} onChange={(e) => updateStore(i, "sellingPriceStore", e.target.value)} />
                          </td>
                          <td className="text-center font-semibold">{fmtPct(fcStore)}</td>
                          <td className="px-2">
                            <input type="number" step="0.01" className={`${inputCls} text-center`} value={s.sellingPriceQF ?? ""} onChange={(e) => updateStore(i, "sellingPriceQF", e.target.value)} />
                          </td>
                          <td className="text-center font-semibold">{fmtPct(fcQF)}</td>
                          <td className="px-2">
                            <button onClick={() => removeStore(i)} className="text-xs text-red-600 px-2 py-1">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button onClick={addStore} className="text-xs px-3 py-1.5 rounded-md bg-slate-200 text-slate-700">+ Κατάστημα</button>
              </div>
            )}
          </div>
        )}

        {view === "contacts" && (
          <div className="flex items-center gap-2 bg-white border-b border-slate-200 px-4 sticky top-0 z-10 py-2">
            <button
              onClick={() => setContactViewMode("table")}
              className={`text-xs px-3 py-1.5 rounded-md ${contactViewMode === "table" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Πίνακας
            </button>
            <button
              onClick={() => setContactViewMode("card")}
              className={`text-xs px-3 py-1.5 rounded-md ${contactViewMode === "card" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Κάρτα
            </button>
            {contactViewMode === "table" && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowContactColPicker((v) => !v)}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-100 text-slate-600 flex items-center gap-1"
                >
                  Στήλες ({contactVisibleColumns.length})
                </button>
                {showContactColPicker && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-2 max-h-72 overflow-y-auto">
                    {CONTACT_COLUMNS.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={contactVisibleColumns.includes(col.key)}
                          onChange={() => toggleContactColumn(col.key)}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {view === "contacts" && contactViewMode === "table" && (
          <div className="p-4">
            <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-slate-500">
                    <th className="text-left font-medium px-3 py-2">#</th>
                    {contactVisibleColumnDefs.map((col) => (
                      <th key={col.key} className="text-left font-medium px-3 py-2">{col.label}</th>
                    ))}
                  </tr>
                  <tr className="border-t border-slate-200">
                    <th className="px-3 py-1.5"></th>
                    {contactVisibleColumnDefs.map((col) => (
                      <th key={col.key} className="px-2 py-1.5">
                        <input
                          value={contactColumnFilters[col.key] || ""}
                          onChange={(e) => setContactColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                          placeholder="Φίλτρο..."
                          className="w-full text-xs font-normal px-2 py-1 rounded border border-slate-200 bg-white"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((c, i) => (
                    <tr
                      key={c.id}
                      onClick={() => { setSelectedContactId(c.id); setContactViewMode("card"); }}
                      className="border-b border-slate-100 hover:bg-teal-50 cursor-pointer"
                    >
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      {contactVisibleColumnDefs.map((col) => {
                        const value = getContactColumnValue(c, col.key);
                        if (col.key === "status") {
                          return (
                            <td key={col.key} className="px-3 py-2">
                              {value ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{value}</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        }
                        return <td key={col.key} className="px-3 py-2">{value || "—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-400">
                # {filteredContacts.length}{filteredContacts.length !== contacts.length ? ` / ${contacts.length}` : ""}
              </p>
              <button onClick={handleNewContact} className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white">+ Νέο</button>
            </div>
          </div>
        )}

        {view === "contacts" && contactViewMode === "card" && !contact && (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">Επίλεξε ή δημιούργησε μία επαφή</div>
        )}

        {view === "contacts" && contactViewMode === "card" && contact && (
          <div className="p-5 space-y-4">
            <div className="flex justify-end">
              <button onClick={handleDeleteContact} className="text-xs text-red-600 px-3 py-1.5">Διαγραφή</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Εταιρεία">
                <input className={inputCls} value={contact.company} onChange={(e) => updateContact("company", e.target.value)} />
              </Field>
              <Field label="Αρμόδιο Τμήμα">
                <input className={inputCls} value={contact.department} onChange={(e) => updateContact("department", e.target.value)} />
              </Field>
              <Field label="Phone">
                <input className={inputCls} value={contact.phone} onChange={(e) => updateContact("phone", e.target.value)} />
              </Field>
              <Field label="Email - Info">
                <input type="email" className={inputCls} value={contact.emailInfo} onChange={(e) => updateContact("emailInfo", e.target.value)} />
              </Field>
              <Field label="Status">
                <input className={inputCls} value={contact.status} onChange={(e) => updateContact("status", e.target.value)} />
              </Field>
              <Field label="Αυτόματος Πωλητής/Κυλικείο">
                <input className={inputCls} value={contact.autoSeller} onChange={(e) => updateContact("autoSeller", e.target.value)} />
              </Field>
              <Field label="Ενδιαφέρον">
                <input className={inputCls} value={contact.interest} onChange={(e) => updateContact("interest", e.target.value)} />
              </Field>
            </div>
            <Field label="Άτομα">
              <div className="flex flex-wrap gap-2 mb-2">
                {(contact.people || []).map((name, i) => (
                  <span key={i} className="text-xs bg-slate-900 text-white rounded-full px-3 py-1 flex items-center gap-2">
                    {name}
                    <span className="cursor-pointer opacity-70 hover:opacity-100" onClick={() => removePerson(i)}>
                      ✕
                    </span>
                  </span>
                ))}
              </div>
              <input
                className={inputCls}
                placeholder="Όνομα ατόμου + Enter"
                value={personInput}
                onChange={(e) => setPersonInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPerson();
                  }
                }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Υπεύθυνος">
                <input className={inputCls} value={contact.responsible} onChange={(e) => updateContact("responsible", e.target.value)} />
              </Field>
              <Field label="Email">
                <input type="email" className={inputCls} value={contact.email} onChange={(e) => updateContact("email", e.target.value)} />
              </Field>
              <Field label="Phone (Υπεύθυνος)">
                <input className={inputCls} value={contact.phone2} onChange={(e) => updateContact("phone2", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="1η Τηλεφωνική Επικοινωνία">
                <input type="date" className={inputCls} value={contact.firstCallDate || ""} onChange={(e) => updateContact("firstCallDate", e.target.value)} />
              </Field>
              <Field label="1η Αποστολή Mail">
                <input type="date" className={inputCls} value={contact.firstMailDate || ""} onChange={(e) => updateContact("firstMailDate", e.target.value)} />
              </Field>
              <Field label="1η Επίσκεψη">
                <input type="date" className={inputCls} value={contact.firstVisitDate || ""} onChange={(e) => updateContact("firstVisitDate", e.target.value)} />
              </Field>
              <Field label="2η Τηλεφωνική Επικοινωνία">
                <input type="date" className={inputCls} value={contact.secondCallDate || ""} onChange={(e) => updateContact("secondCallDate", e.target.value)} />
              </Field>
              <Field label="2η Αποστολή Mail">
                <input type="date" className={inputCls} value={contact.secondMailDate || ""} onChange={(e) => updateContact("secondMailDate", e.target.value)} />
              </Field>
              <Field label="2η Επίσκεψη">
                <input type="date" className={inputCls} value={contact.secondVisitDate || ""} onChange={(e) => updateContact("secondVisitDate", e.target.value)} />
              </Field>
            </div>
            <Field label="Παρατηρήσεις">
              <textarea rows={3} className={inputCls} value={contact.notes} onChange={(e) => updateContact("notes", e.target.value)} />
            </Field>
          </div>
        )}
      </main>
    </div>
  );
}
