import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api, persistAuth } from './api';
import { hasStoredSession, isNativeApp, isNativeBiometricEnabled, setNativeBiometricEnabled } from './authStorage';

let deferredInstallPrompt: any = null;
const installListeners = new Set<() => void>();
function emitInstallAvailability(){ for(const listener of installListeners) listener(); }

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  emitInstallAvailability();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  emitInstallAvailability();
});

export { isNativeApp };
export function isBiometricsAvailable() { return isNativeApp() || browserSupportsWebAuthn(); }

export async function getBiometricAvailability() {
  if (isNativeApp()) {
    const { checkStatus } = await import('@tauri-apps/plugin-biometric');
    const info = await checkStatus();
    return {
      available: Boolean(info.isAvailable),
      strongAvailable: Boolean(info.isAvailable),
      reason: info.error || '',
      code: info.errorCode || '',
    };
  }
  if (!browserSupportsWebAuthn()) return { available:false, strongAvailable:false, reason:'WebAuthn indisponível.', code:'webauthnUnavailable' };
  const available = await platformAuthenticatorIsAvailable().catch(() => false);
  return { available, strongAvailable:available, reason:available?'':'Autenticador biométrico do aparelho indisponível.', code:available?'':'platformAuthenticatorUnavailable' };
}

export async function subscribeBiometricAvailability(listener: (available:boolean) => void) {
  if (!isNativeApp()) return () => {};
  try {
    const status = await getBiometricAvailability();
    listener(status.available);
  } catch {
    listener(false);
  }
  return () => {};
}

async function nativeBiometricPrompt(reason: string) {
  const { authenticate, checkStatus } = await import('@tauri-apps/plugin-biometric');
  const availability = await checkStatus();
  if (!availability.isAvailable) throw new Error(availability.error || 'Nenhuma biometria compatível está cadastrada neste aparelho.');
  await authenticate(reason, {
    allowDeviceCredential: true,
    cancelTitle: 'Cancelar',
    fallbackTitle: 'Usar código do aparelho',
    title: 'Ritmo',
    subtitle: reason,
    confirmationRequired: false,
  });
}

export async function shouldGateNativeSession() {
  return isNativeApp() && await isNativeBiometricEnabled() && await hasStoredSession();
}

export async function unlockNativeSession() {
  if (!isNativeApp()) return false;
  await nativeBiometricPrompt('Confirme sua identidade para abrir o Ritmo');
  return true;
}

export async function registerBiometrics() {
  if (isNativeApp()) {
    await nativeBiometricPrompt('Confirme sua identidade para ativar a biometria no Ritmo');
    await setNativeBiometricEnabled(true);
    return { verified: true, native: true };
  }
  if (!browserSupportsWebAuthn()) throw new Error('Biometria/Passkey não é suportada neste navegador.');
  const optionsJSON = await api.passkeyRegistrationOptions();
  const credential = await startRegistration({ optionsJSON });
  const result = await api.passkeyRegistrationVerify(credential);
  return { ...result, native: false };
}

export async function loginWithBiometrics(username: string) {
  if (isNativeApp()) {
    if (!(await isNativeBiometricEnabled())) throw new Error('Ative a biometria primeiro em Perfil > Segurança.');
    if (!(await hasStoredSession())) throw new Error('Sua sessão biométrica expirou. Entre com usuário, senha e, se solicitado, o código de recuperação.');
    await nativeBiometricPrompt('Confirme sua identidade para entrar no Ritmo');
    const session = await api.session();
    if (!session.authenticated) throw new Error('Sua sessão biométrica expirou. Entre novamente com sua senha.');
    return { mode: 'native' as const, session };
  }
  if (!browserSupportsWebAuthn()) throw new Error('Biometria/Passkey não é suportada neste navegador.');
  if (!username.trim()) throw new Error('Informe o usuário antes de usar a biometria.');
  const optionsJSON = await api.passkeyAuthenticationOptions(username);
  const credential = await startAuthentication({ optionsJSON });
  const auth = await api.passkeyAuthenticationVerify({ username, credential });
  await persistAuth(auth);
  return { mode: 'web' as const, auth };
}

function filePicker(accept: string, capture?: string): Promise<File> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  if (capture) input.setAttribute('capture', capture);
  return new Promise((resolve, reject) => {
    input.onchange = () => {
      const file = input.files?.[0];
      file ? resolve(file) : reject(new Error('Nenhum arquivo selecionado.'));
    };
    input.click();
  });
}

export async function capturePhoto(): Promise<File> {
  return filePicker('image/*', 'environment');
}

export async function pickFile(accept = 'image/*,application/pdf'): Promise<File> {
  return filePicker(accept);
}

export async function getCurrentPosition(options: PositionOptions = { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 }) {
  if (isNativeApp()) {
    const { checkPermissions, requestPermissions, getCurrentPosition: nativePosition } = await import('@tauri-apps/plugin-geolocation');
    let permission = await checkPermissions();
    if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') {
      permission = await requestPermissions(['location']);
    }
    if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') throw new Error('Permissão de localização não concedida.');
    return nativePosition({
      enableHighAccuracy: options.enableHighAccuracy,
      timeout: options.timeout,
      maximumAge: options.maximumAge,
    });
  }
  if (!navigator.geolocation) throw new Error('Geolocalização indisponível.');
  return new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

export async function share(data: ShareData) {
  if (!navigator.share) throw new Error('Compartilhamento nativo indisponível.');
  await navigator.share(data);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePushNotifications() {
  if (isNativeApp()) {
    const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (!granted) throw new Error('Permissão de notificações não concedida.');
    sendNotification({ title: 'Ritmo', body: 'Notificações ativadas com sucesso.' });
    return { mode: 'native' as const };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push não é suportado neste aparelho.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificações não concedida.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.getVapidKey();
  const current = await reg.pushManager.getSubscription();
  const subscription = current || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  await api.savePushSubscription(subscription.toJSON());
  return { mode: 'web' as const, subscription };
}

export async function scheduleNativeDueNotification(_id: number, title: string, body: string, at: Date) {
  if (!isNativeApp() || at.getTime() <= Date.now()) return false;
  const { isPermissionGranted, requestPermission, sendNotification, Schedule } = await import('@tauri-apps/plugin-notification');
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === 'granted';
  if (!granted) return false;
  sendNotification({ title, body, schedule: Schedule.at(at) });
  return true;
}

export async function installPWA() {
  if (isNativeApp()) return false;
  if (!deferredInstallPrompt) return false;
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  return choice.outcome === 'accepted';
}

export function canInstallPWA() { return !isNativeApp() && Boolean(deferredInstallPrompt); }
export function subscribePWAInstallAvailability(listener: () => void) {
  installListeners.add(listener);
  return () => { installListeners.delete(listener); };
}
