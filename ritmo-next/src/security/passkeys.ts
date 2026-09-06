import { mutate } from '../api/client'

type JsonObject = Record<string, unknown>

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
  return { ...(raw as unknown as PublicKeyCredentialCreationOptions), challenge: decode(String(raw.challenge)), user: { ...user, id: decode(user.id) }, excludeCredentials: ((raw.excludeCredentials || []) as Array<PublicKeyCredentialDescriptor & {id:string}>).map((c)=>({ ...c, id: decode(c.id) })), authenticatorSelection: { ...((raw.authenticatorSelection||{}) as AuthenticatorSelectionCriteria), authenticatorAttachment:'platform', residentKey:'preferred', requireResidentKey:false, userVerification:'required' }, attestation:'none', timeout:Math.min(Number(raw.timeout||60000),60000) }
}

function requestOptions(raw: JsonObject): PublicKeyCredentialRequestOptions {
  return { ...(raw as unknown as PublicKeyCredentialRequestOptions), challenge: decode(String(raw.challenge)), allowCredentials: ((raw.allowCredentials || []) as Array<PublicKeyCredentialDescriptor & {id:string}>).map((c)=>({ ...c, id: decode(c.id) })), userVerification:'required', timeout:Math.min(Number(raw.timeout||60000),60000) }
}

export function deviceSecurityLabel() {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'Face ID / Touch ID'
  if (/Android/i.test(ua)) return 'biometria do aparelho'
  if (/Windows/i.test(ua)) return 'Windows Hello'
  if (/Mac/i.test(ua)) return 'Touch ID'
  return 'desbloqueio do aparelho'
}

export async function platformSecurityAvailable() {
  if (!window.PublicKeyCredential || !navigator.credentials?.create || !navigator.credentials?.get) return false
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() } catch { return true }
}

export function deviceKey(userId:string){return `ritmo:bio:${userId}:verified`}
export function deviceSecurityEnabled(userId:string,count=0){return count>0 && Boolean(localStorage.getItem(deviceKey(userId)))}

export async function registerDeviceSecurity(userId:string) {
  if (!await platformSecurityAvailable()) throw new Error('Este aparelho não disponibilizou desbloqueio seguro para o Ritmo.')
  const raw = await mutate<JsonObject>('/api/webauthn/register/options','POST',{})
  const credential = await navigator.credentials.create({ publicKey: creationOptions(raw) }) as PublicKeyCredential | null
  if (!credential) throw new Error('Configuração cancelada.')
  await mutate('/api/webauthn/register/verify','POST',{credential:credentialJson(credential)})
  localStorage.setItem(deviceKey(userId),JSON.stringify({at:Date.now(),credentialId:credential.id}))
}

export async function authenticateDevice(userId:string) {
  const raw = await mutate<JsonObject>('/api/webauthn/auth/options','POST',{})
  const credential = await navigator.credentials.get({ publicKey: requestOptions(raw) }) as PublicKeyCredential | null
  if (!credential) throw new Error('Desbloqueio cancelado.')
  await mutate('/api/webauthn/auth/verify','POST',{credential:credentialJson(credential)})
  localStorage.setItem(deviceKey(userId),JSON.stringify({at:Date.now(),credentialId:credential.id}))
}

export function disableDeviceSecurity(userId:string){localStorage.removeItem(deviceKey(userId))}
