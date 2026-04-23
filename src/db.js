// ============================================================
// FULUS — OFFLINE QUEUE (IndexedDB)
// Transactions are saved here first, then synced to GAS in the background
// ============================================================
import { openDB } from 'idb';
import { postTransaction } from './gas.js';

const DB_NAME    = 'fulus';
const STORE_NAME = 'queue';
const DB_VERSION = 1;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'localId', autoIncrement: true });
        store.createIndex('status', 'status');
      }
    },
  });
}

// Add transaction to the local queue
export async function enqueue(tx) {
  const db = await getDB();
  const localId = await db.add(STORE_NAME, {
    ...tx,
    status:    'pending',
    createdAt: new Date().toISOString(),
  });
  return localId;
}

// Get all pending transactions
export async function getPending() {
  const db = await getDB();
  return db.getAllFromIndex(STORE_NAME, 'status', 'pending');
}

// Get all transactions (for local history view)
export async function getAll() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.reverse();
}

// Sync all pending transactions to GAS
export async function syncQueue(onProgress) {
  const pending = await getPending();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  const db = await getDB();
  let synced = 0, failed = 0;

  for (const item of pending) {
    try {
      const gasId = await postTransaction(item);
      await db.put(STORE_NAME, { ...item, status: 'synced', gasId, syncedAt: new Date().toISOString() });
      synced++;
    } catch (err) {
      // Network error (offline) — keep as pending, not error
      const isNetworkError = err instanceof TypeError && err.message.includes('fetch');
      await db.put(STORE_NAME, { ...item, status: isNetworkError ? 'pending' : 'error', error: err.message });
      if (!isNetworkError) failed++;
    }
    onProgress && onProgress({ synced, failed, total: pending.length });
  }

  return { synced, failed };
}

// Remove all synced transactions (cleanup)
export async function clearSynced() {
  const db   = await getDB();
  const all  = await db.getAllFromIndex(STORE_NAME, 'status', 'synced');
  const tx   = db.transaction(STORE_NAME, 'readwrite');
  await Promise.all(all.map(item => tx.store.delete(item.localId)));
  await tx.done;
  return all.length;
}

// Get count of pending transactions
export async function getPendingCount() {
  const pending = await getPending();
  return pending.length;
}