import { useEffect, useMemo, useState } from 'react'
import { mutate } from '../api/client'
import type { BootstrapData } from '../domain/types'
import { initials } from '../lib/format'
import { authenticateDevice, deviceSecurityEnabled, deviceSecurityPresentation, platformSecurityAvailable } from '../security/passkeys'
import { Icon } from '../ui/Icon'

export function LockScreen({ data, onUnlock, onOtherAccount }: { data:BootstrapData; onUnlock:()=>void; onOtherAccount:()=>void }) {
  const enabled=deviceSecurityEnabled(data.profile.id,Number(data.security?.webauthn_count||0))
  const presentation=useMemo(()=>deviceSecurityPresentation(),[])
  const [available,setAvailable]=useState<boolean|null>(enabled?null:false)
  const [passwordMode,setPasswordMode]=useState(!enabled)
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)

  useEffect(()=>{
    let active=true
    if(!enabled){setAvailable(false);setPasswordMode(true);return()=>{active=false}}
    void platformSecurityAvailable().then((ok)=>{
      if(!active)return
      setAvailable(ok)
      if(!ok){setPasswordMode(true);setError('O desbloqueio do aparelho não está disponível agora. Use sua senha para continuar.')}
    })
    return()=>{active=false}
  },[enabled])

  async function bio(){
    if(available===false){setPasswordMode(true);return}
    setBusy(true);setError(null)
    try{await authenticateDevice(data.profile.id);onUnlock()}
    catch(err){setError(err instanceof Error?err.message:'Não foi possível confirmar. Tente novamente ou use sua senha.')}
    finally{setBusy(false)}
  }

  async function pass(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError(null)
    try{await mutate('/api/auth/reverify','POST',{password});setPassword('');onUnlock()}
    catch(err){setPassword('');setError(err instanceof Error?err.message:'Senha incorreta.')}
    finally{setBusy(false)}
  }

  return <main className="lock-shell"><section className="lock-card">
    <div className="lock-brand">Ritmo</div>
    <span className="lock-avatar">{initials(data.profile.name)}</span>
    <h1>Bem-vindo de volta</h1>
    <p>{enabled&&!passwordMode?presentation.description:'Digite sua senha para continuar.'}</p>
    <small>@{data.profile.username}</small>

    {enabled&&!passwordMode&&<>
      <button className="primary-button wide unlock-button biometric-button" type="button" disabled={busy||available===null} onClick={()=>void bio()}>
        <Icon name={presentation.icon}/>{busy?'Confirmando…':available===null?'Preparando…':presentation.action}
      </button>
      <button className="text-button" type="button" disabled={busy} onClick={()=>{setError(null);setPasswordMode(true)}}>Usar senha</button>
    </>}

    {passwordMode&&<>
      <form className="lock-password" onSubmit={pass}>
        <label className="field"><span>Senha</span><input autoFocus type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} autoComplete="current-password" required/></label>
        <button className="primary-button wide" type="submit" disabled={busy}>{busy?'Confirmando…':'Desbloquear'}</button>
      </form>
      {enabled&&available&&<button className="text-button biometric-alt" type="button" disabled={busy} onClick={()=>{setError(null);setPasswordMode(false)}}><Icon name={presentation.icon}/>{presentation.action}</button>}
    </>}

    {error&&<div className="inline-alert">{error}</div>}
    <button className="other-account" type="button" onClick={onOtherAccount}>Usar outra conta</button>
  </section></main>
}
