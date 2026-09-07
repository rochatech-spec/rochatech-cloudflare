import { useState } from 'react'
import type { BootstrapData } from '../domain/types'
import { firstName, initials, money, shortDate } from '../lib/format'
import { Icon } from '../ui/Icon'

export function SharingPage({ data, onTransfer, onInvite, onAcceptCode, onInviteAction }: { data: BootstrapData; onTransfer: () => void; onInvite: (username: string) => Promise<void>; onAcceptCode: (code: string) => Promise<void>; onInviteAction: (id: string, action: 'accept'|'decline'|'cancel') => Promise<void> }) {
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const sharing = data.sharing
  if (sharing.active) {
    return <div className="page-stack">
      <header className="page-header"><div><small>PERFIL CASAL</small><h1>{firstName(data.profile.name)} & {firstName(sharing.partner?.name)}</h1><p>O dinheiro em comum fica aqui. O pessoal continua privado.</p></div><button className="primary-button" type="button" onClick={onTransfer}><Icon name="transfer"/> Transferir para o casal</button></header>
      <section className="couple-profile-card"><div className="couple-profile-avatars"><span>{initials(data.profile.name)}</span><i><Icon name="users"/></i><span>{initials(sharing.partner?.name)}</span></div><div><small>CARTEIRA COMPARTILHADA</small><strong>{money(data.wallet.shared_balance)}</strong><p>{money(data.wallet.shared_transfers)} recebidos em contribuições pessoais.</p></div></section>
      <section className="premium-card content-section"><div className="section-title"><div><small>CONTRIBUIÇÕES</small><h2>Participação de cada um</h2></div></div><div className="premium-list">{data.wallet.contributions.map((item)=><div className="list-row" key={item.owner_user_id}><span className="row-avatar">{initials(item.name)}</span><div className="row-main"><strong>{item.name}</strong><small>@{item.username||'ritmo'}</small></div><b>{money(item.amount)}</b></div>)}</div></section>
      <section className="premium-card content-section"><div className="section-title"><div><small>HISTÓRICO</small><h2>Transferências ao casal</h2></div></div><div className="premium-list">{data.wallet.transfers.length?data.wallet.transfers.map((item)=><div className="list-row" key={item.id}><span className="movement-badge transfer"><Icon name="transfer"/></span><div className="row-main"><strong>{item.created_by_name||'Contribuição'}</strong><small>{shortDate(item.date)}{item.description?` · ${item.description}`:''}</small></div><b>{money(item.amount)}</b></div>):<div className="empty-card">Nenhuma transferência ainda.</div>}</div></section>
      <div className="privacy-note"><Icon name="shield"/><span><strong>Individualidade preservada.</strong> Carteira e visibilidade são coisas diferentes: somente o que pertence ao casal aparece para os dois.</span></div>
    </div>
  }

  return <div className="page-stack">
    <header className="page-header"><div><small>COMPARTILHAMENTO</small><h1>Crie o perfil Casal</h1><p>Duas contas, sem dividir senha e sem misturar o que é pessoal.</p></div></header>
    <div className="sharing-setup-grid">
      <form className="premium-card setup-card" onSubmit={async(e)=>{e.preventDefault();setBusy(true);try{await onInvite(username);setUsername('')}finally{setBusy(false)}}}><span className="setup-icon"><Icon name="users"/></span><h2>Convidar parceiro</h2><p>Digite o usuário do Ritmo da outra pessoa.</p><label className="field"><span>Usuário</span><input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="ex.: lais.silva" minLength={3} required/></label><button className="primary-button wide" disabled={busy} type="submit">Criar convite</button></form>
      <form className="premium-card setup-card" onSubmit={async(e)=>{e.preventDefault();setBusy(true);try{await onAcceptCode(code);setCode('')}finally{setBusy(false)}}}><span className="setup-icon"><Icon name="check"/></span><h2>Tenho um código</h2><p>Use o código que seu parceiro enviou.</p><label className="field"><span>Código</span><input value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} placeholder="CÓDIGO" maxLength={10} required/></label><button className="secondary-button wide" disabled={busy} type="submit">Conectar</button></form>
    </div>
    {(sharing.incoming_invites?.length||0)>0&&<section className="premium-card content-section"><div className="section-title"><div><small>CONVITES</small><h2>Recebidos</h2></div></div><div className="premium-list">{sharing.incoming_invites?.map((invite)=><div className="list-row" key={invite.id}><span className="row-avatar">{initials(invite.inviter_name)}</span><div className="row-main"><strong>{invite.inviter_name}</strong><small>@{invite.inviter_username}</small></div><div className="inline-actions"><button className="mini-primary" onClick={()=>onInviteAction(invite.id,'accept')} type="button">Aceitar</button><button className="mini-button" onClick={()=>onInviteAction(invite.id,'decline')} type="button">Recusar</button></div></div>)}</div></section>}
    {(sharing.outgoing_invites?.length||0)>0&&<section className="premium-card content-section"><div className="section-title"><div><small>CONVITE ENVIADO</small><h2>Aguardando</h2></div></div><div className="premium-list">{sharing.outgoing_invites?.map((invite)=><div className="list-row" key={invite.id}><span className="row-avatar">{initials(invite.invitee_name)}</span><div className="row-main"><strong>{invite.invitee_name}</strong><small>Código: {invite.code}</small></div><button className="mini-button" onClick={()=>onInviteAction(invite.id,'cancel')} type="button">Cancelar</button></div>)}</div></section>}
  </div>
}
