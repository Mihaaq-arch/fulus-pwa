# Fulus PWA — Changelog

> Append-only. Tambah entri baru di ATAS. Jangan edit entri lama.
> Format: `## [YYYY-MM-DD] Judul singkat`

## [M1-S1] — [2026-06-06] Auto-create Spreadsheet di Drive user selesai.
### Added
- Drive API dipanggil setelah token didapat, spreadsheet "Fulus Data" berhasil dibuat
- Spreadsheet ID tersimpan di localStorage (fulus_spreadsheet_id)
- OnboardingScreen refactor: step internal login → creating → error, auto-skip login kalau token masih valid
- gas.js refactor: hapus static import config.local.js, semua fungsi baca url+key dari localStorage via getGasConfig()
- App.jsx: isConfigured sekarang cek fulus_spreadsheet_id, isGasReady cek fulus_gas_url
- Guard isGasReady ditambah di fetchConfig, tab summary, dor, recurring — tidak ada fetch kalau GAS belum configured
- Error "GAS not configured" disuppress dari UI selama isGasReady false

**Commit:** feat(fulus): M1-S2 auto-create spreadsheet + refactor gas.js & onboarding flow

---
## [M1-S1] — [2026-06-06]
### Added
- OnboardingScreen komponen baru — muncul kalau belum ada `fulus_url` di localStorage
- OAuth login via Google Identity Services (token client, bukan sign-in button)
- Access token + expiry disimpan ke localStorage setelah login berhasil
- fetchConfig() di App.jsx skip kalau belum configured
- config.local.js tetap ada (kosong) sebagai placeholder sampai M1-S4

**Commit:** feat(fulus): M1-S1 OAuth login via Google Identity Services

## [2026-06-06] Milestone planning — roadmap Fulus ke release publik

**Yang diputuskan:**
- Milestone 1: Fulus siap pakai oleh orang lain — onboarding otomatis via OAuth Google
  - User cukup install PWA (atau buka di browser) + login Google
  - Fulus auto-buat Sheet di Drive user, inject + deploy `fulus-gas.js` via Apps Script API
  - `SECRET_KEY` di-generate otomatis per user, tidak hardcoded
  - Multi-platform: Android (homescreen), iOS (homescreen), PC (browser/PWA install)
  - UI/UX tetap fokus mobile untuk saat ini
- Milestone 2: Baca bukti transfer — OCR via Gemini Vision untuk auto-fill form Record
  - User upload/share screenshot bukti transfer
  - Ekstrak nominal, rekening, tanggal → pre-fill form → user konfirmasi → simpan
  - Feasible karena format bukti transfer per bank relatif konsisten
  - Tidak butuh API bank, tidak butuh izin siapapun

**Yang tidak diambil:**
- Koneksi langsung ke API bank (tertutup, bukan di tangan kita)
- APK native via Play Store (overhead tidak sepadan untuk scope sekarang)
- Hosting server sendiri (tidak perlu — GAS tetap gratis di Drive user)

**File diubah:** -
**Commit:** -

---

## [sebelum 2026-06-06] Fulus PWA v3 — backend GAS fungsional

**Yang sudah ada:**
- `fulus-gas.js` — GAS backend v3, satu file, di-paste manual ke Apps Script
- Tab: Record, History, Summary, DOR, Recurring
- Multi-owner architecture dengan bridge accounts (akun "Unown")
- Owner derivation: Income → `To`, Expense/Transfer → `From`
- Auth: `SECRET_KEY` hardcoded di `fulus-gas.js` dan `config.local.js`
- Offline-first: transaksi masuk IndexedDB dulu, sync ke GAS saat online
- Deploy: GitHub Pages via `gh-pages -d dist`
- Setup masih manual: user harus paste GAS, run `setupSheets()`, deploy sendiri, copy URL

**Endpoints GAS yang aktif:**
- `?action=ping` — health check tanpa auth
- `?action=config` — accounts + categories sekaligus
- `?action=accounts` — list akun aktif
- `?action=categories` — list kategori aktif
- `?action=transactions&limit=N` — N transaksi terakhir
- `?action=balances` — saldo per akun, grouped per owner
- `?action=summary` — ringkasan per owner + bridge balance
- `?action=dor` — list DOR entries
- `?action=insert` (GET + param `data`) — insert transaksi
- `?action=insertDor` (GET + param `data`) — insert DOR
- `doPost` — insert transaksi via POST body

**Sheet yang dikelola GAS:**
- `Transactions` — data utama
- `Accounts` — master akun (Name, Owner, Active)
- `Categories` — master kategori (Name, Type, Active)
- `Debts / Reimbursements` — DOR entries
- `📊 Monthly Summary` — generated oleh `generateSummary()`

**Pending (Batch 1 sebelum milestone planning ini):**
- LinkID untuk paired transactions
- Income/Transfer cross-account flow refinements
- DOR: open question apakah tetap sheet terpisah atau merge ke Transactions dengan flag