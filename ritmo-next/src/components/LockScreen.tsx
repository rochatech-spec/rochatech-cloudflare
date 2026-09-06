import { useState } from 'react'
import { mutate } from '../api/client'
import type { BootstrapData } from '../domain/types'
import { initials } from '../lib/format'
import { authenticateDevice, deviceSecurityEnabled, deviceSecurityLabel } from '../security/passkeys'
import { Icon } from '../ui/Icon'

export function LockScreen({ data, onUnlock, onOtherAccount }: { data:BootstrapData; onUnlock:()=>void; onOtherAccount:()=>void }) {
  const enabled=deviceSecurityEnabled(data.profile.id,Number(data.security?.webauthn_count||0))
  const [passwordMode,setPasswordMode]=useState(!enabled)
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  async function bio(){setBusy(true);setError(null);try{await authenticateDevice(data.profile.id);onUnlock()}catch(err){setError(err instanceof Error?err.message:'Não foi possível confirmar.')}finally{setBusy(false)}}
  async function pass(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null);try{await mutate('/api/auth/reverify','POST',{password});setPassword('');onUnlock()}catch(err){setPassword('');setError(err instanceof Error?err.message:'Senha incorreta.')}finally{setBusy(false)}}
  return <main className="lock-shell"><section className="lock-card"><div className="lock-brand">Ritmo</div><span className="lock-avatar">{initials(data.profile.name)}</span><h1>Bem-vindo de volta</h1><p>{enabled?`Use ${deviceSecurityLabel()} para continuar.`:'Digite sua senha para continuar.'}</p><small>@{data.profile.username}</small>{enabled&&!passwordMode&&<><button className="primary-button wide unlock-button" type="button" disabled={busy} onClick={()=>void bio()}><Icon name="shield"/>{busy?'Confirmando…':deviceSecurityLabel()}</button><button className="text-button" type="button" onClick={()=>setPasswordMode(true)}>Usar senha</button></>}{passwordMode&&<form className="lock-password" onSubmit={pass}><label className="field"><span>Senha</span><input autoFocus type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} autoComplete="current-password" required/></label><button className="primary-button wide" type="submit" disabled={busy}>Desbloquear</button></form>}{error&&<div className="inline-alert">{error}</div>}<button className="other-account" type="button" onClick={onOtherAccount}>Usar outra conta</button></section></main>
}
