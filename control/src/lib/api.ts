const TOKEN_KEY = 'rt_session_v2'
export const authStore = {
  get: () => localStorage.getItem(TOKEN_KEY) || '',
  set: (token:string) => token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export async function api<T=any>(path:string, init:RequestInit={}) : Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) headers.set('Content-Type','application/json')
  const token = authStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(path, {...init, headers})
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || body?.message || `Erro ${res.status}`)
  return body as T
}
