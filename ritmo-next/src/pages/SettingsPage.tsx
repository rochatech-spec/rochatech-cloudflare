import { useEffect, useMemo, useState } from 'react'
import type { Settings } from '../domain/types'
import { deviceSecurityEnabled, deviceSecurityPresentation, disableDeviceSecurity, platformSecurityAvailable, registerDeviceSecurity } from '../security/passkeys'
import { Icon } from '../ui/Icon'

export function SettingsPage({ settings, userId, credentialCount, onSave, onSecurityChanged }: { settings: Settings; userId:string; credentialCount:number; onSave:(patch:Partial<Settings>)=>Promise<void>; onSecurityChanged:()=>Promise<void> }) {
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState<string|null>(null)
  const [securityAvailable,setSecurityAvailable]=useState<boolean|null>(null)
  const presentation=useMemo(()=>deviceSecurityPresentation(),[])

  useEffect(()=>{
    let active=true
    void platformSecurityAvailable().then((ok)=>{if(active)setSecurityAvailable(ok)})
    return()=>{active=false}
  },[])

  async function save(patch:Partial<Settings>){setBusy(true);setMessage(null);try{await onSave(patch)}finally{setBusy(false)}}

  const theme=settings.theme||'system'
  const securityEnabled=deviceSecurityEnabled(userId,credentialCount)

  async function toggleSecurity(){
    setBusy(true);setMessage(null)
    try{
      if(securityEnabled){
        disableDeviceSecurity(userId)
        setMessage(`${presentation.label} desativado somente neste aparelho.`)
      }else{
        if(securityAvailable!==true){setMessage('O desbloqueio seguro não está disponível neste aparelho agora. Sua senha continua funcionando normalmente.');return}
        await registerDeviceSecurity(userId)
        await onSecurityChanged()
        setMessage(`${presentation.label} ativado neste aparelho.`)
      }
    }catch(err){setMessage(err instanceof Error?err.message:'Não foi possível alterar o desbloqueio.')}
    finally{setBusy(false)}
  }

  const securityCopy=securityEnabled
    ? `${presentation.label} está pronto para abrir o Ritmo neste aparelho.`
    : securityAvailable===null
      ? 'Verificando o desbloqueio disponível neste aparelho…'
      : securityAvailable
        ? presentation.description
        : 'Neste aparelho, o Ritmo continuará protegido pela sua senha.'

  return <div className="page-stack">
    <header className="page-header"><div><small>CONFIGURAÇÕES</small><h1>Do seu jeito</h1><p>Aparência, avisos e privacidade em uma tela limpa.</p></div></header>
    <section className="premium-card setting-section"><div className="setting-section-head"><span className="setting-icon"><Icon name="spark"/></span><div><h2>Aparência</h2><p>Escolha como o Ritmo deve aparecer.</p></div></div><div className="theme-options"><button type="button" className={theme==='light'?'active':''} onClick={()=>save({theme:'light'})} disabled={busy}><span className="theme-preview light"/><strong>Claro</strong></button><button type="button" className={theme==='dark'?'active':''} onClick={()=>save({theme:'dark'})} disabled={busy}><span className="theme-preview dark"/><strong>Escuro</strong></button><button type="button" className={theme==='system'?'active':''} onClick={()=>save({theme:'system'})} disabled={busy}><span className="theme-preview system"/><strong>Automático</strong></button></div></section>
    <section className="premium-card setting-section"><div className="setting-section-head"><span className="setting-icon"><Icon name="bell"/></span><div><h2>Avisos</h2><p>Receba lembretes somente do que importa.</p></div></div><div className="settings-list"><Toggle label="Avisos do Ritmo" checked={Boolean(settings.notifications_enabled)} onChange={(v)=>save({notifications_enabled:v?1:0})}/><Toggle label="Vencimentos próximos" checked={Boolean(settings.notify_due)} onChange={(v)=>save({notify_due:v?1:0})}/><Toggle label="Contas vencidas" checked={Boolean(settings.notify_overdue)} onChange={(v)=>save({notify_overdue:v?1:0})}/><Toggle label="Progresso das metas" checked={Boolean(settings.notify_goals)} onChange={(v)=>save({notify_goals:v?1:0})}/></div></section>
    <section className="premium-card setting-section biometric-setting"><div className="setting-section-head"><span className="setting-icon biometric"><Icon name={presentation.icon}/></span><div><h2>Segurança</h2><p>Proteja a abertura neste aparelho.</p></div></div><div className="security-row"><div><strong>{presentation.label}</strong><small>{securityCopy}</small><em className={securityEnabled?'security-state active':'security-state'}>{securityEnabled?'Ativo neste aparelho':securityAvailable===false?'Indisponível agora':'Opcional'}</em></div><button className={securityEnabled?'secondary-button':'primary-button'} type="button" onClick={()=>void toggleSecurity()} disabled={busy||(!securityEnabled&&securityAvailable!==true)}>{busy?'Aguarde…':securityEnabled?'Desativar':'Ativar'}</button></div><p className="security-fallback"><Icon name="shield"/> Sua senha continua disponível como alternativa de desbloqueio.</p><label className="field"><span>Bloquear após</span><select value={String(settings.auto_lock_minutes??5)} onChange={(e)=>save({auto_lock_minutes:Number(e.target.value)})} disabled={busy}><option value="0">Somente ao sair</option><option value="1">1 minuto</option><option value="5">5 minutos</option><option value="15">15 minutos</option><option value="30">30 minutos</option></select></label>{message&&<div className="form-message">{message}</div>}</section>
  </div>
}

function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}){return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)}/><i/></label>}
