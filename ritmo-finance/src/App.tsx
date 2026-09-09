import { ReactNode, useEffect, useState } from 'react'
import { ApiError, api, getBootstrap, installSyncListeners, mutate } from './lib/api'
import { cacheBootstrap, clearLocalData } from './lib/offline'
import type { BootstrapData, Debt, Goal, Transaction, Workspace } from './types'
import { navItems, Sidebar, MobileNav, Topbar, type Page, type ModalKind } from './ui/common'
import { Dashboard, Movements, Goals, Debts, CalendarPage, Reports, Profile, Profiles, Settings } from './ui/pages'
import { Modal, AuthPage, Loading, Toast } from './ui/dialogs'

export function App() {
  const initialPage = new URLSearchParams(location.search).get('page') as Page | null
  const [page,setPage]=useState<Page>(navItems.some((n)=>n.id===initialPage)?initialPage!:'dashboard')
  const [collapsed,setCollapsed]=useState(false),[data,setData]=useState<BootstrapData|null>(null),[loading,setLoading]=useState(true),[authRequired,setAuthRequired]=useState(false),[modal,setModal]=useState<ModalKind>(null),[toast,setToast]=useState<string|null>(null),[online,setOnline]=useState(navigator.onLine),[avatarKey,setAvatarKey]=useState(0)

  const notify=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(null),3200)}
  const applyTheme=(theme:BootstrapData['settings']['theme'])=>{const dark=theme==='dark'||(theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#10191b':'#00616c')}

  async function boot(workspace?:string){setLoading(true);try{const next=await getBootstrap(workspace);setData(next);applyTheme(next.settings.theme);setAuthRequired(false)}catch(e){if(e instanceof ApiError&&e.status===401){setData(null);setAuthRequired(true)}else notify(e instanceof Error?e.message:'Não foi possível abrir o Ritmo.')}finally{setLoading(false)}}

  useEffect(()=>{void boot();const removeSync=installSyncListeners();const onOnline=()=>setOnline(true),onOffline=()=>setOnline(false),onFlush=()=>void boot(data?.active_workspace.id);window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);window.addEventListener('ritmo:outbox-flushed',onFlush);return()=>{removeSync();window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);window.removeEventListener('ritmo:outbox-flushed',onFlush)}},[])
  useEffect(()=>{if(!data)return;const media=matchMedia('(prefers-color-scheme: dark)');const fn=()=>{if(data.settings.theme==='system')applyTheme('system')};media.addEventListener?.('change',fn);return()=>media.removeEventListener?.('change',fn)},[data?.settings.theme])

  async function add(kind:Exclude<ModalKind,null>,body:Record<string,unknown>){if(!data)return;const path=kind==='transaction'?'/api/transactions':kind==='goal'?'/api/goals':'/api/debts';const result=await mutate('POST',path,body);if(result.queued){notify('Salvo neste aparelho. Vai sincronizar quando a internet voltar.');const now=new Date().toISOString();if(kind==='transaction'){const temp:Transaction={id:`offline-${crypto.randomUUID()}`,workspace_id:data.active_workspace.id,type:body.type==='income'?'income':'expense',description:String(body.description||''),category:String(body.category||'Outros'),amount_cents:Number(body.amount_cents||0),date:String(body.date||now.slice(0,10)),due_date:String(body.due_date||'')||null,status:body.status==='pending'?'pending':'paid',version:1,created_at:now,updated_at:now};const next={...data,transactions:[temp,...data.transactions]};setData(next);await cacheBootstrap(data.active_workspace.id,next)}else if(kind==='goal'){const temp:Goal={id:`offline-${crypto.randomUUID()}`,workspace_id:data.active_workspace.id,title:String(body.title||''),target_cents:Number(body.target_cents||0),current_cents:Number(body.current_cents||0),deadline:String(body.deadline||'')||null,icon:'target',version:1,created_at:now,updated_at:now};const next={...data,goals:[temp,...data.goals]};setData(next);await cacheBootstrap(data.active_workspace.id,next)}else{const temp:Debt={id:`offline-${crypto.randomUUID()}`,workspace_id:data.active_workspace.id,title:String(body.title||''),creditor:String(body.creditor||''),total_cents:Number(body.total_cents||0),paid_cents:Number(body.paid_cents||0),due_date:String(body.due_date||'')||null,status:'active',version:1,created_at:now,updated_at:now};const next={...data,debts:[temp,...data.debts]};setData(next);await cacheBootstrap(data.active_workspace.id,next)}}else{notify('Salvo com sucesso.');await boot(data.active_workspace.id)}}

  async function removeItem(kind:'transactions'|'goals'|'debts',id:string,version:number){if(id.startsWith('offline-')){notify('Esse item ainda aguarda sincronização.');return}if(!confirm('Deseja excluir este item?'))return;const result=await mutate('DELETE',`/api/${kind}/${id}`,undefined,{version});notify(result.queued?'Exclusão agendada para sincronizar.':'Item excluído.');if(!result.queued&&data)await boot(data.active_workspace.id)}

  async function switchWorkspace(workspace:Workspace){if(data?.active_workspace.id===workspace.id)return;await boot(workspace.id);setPage('dashboard')}
  async function saveProfile(display_name:string,username:string){await api('/api/profile',{method:'PATCH',body:JSON.stringify({display_name,username})});notify('Perfil atualizado.');if(data)await boot(data.active_workspace.id)}
  async function uploadAvatar(file:File){if(file.size>2*1024*1024){notify('A foto deve ter no máximo 2 MB.');return}const response=await fetch('/api/profile/avatar',{method:'PUT',body:file,credentials:'include',headers:{'content-type':file.type||'image/jpeg'}});if(!response.ok){const body=await response.json().catch(()=>({error:'Falha no envio.'}));notify(body.error||'Falha no envio.');return}setAvatarKey(Date.now());notify('Foto atualizada.');if(data)await boot(data.active_workspace.id)}
  async function logout(){await api('/api/auth/logout',{method:'POST',body:'{}'}).catch(()=>undefined);await clearLocalData();setData(null);setAuthRequired(true);setPage('dashboard')}
  async function setTheme(theme:BootstrapData['settings']['theme']){await api('/api/settings',{method:'PATCH',body:JSON.stringify({theme})});if(data){const next={...data,settings:{...data.settings,theme}};setData(next);applyTheme(theme);await cacheBootstrap(data.active_workspace.id,next)}notify('Tema atualizado.')}

  if(loading&&!data)return <><Loading/><Toast message={toast}/></>
  if(authRequired||!data)return <><AuthPage notify={notify} onAuthenticated={()=>boot()}/><Toast message={toast}/></>

  const content:Record<Page,ReactNode>={
    dashboard:<Dashboard data={data} setPage={setPage} onAdd={()=>setModal('transaction')}/>,
    movements:<Movements data={data} onAdd={()=>setModal('transaction')} onDelete={(t)=>void removeItem('transactions',t.id,t.version)}/>,
    goals:<Goals data={data} onAdd={()=>setModal('goal')} onDelete={(g)=>void removeItem('goals',g.id,g.version)}/>,
    debts:<Debts data={data} onAdd={()=>setModal('debt')} onDelete={(d)=>void removeItem('debts',d.id,d.version)}/>,
    calendar:<CalendarPage data={data}/>,reports:<Reports data={data}/>,
    profile:<Profile data={data} onSave={saveProfile} onLogout={logout} onAvatar={uploadAvatar} cacheKey={avatarKey}/>,
    profiles:<Profiles data={data} onSwitch={(w)=>void switchWorkspace(w)}/>,
    settings:<Settings data={data} onTheme={setTheme} notify={notify}/>,
  }

  return <><div className={`app-shell ${collapsed?'is-collapsed':''}`}><Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} data={data} cacheKey={avatarKey}/><main className="app-main"><Topbar setPage={setPage} data={data} online={online} cacheKey={avatarKey}/><div className="content" key={page}>{content[page]}</div></main><MobileNav page={page} setPage={setPage}/></div>{modal&&<Modal kind={modal} workspaceId={data.active_workspace.id} onClose={()=>setModal(null)} onSubmit={add}/>}<Toast message={toast}/></>
}
