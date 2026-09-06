import { fetchBootstrap, mutate, persistScope } from '../api/client'
import type { BootstrapData, FinancialScope, PendingMutation } from '../domain/types'
import {
  bumpMutationAttempt,
  clearScopeSnapshots,
  deletePendingMutation,
  enqueueMutation,
  getScopeSnapshot,
  listPendingMutations,
  saveScopeSnapshot,
} from '../offline/db'

export const ACTIVE_FRESH_MS = 2 * 60 * 1000
export const PREFETCH_FRESH_MS = 15 * 60 * 1000
export const MAX_MUTATION_ATTEMPTS = 4

const inflight = new Map<FinancialScope, Promise<BootstrapData>>()
let flushing = false

const now = () => Date.now()
const mutationId = () => `${now().toString(36)}-${crypto.randomUUID()}`

function rememberOwner(data: BootstrapData) {
  const known = localStorage.getItem('ritmo:cache-owner')
  if (known && known !== data.profile.id) void clearScopeSnapshots()
  localStorage.setItem('ritmo:cache-owner', data.profile.id)
}

async function fetchAndCache(scope: FinancialScope): Promise<BootstrapData> {
  const existing = inflight.get(scope)
  if (existing) return existing
  const request = fetchBootstrap(scope)
    .then(async (data) => {
      rememberOwner(data)
      await saveScopeSnapshot({ key: scope, data, savedAt: now(), version: 1 })
      return data
    })
    .finally(() => inflight.delete(scope))
  inflight.set(scope, request)
  return request
}

export async function loadScope(scope: FinancialScope, options: { forceNetwork?: boolean } = {}): Promise<{ data: BootstrapData; source: 'cache' | 'network'; stale: boolean }> {
  let cached = await getScopeSnapshot(scope)
  const expectedOwner = localStorage.getItem('ritmo:cache-owner')
  if (cached && expectedOwner && cached.data.profile.id !== expectedOwner) {
    await clearScopeSnapshots(); cached = null
  }
  const online = navigator.onLine
  const fresh = cached ? now() - cached.savedAt < ACTIVE_FRESH_MS : false

  if (cached && !options.forceNetwork) {
    if (online && !fresh) void fetchAndCache(scope)
    return { data: cached.data, source: 'cache', stale: !fresh }
  }
  if (online) {
    try {
      const data = await fetchAndCache(scope)
      return { data, source: 'network', stale: false }
    } catch (error) {
      if (cached) return { data: cached.data, source: 'cache', stale: true }
      throw error
    }
  }
  if (cached) return { data: cached.data, source: 'cache', stale: true }
  throw new Error('Abra o Ritmo uma vez com internet para preparar o acesso offline.')
}

export async function refreshScope(scope: FinancialScope) {
  return (await loadScope(scope, { forceNetwork: true })).data
}

export async function invalidateFinancialCache() {
  await clearScopeSnapshots()
  inflight.clear()
}

export async function prefetchOtherScope(scope: FinancialScope): Promise<void> {
  if (!navigator.onLine) return
  const other: FinancialScope = scope === 'personal' ? 'shared' : 'personal'
  const cached = await getScopeSnapshot(other)
  if (cached && now() - cached.savedAt < PREFETCH_FRESH_MS) return
  const run = () => void fetchAndCache(other).catch(() => undefined)
  const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(run, { timeout: 1500 }); else globalThis.setTimeout(run, 600)
}

export async function changeScope(scope: FinancialScope): Promise<BootstrapData> {
  const local = await loadScope(scope)
  if (navigator.onLine) void persistScope(scope).catch(() => undefined)
  void prefetchOtherScope(scope)
  return local.data
}

export async function submitMutation(path: string, method: PendingMutation['method'], body?: unknown): Promise<{ queued: boolean }> {
  if (navigator.onLine) {
    try { await mutate(path, method, body); return { queued: false } }
    catch (error) { if (!(error instanceof TypeError)) throw error }
  }
  await enqueueMutation({ id: mutationId(), path, method, body, createdAt: now(), attempts: 0 })
  return { queued: true }
}

export async function flushPendingMutations(): Promise<number> {
  if (flushing || !navigator.onLine) return 0
  flushing = true
  let completed = 0
  try {
    const items = await listPendingMutations(20)
    for (const item of items) {
      try {
        await mutate(item.path, item.method, item.body)
        await deletePendingMutation(item.id)
        completed += 1
      } catch (error) {
        if (error instanceof TypeError && item.attempts + 1 < MAX_MUTATION_ATTEMPTS) await bumpMutationAttempt(item)
        else await deletePendingMutation(item.id)
        break
      }
    }
    if (completed) {
      await clearScopeSnapshots()
      window.dispatchEvent(new CustomEvent('ritmo:synced', { detail: { completed } }))
    }
  } finally { flushing = false }
  return completed
}

export function installLowConsumptionSync(): () => void {
  const onOnline = () => void flushPendingMutations()
  window.addEventListener('online', onOnline)
  return () => window.removeEventListener('online', onOnline)
}
