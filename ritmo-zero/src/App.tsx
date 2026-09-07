import {useEffect,useMemo,useState} from 'react'
import {ApiError,installSync,invalidate,loadBootstrap,login,logout,mutate,patch,register,uploadAvatar} from './api'
import {clearLocal} from './db'
import {Icon,type IconName} from './Icon'
import type {Bootstrap,Debt,Goal,Scope,Transaction} from './types'

type Page='home'|'transactions'|'planning'|'goals'|'more'|'debts'|'reports'|'sharing'|'account'
type Modal=
 | {kind:'transaction';type:'INCOME'|'EXPENSE';item?:Transaction}
 | {kind:'budget'}
 | {kind:'goal';item?:Goal}
 | {kind:'goal-entry';item:Goal}
 | {kind:'debt';item?:Debt}
 | {kind:'debt-payment';item:Debt}
 | {kind:'contribution'}
 | null

const BRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
const money=(n:number|string|undefined|null)=>BRL.format(Number(n||0))
const today=()=>new Date().toISOString().slice(0,10)
const monthName=(m:number)=>['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][m-1]
const first=(s?:string|null)=>String(s||'').trim().split(/\s+/)[0]||'Você'
const initials=(s?:string|null)=>String(s||'R').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()
const pct=(a:number,b:number)=>b<=0?0:Math.min(100,Math.round(a/b*100))

function applyTheme(theme:Bootstrap['settings']['theme']='SYSTEM'){
 const dark=theme==='DARK'||(theme==='SYSTEM'&&matchMedia('(prefers-color-scheme: dark)').matches)
 document.documentElement.dataset.theme=dark?'dark':'light'
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#071E24':'#F7F5EF')
}

export default function App(){
 const [data,setData]=useState<Bootstrap|null>(null)
 const [scope,setScope]=useState<Scope>(()=>localStorage.getItem('ritmo:scope')==='couple'?'couple':'personal')
 const [page,setPage]=useState<Page>('home')
 const [auth,setAuth]=useState(false)
 const [loading,setLoading]=useState(true)
 const [modal,setModal]=useState<Modal>(null)
 const [toast,setToast]=useState<string|null>(null)
 const [busy,setBusy]=useState(false)
 const notify=(m:string)=>{setToast(m);window.setTimeout(()=>setToast(null),2600)}
 async function boot(nextScope:Scope=scope,force=false){
  setLoading(!data)
  try{const fresh=await loadBootstrap(nextScope,force);setData(fresh);setScope(fresh.scope);localStorage.setItem('ritmo:scope',fresh.scope);applyTheme(fresh.settings.theme);setAuth(false)}
  catch(err){if(err instanceof ApiError&&err.status===401){setData(null);setAuth(true)}else{notify(err instanceof Error?err.message:'Não foi possível abrir o Ritmo.')}}finally{setLoading(false)}
 }
 useEffect(()=>{void boot(scope,false);const off=installSync();const synced=()=>void boot(scope,true);window.addEventListener('ritmo:synced',synced);return()=>{off();window.removeEventListener('ritmo:synced',synced)}},[])
 useEffect(()=>{const fn=()=>{if(data?.settings.theme==='SYSTEM')applyTheme('SYSTEM')};const mq=matchMedia('(prefers-color-scheme: dark)');mq.addEventListener?.('change',fn);return()=>mq.removeEventListener?.('change',fn)},[data?.settings.theme])
 async function switchScope(next:Scope){
  if(next==='couple'&&!data?.sharing.active){setPage('sharing');return}
  if(next===scope)return
  setBusy(true);try{await boot(next,false);setPage('home')}finally{setBusy(false)}
 }
 async function afterMutation(message='Salvo com sucesso.'){await invalidate();if(navigator.onLine)await boot(scope,true);notify(message)}
 async function signOut(){try{await logout()}catch{}await clearLocal();setData(null);setAuth(true);setPage('home')}
 if(loading&&!data)return <Loading/>
 if(auth||!data)return <AuthView onDone={()=>boot('personal',true)}/>
 const nav:{page:Page;label:string;icon:IconName}[]=[
  {page:'home',label:'Início',icon:'home'},{page:'transactions',label:'Transações',icon:'transactions'},{page:'planning',label:'Planejamento',icon:'plan'},{page:'goals',label:'Metas',icon:'heart'},{page:'more',label:'Mais',icon:'more'}]
 return <div className="app-shell">
  <aside className="sidebar">
   <button className="sidebar-brand" onClick={()=>setPage('home')}><img src="/brand-wordmark.svg"/></button>
   <ScopeTabs data={data} scope={scope} onChange={switchScope} compact/>
   <nav>{nav.map(n=><NavButton key={n.page} {...n} active={page===n.page} onClick={()=>setPage(n.page)}/>)}</nav>
   <div className="sidebar-foot"><button onClick={()=>setPage('account')}><Avatar data={data}/><span><b>{data.profile.name}</b><small>{data.profile.email}</small></span></button></div>
  </aside>
  <main className="main-column">
   <header className="topbar"><img className="mobile-logo" src="/brand-wordmark.svg"/><ScopeTabs data={data} scope={scope} onChange={switchScope}/><button className="icon-button" onClick={()=>setPage('account')} aria-label="Minha conta"><Avatar data={data}/></button></header>
   <div className="page-wrap">
    {page==='home'&&<Dashboard data={data} scope={scope} onPage={setPage} onModal={setModal}/>} 
    {page==='transactions'&&<TransactionsPage data={data} onModal={setModal} onDelete={async(id)=>{if(!confirm('Excluir este lançamento?'))return;await mutate(`/api/transactions/${id}`,'DELETE');await afterMutation('Lançamento excluído.')}}/>}
    {page==='planning'&&<PlanningPage data={data} onModal={setModal}/>} 
    {page==='goals'&&<GoalsPage data={data} onModal={setModal} onDelete={async(id)=>{if(!confirm('Excluir esta meta?'))return;await mutate(`/api/goals/${id}`,'DELETE');await afterMutation('Meta excluída.')}}/>}
    {page==='more'&&<MorePage data={data} onPage={setPage}/>} 
    {page==='debts'&&<DebtsPage data={data} onModal={setModal} onDelete={async(id)=>{if(!confirm('Excluir esta dívida?'))return;await mutate(`/api/debts/${id}`,'DELETE');await afterMutation('Dívida excluída.')}}/>}
    {page==='reports'&&<ReportsPage data={data}/>} 
    {page==='sharing'&&<SharingPage data={data} onChanged={async(m)=>{await invalidate();await boot('personal',true);notify(m)}} onModal={setModal}/>} 
    {page==='account'&&<AccountPage data={data} onSaved={async(m)=>{await invalidate();await boot(scope,true);notify(m)}} onLogout={signOut}/>} 
   </div>
   <nav className="bottom-nav">{nav.map(n=><NavButton key={n.page} {...n} active={page===n.page} onClick={()=>setPage(n.page)}/>)}</nav>
  </main>
  {modal&&<ActionModal modal={modal} data={data} scope={scope} onClose={()=>setModal(null)} onSaved={afterMutation}/>} 
  {toast&&<div className="toast">{toast}</div>}
  {busy&&<div className="busy-bar"/>}
 </div>
}

function Loading(){return <div className="loading"><img src="/icon.svg"/><img className="loading-word" src="/brand-wordmark.svg"/><span>Organize hoje. Viva melhor amanhã.</span></div>}

function AuthView({onDone}:{onDone:()=>Promise<void>}){
 const [mode,setMode]=useState<'login'|'register'>('login'),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{if(mode==='login')await login(String(f.get('email')),String(f.get('password')));else await register(String(f.get('name')),String(f.get('email')),String(f.get('password')));await onDone()}catch(err){setError(err instanceof Error?err.message:'Não foi possível entrar.')}finally{setBusy(false)}}
 return <div className="auth-page">
  <section className="auth-story"><img src="/brand-wordmark.svg"/><h1>Mais organização para uma vida mais livre.</h1><div className="story-list"><span><Icon name="plan"/>Planeje o seu hoje</span><span><Icon name="goal"/>Conquiste seus sonhos</span><span><Icon name="heart"/>Viva o seu ritmo</span></div><blockquote>Disciplina hoje,<br/>liberdade sempre.</blockquote></section>
  <section className="auth-card"><img src="/brand-wordmark.svg"/><h2>{mode==='login'?'Bem-vindo(a)!':'Crie seu Ritmo'}</h2><p>{mode==='login'?'Organize hoje, viva melhor amanhã.':'Seu controle pessoal começa aqui.'}</p>
   <form onSubmit={submit}>{mode==='register'&&<label><span>Nome</span><input name="name" required autoComplete="name"/></label>}<label><span>E-mail</span><input type="email" name="email" required autoComplete="email"/></label><label><span>Senha</span><input type="password" name="password" required minLength={8} autoComplete={mode==='login'?'current-password':'new-password'}/></label>{error&&<div className="form-error">{error}</div>}<button className="primary wide" disabled={busy}>{busy?'Aguarde…':mode==='login'?'Entrar':'Criar conta'}</button></form>
   <div className="auth-divider"><span>ou</span></div><button className="biometric" type="button" disabled><Icon name="shield"/> Entrar com biometria <small>disponível após configurar</small></button>
   <p className="auth-switch">{mode==='login'?'Ainda não tem uma conta?':'Já tem uma conta?'} <button onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'Criar conta':'Entrar'}</button></p>
   <div className="legal-note"><Icon name="shield"/><span>O Ritmo <b>não é banco</b> e não movimenta dinheiro. Ele organiza os registros que você informa.</span></div>
  </section>
 </div>
}

function Avatar({data,className=''}:{data:Bootstrap;className?:string}){return data.profile.avatar_url?<img className={`avatar ${className}`} src={data.profile.avatar_url}/>:<span className={`avatar avatar-fallback ${className}`}>{initials(data.profile.name)}</span>}

function ScopeTabs({data,scope,onChange,compact=false}:{data:Bootstrap;scope:Scope;onChange:(s:Scope)=>void;compact?:boolean}){
 return <div className={`scope-tabs ${compact?'compact':''}`}>
  <button className={scope==='personal'?'active':''} onClick={()=>onChange('personal')}><Icon name="user"/><span><b>Ritmo</b>{!compact&&<small>Pessoal</small>}</span></button>
  <button className={scope==='couple'?'active couple':''} onClick={()=>onChange('couple')}><Icon name="users"/><span><b>Nosso Ritmo</b>{!compact&&<small>{data.sharing.active?'Casal':'Conectar'}</small>}</span></button>
 </div>
}

function NavButton({label,icon,active,onClick}:{label:string;icon:IconName;active:boolean;onClick:()=>void}){return <button className={active?'nav-item active':'nav-item'} onClick={onClick}><Icon name={icon}/><span>{label}</span></button>}

function Dashboard({data,scope,onPage,onModal}:{data:Bootstrap;scope:Scope;onPage:(p:Page)=>void;onModal:(m:Modal)=>void}){
 const goals=data.goals.filter(g=>g.status==='ACTIVE').slice(0,2),shared=scope==='couple'
 return <div className="stack">
  <section className={`welcome-card ${shared?'couple':''}`}><div className="welcome-line"><Avatar data={data}/><div><h1>Olá, {first(data.profile.name)}! <span>👋</span></h1><p>{shared?'Este é o espaço financeiro de vocês.':'Que bom ter você por aqui!'}</p></div><button className="icon-button"><Icon name="bell"/></button></div>
   <div className="balance-box"><span>{shared?'Saldo do Nosso Ritmo':'Saldo atual'} <small>○</small></span><strong>{money(data.summary.balance)}</strong><em className={data.summary.monthChange>=0?'up':'down'}>{data.summary.monthChange>=0?'↑':'↓'} {Math.abs(data.summary.monthChange)}% em relação ao mês anterior</em></div>
   <div className="money-grid"><Metric label="Entradas" value={data.summary.income} icon="arrowUp" kind="green"/><Metric label="Saídas" value={data.summary.expenses} icon="arrowDown" kind="red"/></div>
   <div className="quick-grid"><button onClick={()=>onModal({kind:'transaction',type:'INCOME'})}><Icon name="plus"/><span>Adicionar</span></button><button onClick={()=>onModal({kind:'transaction',type:'EXPENSE'})}><Icon name="transactions"/><span>Registrar saída</span></button><button onClick={()=>onPage('planning')}><Icon name="plan"/><span>Planejar</span></button><button onClick={()=>onPage('more')}><Icon name="more"/><span>Mais</span></button></div>
  </section>
  <section><SectionTitle title="Meus objetivos" action="Ver todos" onClick={()=>onPage('goals')}/><div className="goal-preview">{goals.length?goals.map(g=><GoalMini key={g.id} goal={g}/>):<Empty text="Crie uma meta para acompanhar seus próximos passos."/>}</div></section>
  <section><SectionTitle title="Movimentações recentes" action="Ver todas" onClick={()=>onPage('transactions')}/><div className="card list">{data.transactions.slice(0,5).map(t=><TxRow key={t.id} tx={t}/>)||null}{!data.transactions.length&&<Empty text="Nenhum lançamento ainda."/>}</div></section>
  {shared&&<div className="privacy-banner"><Icon name="shield"/><span><b>Privacidade preservada.</b> No Nosso Ritmo aparecem somente os registros do casal. O Ritmo pessoal de cada um continua privado.</span></div>}
 </div>
}

function Metric({label,value,icon,kind}:{label:string;value:number;icon:IconName;kind:'green'|'red'}){return <div className={`metric ${kind}`}><span><Icon name={icon}/></span><div><small>{label}</small><strong>{money(value)}</strong></div></div>}
function SectionTitle({title,action,onClick}:{title:string;action?:string;onClick?:()=>void}){return <div className="section-title"><h2>{title}</h2>{action&&<button onClick={onClick}>{action} ›</button>}</div>}
function Empty({text}:{text:string}){return <div className="empty"><Icon name="wallet"/><span>{text}</span></div>}
function GoalMini({goal}:{goal:Goal}){const p=pct(goal.current_amount,goal.target_amount);return <div className="goal-mini"><div className="goal-icon"><Icon name={goal.kind==='EMERGENCY_RESERVE'?'shield':'goal'}/></div><div><strong>{goal.title}</strong><small>{money(goal.current_amount)} de {money(goal.target_amount)}</small><div className="progress"><i style={{width:`${p}%`}}/></div></div><b>{p}%</b></div>}
function TxRow({tx,actions}:{tx:Transaction;actions?:React.ReactNode}){return <div className="tx-row"><span className={`tx-icon ${tx.type==='INCOME'?'income':'expense'}`}><Icon name={tx.type==='INCOME'?'arrowUp':'arrowDown'}/></span><div className="tx-main"><strong>{tx.description}</strong><small>{tx.category_name||'Sem categoria'} · {new Date(`${tx.date}T12:00:00`).toLocaleDateString('pt-BR')}{tx.created_by_name?` · ${first(tx.created_by_name)}`:''}</small></div><div className="tx-side"><b className={tx.type==='INCOME'?'positive':'negative'}>{tx.type==='INCOME'?'+':'-'} {money(tx.amount)}</b>{tx.status==='PENDING'&&<small className="pending">Pendente</small>}</div>{actions}</div>}

function TransactionsPage({data,onModal,onDelete}:{data:Bootstrap;onModal:(m:Modal)=>void;onDelete:(id:string)=>void}){
 const [filter,setFilter]=useState<'ALL'|'INCOME'|'EXPENSE'>('ALL'),[q,setQ]=useState('')
 const items=data.transactions.filter(t=>(filter==='ALL'||t.type===filter)&&(!q||`${t.description} ${t.category_name||''}`.toLowerCase().includes(q.toLowerCase())))
 return <div className="stack"><PageHeader title="Transações" subtitle={data.scope==='couple'?'Registros do Nosso Ritmo':'Seu histórico pessoal'} actions={<><button className="icon-button"><Icon name="search"/></button><button className="round-plus" onClick={()=>onModal({kind:'transaction',type:'EXPENSE'})}><Icon name="plus"/></button></>}/>
  <div className="search-box"><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar transação"/></div>
  <div className="segmented"><button className={filter==='ALL'?'active':''} onClick={()=>setFilter('ALL')}>Todas</button><button className={filter==='INCOME'?'active':''} onClick={()=>setFilter('INCOME')}>Entradas</button><button className={filter==='EXPENSE'?'active':''} onClick={()=>setFilter('EXPENSE')}>Saídas</button></div>
  <div className="card list">{items.length?items.map(t=><TxRow key={t.id} tx={t} actions={<div className="row-actions"><button onClick={()=>onModal({kind:'transaction',type:t.type,item:t})}>Editar</button><button onClick={()=>onDelete(t.id)}>Excluir</button></div>}/>):<Empty text="Nenhuma transação encontrada."/>}</div>
  <button className="fab" onClick={()=>onModal({kind:'transaction',type:'EXPENSE'})}><Icon name="plus"/></button>
 </div>
}

function PlanningPage({data,onModal}:{data:Bootstrap;onModal:(m:Modal)=>void}){
 const spent=data.summary.expenses,budget=data.budget?.total_amount||0,used=pct(spent,budget),available=Math.max(0,budget-spent)
 return <div className="stack"><PageHeader title="Planejamento" subtitle={`${monthName(new Date().getMonth()+1)} de ${new Date().getFullYear()}`}/>
  <div className="card planning-card"><div className="ring" style={{background:`conic-gradient(var(--teal) 0 ${used}%, var(--sage) ${used}% ${Math.min(100,used+12)}%, var(--line) 0)`}}><div><strong>{used}%</strong><span>do orçamento<br/>utilizado</span></div></div><div className="legend"><span><i className="dot red"/>Gastos <b>{money(spent)}</b></span><span><i className="dot green"/>Disponível <b>{money(available)}</b></span><span><i className="dot gray"/>Total <b>{money(budget)}</b></span></div><button className="soft wide" onClick={()=>onModal({kind:'budget'})}>{budget?'Editar orçamento':'Definir orçamento'}</button></div>
  <SectionTitle title="Categorias"/><div className="card category-bars">{data.budget?.categories?.length?data.budget.categories.map(c=>{const p=pct(c.spent,c.limit_amount);return <div key={c.id}><div><span><i style={{background:c.color}}/> {c.category_name}</span><b>{p}%</b></div><div className="bar"><i style={{width:`${p}%`,background:c.color}}/></div><small>{money(c.spent)} de {money(c.limit_amount)}</small></div>}):<Empty text="Defina um orçamento para acompanhar categorias."/>}</div>
  <div className="info-card"><Icon name="plan"/><span><b>Planejamento, não bloqueio.</b> O Ritmo avisa e organiza. Ele nunca impede uma compra nem movimenta seu dinheiro.</span></div>
 </div>
}

function GoalsPage({data,onModal,onDelete}:{data:Bootstrap;onModal:(m:Modal)=>void;onDelete:(id:string)=>void}){
 const [tab,setTab]=useState<'ACTIVE'|'COMPLETED'>('ACTIVE');const items=data.goals.filter(g=>tab==='ACTIVE'?g.status==='ACTIVE':g.status==='COMPLETED')
 return <div className="stack"><PageHeader title="Minhas Metas" actions={<button className="round-plus" onClick={()=>onModal({kind:'goal'})}><Icon name="plus"/></button>}/><div className="segmented"><button className={tab==='ACTIVE'?'active':''} onClick={()=>setTab('ACTIVE')}>Em andamento</button><button className={tab==='COMPLETED'?'active':''} onClick={()=>setTab('COMPLETED')}>Concluídas</button></div><div className="goal-list">{items.length?items.map(g=><div className="card goal-card" key={g.id}><div className="goal-top"><span className="goal-icon"><Icon name={g.kind==='EMERGENCY_RESERVE'?'shield':'goal'}/></span><div><strong>{g.title}</strong><small>{money(g.current_amount)} de {money(g.target_amount)}</small></div><b>{pct(g.current_amount,g.target_amount)}%</b></div><div className="progress"><i style={{width:`${pct(g.current_amount,g.target_amount)}%`}}/></div><div className="goal-actions"><button onClick={()=>onModal({kind:'goal-entry',item:g})}>Adicionar valor</button><button onClick={()=>onModal({kind:'goal',item:g})}>Editar</button><button onClick={()=>onDelete(g.id)}>Excluir</button></div></div>):<Empty text="Você ainda não criou metas neste perfil."/>}</div></div>
}

function DebtsPage({data,onModal,onDelete}:{data:Bootstrap;onModal:(m:Modal)=>void;onDelete:(id:string)=>void}){return <div className="stack"><PageHeader title="Dívidas" subtitle="Acompanhe o que ainda falta pagar" actions={<button className="round-plus" onClick={()=>onModal({kind:'debt'})}><Icon name="plus"/></button>}/><div className="goal-list">{data.debts.length?data.debts.map(d=>{const paid=d.total_amount-d.remaining_amount,p=pct(paid,d.total_amount);return <div className="card debt-card" key={d.id}><div className="goal-top"><span className="goal-icon debt"><Icon name="debt"/></span><div><strong>{d.title}</strong><small>Restante: {money(d.remaining_amount)}</small></div><b>{p}%</b></div><div className="progress"><i style={{width:`${p}%`}}/></div><div className="debt-details"><span>Total <b>{money(d.total_amount)}</b></span><span>Pago <b>{money(paid)}</b></span>{d.due_date&&<span>Vence <b>{new Date(`${d.due_date}T12:00:00`).toLocaleDateString('pt-BR')}</b></span>}</div><div className="goal-actions"><button onClick={()=>onModal({kind:'debt-payment',item:d})}>Registrar pagamento</button><button onClick={()=>onModal({kind:'debt',item:d})}>Editar</button><button onClick={()=>onDelete(d.id)}>Excluir</button></div></div>}):<Empty text="Nenhuma dívida cadastrada."/>}</div></div>}

function ReportsPage({data}:{data:Bootstrap}){
 const max=Math.max(1,data.summary.income,data.summary.expenses);const month=new Date().getMonth()+1,year=new Date().getFullYear()
 return <div className="stack printable"><PageHeader title="Relatórios" subtitle={`${monthName(month)} de ${year}`} actions={<button className="icon-button" onClick={()=>window.print()}><Icon name="share"/></button>}/><div className="segmented"><button className="active">Resumo</button><button>Entradas</button><button>Saídas</button></div><div className="card report-chart"><div className="bars"><i style={{height:`${Math.max(12,data.summary.income/max*100)}%`}}/><i className="expense" style={{height:`${Math.max(12,data.summary.expenses/max*100)}%`}}/></div><div className="report-summary"><div><small>Entradas</small><strong className="positive">{money(data.summary.income)}</strong></div><div><small>Saídas</small><strong className="negative">{money(data.summary.expenses)}</strong></div></div><div className="period-result"><span>Saldo do período</span><strong>{money(data.summary.income-data.summary.expenses)}</strong></div><button className="primary wide" onClick={()=>window.print()}><Icon name="report"/> Gerar PDF</button></div><SectionTitle title="Lançamentos do período"/><div className="card list">{data.transactions.map(t=><TxRow key={t.id} tx={t}/>)}</div></div>
}

function MorePage({data,onPage}:{data:Bootstrap;onPage:(p:Page)=>void}){
 const items:{page:Page;icon:IconName;title:string;desc:string}[]=[{page:'debts',icon:'debt',title:'Dívidas',desc:'Acompanhe saldos e pagamentos'},{page:'reports',icon:'report',title:'Relatórios',desc:'Resumo e PDF do seu período'},{page:'sharing',icon:'users',title:'Nosso Ritmo',desc:data.sharing.active?'Controle financeiro do casal':'Convide seu parceiro'},{page:'account',icon:'user',title:'Minha Conta',desc:'Perfil, foto, tema e segurança'}]
 return <div className="stack"><PageHeader title="Mais" subtitle="Tudo do seu controle em um só lugar"/><div className="card menu-list">{items.map(i=><button key={i.page} onClick={()=>onPage(i.page)}><span><Icon name={i.icon}/></span><div><strong>{i.title}</strong><small>{i.desc}</small></div><Icon name="chevron"/></button>)}</div><div className="legal-note large"><Icon name="shield"/><span><b>Ritmo é um organizador financeiro pessoal.</b> Não recebe depósitos, não faz pagamentos, não guarda dinheiro e não se conecta a contas para movimentar valores.</span></div></div>
}

function SharingPage({data,onChanged,onModal}:{data:Bootstrap;onChanged:(m:string)=>Promise<void>;onModal:(m:Modal)=>void}){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),sharing=data.sharing
 async function act(fn:()=>Promise<unknown>,msg:string){setBusy(true);try{await fn();await onChanged(msg)}catch(err){alert(err instanceof Error?err.message:'Não foi possível concluir.')}finally{setBusy(false)}}
 if(sharing.active)return <div className="stack"><PageHeader title="Nosso Ritmo" subtitle={`${first(data.profile.name)} & ${first(sharing.partner?.name)}`}/><div className="couple-hero"><div className="couple-avatars"><span>{initials(data.profile.name)}</span><i><Icon name="heart"/></i><span>{initials(sharing.partner?.name)}</span></div><small>CONTROLE COMPARTILHADO</small><strong>{money(data.scope==='couple'?data.summary.balance:0)}</strong><p>Somente o que vocês registrarem no Nosso Ritmo é visível para os dois.</p><button className="primary" onClick={()=>onModal({kind:'contribution'})}>Registrar contribuição</button></div><div className="card list"><SectionTitle title="Contribuições registradas"/>{data.contributions.length?data.contributions.map(c=><div className="tx-row" key={c.id}><span className="tx-icon income"><Icon name="users"/></span><div className="tx-main"><strong>{c.created_by_name||'Contribuição'}</strong><small>{new Date(`${c.date}T12:00:00`).toLocaleDateString('pt-BR')} · {c.description||'Nosso Ritmo'}</small></div><b>{money(c.amount)}</b></div>):<Empty text="Nenhuma contribuição registrada ainda."/>}</div><div className="privacy-banner"><Icon name="shield"/><span><b>O pessoal continua pessoal.</b> Seu parceiro não vê suas despesas, metas ou dívidas do Ritmo individual.</span></div></div>
 return <div className="stack"><PageHeader title="Nosso Ritmo" subtitle="Crie um espaço financeiro para o casal"/><div className="sharing-intro"><span className="big-heart"><Icon name="heart"/></span><h2>Duas pessoas. Dois Ritmos pessoais. Um Nosso Ritmo.</h2><p>Vocês compartilham apenas o que decidirem administrar juntos, sem dividir senha e sem abrir o histórico pessoal um do outro.</p></div><div className="sharing-grid"><form className="card setup" onSubmit={e=>{e.preventDefault();void act(()=>mutate('/api/sharing/invite','POST',{email}),'Convite criado.' )}}><Icon name="users"/><h3>Convidar parceiro</h3><p>Digite o e-mail usado no Ritmo pela outra pessoa.</p><label><span>E-mail</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><button className="primary wide" disabled={busy}>Criar convite</button></form><form className="card setup" onSubmit={e=>{e.preventDefault();void act(()=>mutate('/api/sharing/accept','POST',{code:code.toUpperCase()}),'Nosso Ritmo conectado!')}}><Icon name="check"/><h3>Tenho um código</h3><p>Use o código de convite que seu parceiro enviou.</p><label><span>Código</span><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={8} required/></label><button className="soft wide" disabled={busy}>Conectar</button></form></div>{sharing.incoming.length>0&&<div className="card list"><SectionTitle title="Convites recebidos"/>{sharing.incoming.map(i=><div className="invite-row" key={i.id}><div><strong>{i.inviter_name||'Convite'}</strong><small>{i.expires_at.slice(0,10)}</small></div><button className="primary small" onClick={()=>act(()=>mutate(`/api/sharing/invites/${i.id}/accept`,'POST',{}),'Convite aceito!')}>Aceitar</button></div>)}</div>}{sharing.outgoing.length>0&&<div className="card list"><SectionTitle title="Convite enviado"/>{sharing.outgoing.map(i=><div className="invite-row" key={i.id}><div><strong>{i.invited_email}</strong><small>Código: {i.code}</small></div><button className="text-danger" onClick={()=>act(()=>mutate(`/api/sharing/invites/${i.id}`,'DELETE'), 'Convite cancelado.')}>Cancelar</button></div>)}</div>}</div>
}

function AccountPage({data,onSaved,onLogout}:{data:Bootstrap;onSaved:(m:string)=>Promise<void>;onLogout:()=>void}){
 const [busy,setBusy]=useState(false)
 async function photo(file:File){setBusy(true);try{const blob=await compressAvatar(file);await uploadAvatar(blob);await onSaved('Foto atualizada.')}catch(err){alert(err instanceof Error?err.message:'Não foi possível atualizar a foto.')}finally{setBusy(false)}}
 async function theme(next:'LIGHT'|'DARK'|'SYSTEM'){await patch('/api/settings',{theme:next});applyTheme(next);await onSaved('Tema atualizado.')}
 return <div className="stack"><PageHeader title="Minha Conta"/><div className="profile-card"><div className="profile-photo"><Avatar data={data}/><label className="camera"><Icon name="camera"/><input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&void photo(e.target.files[0])}/></label></div><strong>{data.profile.name}</strong><small>{data.profile.email}</small></div><div className="card settings-list"><button><span><Icon name="user"/>Meus dados</span><Icon name="chevron"/></button><button><span><Icon name="shield"/>Segurança</span><small>Passkey / biometria</small><Icon name="chevron"/></button><button><span><Icon name="wallet"/>Fontes do controle</span><small>Somente referência</small><Icon name="chevron"/></button><button><span><Icon name="transactions"/>Categorias</span><Icon name="chevron"/></button><div className="setting-theme"><span><Icon name="moon"/>Tema</span><select value={data.settings.theme} onChange={e=>void theme(e.target.value as 'LIGHT'|'DARK'|'SYSTEM')}><option value="SYSTEM">Automático</option><option value="LIGHT">Claro</option><option value="DARK">Escuro</option></select></div></div><button className="danger wide" onClick={onLogout}>Sair da conta</button>{busy&&<div className="inline-loading">Processando foto…</div>}<div className="legal-note"><Icon name="shield"/><span>Fotos são reduzidas no aparelho para WebP 128×128 antes do envio, economizando armazenamento e dados.</span></div></div>
}

function PageHeader({title,subtitle,actions}:{title:string;subtitle?:string;actions?:React.ReactNode}){return <header className="page-header"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{actions&&<div className="header-actions">{actions}</div>}</header>}

function ActionModal({modal,data,scope,onClose,onSaved}:{modal:Exclude<Modal,null>;data:Bootstrap;scope:Scope;onClose:()=>void;onSaved:(m?:string)=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);const obj=Object.fromEntries(f.entries());try{
  if(modal.kind==='transaction'){const body={type:modal.type,description:String(obj.description),amount:Number(obj.amount),category_id:String(obj.category_id||''),money_source_id:String(obj.money_source_id||data.sources[0]?.id||''),status:String(obj.status||'PAID'),date:String(obj.date),due_date:String(obj.due_date||''),notes:String(obj.notes||'')};await mutate(modal.item?`/api/transactions/${modal.item.id}`:'/api/transactions',modal.item?'PATCH':'POST',body)}
  if(modal.kind==='budget'){const cats=data.categories.filter(c=>c.type==='EXPENSE').map(c=>({category_id:c.id,limit_amount:Number(obj[`cat_${c.id}`]||0)})).filter(x=>x.limit_amount>0);await mutate('/api/budget','POST',{year:new Date().getFullYear(),month:new Date().getMonth()+1,total_amount:Number(obj.total_amount),categories:cats})}
  if(modal.kind==='goal'){await mutate(modal.item?`/api/goals/${modal.item.id}`:'/api/goals',modal.item?'PATCH':'POST',{title:String(obj.title),target_amount:Number(obj.target_amount),deadline:String(obj.deadline||''),kind:String(obj.kind||'GOAL')})}
  if(modal.kind==='goal-entry'){await mutate(`/api/goals/${modal.item.id}/entries`,'POST',{amount:Number(obj.amount),entry_date:String(obj.date),note:String(obj.note||'')})}
  if(modal.kind==='debt'){await mutate(modal.item?`/api/debts/${modal.item.id}`:'/api/debts',modal.item?'PATCH':'POST',{title:String(obj.title),total_amount:Number(obj.total_amount),due_date:String(obj.due_date||''),notes:String(obj.notes||'')})}
  if(modal.kind==='debt-payment'){await mutate(`/api/debts/${modal.item.id}/payments`,'POST',{amount:Number(obj.amount),payment_date:String(obj.date),money_source_id:String(obj.money_source_id||data.sources[0]?.id||'')})}
  if(modal.kind==='contribution'){await mutate('/api/couple/contributions','POST',{amount:Number(obj.amount),date:String(obj.date),description:String(obj.description||'')})}
  await onSaved();onClose()
 }catch(err){setError(err instanceof Error?err.message:'Não foi possível salvar.')}finally{setBusy(false)}}
 const title=modal.kind==='transaction'?(modal.item?'Editar lançamento':modal.type==='INCOME'?'Nova entrada':'Nova saída'):modal.kind==='budget'?'Definir orçamento':modal.kind==='goal'?(modal.item?'Editar meta':'Nova meta'):modal.kind==='goal-entry'?'Adicionar à meta':modal.kind==='debt'?(modal.item?'Editar dívida':'Nova dívida'):modal.kind==='debt-payment'?'Registrar pagamento':'Registrar contribuição'
 const expenseCats=data.categories.filter(c=>c.type==='EXPENSE'),incomeCats=data.categories.filter(c=>c.type==='INCOME')
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal-sheet"><header><div><small>{scope==='couple'?'NOSSO RITMO':'RITMO PESSOAL'}</small><h2>{title}</h2></div><button className="icon-button" onClick={onClose}><Icon name="close"/></button></header><form onSubmit={submit}>
  {modal.kind==='transaction'&&<><Field label="Valor" name="amount" type="number" step="0.01" defaultValue={modal.item?.amount}/><Field label="Descrição" name="description" defaultValue={modal.item?.description} placeholder="Ex.: Supermercado"/><SelectField label="Categoria" name="category_id" defaultValue="" options={(modal.type==='EXPENSE'?expenseCats:incomeCats).map(c=>({value:c.id,label:c.name}))}/><SelectField label="Fonte no controle" name="money_source_id" defaultValue={data.sources[0]?.id||''} options={data.sources.map(s=>({value:s.id,label:s.name}))}/>{modal.type==='EXPENSE'&&<SelectField label="Status" name="status" defaultValue={modal.item?.status||'PAID'} options={[{value:'PAID',label:'Pago'},{value:'PENDING',label:'Pendente'}]}/>}<Field label="Data" name="date" type="date" defaultValue={modal.item?.date||today()}/>{modal.type==='EXPENSE'&&<Field label="Vencimento" name="due_date" type="date" required={false} defaultValue={modal.item?.due_date||''}/>}<Field label="Observação" name="notes" required={false} defaultValue={modal.item?.notes||''}/></>}
  {modal.kind==='budget'&&<><Field label="Orçamento total do mês" name="total_amount" type="number" step="0.01" defaultValue={data.budget?.total_amount}/><div className="form-section"><span>Limites por categoria (opcional)</span>{expenseCats.map(c=><Field key={c.id} label={c.name} name={`cat_${c.id}`} type="number" step="0.01" required={false} defaultValue={data.budget?.categories.find(x=>x.category_id===c.id)?.limit_amount}/>)}</div></>}
  {modal.kind==='goal'&&<><Field label="Nome da meta" name="title" defaultValue={modal.item?.title}/><Field label="Valor alvo" name="target_amount" type="number" step="0.01" defaultValue={modal.item?.target_amount}/><SelectField label="Tipo" name="kind" defaultValue={modal.item?.kind||'GOAL'} options={[{value:'GOAL',label:'Meta'},{value:'EMERGENCY_RESERVE',label:'Reserva de emergência'}]}/><Field label="Prazo" name="deadline" type="date" required={false} defaultValue={modal.item?.deadline||''}/></>}
  {modal.kind==='goal-entry'&&<><div className="form-context"><Icon name="goal"/><span><small>{modal.item.title}</small><strong>{money(modal.item.current_amount)} de {money(modal.item.target_amount)}</strong></span></div><Field label="Valor" name="amount" type="number" step="0.01"/><Field label="Data" name="date" type="date" defaultValue={today()}/><Field label="Observação" name="note" required={false}/></>}
  {modal.kind==='debt'&&<><Field label="Dívida / credor" name="title" defaultValue={modal.item?.title}/><Field label="Valor total" name="total_amount" type="number" step="0.01" defaultValue={modal.item?.total_amount}/><Field label="Vencimento" name="due_date" type="date" required={false} defaultValue={modal.item?.due_date||''}/><Field label="Observação" name="notes" required={false} defaultValue={modal.item?.notes||''}/></>}
  {modal.kind==='debt-payment'&&<><div className="form-context"><Icon name="debt"/><span><small>{modal.item.title}</small><strong>Restante: {money(modal.item.remaining_amount)}</strong></span></div><Field label="Valor pago" name="amount" type="number" step="0.01"/><Field label="Data" name="date" type="date" defaultValue={today()}/><SelectField label="Fonte no controle" name="money_source_id" defaultValue={data.sources[0]?.id||''} options={data.sources.map(s=>({value:s.id,label:s.name}))}/></>}
  {modal.kind==='contribution'&&<><div className="form-context"><Icon name="users"/><span><small>REGISTRO CONTÁBIL</small><strong>Isto não transfere dinheiro de verdade.</strong></span></div><Field label="Valor" name="amount" type="number" step="0.01"/><Field label="Data" name="date" type="date" defaultValue={today()}/><Field label="Descrição" name="description" required={false} placeholder="Ex.: Parte das contas da casa"/></>}
  {error&&<div className="form-error">{error}</div>}<button className="primary wide" disabled={busy}>{busy?'Salvando…':'Salvar'}</button>
 </form></div></div>
}

function Field({label,name,type='text',step,defaultValue,placeholder,required=true}:{label:string;name:string;type?:string;step?:string;defaultValue?:string|number|null;placeholder?:string;required?:boolean}){return <label className="field"><span>{label}</span><input name={name} type={type} step={step} defaultValue={defaultValue??''} placeholder={placeholder} required={required}/></label>}
function SelectField({label,name,defaultValue,options}:{label:string;name:string;defaultValue:string;options:{value:string;label:string}[]}){return <label className="field"><span>{label}</span><select name={name} defaultValue={defaultValue}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}

async function compressAvatar(file:File):Promise<Blob>{
 const img=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d')!;const scale=Math.max(128/img.width,128/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(128-w)/2,(128-h)/2,w,h);img.close();let quality=.82,blob:Blob|null=null;for(let i=0;i<8;i++){blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/webp',quality));if(blob&&blob.size<=15*1024)break;quality-=.1}if(!blob)throw new Error('Não foi possível processar a foto.');if(blob.size>20*1024)throw new Error('A foto ficou grande demais. Tente outra imagem.');return blob
}
