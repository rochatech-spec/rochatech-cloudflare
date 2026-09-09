import type { BootstrapData, QueuedMutation } from '../types'
import { cacheBootstrap, enqueueMutation, listOutbox, readCachedBootstrap, removeOutbox } from './offline'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload ? String((payload as { error: unknown }).error) : String(payload || 'Erro na requisição')
    throw new ApiError(response.status, message)
  }
  return payload as T
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  })
  return parseResponse<T>(response)
}

export async function getBootstrap(workspaceId?: string): Promise<BootstrapData> {
  const key = workspaceId || 'default'
  const url = workspaceId ? `/api/bootstrap?workspace=${encodeURIComponent(workspaceId)}` : '/api/bootstrap'
  if (navigator.onLine) {
    try {
      const data = await api<BootstrapData>(url)
      await cacheBootstrap(data.active_workspace.id, data)
      if (workspaceId !== data.active_workspace.id) await cacheBootstrap(key, data)
      return data
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error
    }
  }
  const cached = await readCachedBootstrap(key)
  if (cached) return cached
  throw new ApiError(503, 'Sem conexão e ainda não há dados salvos neste aparelho.')
}

export async function mutate<T>(method: QueuedMutation['method'], path: string, body?: unknown, options: { version?: number; queueOffline?: boolean } = {}): Promise<{ queued: boolean; data?: T }> {
  const operationId = crypto.randomUUID()
  const headers: Record<string, string> = { 'x-operation-id': operationId }
  if (options.version != null) headers['x-entity-version'] = String(options.version)

  const send = async () => api<T>(path, { method, body: body == null ? undefined : JSON.stringify(body), headers })
  if (navigator.onLine) {
    try {
      return { queued: false, data: await send() }
    } catch (error) {
      if (error instanceof ApiError && [400, 401, 403, 404, 409, 413, 422].includes(error.status)) throw error
      if (options.queueOffline === false) throw error
    }
  }

  await enqueueMutation({ id: operationId, method, path, body, headers, createdAt: Date.now() })
  return { queued: true }
}

export async function flushOutbox() {
  if (!navigator.onLine) return 0
  let count = 0
  for (const item of await listOutbox()) {
    try {
      await api(item.path, { method: item.method, body: item.body == null ? undefined : JSON.stringify(item.body), headers: item.headers })
      await removeOutbox(item.id)
      count += 1
    } catch (error) {
      if (error instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(error.status)) await removeOutbox(item.id)
      else break
    }
  }
  if (count) window.dispatchEvent(new CustomEvent('ritmo:outbox-flushed', { detail: { count } }))
  return count
}

export function installSyncListeners() {
  const sync = () => void flushOutbox()
  window.addEventListener('online', sync)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync() })
  sync()
  return () => window.removeEventListener('online', sync)
}
