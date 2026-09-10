import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api, persistAuth } from './api';
import { hasStoredSession, isNativeApp, isNativeBiometricEnabled, setNativeBiometricEnabled } from './authStorage';
import type { Bootstrap, Profile } from '../types';

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


function notificationId(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 2_000_000_000) || 1;
}

function reminderDate(date: string, hour = 8) {
  const target = new Date(`${date}T${String(hour).padStart(2,'0')}:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  if (target.getTime() <= Date.now()) {
    const today = new Date();
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0,10);
    if (date !== localToday) return null;
    return new Date(Date.now() + 2 * 60 * 1000);
  }
  return target;
}

export async function syncNativeFinancialNotifications(data: Bootstrap, profile: Profile) {
  if (!isNativeApp()) return { scheduled: 0 };
  const enabled = Boolean(profile.dueNotifications || profile.goalNotifications);
  if (!enabled) return { scheduled: 0 };

  const reminders: Array<{ id:number; title:string; body:string; at:Date }> = [];
  if (profile.dueNotifications) {
    for (const tx of data.transactions) {
      if (tx.status !== 'pending') continue;
      const at = reminderDate(tx.date, 8);
      if (!at) continue;
      reminders.push({
        id: notificationId(`tx:${tx.id}:${tx.date}`),
        title: tx.value >= 0 ? 'Recebimento previsto hoje' : 'Pagamento previsto hoje',
        body: `${tx.desc} • ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Math.abs(tx.value))}`,
        at,
      });
    }
    for (const debt of data.debts) {
      if (debt.remaining <= 0) continue;
      const at = reminderDate(debt.due, 8);
      if (!at) continue;
      reminders.push({
        id: notificationId(`debt:${debt.id}:${debt.due}`),
        title: 'Conta vence hoje',
        body: `${debt.name} • ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(debt.remaining)}`,
        at,
      });
    }
  }
  if (profile.goalNotifications) {
    for (const goal of data.goals) {
      if (!goal.due || goal.saved >= goal.target) continue;
      const at = reminderDate(goal.due, 9);
      if (!at) continue;
      reminders.push({
        id: notificationId(`goal:${goal.id}:${goal.due}`),
        title: 'Prazo de meta hoje',
        body: `${goal.name} • faltam ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Math.max(0,goal.target-goal.saved))}`,
        at,
      });
    }
  }

  const signature = JSON.stringify(reminders.map(r => [r.id, r.at.getTime(), r.title, r.body]));
  if (localStorage.getItem('ritmo.native-reminders.v2') === signature) {
    return { scheduled: reminders.length };
  }

  const { cancelAll, sendNotification, Schedule, isPermissionGranted } = await import('@tauri-apps/plugin-notification');
  if (!(await isPermissionGranted())) return { scheduled: 0 };
  await cancelAll();
  for (const reminder of reminders) {
    sendNotification({
      id: reminder.id,
      title: reminder.title,
      body: reminder.body,
      schedule: Schedule.at(reminder.at, false, true),
      autoCancel: true,
    });
  }
  localStorage.setItem('ritmo.native-reminders.v2', signature);
  return { scheduled: reminders.length };
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
