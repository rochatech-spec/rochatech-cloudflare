export interface Env {
  DB: D1Database
  R2: R2Bucket
  ASSETS: Fetcher
  APP_NAME?: string
  SESSION_TTL_DAYS?: string
}

export type SessionUser = {
  id: string
  username: string
  display_name: string
  avatar_key: string | null
  created_at: string
}

export type WorkspaceRow = { id: string; name: string; type: 'personal' | 'shared'; role: 'owner' | 'member' }

const encoder = new TextEncoder()
export const MAX_JSON = 256 * 1024
export const MAX_FILE = 2 * 1024 * 1024

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } })
}
export function error(message: string, status = 400) { return json({ error: message }, status) }

export function base64url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
export function bytesFromBase64url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}
export function randomToken(bytes = 32) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); return base64url(value) }
export async function sha256(value: string) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))) }
export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytesFromBase64url(salt), iterations: 150_000, hash: 'SHA-256' }, key, 256)
  return base64url(new Uint8Array(bits))
}
export function timingSafeEqual(a: string, b: string) { if (a.length !== b.length) return false; let diff = 0; for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i); return diff===0 }
export function getCookie(request: Request, name: string) { const raw=request.headers.get('cookie')||''; for(const part of raw.split(';')){const [key,...rest]=part.trim().split('=');if(key===name)return decodeURIComponent(rest.join('='))} return null }
export function sessionCookie(token: string, ttlDays: number) { return `ritmo_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttlDays*86400}` }
export function clearSessionCookie() { return 'ritmo_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' }
export async function readJson<T>(request: Request): Promise<T> { const length=Number(request.headers.get('content-length')||0); if(length>MAX_JSON)throw new Error('Payload muito grande.'); return await request.json() as T }
export function normalizeUsername(value: unknown) { return String(value||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,32) }
export function normalizeText(value: unknown, max=120) { return String(value||'').trim().slice(0,max) }
export function cents(value: unknown) { const n=Math.round(Number(value)); return Number.isFinite(n)&&n>=0?n:0 }
export function dateValue(value: unknown, fallback=new Date().toISOString().slice(0,10)) { const text=String(value||'').slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:fallback }
export function rpInfo(request: Request) { const url=new URL(request.url); return { rpID:url.hostname, origin:url.origin } }

export async function getSessionUser(request: Request, env: Env): Promise<SessionUser|null> {
  const token=getCookie(request,'ritmo_session'); if(!token)return null
  const row=await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.avatar_key,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') LIMIT 1`).bind(await sha256(token)).first<SessionUser>()
  return row??null
}
export async function requireUser(request: Request, env: Env) { const user=await getSessionUser(request,env); if(!user)throw json({error:'Sessão expirada. Entre novamente.'},401); return user }
export async function createSession(env: Env, userId: string) {
  const ttlDays=Math.max(1,Math.min(90,Number(env.SESSION_TTL_DAYS||30))),token=randomToken(32),tokenHash=await sha256(token),id=crypto.randomUUID(),expiresAt=new Date(Date.now()+ttlDays*86400_000).toISOString()
  await env.DB.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').bind(id,userId,tokenHash,expiresAt).run()
  return {token,ttlDays}
}
export async function audit(env: Env,userId:string|null,workspaceId:string|null,action:string,resourceType?:string,resourceId?:string,metadata?:unknown){
  await env.DB.prepare('INSERT INTO audit_log(id,user_id,workspace_id,action,resource_type,resource_id,metadata) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,workspaceId,action,resourceType||null,resourceId||null,metadata==null?null:JSON.stringify(metadata)).run()
}
export async function listWorkspaces(env:Env,userId:string){const r=await env.DB.prepare(`SELECT w.id,w.name,w.type,wm.role FROM workspace_members wm JOIN workspaces w ON w.id=wm.workspace_id WHERE wm.user_id=? ORDER BY CASE w.type WHEN 'personal' THEN 0 ELSE 1 END,w.created_at`).bind(userId).all<WorkspaceRow>();return r.results||[]}
export async function resolveWorkspace(env:Env,userId:string,requested?:string|null){const workspaces=await listWorkspaces(env,userId);const active=workspaces.find(w=>w.id===requested)||workspaces.find(w=>w.type===requested)||workspaces[0];if(!active)throw new Error('Nenhum perfil financeiro disponível.');return{workspaces,active}}
export async function ensureWorkspaceAccess(env:Env,userId:string,workspaceId:string){const m=await env.DB.prepare('SELECT role FROM workspace_members WHERE user_id=? AND workspace_id=?').bind(userId,workspaceId).first<{role:string}>();if(!m)throw json({error:'Perfil financeiro não autorizado.'},403);return m}
export async function idempotentExisting(env:Env,table:'transactions'|'goals'|'debts',operationId:string|null){if(!operationId)return null;return env.DB.prepare(`SELECT * FROM ${table} WHERE operation_id=? LIMIT 1`).bind(operationId).first()}
