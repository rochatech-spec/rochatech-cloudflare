import { useState } from 'react'
import type { Profile } from '../domain/types'
import { initials } from '../lib/format'
import { Icon } from '../ui/Icon'

export function ProfilePage({ profile, onSave, onLogout }: { profile: Profile; onSave: (data:{name:string;username:string;password?:string})=>Promise<void>; onLogout:()=>Promise<void> }) {
  const [name,setName]=useState(profile.name)
  const [username,setUsername]=useState(profile.username)
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState<string|null>(null)
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage(null);try{await onSave({name,username,password:password||undefined});setPassword('');setMessage('Perfil atualizado.')}catch(err){setMessage(err instanceof Error?err.message:'Não foi possível atualizar.')}finally{setBusy(false)}}
  return <div className="page-stack">
    <header className="page-header"><div><small>MEU PERFIL</small><h1>Sua conta</h1><p>Dados simples, sem misturar com o perfil financeiro do casal.</p></div></header>
    <section className="profile-account-card"><span className="profile-big-avatar">{initials(profile.name)}</span><div><strong>{profile.name}</strong><small>@{profile.username}</small></div></section>
    <form className="premium-card profile-form" onSubmit={submit}><div className="form-grid"><label className="field full"><span>Nome</span><input value={name} onChange={(e)=>setName(e.target.value)} minLength={2} required/></label><label className="field full"><span>Usuário</span><input value={username} onChange={(e)=>setUsername(e.target.value)} minLength={3} required autoCapitalize="none"/></label><label className="field full"><span>Nova senha</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} placeholder="Deixe em branco para manter" autoComplete="new-password"/></label></div>{message&&<div className="form-message">{message}</div>}<button className="primary-button wide" disabled={busy} type="submit"><Icon name="check"/> {busy?'Salvando…':'Salvar alterações'}</button></form>
    <button className="logout-button" type="button" onClick={()=>void onLogout()}><Icon name="logout"/><span><strong>Sair da conta</strong><small>Os dados locais desta conta serão limpos deste aparelho.</small></span></button>
  </div>
}
