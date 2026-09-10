import { isTauri } from '@tauri-apps/api/core';

const SESSION_KEY = 'ritmo.session.v1';
const DEVICE_KEY = 'ritmo.device.v1';
const BIOMETRIC_KEY = 'ritmo.biometric.enabled.v1';
const LAST_USER_KEY = 'ritmo.last-user.v1';

type Tokens = { sessionToken: string; deviceToken: string };
type NativeVault = { stronghold: any; store: any };
let nativeReady: Promise<NativeVault> | null = null;

export function isNativeApp() {
  return isTauri();
}

async function secureStorage(): Promise<NativeVault | null> {
  if (!isNativeApp()) return null;
  if (!nativeReady) {
    nativeReady = (async () => {
      const [{ Stronghold }, { appDataDir }] = await Promise.all([
        import('@tauri-apps/plugin-stronghold'),
        import('@tauri-apps/api/path'),
      ]);
      const base = await appDataDir();
      const vaultPath = `${base.replace(/[\\/]$/, '')}/ritmo-auth.hold`;
      const stronghold = await Stronghold.load(vaultPath, 'ritmo-local-vault-v1');
      let client: any;
      try {
        client = await stronghold.loadClient('ritmo-auth');
      } catch {
        client = await stronghold.createClient('ritmo-auth');
      }
      return { stronghold, store: client.getStore() };
    })();
  }
  return nativeReady;
}

async function read(key: string): Promise<string> {
  if (!isNativeApp()) return localStorage.getItem(key) || '';
  const vault = await secureStorage();
  const value = await vault!.store.get(key);
  return value ? new TextDecoder().decode(new Uint8Array(value)) : '';
}

async function write(key: string, value?: string) {
  if (!isNativeApp()) {
    value ? localStorage.setItem(key, value) : localStorage.removeItem(key);
    return;
  }
  const vault = await secureStorage();
  if (value) {
    await vault!.store.insert(key, Array.from(new TextEncoder().encode(value)));
  } else {
    await vault!.store.remove(key);
  }
  await vault!.stronghold.save();
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
