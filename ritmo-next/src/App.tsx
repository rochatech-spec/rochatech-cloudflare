import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, login, logout, mutate, register, scopePrefix } from './api/client'
import { FinancialSheet, type FinancialAction, type FinancialPayload } from './components/FinancialSheet'
import { LockScreen } from './components/LockScreen'
import { ProfileSwitcher } from './components/ProfileSwitcher'
import type { BootstrapData, Debt, FinancialScope, Goal, PageKey, Settings } from './domain/types'
import { clearFinancialCache } from './offline/db'
import { AuthPage } from './pages/AuthPage'
import { CalendarPage } from './pages/CalendarPage'
import { DebtsPage } from './pages/DebtsPage'
import { GoalsPage } from './pages/GoalsPage'
import { HomePage } from './pages/HomePage'
import { InsightsPage } from './pages/InsightsPage'
import { MenuPage } from './pages/MenuPage'
import { MovementsPage } from './pages/MovementsPage'
import { buildNotices, NotificationsPage } from './pages/NotificationsPage'
import { ProfilePage } from './pages/ProfilePage'
import { ReportPage } from './pages/ReportPage'
import { SettingsPage } from './pages/SettingsPage'
import { SharingPage } from './pages/SharingPage'
import { deviceSecurityEnabled } from './security/passkeys'
import { changeScope, installLowConsumptionSync, invalidateFinancialCache, loadScope, prefetchOtherScope, refreshScope, submitMutation } from './sync/engine'
import { Icon, type IconName } from './ui/Icon'

const menuPages = new Set<PageKey>(['menu','report','sharing','calendar','insights','settings','profile','notifications'])

function applyTheme(theme: Settings['theme']='system') {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', dark ? '#111817' : '#F7F5EF')
}

function App() {
  const [data,setData]=useState<BootstrapData|null>(null)
  const [scope,setScope]=useState<FinancialScope>(()=>localStorage.getItem('ritmo:last-scope')==='shared'?'shared':'personal')
  const [page,setPage]=useState<PageKey>('home')
  const [action,setAction]=useState<FinancialAction|null>(null)
  const [loading,setLoading]=useState(true)
  const [switching,setSwitching]=useState(false)
  const [authRequired,setAuthRequired]=useState(false)
  const [locked,setLocked]=useState(false)
  const [toast,setToast]=useState<string|null>(null)
  const lockTimer=useRef<number|undefined>(undefined)
  const lastActivity=useRef(Date.now())

  const notify = useCallback((message:string)=>{setToast(message);window.setTimeout(()=>setToast(null),2600)},[])

  const installLockTimer = useCallback((nextData:BootstrapData|null)=>{
    if(lockTimer.current)window.clearTimeout(lockTimer.current)
    if(!nextData||locked)return
    const minutes=Number(nextData.settings?.auto_lock_minutes??5)
    if(minutes<=0)return
    const ms=minutes*60*1000
    lockTimer.current=window.setTimeout(()=>setLocked(true),ms)
  },[locked])

  const setFreshData = useCallback((next:BootstrapData, keepScope=true)=>{
    setData(next)
    if(!keepScope)setScope(next.scope)
    applyTheme(next.settings?.theme)
    localStorage.setItem('ritmo:last-scope',next.scope)
  },[])

  const boot = useCallback(async(afterAuth=false)=>{
    setLoading(true)
    try{
      const desired:FinancialScope=scope==='shared'?'shared':'personal'
      const result=await loadScope(desired,{forceNetwork:navigator.onLine})
      const next=result.data
      setScope(next.scope);setFreshData(next);setAuthRequired(false)
      if(afterAuth)setLocked(false)
      else setLocked(Boolean(Number(next.settings?.auto_lock_minutes??5)>0 || deviceSecurityEnabled(next.profile.id,Number(next.security?.webauthn_count||0))))
      void prefetchOtherScope(next.scope)
    }catch(err){
      if(err instanceof ApiError&&err.status===401){await clearFinancialCache();setData(null);setAuthRequired(true);setLocked(false)}
      else if(!data){setAuthRequired(false);notify(err instanceof Error?err.message:'Não foi possível abrir o Ritmo.')}
    }finally{setLoading(false)}
  },[scope,setFreshData,notify,data])

  useEffect(()=>{void boot(false);const uninstall=installLowConsumptionSync();const synced=()=>{if(!locked&&data)void refreshCurrent()};window.addEventListener('ritmo:synced',synced);return()=>{uninstall();window.removeEventListener('ritmo:synced',synced)}},[])
  useEffect(()=>{applyTheme(data?.settings?.theme);const media=matchMedia('(prefers-color-scheme: dark)');const listener=()=>{if((data?.settings?.theme||'system')==='system')applyTheme('system')};media.addEventListener?.('change',listener);return()=>media.removeEventListener?.('change',listener)},[data?.settings?.theme])
  useEffect(()=>{if(!data||locked)return;const activity=()=>{lastActivity.current=Date.now();installLockTimer(data)};const events=['pointerdown','keydown','touchstart'] as const;events.forEach(e=>window.addEventListener(e,activity,{passive:true}));installLockTimer(data);const visibility=()=>{if(document.hidden){if(lockTimer.current)window.clearTimeout(lockTimer.current)}else{const minutes=Number(data.settings?.auto_lock_minutes??5);if(minutes>0&&Date.now()-lastActivity.current>=minutes*60*1000)setLocked(true);else installLockTimer(data)}};document.addEventListener('visibilitychange',visibility);return()=>{events.forEach(e=>window.removeEventListener(e,activity));document.removeEventListener('visibilitychange',visibility);if(lockTimer.current)window.clearTimeout(lockTimer.current)}},[data,locked,installLockTimer])

  async function refreshCurrent(nextScope:FinancialScope=scope){
    if(!navigator.onLine)return
    try{const fresh=await refreshScope(nextScope);setScope(fresh.scope);setFreshData(fresh)}catch(err){if(err instanceof ApiError&&err.status===401){await clearFinancialCache();setData(null);setAuthRequired(true)}}
  }

  async function authenticate(kind:'login'|'register',values:string[]){
    await clearFinancialCache();localStorage.removeItem('ritmo:cache-owner');localStorage.setItem('ritmo:last-scope','personal');setScope('personal')
    if(kind==='login')await login(values[0],values[1]);else await register(values[0],values[1],values[2])
    await boot(true)
  }

  async function otherAccount(){try{await logout()}catch{}await clearFinancialCache();localStorage.removeItem('ritmo:cache-owner');setData(null);setLocked(false);setAuthRequired(true);setPage('home')}

  async function switchProfile(next:FinancialScope){
    if(next===scope||switching)return
    setSwitching(true)
    try{const nextData=await changeScope(next);setScope(nextData.scope);setFreshData(nextData);localStorage.setItem('ritmo:last-scope',nextData.scope)}catch(err){notify(err instanceof Error?err.message:'Não foi possível trocar de perfil.')}finally{setSwitching(false)}
  }

  async function completeMutation(result:{queued:boolean},affected:FinancialScope){
    if(result.queued){notify('Salvo neste aparelho. O Ritmo sincroniza quando a conexão voltar.');return}
    await invalidateFinancialCache()
    if(affected===scope)await refreshCurrent(scope)
    else void prefetchOtherScope(scope)
    notify('Salvo com sucesso.')
  }

  async function submitFinancial(payload:FinancialPayload){
    const {action,targetScope,body}=payload
    let path='',method:'POST'|'PATCH'='POST',affected=targetScope
    const prefix=scopePrefix(targetScope)
    if(action.type==='income'){path=`${prefix}/incomes${action.item?`/${action.item.id}`:''}`;method=action.item?'PATCH':'POST'}
    if(action.type==='expense'){path=`${prefix}/expenses${action.item?`/${action.item.id}`:''}`;method=action.item?'PATCH':'POST'}
    if(action.type==='debt'){path=`${prefix}/debts${action.item?`/${action.item.id}`:''}`;method=action.item?'PATCH':'POST'}
    if(action.type==='goal'){path=`${prefix}/goals${action.item?`/${action.item.id}`:''}`;method=action.item?'PATCH':'POST'}
    if(action.type==='payment'||action.type==='credit'){affected=action.scope;path=`${scopePrefix(action.scope)}/debts/${action.debt.id}/${action.type}`}
    if(action.type==='contribution'){affected=action.scope;path=`${scopePrefix(action.scope)}/goals/${action.goal.id}/contributions`}
    if(action.type==='transfer'){affected='personal';path='/api/wallet/transfers'}
    const result=await submitMutation(path,method,body)
    await completeMutation(result,affected)
  }

  async function deleteMovement(item:{id:string;kind:'income'|'expense'}){if(!confirm(`Excluir esta ${item.kind==='income'?'entrada':'saída'}?`))return;const plural=item.kind==='income'?'incomes':'expenses';await completeMutation(await submitMutation(`${scopePrefix(scope)}/${plural}/${item.id}`,'DELETE'),scope)}
  async function deleteDebt(debt:Debt){if(!confirm(`Excluir a dívida “${debt.creditor}” e os lançamentos vinculados?`))return;await completeMutation(await submitMutation(`${scopePrefix(scope)}/debts/${debt.id}`,'DELETE'),scope)}
  async function deleteGoal(goal:Goal){if(!confirm(`Excluir a meta “${goal.name}”?`))return;await completeMutation(await submitMutation(`${scopePrefix(scope)}/goals/${goal.id}`,'DELETE'),scope)}

  async function sharingAction(path:string,body:unknown={}){await mutate(path,'POST',body);await invalidateFinancialCache();await refreshCurrent('personal');notify('Compartilhamento atualizado.')}
  async function saveSettings(patch:Partial<Settings>){await mutate('/api/settings','PATCH',patch);setData(current=>current?{...current,settings:{...(current.settings||{}),...patch}}:current);if(patch.theme)applyTheme(patch.theme);notify('Configurações salvas.')}
  async function saveProfile(values:{name:string;username:string;password?:string}){await mutate('/api/profile','PATCH',values);await invalidateFinancialCache();await refreshCurrent(scope)}

  const noticeCount=useMemo(()=>data?buildNotices(data).length:0,[data])

  if(loading&&!data)return <div className="app-loading"><span className="loading-logo">R</span><strong>Ritmo</strong></div>
  if(authRequired||!data)return <AuthPage onLogin={(u,p)=>authenticate('login',[u,p])} onRegister={(n,u,p)=>authenticate('register',[n,u,p])}/>
  if(locked)return <LockScreen data={data} onUnlock={()=>{lastActivity.current=Date.now();setLocked(false)}} onOtherAccount={()=>void otherAccount()}/>

  const pageContent=(()=>{
    if(page==='home')return <HomePage data={data} scope={scope} onQuick={(type)=>setAction(type==='transfer'?{type:'transfer',scope:'personal'}:{type,scope} as FinancialAction)} onReport={()=>setPage('report')} onSharing={()=>setPage('sharing')}/>
    if(page==='movements')return <MovementsPage data={data} onNew={(type)=>setAction({type,scope})} onEdit={(item)=>setAction(item.kind==='income'?{type:'income',item,scope}:{type:'expense',item,scope})} onDelete={(item)=>void deleteMovement(item)}/>
    if(page==='debts')return <DebtsPage data={data} onNew={()=>setAction({type:'debt',scope})} onEdit={(debt)=>setAction({type:'debt',item:debt,scope})} onDelete={(debt)=>void deleteDebt(debt)} onEvent={(debt,type)=>setAction({type,debt,scope})}/>
    if(page==='goals')return <GoalsPage data={data} onNew={()=>setAction({type:'goal',scope})} onEdit={(goal)=>setAction({type:'goal',item:goal,scope})} onDelete={(goal)=>void deleteGoal(goal)} onContribution={(goal)=>setAction({type:'contribution',goal,scope})}/>
    if(page==='report')return <ReportPage initialScope={scope} sharedAvailable={data.sharing.active} profileName={data.profile.name}/>
    if(page==='sharing')return <SharingPage data={data} onTransfer={()=>setAction({type:'transfer',scope:'personal'})} onInvite={(username)=>sharingAction('/api/sharing/invite',{username})} onAcceptCode={(code)=>sharingAction('/api/sharing/accept-code',{code})} onInviteAction={(id,a)=>sharingAction(`/api/sharing/invites/${id}/${a}`)}/>
    if(page==='calendar')return <CalendarPage data={data}/>
    if(page==='insights')return <InsightsPage data={data}/>
    if(page==='settings')return <SettingsPage settings={data.settings||{}} userId={data.profile.id} credentialCount={Number(data.security?.webauthn_count||0)} onSave={saveSettings} onSecurityChanged={()=>refreshCurrent(scope)}/>
    if(page==='profile')return <ProfilePage profile={data.profile} onSave={saveProfile} onLogout={otherAccount}/>
    if(page==='notifications')return <NotificationsPage data={data}/>
    return <MenuPage onOpen={setPage}/>
  })()

  return <div className="app-shell">
    <aside className="desktop-sidebar"><button className="brand-button" type="button" onClick={()=>setPage('home')}><span>R</span><strong>Ritmo</strong></button><nav>{desktopNav.map(item=><NavButton key={item.page} item={item} active={page===item.page||(item.page==='menu'&&menuPages.has(page))} onClick={()=>setPage(item.page)}/>)}</nav><button className="sidebar-profile" type="button" onClick={()=>setPage('profile')}><span>{data.profile.name.slice(0,1).toUpperCase()}</span><div><strong>{data.profile.name}</strong><small>@{data.profile.username}</small></div></button></aside>
    <div className="app-column">
      <header className="mobile-topbar"><button className="mobile-brand" type="button" onClick={()=>setPage('home')}><span>R</span><strong>Ritmo</strong></button><button className="notification-button" type="button" onClick={()=>setPage('notifications')} aria-label="Avisos"><Icon name="bell"/>{noticeCount>0&&<i>{Math.min(99,noticeCount)}</i>}</button></header>
      <main className="app-main">{page==='home'&&<ProfileSwitcher scope={scope} data={data} onChange={(value)=>void switchProfile(value)} busy={switching}/>}<div className="page-frame" key={`${page}-${scope}`}>{pageContent}</div></main>
      <nav className="bottom-nav">{mobileNav.map(item=><NavButton key={item.page} item={item} active={page===item.page||(item.page==='menu'&&menuPages.has(page))} onClick={()=>setPage(item.page)}/>)}</nav>
    </div>
    {action&&<FinancialSheet action={action} sharedAvailable={data.sharing.active} onClose={()=>setAction(null)} onSubmit={submitFinancial}/>} 
    {toast&&<div className="toast" role="status">{toast}</div>}
  </div>
}

type NavItem={page:PageKey;label:string;icon:IconName}
const mobileNav:NavItem[]=[{page:'home',label:'Início',icon:'home'},{page:'movements',label:'Movimentos',icon:'movements'},{page:'debts',label:'Dívidas',icon:'debt'},{page:'goals',label:'Metas',icon:'goal'},{page:'menu',label:'Menu',icon:'menu'}]
const desktopNav:NavItem[]=[...mobileNav.slice(0,4),{page:'report',label:'Relatório',icon:'report'},{page:'calendar',label:'Calendário',icon:'calendar'},{page:'insights',label:'Insights',icon:'spark'},{page:'menu',label:'Menu',icon:'menu'}]
function NavButton({item,active,onClick}:{item:NavItem;active:boolean;onClick:()=>void}){return <button type="button" className={active?'nav-button active':'nav-button'} onClick={onClick}><Icon name={item.icon}/><span>{item.label}</span></button>}

export default App
