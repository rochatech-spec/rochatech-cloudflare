import { Capacitor } from '@capacitor/core';
import type { Bootstrap, Debt, EventItem, Goal, Profile, Transaction, AuthUser, StoredFile } from '../types';
import { clearSessionToken, getAuthTokens, setDeviceToken as persistDeviceToken, setLastUsername, setSessionToken as persistSessionToken } from './authStorage';

const API_URL = (import.meta.env.VITE_API_URL || (Capacitor.isNativePlatform() ? 'https://ritmo-commercial.pages.dev/api' : '/api')).replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.details = details;
  }
}

export async function setDeviceToken(token?: string) { await persistDeviceToken(token); }
export async function setSessionToken(token?: string) { await persistSessionToken(token); }
export async function clearLocalAuth() { await clearSessionToken(); }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const method = String(init.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !headers.has('X-Idempotency-Key')) {
    headers.set('X-Idempotency-Key', crypto.randomUUID());
  }
  const { sessionToken, deviceToken } = await getAuthTokens();
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  if (deviceToken) headers.set('X-Device-Token', deviceToken);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, cache: 'no-store' });
  } catch (error) {
    throw new ApiError('Sem conexão com o servidor. Seus dados poderão ser sincronizados quando a conexão voltar.', 0, 'NETWORK_ERROR', error);
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.message || `Falha na requisição (${response.status}).`, response.status, payload?.code, payload);
  }
  return payload as T;
}

export type AuthResponse = { user: AuthUser; sessionToken: string; deviceToken: string };
export type RegistrationResponse = { user: AuthUser; activationToken: string; recoveryCode: string };
export type DeviceVerificationResponse = { requiresDeviceVerification: true; verificationId: string; username: string };
export type LoginResponse = AuthResponse | DeviceVerificationResponse;

export async function persistAuth(auth: AuthResponse) {
  await Promise.all([
    setSessionToken(auth.sessionToken),
    setDeviceToken(auth.deviceToken),
    setLastUsername(auth.user.username),
  ]);
}

export const api = {
  session: () => request<{ authenticated: boolean; user?: AuthUser }>('/auth/session'),
  register: (body: { displayName: string; password: string }) => request<RegistrationResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  confirmRegistration: (activationToken: string) => request<AuthResponse>('/auth/register/confirm', { method: 'POST', body: JSON.stringify({ activationToken }) }),
  login: async (body: { username: string; password: string }) => {
    try {
      return await request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 428 &&
        error.details &&
        typeof error.details === 'object' &&
        (error.details as DeviceVerificationResponse).requiresDeviceVerification === true &&
        typeof (error.details as DeviceVerificationResponse).verificationId === 'string'
      ) {
        return error.details as DeviceVerificationResponse;
      }
      throw error;
    }
  },
  authorizeDevice: (body: { verificationId: string; recoveryCode: string }) => request<AuthResponse>('/auth/device/verify', { method: 'POST', body: JSON.stringify(body) }),
  recover: (body: { username: string; recoveryCode: string; newPassword: string }) => request<AuthResponse>('/auth/recover', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  bootstrap: () => request<Bootstrap>('/bootstrap'),
  saveProfile: (profile: Partial<Pick<Profile,'displayName'|'theme'|'dueNotifications'|'goalNotifications'>>) => request<Profile>('/profile', { method: 'PATCH', body: JSON.stringify(profile) }),
  changePassword: (body: { currentPassword: string; newPassword: string }) => request<AuthResponse>('/auth/password', { method: 'PUT', body: JSON.stringify(body) }),
  rotateRecoveryCode: (currentPassword: string) => request<{ recoveryCode: string }>('/auth/recovery-code', { method: 'POST', body: JSON.stringify({ currentPassword }) }),
  listPasskeys: () => request<Array<{ id: string; createdAt: string; name: string }>>('/auth/passkeys'),
  passkeyRegistrationOptions: () => request<any>('/auth/passkeys/register/options', { method: 'POST' }),
  passkeyRegistrationVerify: (credential: unknown) => request<{ verified: boolean }>('/auth/passkeys/register/verify', { method: 'POST', body: JSON.stringify(credential) }),
  passkeyAuthenticationOptions: (username: string) => request<any>('/auth/passkeys/login/options', { method: 'POST', body: JSON.stringify({ username }) }),
  passkeyAuthenticationVerify: (body: { username: string; credential: unknown }) => request<AuthResponse>('/auth/passkeys/login/verify', { method: 'POST', body: JSON.stringify(body) }),
  createTransaction: (item: Omit<Transaction, 'id'>) => request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(item) }),
  deleteTransaction: (id: string) => request<void>(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createDebt: (item: Omit<Debt, 'id'>) => request<Debt>('/debts', { method: 'POST', body: JSON.stringify(item) }),
  payDebt: (id: string, value: number, date?: string) => request<Debt>(`/debts/${encodeURIComponent(id)}/payments`, { method: 'POST', body: JSON.stringify({ value, date }) }),
  createGoal: (item: Omit<Goal, 'id'>) => request<Goal>('/goals', { method: 'POST', body: JSON.stringify(item) }),
  addGoalValue: (id: string, value: number) => request<Goal>(`/goals/${encodeURIComponent(id)}/contributions`, { method: 'POST', body: JSON.stringify({ value }) }),
  createEvent: (item: Omit<EventItem, 'id'>) => request<EventItem>('/events', { method: 'POST', body: JSON.stringify(item) }),
  deleteEvent: (id: string) => request<void>(`/events/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getVapidKey: () => request<{ publicKey: string }>('/push/vapid-public-key'),
  savePushSubscription: (subscription: PushSubscriptionJSON) => request<{ ok: true }>('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  sendTestPush: () => request<{ delivered: number }>('/push/test', { method: 'POST' }),
  listFiles: () => request<StoredFile[]>('/files'),
  uploadFile: async (file: File) => {
    const form = new FormData(); form.append('file', file);
    return request<{ id: string; name: string; contentType: string; size: number }>('/files', { method: 'POST', body: form });
  },
  deleteFile: (id: string) => request<void>(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getFile: async (id: string) => {
    const headers = new Headers();
    const { sessionToken, deviceToken } = await getAuthTokens();
    if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
    if (deviceToken) headers.set('X-Device-Token', deviceToken);
    let r: Response;
    try { r = await fetch(`${API_URL}/files/${encodeURIComponent(id)}`, { headers, cache: 'no-store' }); }
    catch (error) { throw new ApiError('Sem conexão com o servidor.', 0, 'NETWORK_ERROR', error); }
    if (!r.ok) throw new ApiError('Não foi possível baixar o arquivo.', r.status);
    return r.blob();
  },
};
