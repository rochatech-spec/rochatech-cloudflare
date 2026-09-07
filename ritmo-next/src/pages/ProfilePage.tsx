import { useState } from 'react'
import { uploadAvatar } from '../api/client'
import { ProfileAvatar } from '../components/ProfileAvatar'
import type { Profile } from '../domain/types'
import { Icon } from '../ui/Icon'

async function optimizeAvatar(file:File):Promise<Blob>{
  if(!file.type.startsWith('image/'))throw new Error('Escolha uma imagem válida.')
  const bitmap=await createImageBitmap(file)
  const side=Math.min(bitmap.width,bitmap.height)
  const sx=Math.max(0,(bitmap.width-side)/2)
  const sy=Math.max(0,(bitmap.height-side)/2)
  const size=Math.min(384,side)
  const canvas=document.createElement('canvas')
  canvas.width=size;canvas.height=size
  const ctx=canvas.getContext('2d',{alpha:false})
  if(!ctx){bitmap.close();throw new Error('Não foi possível preparar a foto.')}
  ctx.drawImage(bitmap,sx,sy,side,side,0,0,size,size)
  bitmap.close()
  const blob=await new Promise<Blob|null>((resolve)=>canvas.toBlob(resolve,'image/webp',.82))
  if(!blob)throw new Error('Não foi possível preparar a foto.')
  if(blob.size>450_000)throw new Error('Essa foto ainda ficou muito grande. Escolha outra imagem.')
  return blob
}

export function ProfilePage({ profile, onSave, onLogout, onAvatarChanged }: { profile: Profile; onSave: (data:{name:string;username:string;password?:string})=>Promise<void>; onLogout:()=>Promise<void>; onAvatarChanged:()=>Promise<void> }) {
  const [name,setName]=useState(profile.name)
  const [username,setUsername]=useState(profile.username)
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [avatarBusy,setAvatarBusy]=useState(false)
  const [message,setMessage]=useState<string|null>(null)

  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setMessage(null)
    try{await onSave({name,username,password:password||undefined});setPassword('');setMessage('Perfil atualizado sem alterar seu histórico.')}
    catch(err){setMessage(err instanceof Error?err.message:'Não foi possível atualizar.')}
    finally{setBusy(false)}
  }

  async function changeAvatar(file?:File){
    if(!file)return
    setAvatarBusy(true);setMessage(null)
    try{const optimized=await optimizeAvatar(file);await uploadAvatar(optimized);await onAvatarChanged();setMessage('Foto de perfil atualizada.')}
    catch(err){setMessage(err instanceof Error?err.message:'Não foi possível atualizar a foto.')}
    finally{setAvatarBusy(false)}
  }

  return <div className="page-stack profile-page">
    <header className="page-header"><div><small>MEU PERFIL</small><h1>Sua conta</h1><p>Identidade, acesso e dados pessoais organizados em um só lugar.</p></div></header>

    <section className="premium-card profile-overview-card">
      <div className="profile-overview-main">
        <ProfileAvatar profile={profile} className="profile-identity-avatar"/>
        <div className="profile-overview-copy"><span className="account-type-pill"><Icon name="user"/> Conta pessoal</span><h2>{profile.name}</h2><p>@{profile.username}</p></div>
      </div>
      <label className={avatarBusy?'avatar-change-button busy':'avatar-change-button'}>
        <Icon name="edit"/><span>{avatarBusy?'Preparando…':'Alterar foto'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarBusy} onChange={(e)=>void changeAvatar(e.target.files?.[0])}/>
      </label>
    </section>

    <form className="profile-editor" onSubmit={submit}>
      <section className="premium-card profile-section-card">
        <div className="profile-section-head"><span className="setting-icon"><Icon name="user"/></span><div><h2>Dados da conta</h2><p>Como seu nome e usuário aparecem no Ritmo.</p></div></div>
        <div className="form-grid profile-fields">
          <label className="field full"><span>Nome</span><input value={name} onChange={(e)=>setName(e.target.value)} autoComplete="name" minLength={2} required/></label>
          <label className="field full"><span>Usuário</span><input value={username} onChange={(e)=>setUsername(e.target.value)} autoComplete="username" minLength={3} required autoCapitalize="none"/></label>
        </div>
      </section>

      <section className="premium-card profile-section-card">
        <div className="profile-section-head"><span className="setting-icon profile-security-icon"><Icon name="shield"/></span><div><h2>Segurança da conta</h2><p>Troque a senha somente quando quiser.</p></div></div>
        <label className="field"><span>Nova senha <em>opcional</em></span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} placeholder="Deixe em branco para manter a atual" autoComplete="new-password"/></label>
        <div className="profile-safe-note"><Icon name="shield"/><div><strong>Sua conta continua a mesma</strong><span>Alterar nome, usuário, senha ou foto não apaga lançamentos, metas, dívidas nem o vínculo do casal.</span></div></div>
      </section>

      {message&&<div className="form-message profile-message" role="status">{message}</div>}
      <button className="primary-button profile-save-button" disabled={busy||avatarBusy} type="submit"><Icon name="check"/> {busy?'Salvando…':'Salvar alterações'}</button>
    </form>

    <section className="profile-danger-zone">
      <div><strong>Sair deste aparelho</strong><small>Use isso quando quiser trocar de conta. Seus dados continuam guardados na sua conta.</small></div>
      <button className="logout-button compact" type="button" onClick={()=>void onLogout()}><Icon name="logout"/><span>Sair</span></button>
    </section>
  </div>
}
