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
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        db.createObjectStore(SNAPSHOTS, { keyPath: 'key' })
      }
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

export async function getScopeSnapshot(scope: FinancialScope): Promise<CachedScopeSnapshot | null> {
  const db = await openDb()
  const tx = db.transaction(SNAPSHOTS, 'readonly')
  const value = await requestResult(tx.objectStore(SNAPSHOTS).get(scope))
  return (value as CachedScopeSnapshot | undefined) ?? null
}

export async function saveScopeSnapshot(snapshot: CachedScopeSnapshot): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SNAPSHOTS, 'readwrite')
    tx.objectStore(SNAPSHOTS).put(snapshot)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function enqueueMutation(mutation: PendingMutation): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MUTATIONS, 'readwrite')
    tx.objectStore(MUTATIONS).put(mutation)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function listPendingMutations(limit = 20): Promise<PendingMutation[]> {
  const db = await openDb()
  const tx = db.transaction(MUTATIONS, 'readonly')
  const store = tx.objectStore(MUTATIONS)
  const index = store.index('createdAt')
  const items: PendingMutation[] = []

  await new Promise<void>((resolve, reject) => {
    const cursor = index.openCursor()
    cursor.onsuccess = () => {
      const current = cursor.result
      if (!current || items.length >= limit) {
        resolve()
        return
      }
      items.push(current.value as PendingMutation)
      current.continue()
    }
    cursor.onerror = () => reject(cursor.error)
  })

  return items
}

export async function deletePendingMutation(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MUTATIONS, 'readwrite')
    tx.objectStore(MUTATIONS).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function bumpMutationAttempt(mutation: PendingMutation): Promise<void> {
  await enqueueMutation({ ...mutation, attempts: mutation.attempts + 1 })
}
