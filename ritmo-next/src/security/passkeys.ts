import { mutate } from '../api/client'

type JsonObject = Record<string, unknown>
export type DeviceSecurityIcon = 'faceId' | 'fingerprint' | 'shield'
export type DeviceSecurityKind = 'apple-mobile' | 'android' | 'windows' | 'mac' | 'generic'
export type DeviceSecurityPresentation = {
  kind: DeviceSecurityKind
  label: string
  action: string
  description: string
  icon: DeviceSecurityIcon
}

function decode(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const raw = atob(base64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer
}

function encode(value: ArrayBuffer) {
  const bytes = new Uint8Array(value)
  let raw = ''
  bytes.forEach((b) => { raw += String.fromCharCode(b) })
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function credentialJson(credential: PublicKeyCredential) {
  const response = credential.response
  const base: JsonObject = { id: credential.id, rawId: encode(credential.rawId), type: credential.type, clientExtensionResults: credential.getClientExtensionResults() }
  if (response instanceof AuthenticatorAttestationResponse) {
    base.response = { clientDataJSON: encode(response.clientDataJSON), attestationObject: encode(response.attestationObject), transports: response.getTransports?.() || [] }
  } else if (response instanceof AuthenticatorAssertionResponse) {
    base.response = { clientDataJSON: encode(response.clientDataJSON), authenticatorData: encode(response.authenticatorData), signature: encode(response.signature), userHandle: response.userHandle ? encode(response.userHandle) : null }
  }
  return base
}

function creationOptions(raw: JsonObject): PublicKeyCredentialCreationOptions {
  const user = raw.user as { id:string; name:string; displayName:string }
  return {
    ...(raw as unknown as PublicKeyCredentialCreationOptions),
    challenge: decode(String(raw.challenge)),
    user: { ...user, id: decode(user.id) },
    excludeCredentials: ((raw.excludeCredentials || []) as Array<PublicKeyCredentialDescriptor & {id:string}>).map((c)=>({ ...c, id: decode(c.id) })),
    authenticatorSelection: {
      ...((raw.authenticatorSelection||{}) as AuthenticatorSelectionCriteria),
      authenticatorAttachment:'platform',
      residentKey:'preferred',
      requireResidentKey:false,
      userVerification:'required',
    },
    attestation:'none',
    timeout:Math.min(Number(raw.timeout||60000),60000),
  }
}

function requestOptions(raw: JsonObject): PublicKeyCredentialRequestOptions {
  return {
    ...(raw as unknown as PublicKeyCredentialRequestOptions),
    challenge: decode(String(raw.challenge)),
    allowCredentials: ((raw.allowCredentials || []) as Array<PublicKeyCredentialDescriptor & {id:string}>).map((c)=>({ ...c, id: decode(c.id) })),
    userVerification:'required',
    timeout:Math.min(Number(raw.timeout||60000),60000),
  }
}

function appleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function deviceSecurityPresentation(): DeviceSecurityPresentation {
  const ua = navigator.userAgent
  if (appleMobile()) return {
    kind:'apple-mobile',
    label:'Face ID / Touch ID',
    action:'Usar Face ID / Touch ID',
    description:'Confirme pelo Face ID ou Touch ID configurado no aparelho.',
    icon:'faceId',
  }
  if (/Android/i.test(ua)) return {
    kind:'android',
    label:'Biometria do aparelho',
    action:'Usar biometria',
    description:'Use a digital ou o reconhecimento facial configurado no aparelho.',
    icon:'fingerprint',
  }
  if (/Windows/i.test(ua)) return {
    kind:'windows',
    label:'Windows Hello',
    action:'Usar Windows Hello',
    description:'Confirme com o método seguro configurado neste computador.',
    icon:'faceId',
  }
  if (/Mac/i.test(ua)) return {
    kind:'mac',
    label:'Touch ID',
    action:'Usar Touch ID',
    description:'Confirme com o Touch ID deste Mac.',
    icon:'fingerprint',
  }
  return {
    kind:'generic',
    label:'Desbloqueio do aparelho',
    action:'Confirmar no aparelho',
    description:'Use o método seguro configurado neste aparelho.',
    icon:'shield',
  }
}

export function deviceSecurityLabel() { return deviceSecurityPresentation().label }

export async function platformSecurityAvailable() {
  if (!window.PublicKeyCredential || !navigator.credentials?.create || !navigator.credentials?.get) return false
  const checker = PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
  if (typeof checker !== 'function') return true
  try { return Boolean(await checker.call(PublicKeyCredential)) } catch { return false }
}

export function deviceKey(userId:string){return `ritmo:bio:${userId}:verified`}

export function deviceSecurityEnabled(userId:string,count=0){
  if(count<=0)return false
  const raw=localStorage.getItem(deviceKey(userId))
  if(!raw)return false
  try { const parsed=JSON.parse(raw) as {at?:number;credentialId?:string}; return Boolean(parsed?.credentialId) } catch { return false }
}

function friendlySecurityError(error: unknown, mode:'register'|'authenticate') {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError') return new Error(mode==='register'
    ? 'A configuração não foi concluída. Tente novamente quando estiver pronto.'
    : 'A confirmação foi cancelada ou não terminou. Tente novamente ou use sua senha.')
  if (name === 'InvalidStateError') return new Error('Este desbloqueio já está configurado neste aparelho.')
  if (name === 'NotSupportedError') return new Error('Este aparelho não disponibilizou biometria ou desbloqueio seguro para o Ritmo.')
  if (name === 'SecurityError') return new Error('O desbloqueio seguro não pôde ser usado agora. Abra o Ritmo normalmente e tente de novo.')
  if (name === 'AbortError') return new Error('A confirmação foi interrompida. Tente novamente.')
  if (error instanceof Error && error.message) return error
  return new Error(mode==='register'?'Não foi possível configurar o desbloqueio neste aparelho.':'Não foi possível confirmar neste aparelho.')
}

export async function registerDeviceSecurity(userId:string) {
  if (!await platformSecurityAvailable()) throw new Error('A biometria ou o desbloqueio seguro não está disponível neste aparelho.')
  try {
    const raw = await mutate<JsonObject>('/api/webauthn/register/options','POST',{})
    const credential = await navigator.credentials.create({ publicKey: creationOptions(raw) }) as PublicKeyCredential | null
    if (!credential) throw new DOMException('Cancelado','NotAllowedError')
    await mutate('/api/webauthn/register/verify','POST',{credential:credentialJson(credential)})
    localStorage.setItem(deviceKey(userId),JSON.stringify({at:Date.now(),credentialId:credential.id,kind:deviceSecurityPresentation().kind}))
  } catch (error) { throw friendlySecurityError(error,'register') }
}

export async function authenticateDevice(userId:string) {
  if (!await platformSecurityAvailable()) throw new Error('A biometria ou o desbloqueio seguro não está disponível agora. Use sua senha para continuar.')
  try {
    const raw = await mutate<JsonObject>('/api/webauthn/auth/options','POST',{})
    const credential = await navigator.credentials.get({ publicKey: requestOptions(raw) }) as PublicKeyCredential | null
    if (!credential) throw new DOMException('Cancelado','NotAllowedError')
    await mutate('/api/webauthn/auth/verify','POST',{credential:credentialJson(credential)})
    localStorage.setItem(deviceKey(userId),JSON.stringify({at:Date.now(),credentialId:credential.id,kind:deviceSecurityPresentation().kind}))
  } catch (error) { throw friendlySecurityError(error,'authenticate') }
}

export function disableDeviceSecurity(userId:string){localStorage.removeItem(deviceKey(userId))}
