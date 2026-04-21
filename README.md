# Fulus PWA

Personal finance tracker — PWA with Google Sheets as database.

Built for speed: offline-first input, syncs to Sheets in the background. Step-based adaptive form that adjusts fields based on transaction type.

## Stack

- React + Vite
- Google Apps Script as REST backend (no server needed)
- Google Sheets as database
- IndexedDB for offline queue
- Deployed to GitHub Pages

## Features

- Offline-first: transactions saved locally first, synced when online
- Step-by-step form with auto-advance — minimal taps to record
- Accounts and categories pulled live from Sheets (no hardcoded lists)
- Cross-owner transactions auto-generate bridge entries
- DOR (debt/receivable) tagging per category
- PWA installable to homescreen (Android + iOS)

## Setup

### 1. Google Apps Script backend

- Copy `fulus-gas.js` to your Google Sheets via Extensions > Apps Script
- Run `setupSheets()` to create `Accounts` and `Categories` sheets
- Deploy as Web App: Execute as Me, Who has access: Anyone
- Note your deployment URL and generate a secret key

### 2. Local config

```bash
cp config.example.js config.local.js
```

Edit `config.local.js`:

```js
export const GAS_URL = "https://script.google.com/macros/s/YOUR_ID/exec";
export const GAS_KEY = "your-secret-key";
```

`config.local.js` is gitignored — safe to put real values here.

### 3. Run locally

```bash
npm install
npm run dev
```

### 4. Deploy to GitHub Pages

```bash
npm run build
npm install -g gh-pages
gh-pages -d dist
```

Then: GitHub repo → Settings → Pages → source: `gh-pages` branch.

### 5. Add to homescreen

- **Android**: Chrome → menu → Add to Home Screen
- **iOS**: Safari → Share → Add to Home Screen

## Adding accounts or categories

Edit the `Accounts` or `Categories` sheet in Google Sheets directly.
PWA re-fetches config every 24h. To force refresh, run in browser console:

```js
localStorage.removeItem('fulus_config') // then reload
```

## Project structure

```
src/
  gas.js            API client + fetch/post logic
  db.js             IndexedDB offline queue
  App.jsx           UI — full transaction flow
config.example.js   Copy this to config.local.js and fill in values
fulus-gas.js        Google Apps Script backend (paste to Apps Script)
```
