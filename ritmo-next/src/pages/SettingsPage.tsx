import { useState } from 'react'
import type { Settings } from '../domain/types'
import { Icon } from '../ui/Icon'

export function SettingsPage({ settings, onSave }: { settings: Settings; onSave: (patch: Partial<Settings>)=>Promise<void> }) {
  const [busy,setBusy]=useState(false)
  async function save(patch:Partial<Settings>){setBusy(true);try{await onSave(patch)}finally{setBusy(false)}}
  const theme=settings.theme||'system'
  return <div className="page-stack">
    <header className="page-header"><div><small>CONFIGURAÇÕES</small><h1>Do seu jeito</h1><p>Aparência, avisos e privacidade em uma tela limpa.</p></div></header>
    <section className="premium-card setting-section"><div className="setting-section-head"><span className="setting-icon"><Icon name="spark"/></span><div><h2>Aparência</h2><p>Escolha como o Ritmo deve aparecer.</p></div></div><div className="theme-options"><button type="button" className={theme==='light'?'active':''} onClick={()=>save({theme:'light'})} disabled={busy}><span className="theme-preview light"/><strong>Claro</strong></button><button type="button" className={theme==='dark'?'active':''} onClick={()=>save({theme:'dark'})} disabled={busy}><span className="theme-preview dark"/><strong>Escuro</strong></button><button type="button" className={theme==='system'?'active':''} onClick={()=>save({theme:'system'})} disabled={busy}><span className="theme-preview system"/><strong>Automático</strong></button></div></section>
    <section className="premium-card setting-section"><div className="setting-section-head"><span className="setting-icon"><Icon name="bell"/></span><div><h2>Avisos</h2><p>Receba lembretes somente do que importa.</p></div></div><div className="settings-list"><Toggle label="Avisos do Ritmo" checked={Boolean(settings.notifications_enabled)} onChange={(v)=>save({notifications_enabled:v?1:0})}/><Toggle label="Vencimentos próximos" checked={Boolean(settings.notify_due)} onChange={(v)=>save({notify_due:v?1:0})}/><Toggle label="Contas vencidas" checked={Boolean(settings.notify_overdue)} onChange={(v)=>save({notify_overdue:v?1:0})}/><Toggle label="Progresso das metas" checked={Boolean(settings.notify_goals)} onChange={(v)=>save({notify_goals:v?1:0})}/></div></section>
    <section className="premium-card setting-section"><div className="setting-section-head"><span className="setting-icon"><Icon name="shield"/></span><div><h2>Privacidade</h2><p>O Ritmo bloqueia novamente após um tempo sem uso.</p></div></div><label className="field"><span>Bloquear após</span><select value={String(settings.auto_lock_minutes??5)} onChange={(e)=>save({auto_lock_minutes:Number(e.target.value)})} disabled={busy}><option value="0">Somente ao sair</option><option value="1">1 minuto</option><option value="5">5 minutos</option><option value="15">15 minutos</option><option value="30">30 minutos</option></select></label></section>
  </div>
}

function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}){return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)}/><i/></label>}
