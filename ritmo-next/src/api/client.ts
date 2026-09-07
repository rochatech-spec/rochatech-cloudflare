import type { BootstrapData, FinancialScope, WalletReport } from '../domain/types'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '')

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error?: unknown }).error || 'Não foi possível concluir a ação.')
      : 'Não foi possível concluir a ação.'
    throw new ApiError(message, response.status)
  }

  return payload as T
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers || {}),
    },
  })
  return parseResponse<T>(response)
}

export async function fetchBootstrap(scope: FinancialScope, signal?: AbortSignal): Promise<BootstrapData> {
  return jsonRequest<BootstrapData>(`/api/bootstrap?scope=${scope}`, { signal })
}

export async function login(username: string, password: string): Promise<void> {
  await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function register(name: string, username: string, password: string): Promise<void> {
  await jsonRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, username, password }),
  })
}

export async function logout(): Promise<void> {
  await jsonRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) })
}

export async function persistScope(scope: FinancialScope): Promise<void> {
  await jsonRequest('/api/sharing/scope', {
    method: 'POST',
    body: JSON.stringify({ scope }),
  })
}

export async function mutate<T = { ok: true }>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  return jsonRequest<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function fetchReport(scope: FinancialScope, from: string, to: string): Promise<WalletReport> {
  const params = new URLSearchParams({ scope, from, to })
  return jsonRequest<WalletReport>(`/api/wallet/report?${params.toString()}`)
}

export function scopePrefix(scope: FinancialScope) {
  return scope === 'shared' ? '/api/shared' : '/api'
}
