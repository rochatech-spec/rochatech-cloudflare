import type { BootstrapData, FinancialScope } from '../domain/types'

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

export async function fetchBootstrap(scope: FinancialScope, signal?: AbortSignal): Promise<BootstrapData> {
  const response = await fetch(`/api/bootstrap?scope=${scope}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  })
  return parseResponse<BootstrapData>(response)
}

export async function persistScope(scope: FinancialScope): Promise<void> {
  const response = await fetch('/api/sharing/scope', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ scope }),
  })
  await parseResponse(response)
}

export async function mutate<T = { ok: true }>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return parseResponse<T>(response)
}
