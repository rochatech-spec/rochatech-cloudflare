import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api, persistAuth } from './api';

let deferredInstallPrompt: any = null;
const BIOMETRIC_ENABLED_KEY = 'ritmo.biometric.enabled.v1';
const BIOMETRIC_REGISTERED_KEY = 'ritmo.biometric.registered.v1';
const installListeners = new Set<() => void>();
function emitInstallAvailability(){ for (const listener of installListeners) listener(); }

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  emitInstallAvailability();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  emitInstallAvailability();
});

export function isBiometricsAvailable() {
  return browserSupportsWebAuthn();
}

export async function getBiometricAvailability() {
  if (!browserSupportsWebAuthn()) {
    try { sessionStorage.setItem('ritmo.biometric.available', '0'); } catch {}
    return { available:false, strongAvailable:false, reason:'WebAuthn indisponível.', code:'webauthnUnavailable' };
  }
  const available = await platformAuthenticatorIsAvailable().catch(() => false);
  try { sessionStorage.setItem('ritmo.biometric.available', available ? '1' : '0'); } catch {}
  return {
    available,
    strongAvailable: available,
    reason: available ? '' : 'Autenticador biométrico do aparelho indisponível.',
    code: available ? '' : 'platformAuthenticatorUnavailable',
  };
}

export function isBiometricLoginEnabled() {
  try { return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === '1'; } catch { return false; }
}

export function setBiometricLoginEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(BIOMETRIC_ENABLED_KEY, '1');
    else localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  } catch {}
}

function isBiometricCredentialRegistered() {
  try { return localStorage.getItem(BIOMETRIC_REGISTERED_KEY) === '1'; } catch { return false; }
}

export async function registerBiometrics() {
  if (!browserSupportsWebAuthn()) throw new Error('Biometria não é suportada neste navegador.');
  if (isBiometricCredentialRegistered()) {
    setBiometricLoginEnabled(true);
    return { verified:true };
  }
  const optionsJSON = await api.passkeyRegistrationOptions();
  const credential = await startRegistration({ optionsJSON });
  const result = await api.passkeyRegistrationVerify(credential);
  if (result.verified) {
    try { localStorage.setItem(BIOMETRIC_REGISTERED_KEY, '1'); } catch {}
    setBiometricLoginEnabled(true);
  }
  return result;
}

export async function loginWithBiometrics(username: string) {
  const clean = username.trim().toLowerCase();
  if (!browserSupportsWebAuthn()) throw new Error('Biometria não é suportada neste navegador.');
  if (!clean) throw new Error('Ative “Lembrar usuário” para entrar com biometria sem digitar o login.');
  const optionsJSON = await api.passkeyAuthenticationOptions(clean);
  const credential = await startAuthentication({ optionsJSON });
  const auth = await api.passkeyAuthenticationVerify({ username: clean, credential });
  await persistAuth(auth);
  return auth;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function getPushNotificationState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Notificações não são suportadas neste aparelho.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificações não concedida.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.getVapidKey();
  const current = await reg.pushManager.getSubscription();
  const subscription = current || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await api.savePushSubscription(subscription.toJSON());
  return subscription;
}

export async function disablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return true;
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return true;
  try { await api.removePushSubscription(subscription.endpoint); } catch {}
  await subscription.unsubscribe();
  return true;
}

export async function installPWA() {
  if (!deferredInstallPrompt) return false;
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  return choice.outcome === 'accepted';
}

export function canInstallPWA() {
  return Boolean(deferredInstallPrompt);
}

export function subscribePWAInstallAvailability(listener: () => void) {
  installListeners.add(listener);
  return () => { installListeners.delete(listener); };
}
