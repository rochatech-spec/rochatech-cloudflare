import type { BootstrapData, QueuedMutation } from '../types'

const DB_NAME = 'ritmo-finance-local'
const DB_VERSION = 1
const CACHE_STORE = 'cache'
const OUTBOX_STORE = 'outbox'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE)
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const req = work(tx.objectStore(storeName))
    let result: T | undefined
    if (req) {
      req.onsuccess = () => { result = req.result }
      req.onerror = () => reject(req.error)
    }
    tx.oncomplete = () => { db.close(); resolve(result) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function cacheBootstrap(workspaceId: string, data: BootstrapData) {
  await withStore(CACHE_STORE, 'readwrite', (store) => store.put(data, `bootstrap:${workspaceId}`))
}

export async function readCachedBootstrap(workspaceId: string): Promise<BootstrapData | null> {
  const result = await withStore<BootstrapData>(CACHE_STORE, 'readonly', (store) => store.get(`bootstrap:${workspaceId}`))
  return result ?? null
}

export async function enqueueMutation(item: QueuedMutation) {
  await withStore(OUTBOX_STORE, 'readwrite', (store) => store.put(item))
}

export async function listOutbox(): Promise<QueuedMutation[]> {
  const result = await withStore<QueuedMutation[]>(OUTBOX_STORE, 'readonly', (store) => store.getAll())
  return (result ?? []).sort((a, b) => a.createdAt - b.createdAt)
}

export async function removeOutbox(id: string) {
  await withStore(OUTBOX_STORE, 'readwrite', (store) => store.delete(id))
}

export async function clearLocalData() {
  const db = await openDB()
  await Promise.all([CACHE_STORE, OUTBOX_STORE].map((name) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite')
    tx.objectStore(name).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })))
  db.close()
}
