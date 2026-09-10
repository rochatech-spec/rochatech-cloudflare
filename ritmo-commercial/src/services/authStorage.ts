const SESSION_KEY = 'ritmo.session.v1';
const DEVICE_KEY = 'ritmo.device.v1';
const REMEMBERED_USER_KEY = 'ritmo.remembered-user.v1';
const REMEMBER_USER_ENABLED_KEY = 'ritmo.remember-user.enabled.v1';

type Tokens = { sessionToken: string; deviceToken: string };

function read(key: string) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function write(key: string, value?: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {}
}

export async function getAuthTokens(): Promise<Tokens> {
  return { sessionToken: read(SESSION_KEY), deviceToken: read(DEVICE_KEY) };
}

export async function hasStoredSession() {
  return Boolean(read(SESSION_KEY).trim());
}

export async function setSessionToken(token?: string) {
  write(SESSION_KEY, token);
}

export async function setDeviceToken(token?: string) {
  write(DEVICE_KEY, token);
}

export async function clearSessionToken() {
  write(SESSION_KEY);
}

export function getRememberedUsername() {
  if (read(REMEMBER_USER_ENABLED_KEY) !== '1') return '';
  return read(REMEMBERED_USER_KEY).trim().toLowerCase();
}

export function isRememberUserEnabled() {
  return read(REMEMBER_USER_ENABLED_KEY) === '1';
}

export function setRememberedUsername(username?: string) {
  const clean = String(username || '').trim().toLowerCase();
  if (clean) {
    write(REMEMBERED_USER_KEY, clean);
    write(REMEMBER_USER_ENABLED_KEY, '1');
  } else {
    write(REMEMBERED_USER_KEY);
    write(REMEMBER_USER_ENABLED_KEY);
  }
}
