// ============================================================
// FULUS BACKEND v3
// Google Apps Script — paste ke Extensions > Apps Script
//
// CHANGES FROM v2:
// - Account & category lists read from sheets, not hardcoded
// - doGet → PWA can fetch accounts, categories, transactions
// - doPost → PWA can send new transactions
// - generateSummary & onEdit remain unchanged
//
// INITIAL SETUP (run once only):
// 1. Run setupSheets() → will create Accounts & Categories sheets
// 2. Fill in data in both sheets (examples are already provided)
// 3. Deploy as Web App:
//    Deploy > New Deployment > Web App
//    Execute as: Me | Who has access: Anyone
//    Copy the URL → paste in PWA as url
// ============================================================

// ============================================================
// CONSTANTS
// ============================================================
const SOURCE_SHEET = "Transactions";
const SUMMARY_SHEET = "📊 Monthly Summary";
const ACCOUNTS_SHEET = "Accounts";
const CATS_SHEET = "Categories";
const DOR_SHEET = "Debts / Reimbursements";

const COL = { ID: 1, AMOUNT: 2, DATE: 3, REP: 4, FROM: 5, TO: 6, OWNER: 7, TYPE: 8, CATEGORY: 9, SYSTEM_SUM: 10, NOTES: 11, LINK_ID: 12 };

// Secret key untuk autentikasi PWA — ganti dengan string random panjang
// Generate di: https://randomkeygen.com (pakai "Fort Knox Passwords")
const SECRET_KEY = "CHANGE_WITH_YOUR_KEY_MIN_32_CHARACTERS";

// ============================================================
// SETUP — RUN ONCE to create lookup sheets
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
      ["BRI", "Personal", true],
      ["BSI", "Personal", true],
      ["House Bank", "House", true],
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
      ["Food", "Expense", true],
      ["Payment", "Expense", true],
      ["Service", "Expense", true],
      ["Transport", "Expense", true],
      ["Shopping", "Expense", true],
      ["Health", "Expense", true],
      ["Education", "Expense", true],
      ["Utility", "Expense", true],
      ["Other", "Expense", true],
      // Income
      ["Salary", "Income", true],
      ["Cashback", "Income", true],
      ["Loan", "Income", true],
      ["Reimburse", "Income", true],
      ["Other", "Income", true],
      // Neutral
      ["Adjust", "Follow-Up", true],
      ["Transfer", "Transfer", true],
    ];
    catSheet.getRange(2, 1, defaultCats.length, 3).setValues(defaultCats);
    catSheet.setColumnWidth(1, 160);
    catSheet.setColumnWidth(2, 120);

    // --- Sheet: Transactions ---
    if (!ss.getSheetByName(SOURCE_SHEET)) {
      const txSheet = ss.insertSheet(SOURCE_SHEET);
      txSheet.getRange(1, 1, 1, 12).setValues([[
        "ID", "Amount", "Date", "Rep", "From", "To", "Owner", "Type", "Category", "System Sum", "Notes", "Link ID"
      ]]);
      txSheet.getRange(1, 1, 1, 12).setFontWeight("bold").setBackground("#e8eaf6");
    }

    // --- Sheet: Debts / Reimbursements ---
    if (!ss.getSheetByName(DOR_SHEET)) {
      const dorSheet = ss.insertSheet(DOR_SHEET);
      dorSheet.getRange(1, 1, 1, 5).setValues([[
        "ID", "Date", "Person", "Amount", "Context"
      ]]);
      dorSheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#e8eaf6");
    }
  }

  Logger.log("✅ setupSheets completed. Check Accounts and Categories sheets.");
}

// ============================================================
// LOOKUP HELPERS — read from sheets, not hardcoded
// ============================================================
// Helper: get active rows from a certain sheet
function getActiveRows(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  return sheet.getDataRange().getValues()
    .slice(1)
    .filter(r => r[2] == true || String(r[2]).toLowerCase() === "true");
  // using == true to capture boolean & string at the same time
}

function getAccounts() {
  return getActiveRows(ACCOUNTS_SHEET)
    .map(r => ({ name: String(r[0]).trim(), owner: String(r[1]).trim() }));
}

function getCategories() {
  return getActiveRows(CATS_SHEET)
    .map(r => ({ name: String(r[0]).trim(), type: String(r[1]).trim() }));
}

// Get bridge accounts (Unown entries in Accounts sheet)
function getBridgeAccounts() {
  return getActiveRows(ACCOUNTS_SHEET)
    .filter(r => String(r[1]).trim() === "Unown")
    .map(r => String(r[0]).trim());
}

// derive owner from account name, using sheet lookup
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
// URL: [url]?action=accounts
//      [url]?action=categories
//      [url]?action=transactions&limit=20
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
      result = {
        ok: true,
        data: {
          accounts: getAccounts(),
          categories: getCategories(),
          repOptions: ["One Time", "Monthly", "Quarterly", "Yearly", "Weekly"],
        }
      };

    } else if (action === "insert") {
      const dataRaw = e && e.parameter && e.parameter.data ? e.parameter.data : null;
      if (!dataRaw) throw new Error("data is required");
      const tx = JSON.parse(dataRaw);
      const id = insertTransaction(tx);
      result = { ok: true, id };

    } else if (action === "balances") {
      const src = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SOURCE_SHEET);
      if (!src) throw new Error("Sheet Transactions not found");
      const raw = src.getDataRange().getValues();
      const rows = raw.slice(1).filter(r => String(r[0]).trim() !== "");
      const txs = parseRows(rows);
      const allAccounts = getAccounts();

      // Hitung saldo per akun dari semua transaksi
      const balances = {};
      for (const acc of allAccounts) {
        balances[acc.name] = { owner: acc.owner, balance: 0 };
      }
      for (const tx of txs) {
        if (tx.from && balances[tx.from] !== undefined) balances[tx.from].balance -= tx.amount;
        if (tx.to && balances[tx.to] !== undefined) balances[tx.to].balance += tx.amount;
      }

      // Group per owner, exclude Unown
      const byOwner = {};
      for (const [name, { owner, balance }] of Object.entries(balances)) {
        if (owner === "Unown") continue;
        if (!byOwner[owner]) byOwner[owner] = { accounts: [], total: 0 };
        byOwner[owner].accounts.push({ name, balance });
        byOwner[owner].total += balance;
      }

      // Estimasi pengeluaran bulan depan per owner (pakai estimatedMonthly)
      const txsParsed = txs;
      const allAcc2 = getAccounts();
      const owners2 = [...new Set(allAcc2.map(a => a.owner))].filter(o => o !== "Unown");
      const estimates = {};
      for (const owner of owners2) {
        const s = getOwnerStats(txsParsed, owner);
        estimates[owner] = s.estimatedMonthly;
      }

      result = { ok: true, data: { byOwner, estimates } };

    } else if (action === "summary") {
      const src = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SOURCE_SHEET);
      if (!src) throw new Error("Sheet Transactions not found");
      const raw = src.getDataRange().getValues();
      const rows = raw.slice(1).filter(r => String(r[0]).trim() !== "");
      const txs = parseRows(rows);

      const allAccounts = getAccounts();
      const owners = [...new Set(allAccounts.map(a => a.owner))].filter(o => o !== "Unown");

      const summaryData = {};
      for (const owner of owners) {
        const s = getOwnerStats(txs, owner);
        // Ambil bulan ini
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const monthData = s.byMonth[thisMonth] || { income: 0, expense: 0, categories: {} };
        summaryData[owner] = {
          total: { income: s.income, expense: s.expense, net: s.net },
          thisMonth: { income: monthData.income, expense: monthData.expense, net: monthData.income - monthData.expense },
          cats: s.cats,
          estimatedMonthly: s.estimatedMonthly,
          impulsive: s.impulsive,
          routine: s.routine,
          months: s.months.sort().slice(-6).map(m => ({
            month: m,
            income: s.byMonth[m].income,
            expense: s.byMonth[m].expense,
            net: s.byMonth[m].income - s.byMonth[m].expense,
          })),
        };
      }

      // Bridge balances
      const bridges = {};
      for (const b of getBridgeAccounts()) {
        bridges[b] = getBridgeBalance(txs, b);
      }

      result = { ok: true, data: { owners, summary: summaryData, bridges } };

    } else if (action === "dor") {
      result = { ok: true, data: getDorEntries() };

    } else if (action === "insertDor") {
      const dataRaw = e && e.parameter && e.parameter.data ? e.parameter.data : null;
      if (!dataRaw) throw new Error("data wajib diisi");
      const entry = JSON.parse(dataRaw);
      const id = insertDor(entry);
      result = { ok: true, id };

    } else {
      result = { ok: true, message: "Fulus GAS v10 is alive" };
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
    const id = insertTransaction(body);
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SOURCE_SHEET);
  if (!sheet) throw new Error(`Sheet "${SOURCE_SHEET}" not found`);

  // Validasi per type
  if (!data.type) throw new Error("type is required");
  if (!data.category) throw new Error("category is required");
  if (!data.amount) throw new Error("amount is required");
  if (data.type === "Income" && !data.to) throw new Error("to is required for Income");
  if (data.type === "Expense" && !data.from) throw new Error("from is required for Expense");
  if (data.type === "Transfer" && (!data.from || !data.to)) throw new Error("from and to are required for Transfer");

  // Generate ID
  const now = new Date();
  const id = generateId(now);

  // Derive owner sesuai type:
  // Income  → owner dari To  (uang masuk ke akun ini)
  // lainnya → owner dari From (uang keluar dari akun ini)
  const owner = deriveOwner(data);

  // System sum: Income = +, Expense = -, lainnya 0
  const amount = Math.abs(parseInt(data.amount) || 0);
  const systemSum = data.type === "Income" ? amount : data.type === "Expense" ? -amount : 0;

  // Format tanggal
  const txDate = data.date ? new Date(data.date) : now;


  const row = [
    id,
    amount,
    txDate,
    data.rep || "One Time",
    data.from,
    data.to || "",
    owner,
    data.type,
    data.category,
    systemSum,
    data.notes || "",
    data.linkId || "",
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
  const raw = sheet.getDataRange().getValues();
  const rows = raw.slice(1).filter(r => String(r[0]).trim() !== "");
  return rows.slice(-limit).reverse().map(r => ({
    id: String(r[COL.ID - 1]),
    amount: parseInt(String(r[COL.AMOUNT - 1]).replace(/[^0-9]/g, "")) || 0,
    date: r[COL.DATE - 1] instanceof Date ? r[COL.DATE - 1].toISOString() : String(r[COL.DATE - 1]),
    rep: String(r[COL.REP - 1] || ""),
    from: String(r[COL.FROM - 1] || ""),
    to: String(r[COL.TO - 1] || ""),
    owner: String(r[COL.OWNER - 1] || ""),
    type: String(r[COL.TYPE - 1] || ""),
    category: String(r[COL.CATEGORY - 1] || ""),
    notes: String(r[COL.NOTES - 1] || ""),
    linkId: String(r[COL.LINK_ID - 1] || ""),
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
  const COL_DATE = 3;
  const COL_ID = 1;

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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(SOURCE_SHEET);
  if (!src) {
    Logger.log(`Sheet "${SOURCE_SHEET}" not found.`); return;
    return;
  }

  const raw = src.getDataRange().getValues();
  const rows = raw.slice(1).filter(r => String(r[COL.ID - 1]).trim() !== "");
  const txs = parseRows(rows);

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

  Logger.log("✅ Summary generated successfully!");
}

function parseRows(rows) {
  return rows.map(row => {
    const amountRaw = String(row[COL.AMOUNT - 1]).replace(/[^0-9]/g, "");
    const amount = parseInt(amountRaw) || 0;
    const dateRaw = row[COL.DATE - 1];
    const date = dateRaw instanceof Date ? dateRaw : new Date(dateRaw);
    const month = isNaN(date) ? "unknown" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const quarter = isNaN(date) ? "unknown" : `Q${Math.ceil((date.getMonth() + 1) / 3)} ${date.getFullYear()}`;
    return {
      id: String(row[COL.ID - 1]).trim(),
      amount, date, month, quarter,
      rep: String(row[COL.REP - 1] || "").trim(),
      from: String(row[COL.FROM - 1] || "").trim(),
      to: String(row[COL.TO - 1] || "").trim(),
      owner: String(row[COL.OWNER - 1] || "").trim(),
      type: String(row[COL.TYPE - 1] || "").trim(),
      category: String(row[COL.CATEGORY - 1] || "").trim(),
    };
  }).filter(t => !isNaN(t.date));
}

function getOwnerStats(txs, owner) {
  const relevant = txs.filter(t => t.owner === owner && t.type !== "Follow-Up" && t.type !== "Transfer");
  const income = relevant.filter(t => t.type === "Income").reduce((s, t) => s + t.amount, 0);
  const expense = relevant.filter(t => t.type === "Expense").reduce((s, t) => s + t.amount, 0);

  const byMonth = {};
  for (const t of relevant) {
    if (!byMonth[t.month]) byMonth[t.month] = { income: 0, expense: 0, categories: {} };
    if (t.type === "Income") byMonth[t.month].income += t.amount;
    if (t.type === "Expense") {
      byMonth[t.month].expense += t.amount;
      byMonth[t.month].categories[t.category] = (byMonth[t.month].categories[t.category] || 0) + t.amount;
    }
  }

  const byQuarter = {};
  for (const t of relevant) {
    if (!byQuarter[t.quarter]) byQuarter[t.quarter] = { income: 0, expense: 0 };
    if (t.type === "Income") byQuarter[t.quarter].income += t.amount;
    if (t.type === "Expense") byQuarter[t.quarter].expense += t.amount;
  }

  const cats = {};
  for (const t of relevant.filter(t => t.type === "Expense")) {
    cats[t.category] = (cats[t.category] || 0) + t.amount;
  }

  const expenseTxs = relevant.filter(t => t.type === "Expense");
  const impulsive = expenseTxs.filter(t => t.rep === "One Time").reduce((s, t) => s + t.amount, 0);
  const routine = expenseTxs.filter(t => t.rep !== "One Time").reduce((s, t) => s + t.amount, 0);

  const seen = {};
  let annualRecurring = 0;
  const MULT = { Monthly: 12, Quarterly: 4, Weekly: 52, Yearly: 1, "One Time": 0 };
  for (const t of expenseTxs.filter(t => t.rep !== "One Time")) {
    const key = t.category + "_" + t.rep;
    if (!seen[key]) { seen[key] = true; annualRecurring += t.amount * (MULT[t.rep] || 1); }
  }
  const months = Object.keys(byMonth).filter(m => m !== "unknown");
  const nMonths = months.length || 1;
  const oneTimeAvg = Math.round(impulsive / nMonths);
  const estimatedMonthly = Math.round(annualRecurring / 12) + oneTimeAvg;

  return { income, expense, net: income - expense, byMonth, byQuarter, cats, impulsive, routine, estimatedMonthly, oneTimeAvg, months };
}

function getBridgeBalance(txs, bridgeAccount) {
  let net = 0;
  for (const t of txs) {
    if (t.from === bridgeAccount) net -= t.amount;
    if (t.to === bridgeAccount) net += t.amount;
  }
  return net;
}

function getDorEntries() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DOR_SHEET);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues().slice(1);
  return rows
    .filter(r => String(r[0]).trim() !== "")
    .map(r => ({
      id: String(r[0]),
      date: r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
      person: String(r[2] || "").trim(),
      amount: parseInt(String(r[3]).replace(/[^0-9-]/g, "")) || 0,  // signed
      context: String(r[4] || "").trim(),
    }))
    .reverse();  // newest first
}

function insertDor(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DOR_SHEET);
  if (!sheet) throw new Error(`Sheet "${DOR_SHEET}" not found`);

  if (!data.person) throw new Error("person is required");
  if (!data.amount) throw new Error("amount is required");
  if (!data.context) throw new Error("context is required");

  const now = new Date();
  const id = generateId(now);
  // direction: "in" = receivable (+), "out" = payable (-)
  const signed = data.direction === "out"
    ? -Math.abs(parseInt(data.amount) || 0)
    : Math.abs(parseInt(data.amount) || 0);

  sheet.appendRow([id, now, data.person.trim(), signed, data.context.trim()]);
  return id;
}

function getAnomalies(txs) {
  const issues = [];
  const followUps = txs.filter(t => t.type === "Follow-Up");
  const nonFollows = txs.filter(t => t.type !== "Follow-Up");
  for (const fu of followUps) {
    const partner = nonFollows.find(t =>
      t.amount === fu.amount && t.date.toDateString() === fu.date.toDateString() && t.id !== fu.id
    );
    if (!partner) {
      issues.push({ level: "⚠️", msg: `Follow-Up without partner: ${fu.id} | ${fu.category} | ${idr(fu.amount)}` });
    }
  }
  const bridgeAccounts = getBridgeAccounts();
  for (const bridge of bridgeAccounts) {
    const bal = getBridgeBalance(txs, bridge);
    if (Math.abs(bal) > 0) {
      issues.push({ level: "🔵", msg: `${bridge} net ${idr(bal)} — difference not yet settled` });
    }
  }
  const seen = {};
  for (const t of txs) {
    const key = `${t.amount}_${t.date.toDateString()}_${t.category}_${t.owner}_${t.type}`;
    if (seen[key]) {
      issues.push({ level: "❓", msg: `Possible duplicate: ${t.id} & ${seen[key]} | ${t.category} | ${idr(t.amount)}` });
    } else {
      seen[key] = t.id;
    }
  }
  return issues;
}

class SheetWriter {
  constructor(sheet) { this.sheet = sheet; this.row = 1; }

  write(cells, { bold = false, bg = null, fontSize = 10, color = null } = {}) {
    const r = this.sheet.getRange(this.row, 1, 1, cells.length);
    r.setValues([cells]);
    r.setFontSize(fontSize);
    if (bold) r.setFontWeight("bold");
    if (bg) r.setBackground(bg);
    if (color) r.setFontColor(color);
    this.row++;
    return this;
  }

  header(text, bg = "#1a237e") {
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

  note(text, bg = null) {
    const r = this.sheet.getRange(this.row, 1, 1, 6);
    r.merge(); r.setValue(text); r.setFontSize(10); r.setFontColor("#444444");
    if (bg) r.setBackground(bg);
    this.row++; return this;
  }

  blank(n = 1) { this.row += n; return this; }

  divider() {
    const r = this.sheet.getRange(this.row, 1, 1, 6);
    r.merge(); r.setValue("─".repeat(70));
    r.setFontColor("#cccccc"); r.setFontSize(9);
    this.row++; return this;
  }
}

function writeFull(w, txs) {
  const now = new Date();
  // Owner is read dynamically from Accounts sheet — not hardcoded
  const allAccounts = getAccounts();
  const owners = [...new Set(allAccounts.map(a => a.owner))].filter(o => o !== "Unown");

  const OWNER_COLOR = {
    Personal: "#1565c0", Servo: "#2e7d32", House: "#6a1b9a",
    ElFamilia: "#b71c1c", Investment: "#e65100",
  };
  const OWNER_BG = {
    Personal: "#e3f2fd", Servo: "#e8f5e9", House: "#f3e5f5",
    ElFamilia: "#ffebee", Investment: "#fff3e0",
  };

  w.header("💰  FULUS — FINANCIAL SUMMARY", "#1a237e");
  w.write(["Generated:", now.toLocaleString("id-ID"), "", "", "", ""], { bg: "#e3f2fd", fontSize: 9 });
  w.blank();

  for (const owner of owners) {
    const s = getOwnerStats(txs, owner);
    const months = s.months.sort();
    const quarters = Object.keys(s.byQuarter).sort();
    const col = OWNER_COLOR[owner] || "#37474f";
    const bg = OWNER_BG[owner] || "#eceff1";

    w.header(`👤  ${owner.toUpperCase()}`, col);
    w.write(["TOTAL INCOME", "TOTAL EXPENSE", "NET", "EST. BIAYA/BULAN", "", ""], { bold: true, bg: "#f5f5f5" });
    w.write([idr(s.income), idr(s.expense), idr(s.net), idr(s.estimatedMonthly), "", ""],
      { bg: s.net >= 0 ? "#e8f5e9" : "#ffebee", bold: true });
    w.blank();

    if (months.length > 0) {
      w.write(["Bulan", "Income", "Expense", "Net", "Impulsif", "Rutin"], { bold: true, bg: "#eceff1" });
      for (const m of months) {
        const md = s.byMonth[m];
        const net = md.income - md.expense;
        const imp = txs.filter(t => t.owner === owner && t.type === "Expense" && t.rep === "One Time" && t.month === m).reduce((s, t) => s + t.amount, 0);
        const rut = txs.filter(t => t.owner === owner && t.type === "Expense" && t.rep !== "One Time" && t.month === m).reduce((s, t) => s + t.amount, 0);
        w.write([m, idr(md.income), idr(md.expense), idr(net), idr(imp), idr(rut)], { bg: net >= 0 ? null : "#fff3e0" });
      }
      w.blank();
    }

    if (quarters.length > 0) {
      w.write(["Kuartal", "Income", "Expense", "Net", "Rata-rata/Bulan", ""], { bold: true, bg: "#eceff1" });
      for (const q of quarters) {
        const qd = s.byQuarter[q];
        const net = qd.income - qd.expense;
        w.write([q, idr(qd.income), idr(qd.expense), idr(net), idr(Math.round(qd.expense / 3)), ""],
          { bg: net >= 0 ? null : "#fff3e0" });
      }
      w.blank();
    }

    const sortedCats = Object.entries(s.cats).sort((a, b) => b[1] - a[1]);
    if (sortedCats.length > 0) {
      const totalExp = sortedCats.reduce((s, [, v]) => s + v, 0);
      w.write(["Kategori", "Total", "% dari expense", "", "", ""], { bold: true, bg: "#eceff1" });
      for (const [cat, total] of sortedCats) {
        w.write([cat, idr(total), totalExp > 0 ? ((total / totalExp) * 100).toFixed(1) + "%" : "0%", "", "", ""]);
      }
      w.blank();
    }

    const totalExp = s.impulsive + s.routine;
    if (totalExp > 0) {
      const impPct = ((s.impulsive / totalExp) * 100).toFixed(1);
      const rutPct = ((s.routine / totalExp) * 100).toFixed(1);
      const impMsg = parseFloat(impPct) >= 60 ? "⚠️ TINGGI" : parseFloat(impPct) >= 35 ? "🟡 MODERAT" : "✅ TERKONTROL";
      w.write([`Pola: ${impMsg}`, `Impulsif ${impPct}%`, `Rutin ${rutPct}%`, "", "", ""],
        { bg: parseFloat(impPct) >= 60 ? "#fff3e0" : "#f1f8e9" });
      w.blank();
    }

    w.divider().blank();
  }

  w.section("🔗  STATUS BRIDGE ACCOUNTS");
  w.write(["Bridge Account", "Net Balance", "Status", "", "", ""], { bold: true, bg: "#eceff1" });
  for (const bridge of getBridgeAccounts()) {
    const net = getBridgeBalance(txs, bridge);
    w.write([bridge, idr(net), Math.abs(net) < 1000 ? "✅ Settled" : `🔵 Selisih ${idr(Math.abs(net))}`, "", "", ""],
      { bg: Math.abs(net) < 1000 ? "#e8f5e9" : "#fff3e0" });
  }
  w.blank();

  const anomalies = getAnomalies(txs);
  w.section("🔍  ANOMALIES DETECTED");
  if (anomalies.length === 0) {
    w.note("✅ No anomalies detected.", "#e8f5e9");
  } else {
    w.note(`${anomalies.length} potential anomalies detected:`, "#fff3e0");
    for (const a of anomalies) w.note(`${a.level}  ${a.msg}`, "#fff9c4");
  }
  w.blank();

  w.section("📅  ESTIMATED MONTHLY EXPENSES");
  w.write(["Owner", "Est. Expense/Month", "Est. Expense/Year", "", "", ""], { bold: true, bg: "#eceff1" });
  let grandTotal = 0;
  for (const owner of owners) {
    const s = getOwnerStats(txs, owner);
    if (s.estimatedMonthly > 0) {
      w.write([owner, idr(s.estimatedMonthly), idr(s.estimatedMonthly * 12), "", "", ""]);
      grandTotal += s.estimatedMonthly;
    }
  }
  w.write(["TOTAL", idr(grandTotal), idr(grandTotal * 12), "", "", ""], { bold: true, bg: "#c5cae9" });
  w.blank();
  w.note(`⏱️  Last updated: ${now.toLocaleString("id-ID")}`, "#e3f2fd");
}