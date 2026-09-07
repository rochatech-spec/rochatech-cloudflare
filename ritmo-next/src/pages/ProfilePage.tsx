import { useState } from 'react'
import { uploadAvatar } from '../api/client'
import { ProfileAvatar } from '../components/ProfileAvatar'
import type { BootstrapData } from '../domain/types'
import { shortDate } from '../lib/format'
import { Icon } from '../ui/Icon'

async function optimizeAvatar(file:File):Promise<Blob>{
  if(!file.type.startsWith('image/'))throw new Error('Escolha uma imagem válida.')
  const bitmap=await createImageBitmap(file)
  const side=Math.min(bitmap.width,bitmap.height)
  const sx=Math.max(0,(bitmap.width-side)/2),sy=Math.max(0,(bitmap.height-side)/2)
  const size=Math.min(384,side)
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size
  const ctx=canvas.getContext('2d',{alpha:false})
  if(!ctx){bitmap.close();throw new Error('Não foi possível preparar a foto.')}
  ctx.drawImage(bitmap,sx,sy,side,side,0,0,size,size);bitmap.close()
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',.82))
  if(!blob)throw new Error('Não foi possível preparar a foto.')
  if(blob.size>450_000)throw new Error('Essa foto ainda ficou muito grande. Escolha outra imagem.')
  return blob
}

export function ProfilePage({ data, onSave, onLogout, onAvatarChanged }: { data:BootstrapData; onSave:(values:{name:string;username:string;password?:string})=>Promise<void>; onLogout:()=>Promise<void>; onAvatarChanged:()=>Promise<void> }) {
  const profile=data.profile
  const [name,setName]=useState(profile.name),[username,setUsername]=useState(profile.username),[password,setPassword]=useState('')
  const [busy,setBusy]=useState(false),[avatarBusy,setAvatarBusy]=useState(false),[message,setMessage]=useState<string|null>(null)
  const couple=data.sharing.active,protectedDevice=Number(data.security?.webauthn_count||0)>0

  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage(null);try{await onSave({name,username,password:password||undefined});setPassword('');setMessage('Perfil atualizado sem alterar seu histórico.')}catch(err){setMessage(err instanceof Error?err.message:'Não foi possível atualizar.')}finally{setBusy(false)}}
  async function changeAvatar(file?:File){if(!file)return;setAvatarBusy(true);setMessage(null);try{const optimized=await optimizeAvatar(file);await uploadAvatar(optimized);await onAvatarChanged();setMessage('Foto de perfil atualizada.')}catch(err){setMessage(err instanceof Error?err.message:'Não foi possível atualizar a foto.')}finally{setAvatarBusy(false)}}

  return <div className="page-stack profile-page ios-profile-page">
    <header className="page-header ios-page-header"><div><small>MEU PERFIL</small><h1>Sua conta</h1><p>Sua identidade no Ritmo separada dos perfis financeiros Pessoal e Casal.</p></div></header>

    <section className="profile-ios-hero">
      <div className="profile-photo-wrap"><ProfileAvatar profile={profile} className="profile-identity-avatar"/><label className={avatarBusy?'profile-photo-action busy':'profile-photo-action'}><Icon name="edit"/><span>{avatarBusy?'Preparando…':'Alterar'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarBusy} onChange={e=>void changeAvatar(e.target.files?.[0])}/></label></div>
      <div className="profile-ios-identity"><h2>{profile.name}</h2><p>@{profile.username}</p><div className="profile-real-badges"><span><Icon name="check"/> Conta sincronizada</span>{couple&&<span><Icon name="users"/> Nosso Ritmo ativo</span>}{protectedDevice&&<span><Icon name="shield"/> Proteção do aparelho</span>}</div></div>
    </section>

    <form className="profile-editor" onSubmit={submit}>
      <section className="ios-menu-section"><h2>Dados pessoais</h2><div className="ios-list-card profile-field-group"><label className="ios-profile-field"><span>Nome</span><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" minLength={2} required/></label><label className="ios-profile-field"><span>Usuário</span><input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" minLength={3} required/></label></div></section>

      <section className="ios-menu-section"><h2>Segurança da conta</h2><div className="ios-list-card profile-field-group"><label className="ios-profile-field"><span>Nova senha</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} placeholder="Manter senha atual" autoComplete="new-password"/></label><div className="profile-info-row"><Icon name="shield"/><span><strong>Seu histórico continua intacto</strong><small>Mudar nome, usuário, senha ou foto não apaga lançamentos, metas, dívidas nem o vínculo do casal.</small></span></div></div></section>

      <section className="ios-menu-section"><h2>Conta</h2><div className="ios-list-card"><div className="profile-info-row"><Icon name="user"/><span><strong>Tipo de conta</strong><small>{couple?'Conta pessoal com espaço financeiro do casal':'Conta pessoal'}</small></span></div>{profile.created_at&&<div className="profile-info-row"><Icon name="calendar"/><span><strong>No Ritmo desde</strong><small>{shortDate(profile.created_at.slice(0,10))}</small></span></div>}<div className="profile-info-row"><Icon name={protectedDevice?'shield':'user'}/><span><strong>Acesso neste aparelho</strong><small>{protectedDevice?'Desbloqueio do aparelho configurado':'Senha disponível para desbloqueio'}</small></span></div></div></section>

      {message&&<div className="form-message profile-message" role="status">{message}</div>}
      <button className="primary-button profile-save-button" disabled={busy||avatarBusy} type="submit"><Icon name="check"/>{busy?'Salvando…':'Salvar alterações'}</button>
    </form>

    <section className="ios-menu-section profile-signout-section"><h2>Sessão</h2><div className="ios-list-card"><button className="ios-danger-row" type="button" onClick={()=>void onLogout()}><Icon name="logout"/><span><strong>Sair deste aparelho</strong><small>Troque de conta sem apagar os dados guardados na sua conta.</small></span><Icon name="chevron"/></button></div></section>
  </div>
}
