import type { CachedScopeSnapshot, FinancialScope, PendingMutation } from '../domain/types'

const DB_NAME = 'ritmo-offline'
const DB_VERSION = 1
const SNAPSHOTS = 'snapshots'
const MUTATIONS = 'mutations'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(MUTATIONS)) {
        const store = db.createObjectStore(MUTATIONS, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function getScopeSnapshot(scope: FinancialScope): Promise<CachedScopeSnapshot | null> {
  const db = await openDb()
  const tx = db.transaction(SNAPSHOTS, 'readonly')
  const value = await requestResult(tx.objectStore(SNAPSHOTS).get(scope))
  return (value as CachedScopeSnapshot | undefined) ?? null
}

export async function saveScopeSnapshot(snapshot: CachedScopeSnapshot): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(SNAPSHOTS, 'readwrite')
  tx.objectStore(SNAPSHOTS).put(snapshot)
  await complete(tx)
}

export async function clearScopeSnapshots(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(SNAPSHOTS, 'readwrite')
  tx.objectStore(SNAPSHOTS).clear()
  await complete(tx)
}

export async function enqueueMutation(mutation: PendingMutation): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(MUTATIONS, 'readwrite')
  tx.objectStore(MUTATIONS).put(mutation)
  await complete(tx)
}

export async function listPendingMutations(limit = 20): Promise<PendingMutation[]> {
  const db = await openDb()
  const tx = db.transaction(MUTATIONS, 'readonly')
  const index = tx.objectStore(MUTATIONS).index('createdAt')
  const items: PendingMutation[] = []
  await new Promise<void>((resolve, reject) => {
    const cursor = index.openCursor()
    cursor.onsuccess = () => {
      const current = cursor.result
      if (!current || items.length >= limit) return resolve()
      items.push(current.value as PendingMutation)
      current.continue()
    }
    cursor.onerror = () => reject(cursor.error)
  })
  return items
}

export async function deletePendingMutation(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(MUTATIONS, 'readwrite')
  tx.objectStore(MUTATIONS).delete(id)
  await complete(tx)
}

export async function clearPendingMutations(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(MUTATIONS, 'readwrite')
  tx.objectStore(MUTATIONS).clear()
  await complete(tx)
}

export async function clearFinancialCache(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([SNAPSHOTS, MUTATIONS], 'readwrite')
  tx.objectStore(SNAPSHOTS).clear()
  tx.objectStore(MUTATIONS).clear()
  await complete(tx)
}

export async function bumpMutationAttempt(mutation: PendingMutation): Promise<void> {
  await enqueueMutation({ ...mutation, attempts: mutation.attempts + 1 })
}
