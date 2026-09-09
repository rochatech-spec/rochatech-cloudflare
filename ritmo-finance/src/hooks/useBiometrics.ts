import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

type RegistrationOptionsJSON = Omit<PublicKeyCredentialCreationOptions, 'challenge' | 'user' | 'excludeCredentials'> & {
  challenge: string
  user: Omit<PublicKeyCredentialUserEntity, 'id'> & { id: string }
  excludeCredentials?: Array<Omit<PublicKeyCredentialDescriptor, 'id'> & { id: string }>
}
type AuthenticationOptionsJSON = Omit<PublicKeyCredentialRequestOptions, 'challenge' | 'allowCredentials'> & {
  challenge: string
  allowCredentials?: Array<Omit<PublicKeyCredentialDescriptor, 'id'> & { id: string }>
}

function fromBase64URL(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function toBase64URL(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function serializeCredential(credential: PublicKeyCredential) {
  const response = credential.response
  if (response instanceof AuthenticatorAttestationResponse) {
    return {
      id: credential.id,
      rawId: toBase64URL(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: toBase64URL(response.clientDataJSON),
        attestationObject: toBase64URL(response.attestationObject),
        transports: response.getTransports?.() ?? [],
      },
    }
  }
  const assertion = response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: toBase64URL(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64URL(assertion.clientDataJSON),
      authenticatorData: toBase64URL(assertion.authenticatorData),
      signature: toBase64URL(assertion.signature),
      userHandle: assertion.userHandle ? toBase64URL(assertion.userHandle) : null,
    },
  }
}

export function useBiometrics() {
  const [isSupported, setIsSupported] = useState(false)
  const [isPlatformAvailable, setIsPlatformAvailable] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supported = typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials
    setIsSupported(supported)
    if (supported) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().then(setIsPlatformAvailable).catch(() => setIsPlatformAvailable(false))
    }
  }, [])

  const registerBiometrics = useCallback(async () => {
    if (!isSupported) throw new Error('WebAuthn não é suportado neste aparelho.')
    setBusy(true)
    try {
      const options = await api<RegistrationOptionsJSON>('/api/webauthn/register/options', { method: 'POST', body: '{}' })
      const publicKey: PublicKeyCredentialCreationOptions = {
        ...options,
        challenge: fromBase64URL(options.challenge),
        user: { ...options.user, id: fromBase64URL(options.user.id) },
        excludeCredentials: options.excludeCredentials?.map((item) => ({ ...item, id: fromBase64URL(item.id) })),
      }
      const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null
      if (!credential) throw new Error('Cadastro biométrico cancelado.')
      await api('/api/webauthn/register/verify', { method: 'POST', body: JSON.stringify({ response: serializeCredential(credential) }) })
      return true
    } finally {
      setBusy(false)
    }
  }, [isSupported])

  const authenticateBiometrics = useCallback(async () => {
    if (!isSupported) throw new Error('WebAuthn não é suportado neste aparelho.')
    setBusy(true)
    try {
      const options = await api<AuthenticationOptionsJSON>('/api/webauthn/login/options', { method: 'POST', body: '{}' })
      const publicKey: PublicKeyCredentialRequestOptions = {
        ...options,
        challenge: fromBase64URL(options.challenge),
        allowCredentials: options.allowCredentials?.map((item) => ({ ...item, id: fromBase64URL(item.id) })),
      }
      const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null
      if (!credential) throw new Error('Autenticação biométrica cancelada.')
      await api('/api/webauthn/login/verify', { method: 'POST', body: JSON.stringify({ challenge: options.challenge, response: serializeCredential(credential) }) })
      return true
    } finally {
      setBusy(false)
    }
  }, [isSupported])

  return { isSupported, isPlatformAvailable, busy, registerBiometrics, authenticateBiometrics }
}
