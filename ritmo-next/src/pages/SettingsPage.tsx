import { useEffect, useMemo, useState } from 'react'
import type { MobileShortcut, Settings } from '../domain/types'
import { deviceSecurityEnabled, deviceSecurityPresentation, disableDeviceSecurity, platformSecurityAvailable, registerDeviceSecurity } from '../security/passkeys'
import { Icon, type IconName } from '../ui/Icon'

const shortcutOptions:Array<{key:MobileShortcut;label:string;copy:string;icon:IconName}>=[
  {key:'expenses',label:'Movimentos',copy:'Entradas e saídas',icon:'movements'},
  {key:'debts',label:'Dívidas',copy:'Compromissos e haveres',icon:'debt'},
  {key:'goals',label:'Metas',copy:'Objetivos e aportes',icon:'goal'},
  {key:'calendar',label:'Calendário',copy:'Prazos e vencimentos',icon:'calendar'},
  {key:'insights',label:'Insights',copy:'Leituras dos seus dados',icon:'spark'},
  {key:'sharing',label:'Compartilhamento',copy:'Espaço do casal',icon:'users'},
  {key:'settings',label:'Configurações',copy:'Preferências do app',icon:'settings'},
]
function parseShortcuts(value:Settings['mobile_shortcuts']):MobileShortcut[]{
  const allowed=new Set(shortcutOptions.map(x=>x.key))
  let source:unknown=value
  if(typeof value==='string'){try{source=JSON.parse(value)}catch{source=[]}}
  const valid=Array.isArray(source)?source.filter((x):x is MobileShortcut=>typeof x==='string'&&allowed.has(x as MobileShortcut)):[]
  return [...new Set(valid)].slice(0,3).length===3?[...new Set(valid)].slice(0,3):['expenses','debts','goals']
}

export function SettingsPage({ settings, userId, credentialCount, onSave, onSecurityChanged }: { settings:Settings; userId:string; credentialCount:number; onSave:(patch:Partial<Settings>)=>Promise<void>; onSecurityChanged:()=>Promise<void> }) {
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState<string|null>(null)
  const [securityAvailable,setSecurityAvailable]=useState<boolean|null>(null)
  const [shortcuts,setShortcuts]=useState<MobileShortcut[]>(()=>parseShortcuts(settings.mobile_shortcuts))
  const [shortcutsDirty,setShortcutsDirty]=useState(false)
  const presentation=useMemo(()=>deviceSecurityPresentation(),[])

  useEffect(()=>{setShortcuts(parseShortcuts(settings.mobile_shortcuts));setShortcutsDirty(false)},[settings.mobile_shortcuts])
  useEffect(()=>{let active=true;void platformSecurityAvailable().then(ok=>{if(active)setSecurityAvailable(ok)});return()=>{active=false}},[])

  async function save(patch:Partial<Settings>){setBusy(true);setMessage(null);try{await onSave(patch)}finally{setBusy(false)}}
  async function saveShortcuts(){if(shortcuts.length!==3)return;await save({mobile_shortcuts:shortcuts});setShortcutsDirty(false);setMessage('Atalhos atualizados.')}

  const theme=settings.theme||'system'
  const securityEnabled=deviceSecurityEnabled(userId,credentialCount)
  async function toggleSecurity(){
    setBusy(true);setMessage(null)
    try{
      if(securityEnabled){disableDeviceSecurity(userId);setMessage(`${presentation.label} desativado somente neste aparelho.`)}
      else{
        if(securityAvailable!==true){setMessage('O desbloqueio seguro não está disponível neste aparelho agora. Sua senha continua funcionando normalmente.');return}
        await registerDeviceSecurity(userId);await onSecurityChanged();setMessage(`${presentation.label} ativado neste aparelho.`)
      }
    }catch(err){setMessage(err instanceof Error?err.message:'Não foi possível alterar o desbloqueio.')}
    finally{setBusy(false)}
  }
  const securityCopy=securityEnabled?`${presentation.label} está pronto para abrir o Ritmo neste aparelho.`:securityAvailable===null?'Verificando o desbloqueio disponível…':securityAvailable?presentation.description:'Neste aparelho, o Ritmo continuará protegido pela sua senha.'

  function toggleShortcut(key:MobileShortcut){
    setShortcuts(current=>{
      if(current.includes(key))return current.filter(x=>x!==key)
      if(current.length>=3)return current
      return [...current,key]
    });setShortcutsDirty(true)
  }
  function moveShortcut(key:MobileShortcut,direction:-1|1){
    setShortcuts(current=>{const i=current.indexOf(key),j=i+direction;if(i<0||j<0||j>=current.length)return current;const copy=[...current];[copy[i],copy[j]]=[copy[j],copy[i]];return copy});setShortcutsDirty(true)
  }

  return <div className="page-stack ios-settings-page">
    <header className="page-header ios-page-header"><div><small>CONFIGURAÇÕES</small><h1>Do seu jeito</h1><p>Preferências organizadas em grupos, sem misturar conta, aparência e segurança.</p></div></header>

    <section className="ios-menu-section"><h2>Aparência</h2><div className="ios-list-card setting-group-card"><div className="theme-segmented">{(['light','dark','system'] as const).map(value=><button type="button" key={value} className={theme===value?'active':''} onClick={()=>void save({theme:value})} disabled={busy}><span className={`theme-dot ${value}`}/><strong>{value==='light'?'Claro':value==='dark'?'Escuro':'Automático'}</strong></button>)}</div></div></section>

    <section className="ios-menu-section"><h2>Avisos</h2><div className="ios-list-card setting-group-card">
      <Toggle label="Avisos do Ritmo" copy="Permitir avisos importantes" checked={Boolean(settings.notifications_enabled)} onChange={v=>void save({notifications_enabled:v?1:0})}/>
      <Toggle label="Vencimentos próximos" copy="Lembrar antes das contas" checked={Boolean(settings.notify_due)} onChange={v=>void save({notify_due:v?1:0})}/>
      <Toggle label="Contas vencidas" copy="Destacar o que entrou em atraso" checked={Boolean(settings.notify_overdue)} onChange={v=>void save({notify_overdue:v?1:0})}/>
      <Toggle label="Progresso das metas" copy="Avisos de prazo e evolução" checked={Boolean(settings.notify_goals)} onChange={v=>void save({notify_goals:v?1:0})}/>
      <SettingSelect label="Antecedência" copy="Quantos dias antes avisar" value={String(settings.reminder_days??3)} onChange={v=>void save({reminder_days:Number(v)})} options={['1','2','3','5','7','10'].map(v=>[v,`${v} dias`])}/>
      <Toggle label="Resumo mensal" copy="Lembrete para fechar o mês" checked={Boolean(settings.monthly_summary)} onChange={v=>void save({monthly_summary:v?1:0})}/>
    </div></section>

    <section className="ios-menu-section"><h2>Barra inferior</h2><div className="ios-list-card shortcuts-card"><div className="shortcut-intro"><strong>Escolha 3 atalhos</strong><small>Início e Menu ficam fixos. Os três itens do meio podem ser personalizados.</small></div>{shortcutOptions.map(option=>{const index=shortcuts.indexOf(option.key),selected=index>=0;return <div className={selected?'shortcut-row selected':'shortcut-row'} key={option.key}><button className="shortcut-select" type="button" onClick={()=>toggleShortcut(option.key)}><span className="ios-list-icon"><Icon name={option.icon}/></span><span><strong>{option.label}</strong><small>{option.copy}</small></span><i>{selected?<Icon name="check"/>:null}</i></button>{selected&&<span className="shortcut-order"><button type="button" disabled={index===0} onClick={()=>moveShortcut(option.key,-1)} aria-label="Mover para cima">↑</button><b>{index+1}</b><button type="button" disabled={index===shortcuts.length-1} onClick={()=>moveShortcut(option.key,1)} aria-label="Mover para baixo">↓</button></span>}</div>})}<button className="ios-save-row" type="button" disabled={!shortcutsDirty||shortcuts.length!==3||busy} onClick={()=>void saveShortcuts()}>{shortcuts.length===3?'Salvar atalhos':`Escolha mais ${3-shortcuts.length}`}</button></div></section>

    <section className="ios-menu-section biometric-setting"><h2>Segurança</h2><div className="ios-list-card setting-group-card">
      <div className="ios-setting-row security-ios-row"><span className="ios-list-icon biometric"><Icon name={presentation.icon}/></span><span className="ios-setting-copy"><strong>{presentation.label}</strong><small>{securityCopy}</small><em className={securityEnabled?'security-state active':'security-state'}>{securityEnabled?'Ativo neste aparelho':securityAvailable===false?'Indisponível agora':'Opcional'}</em></span><button className={securityEnabled?'secondary-button security-compact-button':'primary-button security-compact-button'} type="button" onClick={()=>void toggleSecurity()} disabled={busy||(!securityEnabled&&securityAvailable!==true)}>{busy?'…':securityEnabled?'Desativar':'Ativar'}</button></div>
      <SettingSelect label="Bloquear após" copy="Solicitar desbloqueio depois de inatividade" value={String(settings.auto_lock_minutes??5)} onChange={v=>void save({auto_lock_minutes:Number(v)})} options={[["0","Somente ao sair"],["1","1 minuto"],["5","5 minutos"],["15","15 minutos"],["30","30 minutos"]]}/>
      <div className="security-fallback ios-security-note"><Icon name="shield"/><span>Sua senha continua disponível como alternativa de desbloqueio.</span></div>
    </div></section>

    {message&&<div className="form-message settings-message" role="status">{message}</div>}
  </div>
}

function Toggle({label,copy,checked,onChange}:{label:string;copy:string;checked:boolean;onChange:(value:boolean)=>void}){return <label className="ios-setting-row toggle-row-ios"><span className="ios-setting-copy"><strong>{label}</strong><small>{copy}</small></span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i/></label>}
function SettingSelect({label,copy,value,onChange,options}:{label:string;copy:string;value:string;onChange:(value:string)=>void;options:string[][]}){return <label className="ios-setting-row"><span className="ios-setting-copy"><strong>{label}</strong><small>{copy}</small></span><select className="ios-select" value={value} onChange={e=>onChange(e.target.value)}>{options.map(([v,t])=><option value={v} key={v}>{t}</option>)}</select></label>}
