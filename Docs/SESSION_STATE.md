# Fulus PWA — Session State

> Paste file ini di awal setiap sesi AI baru.
> Selalu overwrite — tidak ada history di sini. History ada di FULUS_CHANGELOG.md.
> Satu sesi = satu masalah sampai selesai. Tiap akhir sesi: update SESSION + sarankan commit.
>
> Pendekatan kode: ramping, tidak redundan, mudah dibaca.
> Output kode: tunjukkan hanya bagian yang berubah — dari baris X sampai Y,
> dengan konteks 2-3 baris sebelum dan sesudah. Format: hapus/ganti/tambah.
>
> Jika "Sesi ini" kosong atau masalah belum jelas:
> 1. Tanya dulu apa yang terasa tidak beres atau ingin dikerjakan
> 2. Telusuri bersama sampai scope dan done criteria jelas
> 3. Baru mulai implementasi — jangan langsung kasih kode sebelum masalah terdefinisi.

---

## Project

**Fulus PWA** — React/Vite + Google Apps Script + Google Sheets
Personal finance tracker, multi-owner, offline-first.
Deploy: GitHub Pages (`mihaaq-arch.github.io/fulus-pwa/`)
Brand: Mihaaq-arch

Stack:
- Frontend: React + Vite, deployed via `gh-pages -d dist`
- Backend: Google Apps Script (`fulus-gas.js`) — satu file, di-paste manual ke Sheets
- Storage: Google Sheets sebagai DB, IndexedDB sebagai offline queue
- Auth: `SECRET_KEY` hardcoded di GAS + `config.local.js` (gitignored)

File utama yang sudah dibaca AI:
- `fulus-gas.js` — GAS backend v3, lengkap (sudah dibaca)
- `src/App.jsx` — UI utama lengkap (sudah dibaca)
- `src/gas.js` — API client lengkap (sudah dibaca)
- `src/db.js`, `src/constants.js`, `src/main.jsx`, `src/components/*` — belum dibaca, minta paste jika dibutuhkan

---

## Module State

| Fitur | Status |
|---|---|
| Record transaksi (offline-first) | ✅ done |
| History | ✅ done |
| Summary per owner | ✅ done |
| DOR (Debts / Reimbursements) | ✅ done |
| Recurring | ✅ done |
| Multi-owner + bridge accounts | ✅ done |
| LinkID paired transactions | ⏸ pending |
| Income/Transfer cross-account flow | ⏸ pending |
| DOR merge decision (sheet terpisah vs flag) | ⏸ open question |
| **Milestone 1: Onboarding otomatis via OAuth** | 🚧 next |
| **Milestone 2: OCR bukti transfer (Gemini Vision)** | 📋 backlog |

---

## Navigasi Aktif

```
src/
├── App.jsx               → UI utama, full transaction flow
├── gas.js                → API client + fetch/post ke GAS
├── db.js                 → IndexedDB offline queue
├── constants.js          → konstanta shared
├── main.jsx              → entry point
└── components/
    ├── ChipGrid.jsx      → grid tombol pilihan (accounts, categories, rep, dll)
    ├── HistoryItem.jsx   → render satu item di History
    ├── NumPad.jsx        → numpad input amount
    ├── SummaryView.jsx   → tampilan Summary per owner
    └── ui.jsx            → shared UI primitives
```

Config (gitignored, tidak di repo):
```
config.local.js           → url + key per user
```

---

## Arsitektur Kritis

### Pipeline transaksi utama
```
User input → IndexedDB (offline queue)
          → gas.js fetch ke GAS Web App URL
          → doPost / ?action=insert
          → GAS appendRow ke sheet Transactions
          → generateId() otomatis
```

### Owner derivation (JANGAN UBAH logikanya)
- Income → owner dari akun `To` (uang masuk)
- Expense / Transfer / Follow-Up → owner dari akun `From` (uang keluar)

### Bridge accounts
- Akun dengan `Owner = "Unown"` di sheet Accounts
- Dipakai untuk transaksi lintas owner
- `getBridgeBalance()` hitung net — idealnya selalu 0

### Auth pattern
- Semua request ke GAS wajib sertakan `key` = `SECRET_KEY`
- Kecuali `?action=ping` — boleh tanpa key
- Key disimpan di `config.local.js` (gitignored)

### Sheet yang dikelola GAS
| Sheet | Fungsi |
|---|---|
| `Transactions` | Data utama |
| `Accounts` | Master akun (Name, Owner, Active) |
| `Categories` | Master kategori (Name, Type, Active) |
| `Debts / Reimbursements` | DOR entries |
| `📊 Monthly Summary` | Generated oleh `generateSummary()` |

### GAS Endpoints aktif
| Endpoint | Fungsi |
|---|---|
| `?action=ping` | Health check, no auth |
| `?action=config` | Accounts + categories sekaligus |
| `?action=accounts` | List akun aktif |
| `?action=categories` | List kategori aktif |
| `?action=transactions&limit=N` | N transaksi terakhir |
| `?action=balances` | Saldo per akun, grouped per owner |
| `?action=summary` | Ringkasan per owner + bridge balance |
| `?action=dor` | List DOR entries |
| `?action=insert&data=...` | Insert transaksi (GET) |
| `?action=insertDor&data=...` | Insert DOR (GET) |
| `doPost` | Insert transaksi (POST body) |

### Aturan wajib
- Jangan tulis ke source sheet GAS dari luar GAS — semua write lewat GAS endpoint
- `config.local.js` tidak boleh masuk repo (sudah di `.gitignore`)
- Commit format: `feat/fix/refactor(fulus): <pesan>`
- Test di HP sebelum commit — konfirmasi production work dulu

### Filosofi kode
- Ramping: kurangi baris, bukan tambah
- Sebelum tambah fungsi baru, cek apakah sudah ada yang bisa di-reuse
- Komentar hanya untuk hal yang tidak bisa dijelaskan oleh kode itu sendiri
- Satu fungsi, satu tanggung jawab

---

## Milestone Roadmap

### Milestone 1 — Fulus siap pakai orang lain (NEXT)
User flow target: install PWA (atau buka browser) → login Google → langsung bisa pakai, tanpa setup manual apapun.

Platform: Android (homescreen), iOS (homescreen), PC (browser / PWA install)
UI/UX: tetap fokus mobile, PC fungsional tapi belum dioptimasi
Data: tiap user punya GSheet sendiri di Drive mereka — bukan di server kita

**Breakdown per sesi:**

| Sesi | Scope | Done criteria |
|---|---|---|
| M1-S1 | OAuth login Google (Google Identity Services) | Token berhasil didapat dan tersimpan di localStorage | DONE
| M1-S2 | Auto-create Spreadsheet di Drive user via Drive API | Sheet baru muncul di Drive user, Spreadsheet ID tersimpan | DONE
| M1-S3 | Inject `fulus-gas.js` + deploy sebagai Web App via Apps Script API | Deployment URL bisa di-ping, balik response ok |
| M1-S4 | Generate SECRET_KEY random → patch ke script → simpan URL+key, hapus `config.local.js` | Fulus jalan penuh tanpa `config.local.js` |
| M1-S5 | Onboarding UI — progress indicator, error handling, retry | User experience mulus dari buka app sampai siap pakai |

**Catatan teknis:**
- `config.local.js` akan digantikan oleh localStorage sepenuhnya setelah M1-S4
- SECRET_KEY di-generate random per user (bukan hardcoded)
- GAS script yang di-inject = `fulus-gas.js` yang sudah ada, dengan KEY di-patch otomatis
- Apps Script API butuh OAuth scope tambahan: `https://www.googleapis.com/auth/script.projects`

### Milestone 2 — OCR bukti transfer (BACKLOG)
User flow target: share/upload screenshot bukti transfer → form Record ter-prefill → konfirmasi → simpan

Approach: Gemini Vision (sudah ada via Google One AI Premium)
Scope: BCA, Mandiri, BRI dulu (format paling umum)
Dependency: Milestone 1 harus selesai dulu

---

## Known Issues (jangan fix kecuali diminta)
- Balance summary menampilkan angka tidak masuk akal (Rp11.891.700.320.421.464) — diduga bug parsing amount di GAS `action=balances`, atau data korup di sheet lama. Akan diverifikasi dengan sheet baru setelah M1-S2 selesai.
- Tidak ada backdate di form Record — `date` selalu `new Date().toISOString()` di `handleSubmit` App.jsx
- SECRET_KEY hardcoded di fulus-gas.js — akan di-refactor di M1-S4
- Setup masih manual (paste GAS, run setupSheets, deploy, copy URL) — akan diotomasi di Milestone 1

---

## Backlog (jangan implement kecuali diminta)

| ID | Item | Scope |
|---|---|---|
| B1 | LinkID untuk paired transactions | Frontend + GAS |
| B2 | Income/Transfer cross-account flow refinements | Frontend |
| B3 | DOR: tetap sheet terpisah vs merge ke Transactions dengan flag | Keduanya |
| B4 | Fiverr gig: legacy Java code auditing (portfolio Mihaaq-arch) | Non-teknis |
| B5 | Backdate transaksi — field tanggal di form Record | Frontend |

---

## Session

### Sesi ini
[kosongkan — tunggu sesi berikutnya]

### Sesi sebelumnya
[M1-S2 — Juni 2026] Auto-create Spreadsheet di Drive user selesai.
- Drive API dipanggil setelah token didapat, spreadsheet "Fulus Data" berhasil dibuat
- Spreadsheet ID tersimpan di localStorage (fulus_spreadsheet_id)
- OnboardingScreen refactor: step internal login → creating → error, auto-skip login kalau token masih valid
- gas.js refactor: hapus static import config.local.js, semua fungsi baca url+key dari localStorage via getGasConfig()
- App.jsx: isConfigured sekarang cek fulus_spreadsheet_id, isGasReady cek fulus_gas_url
- Guard isGasReady ditambah di fetchConfig, tab summary, dor, recurring — tidak ada fetch kalau GAS belum configured
- Error "GAS not configured" disuppress dari UI selama isGasReady false
Status: done