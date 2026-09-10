import { Capacitor } from '@capacitor/core';

const SESSION_KEY = 'ritmo.session.v1';
const DEVICE_KEY = 'ritmo.device.v1';
const BIOMETRIC_KEY = 'ritmo.biometric.enabled.v1';
const LAST_USER_KEY = 'ritmo.last-user.v1';

type Tokens = { sessionToken: string; deviceToken: string };
let nativeReady: Promise<any> | null = null;

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

async function secureStorage() {
  if (!isNativeApp()) return null;
  if (!nativeReady) {
    nativeReady = import('@aparajita/capacitor-secure-storage').then(async ({ SecureStorage }) => {
      await SecureStorage.setKeyPrefix('ritmo_');
      return SecureStorage;
    });
  }
  return nativeReady;
}

async function read(key: string): Promise<string> {
  if (!isNativeApp()) return localStorage.getItem(key) || '';
  const storage = await secureStorage();
  const value = await storage.get(key);
  return typeof value === 'string' ? value : '';
}

async function write(key: string, value?: string) {
  if (!isNativeApp()) {
    value ? localStorage.setItem(key, value) : localStorage.removeItem(key);
    return;
  }
  const storage = await secureStorage();
  if (value) await storage.set(key, value);
  else await storage.remove(key);
}

export async function getAuthTokens(): Promise<Tokens> {
  const [sessionToken, deviceToken] = await Promise.all([read(SESSION_KEY), read(DEVICE_KEY)]);
  return { sessionToken, deviceToken };
}

export async function hasStoredSession() {
  return Boolean((await read(SESSION_KEY)).trim());
}

export async function setSessionToken(token?: string) {
  await write(SESSION_KEY, token);
}

export async function setDeviceToken(token?: string) {
  await write(DEVICE_KEY, token);
}

export async function clearSessionToken() {
  await write(SESSION_KEY, undefined);
}

export async function setLastUsername(username: string) {
  await write(LAST_USER_KEY, username.trim().toLowerCase());
}

export async function getLastUsername() {
  return read(LAST_USER_KEY);
}

export async function setNativeBiometricEnabled(enabled: boolean) {
  await write(BIOMETRIC_KEY, enabled ? '1' : undefined);
}

export async function isNativeBiometricEnabled() {
  return isNativeApp() && (await read(BIOMETRIC_KEY)) === '1';
}
