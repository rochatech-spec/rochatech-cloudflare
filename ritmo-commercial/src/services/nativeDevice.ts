import { Capacitor } from '@capacitor/core';
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api, persistAuth } from './api';
import { hasStoredSession, isNativeBiometricEnabled, setNativeBiometricEnabled } from './authStorage';

let deferredInstallPrompt: any = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

export function isNativeApp() { return Capacitor.isNativePlatform(); }
export function isBiometricsAvailable() { return isNativeApp() || browserSupportsWebAuthn(); }

async function nativeBiometricPrompt(reason: string) {
  const { BiometricAuth, AndroidBiometryStrength } = await import('@aparajita/capacitor-biometric-auth');
  const availability = await BiometricAuth.checkBiometry();
  if (!availability.isAvailable) throw new Error('Nenhuma biometria compatível está cadastrada neste aparelho.');
  await BiometricAuth.authenticate({
    reason,
    cancelTitle: 'Cancelar',
    allowDeviceCredential: true,
    iosFallbackTitle: 'Usar código do aparelho',
    androidTitle: 'Ritmo',
    androidSubtitle: reason,
    androidConfirmationRequired: false,
    androidBiometryStrength: AndroidBiometryStrength.strong,
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

function dataUrlToFile(dataUrl: string, filename: string, mime: string) {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], filename, { type: mime });
}

export async function capturePhoto(): Promise<File> {
  if (isNativeApp()) {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      quality: 88,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      correctOrientation: true,
    });
    if (!photo.base64String) throw new Error('A câmera não retornou uma imagem.');
    const ext = photo.format === 'png' ? 'png' : 'jpeg';
    return dataUrlToFile(photo.base64String, `ritmo-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`, `image/${ext}`);
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture', 'environment');
  return new Promise((resolve, reject) => {
    input.onchange = () => {
      const file = input.files?.[0];
      file ? resolve(file) : reject(new Error('Nenhuma imagem selecionada.'));
    };
    input.click();
  });
}

export async function pickFile(accept = 'image/*,application/pdf'): Promise<File> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  return new Promise((resolve, reject) => {
    input.onchange = () => {
      const file = input.files?.[0];
      file ? resolve(file) : reject(new Error('Nenhum arquivo selecionado.'));
    };
    input.click();
  });
}

export async function getCurrentPosition(options: PositionOptions = { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 }) {
  if (isNativeApp()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    let permission = await Geolocation.checkPermissions();
    if (permission.location !== 'granted') permission = await Geolocation.requestPermissions();
    if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') throw new Error('Permissão de localização não concedida.');
    return Geolocation.getCurrentPosition({
      enableHighAccuracy: options.enableHighAccuracy,
      timeout: options.timeout,
      maximumAge: options.maximumAge,
    });
  }
  if (!navigator.geolocation) throw new Error('Geolocalização indisponível.');
  return new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

export async function share(data: ShareData) {
  if (isNativeApp()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title: data.title, text: data.text, url: data.url });
    return;
  }
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
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') throw new Error('Permissão de notificações não concedida.');
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.max(1, Math.floor(Date.now() / 1000) % 2_000_000_000),
        title: 'Ritmo',
        body: 'Notificações ativadas com sucesso.',
        schedule: { at: new Date(Date.now() + 1200) },
        extra: { route: 'home' },
      }],
    });
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

export async function scheduleNativeDueNotification(id: number, title: string, body: string, at: Date) {
  if (!isNativeApp() || at.getTime() <= Date.now()) return false;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.schedule({ notifications: [{ id, title, body, schedule: { at }, extra: { route: 'debts' } }] });
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
