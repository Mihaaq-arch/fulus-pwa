// ============================================================
// FULUS BACKEND v3
// Google Apps Script — paste ke Extensions > Apps Script
//
// PERUBAHAN DARI v2:
// - Daftar akun & kategori dibaca dari sheet, bukan hardcoded
// - doGet  → PWA bisa fetch accounts, categories, transactions
// - doPost → PWA bisa kirim transaksi baru
// - generateSummary & onEdit tetap ada, tidak berubah
//
// SETUP AWAL (sekali saja):
// 1. Jalankan setupSheets() → akan bikin sheet Accounts & Categories
// 2. Isi data di kedua sheet itu (contoh sudah disediakan)
// 3. Deploy sebagai Web App:
//    Deploy > New Deployment > Web App
//    Execute as: Me | Who has access: Anyone
//    Copy URL-nya → pasang di PWA sebagai GAS_URL
// ============================================================

// ============================================================
// KONSTANTA
// ============================================================
const SOURCE_SHEET   = "Transactions";
const SUMMARY_SHEET  = "📊 Monthly Summary";
const ACCOUNTS_SHEET = "Accounts";
const CATS_SHEET     = "Categories";

const COL = { ID:1, AMOUNT:2, DATE:3, REP:4, FROM:5, TO:6, OWNER:7, TYPE:8, CATEGORY:9, SYSTEM_SUM:10, NOTES:11 };

// Secret key untuk autentikasi PWA — ganti dengan string random panjang
// Generate di: https://randomkeygen.com (pakai "Fort Knox Passwords")
const SECRET_KEY = "GANTI_DENGAN_STRING_RANDOM_PANJANG_MINIMAL_32_KARAKTER";

const BRIDGE_ACCOUNTS = ["A-S Balance", "A-E Balance", "A-H Balance"];

// ============================================================
// SETUP — jalankan SEKALI untuk bikin sheet lookup
// ============================================================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Sheet: Accounts ---
  let accSheet = ss.getSheetByName(ACCOUNTS_SHEET);
  if (!accSheet) {
    accSheet = ss.insertSheet(ACCOUNTS_SHEET);
    accSheet.getRange(1, 1, 1, 3).setValues([["Name", "Owner", "Active"]]);
    accSheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#e8eaf6");

    const defaultAccounts = [
      ["Aksel",              "Personal",  true],
      ["BRI",                "Personal",  true],
      ["BSI",                "Personal",  true],
      ["Dana",               "Personal",  true],
      ["Flip",               "Personal",  true],
      ["Jago",               "Personal",  true],
      ["Shopee",             "Personal",  true],
      ["SPayLater",          "Personal",  true],
      ["Bibit",              "Investment",true],
      ["Google Play Credit", "Personal",  true],
      ["House Bank",         "House",     true],
      ["House Cash",         "House",     true],
      ["XL 330",             "House",     true],
      ["XL 541",             "House",     true],
      ["Servo Bank",         "Servo",     true],
      ["Servo Cash",         "Servo",     true],
      ["Servo Hutang",       "Servo",     true],
      ["Servo Pinjam",       "Servo",     true],
      ["ElFamilia",          "ElFamilia", true],
      ["A-S Balance",        "Unown",     true],
      ["A-E Balance",        "Unown",     true],
      ["A-H Balance",        "Unown",     true],
    ];
    accSheet.getRange(2, 1, defaultAccounts.length, 3).setValues(defaultAccounts);
    accSheet.setColumnWidth(1, 200);
    accSheet.setColumnWidth(2, 120);
  }

  // --- Sheet: Categories ---
  let catSheet = ss.getSheetByName(CATS_SHEET);
  if (!catSheet) {
    catSheet = ss.insertSheet(CATS_SHEET);
    catSheet.getRange(1, 1, 1, 3).setValues([["Name", "Type", "Active"]]);
    catSheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#e8eaf6");

    const defaultCats = [
      // Expense
      ["Food",       "Expense", true],
      ["Payment",    "Expense", true],
      ["Service",    "Expense", true],
      ["Transport",  "Expense", true],
      ["Shopping",   "Expense", true],
      ["Health",     "Expense", true],
      ["Education",  "Expense", true],
      ["Utility",    "Expense", true],
      ["Other",      "Expense", true],
      // Income
      ["Salary",     "Income",  true],
      ["Cashback",   "Income",  true],
      ["Loan",       "Income",  true],
      ["Reimburse",  "Income",  true],
      ["Other",      "Income",  true],
      // Neutral
      ["Adjust",     "Follow-Up", true],
      ["Transfer",   "Transfer",  true],
    ];
    catSheet.getRange(2, 1, defaultCats.length, 3).setValues(defaultCats);
    catSheet.setColumnWidth(1, 160);
    catSheet.setColumnWidth(2, 120);
  }

  Logger.log("✅ setupSheets selesai. Cek sheet Accounts dan Categories.");
}

// ============================================================
// LOOKUP HELPERS — baca dari sheet, bukan hardcoded
// ============================================================
function getAccounts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCOUNTS_SHEET);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues().slice(1);
  return rows
    .filter(r => r[2] === true || r[2] === "TRUE" || r[2] === "true")
    .map(r => ({ name: String(r[0]).trim(), owner: String(r[1]).trim() }));
}

function getCategories() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CATS_SHEET);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues().slice(1);
  return rows
    .filter(r => r[2] === true || r[2] === "TRUE" || r[2] === "true")
    .map(r => ({ name: String(r[0]).trim(), type: String(r[1]).trim() }));
}

// derive owner dari nama akun, pakai lookup sheet
function lookupOwner(accountName) {
  if (!accountName || accountName.trim() === "") return "Unown";
  const accounts = getAccounts();
  const found = accounts.find(a => a.name === accountName.trim());
  return found ? found.owner : "Unown";
}

// derive owner berdasarkan type transaksi:
// Income → owner dari To (uang masuk ke akun ini)
// Expense / Follow-Up → owner dari From (uang keluar dari akun ini)
// Transfer → owner dari From (yang menginisiasi)
function deriveOwner(data) {
  if (data.type === "Income") return lookupOwner(data.to);
  return lookupOwner(data.from);
}

// ============================================================
// doGet — PWA fetch data (accounts, categories, transaksi)
// URL: [GAS_URL]?action=accounts
//      [GAS_URL]?action=categories
//      [GAS_URL]?action=transactions&limit=20
// ============================================================
function doGet(e) {
  const action = e && e.parameter && e.parameter.action ? e.parameter.action : "ping";
  let result;

  // Auth check — skip untuk ping
  if (action !== "ping") {
    const key = e && e.parameter && e.parameter.key ? e.parameter.key : "";
    if (key !== SECRET_KEY) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "Unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  try {
    if (action === "accounts") {
      result = { ok: true, data: getAccounts() };

    } else if (action === "categories") {
      result = { ok: true, data: getCategories() };

    } else if (action === "transactions") {
      const limit = parseInt((e.parameter && e.parameter.limit) || "50");
      result = { ok: true, data: getRecentTransactions(limit) };

    } else if (action === "config") {
      // Ambil semua yang dibutuhkan PWA sekaligus — satu request saat startup
      result = {
        ok: true,
        data: {
          accounts:   getAccounts(),
          categories: getCategories(),
          repOptions: ["One Time", "Monthly", "Quarterly", "Yearly", "Weekly"],
        }
      };

    } else {
      result = { ok: true, message: "Fulus GAS v3 is alive" };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// doPost — PWA kirim transaksi baru
// Body JSON: { from, to, type, category, amount, rep, notes, date? }
// ============================================================
function doPost(e) {
  let result;
  try {
    const body = JSON.parse(e.postData.contents);

    // Auth check
    if (!body.key || body.key !== SECRET_KEY) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "Unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const id   = insertTransaction(body);
    result = { ok: true, id };
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// INSERT TRANSACTION
// ============================================================
function insertTransaction(data) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SOURCE_SHEET);
  if (!sheet) throw new Error(`Sheet "${SOURCE_SHEET}" tidak ditemukan`);

  // Validasi per type
  if (!data.type)     throw new Error("type wajib diisi");
  if (!data.category) throw new Error("category wajib diisi");
  if (!data.amount)   throw new Error("amount wajib diisi");
  if (data.type === "Income"   && !data.to)                 throw new Error("to wajib diisi untuk Income");
  if (data.type === "Expense"  && !data.from)               throw new Error("from wajib diisi untuk Expense");
  if (data.type === "Transfer" && (!data.from || !data.to)) throw new Error("from dan to wajib diisi untuk Transfer");

  // Generate ID
  const now = new Date();
  const id  = generateId(now);

  // Derive owner sesuai type:
  // Income  → owner dari To  (uang masuk ke akun ini)
  // lainnya → owner dari From (uang keluar dari akun ini)
  const owner = deriveOwner(data);

  // System sum: Income = +, Expense = -, lainnya 0
  const amount    = Math.abs(parseInt(data.amount) || 0);
  const systemSum = data.type === "Income" ? amount : data.type === "Expense" ? -amount : 0;

  // Format tanggal
  const txDate = data.date ? new Date(data.date) : now;

  const row = [
    id,
    amount,
    txDate,
    data.rep      || "One Time",
    data.from,
    data.to       || "",
    owner,
    data.type,
    data.category,
    systemSum,
    data.notes    || "",
  ];

  sheet.appendRow(row);

  // Format kolom amount & system sum sebagai angka
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, COL.AMOUNT).setNumberFormat("#,##0");
  sheet.getRange(lastRow, COL.SYSTEM_SUM).setNumberFormat("#,##0");
  sheet.getRange(lastRow, COL.DATE).setNumberFormat("dddd, dd MMMM yyyy");

  return id;
}

// ============================================================
// GET RECENT TRANSACTIONS
// ============================================================
function getRecentTransactions(limit) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SOURCE_SHEET);
  if (!sheet) return [];
  const raw  = sheet.getDataRange().getValues();
  const rows = raw.slice(1).filter(r => String(r[0]).trim() !== "");
  return rows.slice(-limit).reverse().map(r => ({
    id:       String(r[COL.ID-1]),
    amount:   parseInt(String(r[COL.AMOUNT-1]).replace(/[^0-9]/g, "")) || 0,
    date:     r[COL.DATE-1] instanceof Date ? r[COL.DATE-1].toISOString() : String(r[COL.DATE-1]),
    rep:      String(r[COL.REP-1]     || ""),
    from:     String(r[COL.FROM-1]    || ""),
    to:       String(r[COL.TO-1]      || ""),
    owner:    String(r[COL.OWNER-1]   || ""),
    type:     String(r[COL.TYPE-1]    || ""),
    category: String(r[COL.CATEGORY-1]|| ""),
    notes:    String(r[COL.NOTES-1]   || ""),
  }));
}

// ============================================================
// HELPERS
// ============================================================
function generateId(date) {
  const d = date || new Date();
  const YY = String(d.getFullYear()).slice(2);
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${YY}${MM}${DD}-${HH}${mm}${ss}`;
}

// ============================================================
// onEdit — auto-generate ID (tidak berubah dari v2)
// ============================================================
function onEdit(e) {
  const SHEET_NAME = "Transactions";
  const COL_DATE   = 3;
  const COL_ID     = 1;

  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (e.range.getColumn() !== COL_DATE) return;

  const row = e.range.getRow();
  if (row <= 1) return;

  const idCell = sheet.getRange(row, COL_ID);
  if (idCell.getValue() !== "") return;

  idCell.setValue(generateId());
}

// ============================================================
// generateSummary — tidak berubah dari v2, masih bisa dipakai
// (kode summary lengkap tetap di bawah ini)
// ============================================================
function idr(n) {
  if (isNaN(n) || n === null) return "Rp0";
  const abs = Math.abs(Math.round(n));
  const formatted = abs.toLocaleString("id-ID");
  return (n < 0 ? "-Rp" : "Rp") + formatted;
}

function generateSummary() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(SOURCE_SHEET);
  if (!src) {
    Logger.log(`Sheet "${SOURCE_SHEET}" tidak ditemukan.`); return;
    return;
  }

  const raw  = src.getDataRange().getValues();
  const rows = raw.slice(1).filter(r => String(r[COL.ID-1]).trim() !== "");
  const txs  = parseRows(rows);

  let out = ss.getSheetByName(SUMMARY_SHEET);
  if (out) out.clear(); else out = ss.insertSheet(SUMMARY_SHEET);

  const writer = new SheetWriter(out);
  writeFull(writer, txs);

  out.setColumnWidth(1, 240);
  out.setColumnWidth(2, 160);
  out.setColumnWidth(3, 160);
  out.setColumnWidth(4, 160);
  out.setColumnWidth(5, 180);
  out.setColumnWidth(6, 120);
  out.setFrozenRows(2);

  Logger.log("✅ Summary berhasil digenerate!");
}

function parseRows(rows) {
  return rows.map(row => {
    const amountRaw = String(row[COL.AMOUNT-1]).replace(/[^0-9]/g, "");
    const amount    = parseInt(amountRaw) || 0;
    const dateRaw   = row[COL.DATE-1];
    const date      = dateRaw instanceof Date ? dateRaw : new Date(dateRaw);
    const month     = isNaN(date) ? "unknown" : `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
    const quarter   = isNaN(date) ? "unknown" : `Q${Math.ceil((date.getMonth()+1)/3)} ${date.getFullYear()}`;
    return {
      id:       String(row[COL.ID-1]).trim(),
      amount, date, month, quarter,
      rep:      String(row[COL.REP-1]     || "").trim(),
      from:     String(row[COL.FROM-1]    || "").trim(),
      to:       String(row[COL.TO-1]      || "").trim(),
      owner:    String(row[COL.OWNER-1]   || "").trim(),
      type:     String(row[COL.TYPE-1]    || "").trim(),
      category: String(row[COL.CATEGORY-1]|| "").trim(),
    };
  }).filter(t => !isNaN(t.date));
}

function getOwnerStats(txs, owner) {
  const relevant = txs.filter(t => t.owner === owner && t.type !== "Follow-Up" && t.type !== "Transfer");
  const income   = relevant.filter(t => t.type === "Income").reduce((s,t) => s+t.amount, 0);
  const expense  = relevant.filter(t => t.type === "Expense").reduce((s,t) => s+t.amount, 0);

  const byMonth = {};
  for (const t of relevant) {
    if (!byMonth[t.month]) byMonth[t.month] = { income:0, expense:0, categories:{} };
    if (t.type === "Income") byMonth[t.month].income += t.amount;
    if (t.type === "Expense") {
      byMonth[t.month].expense += t.amount;
      byMonth[t.month].categories[t.category] = (byMonth[t.month].categories[t.category]||0) + t.amount;
    }
  }

  const byQuarter = {};
  for (const t of relevant) {
    if (!byQuarter[t.quarter]) byQuarter[t.quarter] = { income:0, expense:0 };
    if (t.type === "Income") byQuarter[t.quarter].income += t.amount;
    if (t.type === "Expense") byQuarter[t.quarter].expense += t.amount;
  }

  const cats = {};
  for (const t of relevant.filter(t => t.type === "Expense")) {
    cats[t.category] = (cats[t.category]||0) + t.amount;
  }

  const expenseTxs = relevant.filter(t => t.type === "Expense");
  const impulsive  = expenseTxs.filter(t => t.rep === "One Time").reduce((s,t) => s+t.amount, 0);
  const routine    = expenseTxs.filter(t => t.rep !== "One Time").reduce((s,t) => s+t.amount, 0);

  const seen = {};
  let annualRecurring = 0;
  const MULT = { Monthly:12, Quarterly:4, Weekly:52, Yearly:1, "One Time":0 };
  for (const t of expenseTxs.filter(t => t.rep !== "One Time")) {
    const key = t.category+"_"+t.rep;
    if (!seen[key]) { seen[key]=true; annualRecurring += t.amount*(MULT[t.rep]||1); }
  }
  const months  = Object.keys(byMonth).filter(m=>m!=="unknown");
  const nMonths = months.length || 1;
  const oneTimeAvg       = Math.round(impulsive / nMonths);
  const estimatedMonthly = Math.round(annualRecurring/12) + oneTimeAvg;

  return { income, expense, net: income-expense, byMonth, byQuarter, cats, impulsive, routine, estimatedMonthly, oneTimeAvg, months };
}

function getBridgeBalance(txs, bridgeAccount) {
  let net = 0;
  for (const t of txs) {
    if (t.from === bridgeAccount) net -= t.amount;
    if (t.to   === bridgeAccount) net += t.amount;
  }
  return net;
}

function getAnomalies(txs) {
  const issues = [];
  const followUps  = txs.filter(t => t.type === "Follow-Up");
  const nonFollows = txs.filter(t => t.type !== "Follow-Up");
  for (const fu of followUps) {
    const partner = nonFollows.find(t =>
      t.amount === fu.amount && t.date.toDateString() === fu.date.toDateString() && t.id !== fu.id
    );
    if (!partner) {
      issues.push({ level:"⚠️", msg:`Follow-Up tanpa pasangan: ${fu.id} | ${fu.category} | ${idr(fu.amount)}` });
    }
  }
  const bridgeAccounts = BRIDGE_ACCOUNTS;
  for (const bridge of bridgeAccounts) {
    const bal = getBridgeBalance(txs, bridge);
    if (Math.abs(bal) > 0) {
      issues.push({ level:"🔵", msg:`${bridge} net ${idr(bal)} — ada selisih yang belum settled` });
    }
  }
  const seen = {};
  for (const t of txs) {
    const key = `${t.amount}_${t.date.toDateString()}_${t.category}_${t.owner}_${t.type}`;
    if (seen[key]) {
      issues.push({ level:"❓", msg:`Kemungkinan duplikat: ${t.id} & ${seen[key]} | ${t.category} | ${idr(t.amount)}` });
    } else {
      seen[key] = t.id;
    }
  }
  return issues;
}

class SheetWriter {
  constructor(sheet) { this.sheet = sheet; this.row = 1; }

  write(cells, { bold=false, bg=null, fontSize=10, color=null }={}) {
    const r = this.sheet.getRange(this.row, 1, 1, cells.length);
    r.setValues([cells]);
    r.setFontSize(fontSize);
    if (bold)  r.setFontWeight("bold");
    if (bg)    r.setBackground(bg);
    if (color) r.setFontColor(color);
    this.row++;
    return this;
  }

  header(text, bg="#1a237e") {
    const r = this.sheet.getRange(this.row, 1, 1, 6);
    r.merge(); r.setValue(text);
    r.setFontWeight("bold"); r.setFontSize(13);
    r.setFontColor("#ffffff"); r.setBackground(bg);
    this.row++; return this;
  }

  section(text) {
    const r = this.sheet.getRange(this.row, 1, 1, 6);
    r.merge(); r.setValue(text);
    r.setFontWeight("bold"); r.setFontSize(11);
    r.setBackground("#e8eaf6"); r.setFontColor("#1a237e");
    this.row++; return this;
  }

  note(text, bg=null) {
    const r = this.sheet.getRange(this.row, 1, 1, 6);
    r.merge(); r.setValue(text); r.setFontSize(10); r.setFontColor("#444444");
    if (bg) r.setBackground(bg);
    this.row++; return this;
  }

  blank(n=1) { this.row += n; return this; }

  divider() {
    const r = this.sheet.getRange(this.row, 1, 1, 6);
    r.merge(); r.setValue("─".repeat(70));
    r.setFontColor("#cccccc"); r.setFontSize(9);
    this.row++; return this;
  }
}

function writeFull(w, txs) {
  const now    = new Date();
  // Owner dibaca dinamis dari sheet Accounts — tidak hardcoded
  const allAccounts = getAccounts();
  const owners = [...new Set(allAccounts.map(a => a.owner))].filter(o => o !== "Unown");

  const OWNER_COLOR = {
    Personal:"#1565c0", Servo:"#2e7d32", House:"#6a1b9a",
    ElFamilia:"#b71c1c", Investment:"#e65100",
  };
  const OWNER_BG = {
    Personal:"#e3f2fd", Servo:"#e8f5e9", House:"#f3e5f5",
    ElFamilia:"#ffebee", Investment:"#fff3e0",
  };

  w.header("💰  FULUS — FINANCIAL SUMMARY", "#1a237e");
  w.write(["Generated:", now.toLocaleString("id-ID"),"","","",""], { bg:"#e3f2fd", fontSize:9 });
  w.blank();

  for (const owner of owners) {
    const s       = getOwnerStats(txs, owner);
    const months  = s.months.sort();
    const quarters= Object.keys(s.byQuarter).sort();
    const col     = OWNER_COLOR[owner] || "#37474f";
    const bg      = OWNER_BG[owner]   || "#eceff1";

    w.header(`👤  ${owner.toUpperCase()}`, col);
    w.write(["TOTAL INCOME","TOTAL EXPENSE","NET","EST. BIAYA/BULAN","",""], { bold:true, bg:"#f5f5f5" });
    w.write([idr(s.income), idr(s.expense), idr(s.net), idr(s.estimatedMonthly),"",""],
      { bg: s.net >= 0 ? "#e8f5e9" : "#ffebee", bold:true });
    w.blank();

    if (months.length > 0) {
      w.write(["Bulan","Income","Expense","Net","Impulsif","Rutin"], { bold:true, bg:"#eceff1" });
      for (const m of months) {
        const md  = s.byMonth[m];
        const net = md.income - md.expense;
        const imp = txs.filter(t=>t.owner===owner&&t.type==="Expense"&&t.rep==="One Time"&&t.month===m).reduce((s,t)=>s+t.amount,0);
        const rut = txs.filter(t=>t.owner===owner&&t.type==="Expense"&&t.rep!=="One Time"&&t.month===m).reduce((s,t)=>s+t.amount,0);
        w.write([m, idr(md.income), idr(md.expense), idr(net), idr(imp), idr(rut)], { bg: net>=0?null:"#fff3e0" });
      }
      w.blank();
    }

    if (quarters.length > 0) {
      w.write(["Kuartal","Income","Expense","Net","Rata-rata/Bulan",""], { bold:true, bg:"#eceff1" });
      for (const q of quarters) {
        const qd  = s.byQuarter[q];
        const net = qd.income - qd.expense;
        w.write([q, idr(qd.income), idr(qd.expense), idr(net), idr(Math.round(qd.expense/3)),""],
          { bg: net>=0?null:"#fff3e0" });
      }
      w.blank();
    }

    const sortedCats = Object.entries(s.cats).sort((a,b)=>b[1]-a[1]);
    if (sortedCats.length > 0) {
      const totalExp = sortedCats.reduce((s,[,v])=>s+v,0);
      w.write(["Kategori","Total","% dari expense","","",""], { bold:true, bg:"#eceff1" });
      for (const [cat, total] of sortedCats) {
        w.write([cat, idr(total), totalExp>0?((total/totalExp)*100).toFixed(1)+"%":"0%","","",""]);
      }
      w.blank();
    }

    const totalExp = s.impulsive + s.routine;
    if (totalExp > 0) {
      const impPct = ((s.impulsive/totalExp)*100).toFixed(1);
      const rutPct = ((s.routine/totalExp)*100).toFixed(1);
      const impMsg = parseFloat(impPct)>=60 ? "⚠️ TINGGI" : parseFloat(impPct)>=35 ? "🟡 MODERAT" : "✅ TERKONTROL";
      w.write([`Pola: ${impMsg}`,`Impulsif ${impPct}%`,`Rutin ${rutPct}%`,"","",""],
        { bg: parseFloat(impPct)>=60?"#fff3e0":"#f1f8e9" });
      w.blank();
    }

    w.divider().blank();
  }

  w.section("🔗  STATUS BRIDGE ACCOUNTS");
  w.write(["Bridge Account","Net Balance","Status","","",""], { bold:true, bg:"#eceff1" });
  for (const bridge of BRIDGE_ACCOUNTS) {
    const net = getBridgeBalance(txs, bridge);
    w.write([bridge, idr(net), Math.abs(net)<1000?"✅ Settled":`🔵 Selisih ${idr(Math.abs(net))}`,"","",""],
      { bg: Math.abs(net)<1000?"#e8f5e9":"#fff3e0" });
  }
  w.blank();

  const anomalies = getAnomalies(txs);
  w.section("🔍  DETEKSI ANOMALI");
  if (anomalies.length === 0) {
    w.note("✅ Tidak ada anomali terdeteksi.", "#e8f5e9");
  } else {
    w.note(`${anomalies.length} potensi anomali ditemukan:`, "#fff3e0");
    for (const a of anomalies) w.note(`${a.level}  ${a.msg}`, "#fff9c4");
  }
  w.blank();

  w.section("📅  ESTIMASI BIAYA BULANAN GABUNGAN");
  w.write(["Owner","Est. Biaya/Bulan","Est. Biaya/Tahun","","",""], { bold:true, bg:"#eceff1" });
  let grandTotal = 0;
  for (const owner of owners) {
    const s = getOwnerStats(txs, owner);
    if (s.estimatedMonthly > 0) {
      w.write([owner, idr(s.estimatedMonthly), idr(s.estimatedMonthly*12),"","",""]);
      grandTotal += s.estimatedMonthly;
    }
  }
  w.write(["TOTAL", idr(grandTotal), idr(grandTotal*12),"","",""], { bold:true, bg:"#c5cae9" });
  w.blank();
  w.note(`⏱️  Last updated: ${now.toLocaleString("id-ID")}`, "#e3f2fd");
}
