import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createIcons, icons } from 'lucide';
import { api, ApiError, clearLocalAuth, persistAuth, type AuthResponse } from './services/api';
import { canInstallPWA, enablePushNotifications, getBiometricAvailability, installPWA, isNativeApp, loginWithBiometrics, registerBiometrics, shouldGateNativeSession, subscribeBiometricAvailability, subscribePWAInstallAvailability, unlockNativeSession } from './services/nativeDevice';
import type { Bootstrap, Debt, EventItem, Goal, Profile, Transaction } from './types';

type Page = 'home'|'transactions'|'debts'|'calendar'|'goals'|'reports'|'profile'|'settings';
type AuthView = 'login'|'register'|'code'|'recover'|'device';
type ModalKind = 'new-transaction'|'new-goal'|'new-event'|'new-debt'|'debt-payment'|'goal-add'|'edit-profile'|'change-password'|'recovery-code'|'new-recovery-code'|'privacy'|'categories'|'search'|'notifications'|null;
type ModalState = { kind: ModalKind; id?: string } | null;
type FormState = Record<string,string>;

const emptyData: Bootstrap = { profile:{displayName:'',theme:'system',dueNotifications:true,goalNotifications:true}, transactions:[], debts:[], goals:[], events:[], files:[] };
const titles: Record<Page,string> = {home:'Início',transactions:'Movimentações',debts:'Dívidas',calendar:'Planejamento',goals:'Metas',reports:'Relatórios',profile:'Perfil',settings:'Ajustes'};
const money = (v:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const signedMoney = (v:number) => `${v>0?'+ ':v<0?'- ':''}${money(Math.abs(v))}`;
const fmtDate = (v:string) => { if(!v)return '—'; const d=new Date(`${v}T12:00:00`); return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(d).replace('.',''); };
const todayISO = () => { const d=new Date(); const off=d.getTimezoneOffset(); return new Date(d.getTime()-off*60000).toISOString().slice(0,10); };
const isoFromDate=(d:Date)=>{ const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10); };
const monthKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const escapeHtml=(s:unknown)=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]!));
const iconMarkup=(name:string)=>`<i data-lucide="${escapeHtml(name)}"></i>`;
const empty=(icon:string,title:string,subtitle:string)=>`<div class="empty-state">${iconMarkup(icon)}<strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></div>`;
const parseMoney=(value:string)=>{ const clean=String(value||'').replace(/[^\d,.-]/g,'').replace(/\.(?=.*\.)/g,'').replace(',','.'); const n=Number(clean); return Number.isFinite(n)?n:0; };
const initials=(name:string)=>{const p=String(name||'R').trim().split(/\s+/).filter(Boolean);return `${p[0]?.[0]||'R'}${p.length>1?p[p.length-1]?.[0]||'':''}`.toUpperCase();};

export default function App() {
  const [currentPage,setCurrentPage]=useState<Page>('home');
  const [authenticated,setAuthenticated]=useState(false);
  const [authView,setAuthView]=useState<AuthView>('login');
  const [data,setData]=useState<Bootstrap>(emptyData);
  const [modal,setModal]=useState<ModalState>(null);
  const [sheetOpen,setSheetOpen]=useState(false);
  const [form,setForm]=useState<FormState>({});
  const [loading,setLoading]=useState(false);
  const [pwaInstallReady,setPwaInstallReady]=useState(()=>canInstallPWA());
  const [biometricAvailable,setBiometricAvailable]=useState(false);
  const [recoveryCode,setRecoveryCode]=useState('');
  const [generatedUsername,setGeneratedUsername]=useState('');
  const [syncing,setSyncing]=useState(false);
  const [pendingDeviceVerification,setPendingDeviceVerification]=useState('');
  const [pendingActivationToken,setPendingActivationToken]=useState('');
  const [toastState,setToastState]=useState({open:false,message:''});
  const [txFilter,setTxFilter]=useState<'all'|'income'|'expense'>('all');
  const [txSearch,setTxSearch]=useState('');
  const [calendarCursor,setCalendarCursor]=useState(()=>new Date());
  const [selectedDate,setSelectedDate]=useState(()=>new Date());
  const toastTimer=useRef<number|undefined>(undefined);
  const busyRef=useRef(false);

  const transactions=data.transactions, debts=data.debts, goals=data.goals, events=data.events, profile=data.profile;
  const notify=useCallback((message:string)=>{
    if(toastTimer.current) window.clearTimeout(toastTimer.current);
    setToastState({open:true,message}); toastTimer.current=window.setTimeout(()=>setToastState({open:false,message:''}),2400);
  },[]);
  const setField=(id:string,value:string)=>setForm(f=>({...f,[id]:value}));
  const resetForm=(values:FormState={})=>setForm(values);

  const syncRef=useRef(false);
  const refresh=useCallback(async()=>{
    if(syncRef.current)return;
    syncRef.current=true;
    try{
      const next=await api.bootstrap();
      setData(next);
    }finally{
      syncRef.current=false;
    }
  },[]);
  const applyAuth=useCallback(async(out:AuthResponse)=>{await persistAuth(out);setAuthenticated(true);setAuthView('login');await refresh();},[refresh]);

  useEffect(()=>subscribePWAInstallAvailability(() => setPwaInstallReady(canInstallPWA())),[]);

  useEffect(()=>{
    let dispose: (()=>void)|undefined;
    let active=true;
    (async()=>{
      try{
        const info=await getBiometricAvailability();
        if(active)setBiometricAvailable(info.available);
        dispose=await subscribeBiometricAvailability((available)=>{ if(active)setBiometricAvailable(available); });
      }catch{
        if(active)setBiometricAvailable(false);
      }
    })();
    return()=>{active=false;dispose?.();};
  },[]);

  useEffect(()=>{
    let live=true;
    (async()=>{
      try{
        if(await shouldGateNativeSession()){
          try{await unlockNativeSession();}
          catch{if(live)notify('Desbloqueio cancelado. Você também pode entrar com sua senha.');return;}
        }
        const s=await api.session();
        if(live&&s.authenticated){setAuthenticated(true);await refresh();}
      }catch(e){
        if(e instanceof ApiError&&e.status===0)notify('Sem conexão. O Ritmo abrirá quando o servidor estiver disponível.');
      }finally{document.documentElement.classList.add('ritmo-ready');}
    })();
    return()=>{live=false};
  },[refresh,notify]);

  useEffect(()=>{
    if(!authenticated)return;

    const sync=async()=>{
      if(document.visibilityState==='hidden'||busyRef.current)return;
      try{
        await refresh();
      }catch(e){
        if(e instanceof ApiError&&(e.status===401||e.status===403)){
          await clearLocalAuth();
          setAuthenticated(false);
          setData(emptyData);
          setAuthView('login');
          notify('Sua sessão expirou. Entre novamente.');
        }
      }
    };

    const onVisibility=()=>{if(document.visibilityState==='visible')void sync();};
    const onFocus=()=>void sync();
    const onOnline=()=>void sync();
    const timer=window.setInterval(()=>void sync(),30000);

    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('focus',onFocus);
    window.addEventListener('online',onOnline);

    return()=>{
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('focus',onFocus);
      window.removeEventListener('online',onOnline);
    };
  },[authenticated,refresh,notify]);

  useEffect(()=>{
    if(!authenticated)return;
    const params=new URLSearchParams(window.location.search);
    const page=params.get('page');
    const action=params.get('action');
    if(page&&page in titles)setCurrentPage(page as Page);
    if(action==='new-transaction'){
      setModal({kind:'new-transaction'});
      resetForm({newTxDate:todayISO(),newTxType:'Despesa'});
    }
    if(page||action)window.history.replaceState({},'',window.location.pathname);
  },[authenticated]);

  useEffect(()=>{
    const open=Boolean(modal||sheetOpen);
    document.body.classList.toggle('mobile-overlay-open',open);
    return()=>document.body.classList.remove('mobile-overlay-open');
  },[modal,sheetOpen]);

  useEffect(()=>{
    document.body.classList.toggle('auth-active',!authenticated);
    const shell=document.getElementById('appShell');
    if(!authenticated){shell?.setAttribute('inert','');shell?.setAttribute('aria-hidden','true');}else{shell?.removeAttribute('inert');shell?.removeAttribute('aria-hidden');}
    if(!authenticated){setModal(null);setSheetOpen(false);}
  },[authenticated]);

  useEffect(()=>{
    const theme=profile.theme||'system';
    const resolved=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;
    document.documentElement.dataset.theme=resolved;
    document.querySelectorAll<HTMLElement>('[data-theme-choice]').forEach(el=>el.classList.toggle('active',el.dataset.themeChoice===theme));
    document.getElementById('profileTheme')!.textContent=theme==='system'?'Automático':theme==='dark'?'Black':'Claro';
  },[profile.theme]);

  const totals=useMemo(()=>{
    const bal=transactions.reduce((a,t)=>a+Number(t.value||0),0),mk=monthKey(new Date());
    const current=transactions.filter(t=>String(t.date||'').slice(0,7)===mk),inc=current.filter(t=>t.value>0).reduce((a,t)=>a+t.value,0),exp=Math.abs(current.filter(t=>t.value<0).reduce((a,t)=>a+t.value,0));
    const rate=inc>0?Math.max(0,Math.min(100,((inc-exp)/inc)*100)):0;return{bal,inc,exp,rate};
  },[transactions]);

  const last12=useCallback(()=>{
    const n=new Date(),arr:Array<{key:string;label:string;inc:number;exp:number}>=[];
    for(let i=11;i>=0;i--){const d=new Date(n.getFullYear(),n.getMonth()-i,1);arr.push({key:monthKey(d),label:new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(d).replace('.',''),inc:0,exp:0});}
    for(const t of transactions){const x=arr.find(a=>a.key===String(t.date||'').slice(0,7));if(x){if(t.value>0)x.inc+=t.value;else x.exp+=Math.abs(t.value);}}
    return arr;
  },[transactions]);

  useEffect(()=>{
    const setText=(id:string,value:string)=>{const e=document.getElementById(id);if(e)e.textContent=value};
    const avgGoal=goals.length?goals.reduce((a,g)=>a+Math.min(100,(Number(g.saved||0)/Math.max(1,Number(g.target||1)))*100),0)/goals.length:0;
    setText('homeBalance',money(totals.bal));setText('homeBalanceHint',transactions.length?'Saldo calculado pelos lançamentos':'Sem movimentações');
    setText('homeIncome',money(totals.inc));setText('homeIncomeHint','No mês atual');setText('homeExpense',money(totals.exp));setText('homeExpenseHint','No mês atual');setText('homeGoals',String(goals.length));setText('homeGoalsHint',goals.length?`${Math.round(avgGoal)}% de progresso médio`:'Nenhuma meta cadastrada');
    setText('txBalance',money(totals.bal));setText('txBalanceHint',transactions.length?'Saldo calculado pelos lançamentos':'Sem movimentações');setText('txIncome',money(totals.inc));setText('txExpense',money(totals.exp));setText('txSavings',`${Math.round(totals.rate)}%`);setText('txSavingsHint',totals.inc?'da receita deste mês':'Sem dados suficientes');
    setText('homeSavingsRate',`${Math.round(totals.rate)}%`);setText('homeMonthResult',money(totals.inc-totals.exp));setText('homeSummaryText',transactions.length?(totals.inc>=totals.exp?'Receitas cobrem as despesas no mês atual.':'Despesas acima das receitas no mês atual.'):'Adicione movimentações para gerar seu resumo.');
    document.getElementById('homeDonut')?.style.setProperty('--score',String(Math.round(totals.rate)));setText('homeStatusChip',!transactions.length?'Sem dados':totals.inc>=totals.exp?'Em equilíbrio':'Atenção');
    const name=profile.displayName||'Conta',ini=initials(name);setText('accountAvatar',ini);setText('profileAvatar',ini);setText('accountName',name);setText('profileName',name);setText('profileUser',profile.username?'@'+profile.username:'@usuario');
    setText('profileIncome',money(totals.inc));setText('profileExpense',money(totals.exp));setText('profileBalance',money(totals.bal));setText('profileScore',transactions.length?`${Math.round(totals.rate)}%`:'—');document.getElementById('profileDonut')?.style.setProperty('--score',String(Math.round(totals.rate)));setText('profileStorage','Cloudflare D1 • sincronizado');setText('profileNotifications',(profile.dueNotifications||profile.goalNotifications)?'Ativas':'Desativadas');

    const filterData=transactions.filter(t=>(txFilter==='all'||(txFilter==='income'&&t.value>0)||(txFilter==='expense'&&t.value<0))&&(!txSearch||`${t.desc} ${t.cat}`.toLowerCase().includes(txSearch.toLowerCase()))).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    const txTable=document.getElementById('txTable'),txMobile=document.getElementById('txMobile');
    if(txTable)txTable.innerHTML=filterData.length?filterData.map(t=>`<tr><td>${fmtDate(t.date)}</td><td><div style="display:flex;align-items:center;gap:8px"><span class="row-icon" style="width:30px;height:30px;background:${t.value>0?'rgba(24,183,163,.12)':'rgba(224,91,104,.10)'};color:${t.value>0?'var(--emerald)':'var(--danger)'}">${iconMarkup(t.icon||'circle-dollar-sign')}</span><strong>${escapeHtml(t.desc)}</strong></div></td><td>${escapeHtml(t.cat||'Outros')}</td><td><span class="tag ${t.value>0?'ok':'bad'}">${t.value>0?'Receita':'Despesa'}</span></td><td class="${t.value>0?'pos':'neg'}" style="font-weight:800">${signedMoney(t.value)}</td></tr>`).join(''):`<tr class="table-empty"><td colspan="5">${empty('receipt-text','Nenhuma movimentação','Use o botão + para registrar sua primeira entrada ou saída.')}</td></tr>`;
    if(txMobile)txMobile.innerHTML=filterData.length?filterData.slice(0,8).map(t=>`<div class="row"><div class="row-icon" style="background:${t.value>0?'rgba(24,183,163,.12)':'rgba(224,91,104,.10)'};color:${t.value>0?'var(--emerald)':'var(--danger)'}">${iconMarkup(t.icon||'circle-dollar-sign')}</div><div class="row-main"><strong>${escapeHtml(t.desc)}</strong><small>${fmtDate(t.date)} • ${escapeHtml(t.cat||'Outros')}</small></div><div class="row-value ${t.value>0?'pos':'neg'}">${signedMoney(t.value)}</div></div>`).join(''):empty('receipt-text','Nenhuma movimentação','Toque no + para começar.');
    document.querySelectorAll('#txFilter button').forEach(x=>x.classList.toggle('active',(x as HTMLElement).dataset.filter===txFilter));

    const debtStatus=(d:Debt)=>d.remaining<=0?'Quitada':d.due<todayISO()?'Em atraso':'Em aberto'; const tagClass=(s:string)=>s==='Quitada'?'ok':s==='Em atraso'?'bad':'warn';const sorted=[...debts].sort((a,b)=>String(a.due).localeCompare(String(b.due)));
    const debtTable=document.getElementById('debtTable'),debtMobile=document.getElementById('debtMobile');
    if(debtTable)debtTable.innerHTML=sorted.length?sorted.map(d=>{const st=debtStatus(d),prog=Math.max(0,Math.min(100,100-(Number(d.remaining||0)/Math.max(1,Number(d.total||d.remaining||1))*100)));return `<tr><td><div style="display:flex;align-items:center;gap:8px"><span class="row-icon" style="width:30px;height:30px;background:rgba(16,42,92,.09);color:var(--night)">${iconMarkup('landmark')}</span><div><strong>${escapeHtml(d.name)}</strong><div style="font-size:9px;color:var(--muted)">${escapeHtml(d.category||'Compromisso')}</div></div></div></td><td>${money(d.remaining)}</td><td>${fmtDate(d.due)}</td><td><span class="tag ${tagClass(st)}">${st}</span></td><td><div style="display:flex;align-items:center;gap:7px"><div class="progress" style="width:75px"><span style="width:${prog}%"></span></div><span>${Math.round(prog)}%</span></div></td><td>${d.remaining>0?`<button class="premium-btn btn-glass" style="height:34px;padding:0 11px;font-size:10px" data-action="debt-payment" data-debt="${escapeHtml(d.id)}">Pagar</button>`:''}</td></tr>`}).join(''):`<tr class="table-empty"><td colspan="6">${empty('landmark','Nenhuma dívida cadastrada','Use o botão + para adicionar um compromisso.')}</td></tr>`;
    if(debtMobile)debtMobile.innerHTML=sorted.length?sorted.map(d=>`<div class="row"><div class="row-icon" style="background:rgba(16,42,92,.09);color:var(--night)">${iconMarkup('landmark')}</div><div class="row-main"><strong>${escapeHtml(d.name)}</strong><small>${fmtDate(d.due)} • ${debtStatus(d)}</small></div><div class="row-value">${money(d.remaining)}</div></div>`).join(''):empty('landmark','Nenhuma dívida cadastrada','Toque no + para adicionar.');
    const open=debts.filter(d=>d.remaining>0),total=open.reduce((a,d)=>a+d.remaining,0),late=open.filter(d=>debtStatus(d)==='Em atraso'),next=open.filter(d=>d.due>=todayISO()).sort((a,b)=>a.due.localeCompare(b.due))[0];setText('debtTotal',money(total));setText('debtTotalHint',`${open.length} compromisso${open.length===1?'':'s'}`);setText('debtCount',String(open.length));setText('debtCountHint',open.length?'Em acompanhamento':'Nenhuma dívida cadastrada');setText('debtNext',next?fmtDate(next.due):'—');setText('debtNextHint',next?next.name:'Sem vencimentos');setText('debtLate',String(late.length));setText('debtLateHint',late.length?'Requer atenção':'Nenhuma conta em atraso');

    const goalGrid=document.getElementById('goalGrid');if(goalGrid)goalGrid.innerHTML=goals.length?goals.map(g=>{const p=Math.max(0,Math.min(100,(g.saved/Math.max(1,g.target))*100));return `<div class="goal liquid"><div class="goal-top"><div class="goal-symbol" style="background:rgba(24,183,163,.12);color:var(--emerald)">${iconMarkup('target')}</div><div><div class="goal-name">${escapeHtml(g.name)}</div><div class="goal-sub">${g.due?`Prazo: ${fmtDate(g.due)}`:'Sem prazo definido'}</div></div></div><div class="goal-numbers"><div><strong>${money(g.saved)}</strong><small> de ${money(g.target)}</small></div><small>${Math.round(p)}%</small></div><div class="progress"><span style="width:${p}%"></span></div><div class="goal-foot"><span>Faltam ${money(Math.max(0,g.target-g.saved))}</span><button class="text-link" data-action="goal-add" data-goal="${escapeHtml(g.id)}">Adicionar</button></div></div>`}).join(''):empty('target','Nenhuma meta cadastrada','Use o botão + para criar seu primeiro objetivo.');

    const recent=[...transactions].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4),rt=document.getElementById('homeRecentTransactions');if(rt)rt.innerHTML=recent.length?recent.map(t=>`<button class="row" data-go="transactions"><div class="row-icon ${t.value>0?'green':'red'}">${iconMarkup(t.icon||'circle-dollar-sign')}</div><div class="row-main"><strong>${escapeHtml(t.desc)}</strong><small>${fmtDate(t.date)} • ${escapeHtml(t.cat||'Outros')}</small></div><div class="row-value ${t.value>0?'pos':'neg'}">${signedMoney(t.value)}</div></button>`).join(''):empty('receipt-text','Nenhuma transação recente','Use o botão + para adicionar um lançamento.');
    const nextDebts=debts.filter(d=>d.remaining>0).sort((a,b)=>String(a.due).localeCompare(String(b.due))).slice(0,4),hc=document.getElementById('homeCommitments');if(hc)hc.innerHTML=nextDebts.length?nextDebts.map(d=>`<button class="row" data-go="debts"><div class="row-icon" style="background:rgba(217,179,91,.13);color:#B57C25">${iconMarkup('landmark')}</div><div class="row-main"><strong>${escapeHtml(d.name)}</strong><small>${fmtDate(d.due)}</small></div><div class="row-value">${money(d.remaining)}</div></button>`).join(''):empty('calendar-check','Nenhum compromisso','As próximas contas aparecerão aqui.');

    const chartData=last12(),max=Math.max(1,...chartData.flatMap(x=>[x.inc,x.exp]));for(const [chartId,monthsId] of [['homeChart','homeMonths'],['reportChart','reportMonths']]){const ch=document.getElementById(chartId),mo=document.getElementById(monthsId);if(ch)ch.innerHTML=chartData.map(x=>`<div class="bar-group"><span class="bar in" style="height:${Math.max(x.inc?4:0,(x.inc/max)*125)}px"></span><span class="bar out" style="height:${Math.max(x.exp?4:0,(x.exp/max)*125)}px"></span></div>`).join('');if(mo)mo.innerHTML=chartData.map(x=>`<div>${x.label}</div>`).join('');}
    const annualIn=chartData.reduce((a,x)=>a+x.inc,0),annualExp=chartData.reduce((a,x)=>a+x.exp,0),months=chartData.filter(x=>x.inc||x.exp).length||1;setText('reportIncomeAvg',money(annualIn/months));setText('reportExpenseAvg',money(annualExp/months));setText('reportSavingsRate',annualIn?`${Math.round(Math.max(0,((annualIn-annualExp)/annualIn)*100))}%`:'0%');

    const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth(),first=new Date(y,m,1),start=new Date(y,m,1-first.getDay()),title=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(first);setText('calendarTitle',title.charAt(0).toUpperCase()+title.slice(1));let days='';for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const iso=isoFromDate(d),muted=d.getMonth()!==m,active=iso===isoFromDate(selectedDate),has=events.some(e=>e.date===iso)||debts.some(x=>x.due===iso&&x.remaining>0);days+=`<button class="day ${muted?'muted':''} ${active?'active':''}" data-cal-date="${iso}">${d.getDate()}${has?'<span class="dots"><i style="background:var(--emerald)"></i></span>':''}</button>`;}const cal=document.getElementById('calendarDays');if(cal)cal.innerHTML=days;const sd=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(selectedDate);setText('selectedDateTitle',sd.charAt(0).toUpperCase()+sd.slice(1));const sel=isoFromDate(selectedDate),eventList=document.getElementById('eventList'),dayEvents=events.filter(e=>e.date===sel).sort((a,b)=>String(a.time).localeCompare(String(b.time)));if(eventList)eventList.innerHTML=dayEvents.length?dayEvents.map(e=>`<div class="row"><div class="row-icon" style="background:rgba(24,183,163,.12);color:var(--emerald)">${iconMarkup('calendar-clock')}</div><div class="row-main"><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(e.note||'Compromisso')} • ${escapeHtml(e.time||'Sem horário')}</small></div></div>`).join(''):empty('calendar-days','Nenhum evento nesta data','Use o botão + para agendar um compromisso.');

    document.querySelectorAll<HTMLElement>('.nav-item[data-go],#bottomNav button[data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===currentPage));setText('miniTitle',titles[currentPage]);
    document.querySelectorAll<HTMLElement>('.switch').forEach(sw=>{const enabled=sw.dataset.setting==='due'?Boolean(profile.dueNotifications):Boolean(profile.goalNotifications);sw.classList.toggle('on',enabled);});
    requestAnimationFrame(()=>{try{createIcons({icons});}catch{}});
  },[transactions,debts,goals,events,profile,totals,txFilter,txSearch,calendarCursor,selectedDate,currentPage,last12,modal,authView,recoveryCode,sheetOpen]);

  useEffect(()=>{const e=document.getElementById('recoveryCodeText');if(e)e.textContent=recoveryCode||'—';},[recoveryCode,authView]);

  useEffect(()=>{
    const fab=document.getElementById('globalFab'),menu=document.getElementById('fabMenu');if(!fab||!menu)return;let dragging=false,moved=false,pointerId:number|null=null,startX=0,startY=0,startLeft=0,startTop=0;const margin=10,clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
    const restore=()=>{try{const p=JSON.parse(localStorage.getItem('ritmo-fab-pos')||'null');if(!p)return;const r=fab.getBoundingClientRect();fab.style.left=clamp(p.x,margin,innerWidth-r.width-margin)+'px';fab.style.top=clamp(p.y,margin,innerHeight-r.height-margin)+'px';fab.style.right='auto';fab.style.bottom='auto';}catch{}};
    const posMenu=()=>{const r=fab.getBoundingClientRect(),mr=menu.getBoundingClientRect();let left=clamp(r.right-mr.width,12,innerWidth-mr.width-12),top=r.top-mr.height-10;if(top<12)top=clamp(r.bottom+10,12,innerHeight-mr.height-12);menu.style.left=left+'px';menu.style.top=top+'px';};
    const setOpen=(open:boolean)=>{menu.classList.toggle('show',open);fab.classList.toggle('fab-open',open);document.body.classList.toggle('mobile-fab-menu-open',open);fab.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-hidden',String(!open));if(open)requestAnimationFrame(posMenu)};
    const down=(e:PointerEvent)=>{if(e.button!==0)return;pointerId=e.pointerId;fab.setPointerCapture?.(pointerId);const r=fab.getBoundingClientRect();startX=e.clientX;startY=e.clientY;startLeft=r.left;startTop=r.top;dragging=true;moved=false};
    const move=(e:PointerEvent)=>{if(!dragging||e.pointerId!==pointerId)return;const dx=e.clientX-startX,dy=e.clientY-startY;if(Math.hypot(dx,dy)>5)moved=true;if(!moved)return;e.preventDefault();fab.classList.add('dragging');setOpen(false);const r=fab.getBoundingClientRect();fab.style.left=clamp(startLeft+dx,margin,innerWidth-r.width-margin)+'px';fab.style.top=clamp(startTop+dy,margin,innerHeight-r.height-margin)+'px';fab.style.right='auto';fab.style.bottom='auto'};
    const end=()=>{if(!dragging)return;dragging=false;fab.classList.remove('dragging');const r=fab.getBoundingClientRect();localStorage.setItem('ritmo-fab-pos',JSON.stringify({x:r.left,y:r.top}));setTimeout(()=>moved=false,0)};
    const click=(e:MouseEvent)=>{if(moved){e.preventDefault();e.stopPropagation();return}setOpen(!menu.classList.contains('show'))}; const outside=(e:MouseEvent)=>{if(!fab.contains(e.target as Node)&&!menu.contains(e.target as Node))setOpen(false)};const resize=()=>{if(menu.classList.contains('show'))posMenu();restore()};
    fab.addEventListener('pointerdown',down);fab.addEventListener('pointermove',move);fab.addEventListener('pointerup',end);fab.addEventListener('pointercancel',end);fab.addEventListener('click',click);document.addEventListener('click',outside);window.addEventListener('resize',resize);restore();
    return()=>{document.body.classList.remove('mobile-fab-menu-open');fab.removeEventListener('pointerdown',down);fab.removeEventListener('pointermove',move);fab.removeEventListener('pointerup',end);fab.removeEventListener('pointercancel',end);fab.removeEventListener('click',click);document.removeEventListener('click',outside);window.removeEventListener('resize',resize)};
  },[authenticated]);

  async function busy<T>(fn:()=>Promise<T>,success?:string){if(busyRef.current)throw new Error('busy');busyRef.current=true;setLoading(true);try{const r=await fn();if(success)notify(success);return r;}catch(e:any){if(e?.message!=='busy')notify(e instanceof ApiError?e.message:(e?.message||'Não foi possível concluir a operação.'));throw e;}finally{busyRef.current=false;setLoading(false);}}
  async function login(){const username=(form.loginUser||'').trim(),password=form.loginPass||'';if(!username||!password)return notify('Preencha usuário e senha.');try{const out=await busy(()=>api.login({username,password}));if('requiresDeviceVerification'in out){setPendingDeviceVerification(out.verificationId);setAuthView('device');resetForm({loginUser:username});notify('Confirme o código para autorizar este aparelho.');return;}await applyAuth(out);notify('Bem-vindo ao Ritmo.');}catch(e:any){if(e instanceof ApiError&&e.status===428&&(e.details as any)?.verificationId){setPendingDeviceVerification((e.details as any).verificationId);setAuthView('device');notify('Novo aparelho detectado. Confirme seu código de recuperação.');}}}
  async function register(){const displayName=(form.firstUser||'').trim().replace(/\s+/g,' '),password=form.firstPass||'',confirm=form.firstPassConfirm||'';if(displayName.length<2)return notify('Informe seu nome completo.');if(password.length<8)return notify('A senha precisa ter pelo menos 8 caracteres.');if(password!==confirm)return notify('As senhas não conferem.');try{const out=await busy(()=>api.register({displayName,password}));setPendingActivationToken(out.activationToken);setRecoveryCode(out.recoveryCode||'');setGeneratedUsername(out.user.username||'');setAuthView('code');notify(`Usuário ${out.user.username} criado. Guarde seu código de recuperação.`);}catch{}}
  async function recover(){const username=(form.recoverUser||'').trim(),code=(form.recoverCode||'').trim(),p=form.recoverPass||'',p2=form.recoverPass2||'';if(!username||!code||!p)return notify('Preencha os dados de recuperação.');if(p.length<8)return notify('A nova senha precisa ter pelo menos 8 caracteres.');if(p!==p2)return notify('As senhas não conferem.');try{const out=await busy(()=>api.recover({username,recoveryCode:code,newPassword:p}));await applyAuth(out);notify('Senha redefinida e aparelho autorizado.');}catch{}}
  async function authorizeDevice(){const code=(form.newDeviceCode||'').trim();if(!code)return notify('Informe o código de recuperação.');try{const out=await busy(()=>api.authorizeDevice({verificationId:pendingDeviceVerification,recoveryCode:code}));setPendingDeviceVerification('');await applyAuth(out);notify('Aparelho autorizado com segurança.');}catch{}}
  async function manualRefresh(){
    if(syncing||busyRef.current)return;
    setSyncing(true);
    try{
      await refresh();
      notify('Dados atualizados e sincronizados.');
    }catch(e){
      if(e instanceof ApiError&&(e.status===401||e.status===403)){
        await clearLocalAuth();
        setAuthenticated(false);
        setData(emptyData);
        setAuthView('login');
        notify('Sua sessão expirou. Entre novamente.');
      }else{
        notify(e instanceof ApiError?e.message:'Não foi possível atualizar agora.');
      }
    }finally{
      setSyncing(false);
    }
  }

  const handleInput=(e:React.FormEvent<HTMLElement>)=>{const t=e.target as HTMLInputElement|HTMLSelectElement;if(!t.id)return;setField(t.id,t.value);if(t.id==='txSearch')setTxSearch(t.value);};
  const navigate=(page:string)=>{if(page in titles){setCurrentPage(page as Page);setModal(null);setSheetOpen(false);window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}};

  const handleAuthKeyDown=async(e:React.KeyboardEvent<HTMLElement>)=>{
    if(e.key!=='Enter'||loading)return;
    const target=e.target as HTMLElement;
    if(target.tagName==='TEXTAREA')return;
    e.preventDefault();
    if(authView==='login')await login();
    else if(authView==='register')await register();
    else if(authView==='recover')await recover();
    else if(authView==='device')await authorizeDevice();
  };

  const handleClick=async(e:React.MouseEvent<HTMLElement>)=>{
    const el=e.target as HTMLElement;const go=el.closest<HTMLElement>('[data-go]');if(go){navigate(go.dataset.go||'home');return;}const sg=el.closest<HTMLElement>('[data-search-go]');if(sg){navigate(sg.dataset.searchGo||'home');return;}const cal=el.closest<HTMLElement>('[data-cal-date]');if(cal){setSelectedDate(new Date(`${cal.dataset.calDate}T12:00:00`));return;}const button=el.closest<HTMLButtonElement>('button');if(!button)return;
    if(button.dataset.filter){setTxFilter(button.dataset.filter as any);return;}if(button.dataset.themeChoice){const theme=button.dataset.themeChoice as Profile['theme'];setData(d=>({...d,profile:{...d.profile,theme}}));try{const p=await api.saveProfile({theme});setData(d=>({...d,profile:p}));notify('Tema atualizado.');}catch{}return;}
    if(button.classList.contains('switch')){const key=button.dataset.setting,patch=key==='due'?{dueNotifications:!profile.dueNotifications}:{goalNotifications:!profile.goalNotifications};setData(d=>({...d,profile:{...d.profile,...patch}}));try{const p=await api.saveProfile(patch);setData(d=>({...d,profile:p}));notify('Preferência atualizada.');}catch{}return;}
    switch(button.id){
      case 'loginBtn':await login();return;case 'firstAccessBtn':setGeneratedUsername('');setRecoveryCode('');setPendingActivationToken('');setAuthView('register');resetForm();return;case 'forgotBtn':setAuthView('recover');resetForm();return;case 'backLoginBtn':case 'backRecoveryBtn':setGeneratedUsername('');setRecoveryCode('');setPendingActivationToken('');setAuthView('login');resetForm();return;case 'createAccessBtn':await register();return;case 'recoverAccessBtn':await recover();return;case 'authorizeDeviceBtn':await authorizeDevice();return;case 'cancelDeviceBtn':setPendingDeviceVerification('');setAuthView('login');resetForm();return;
      case 'copyRecoveryBtn':try{await navigator.clipboard.writeText(recoveryCode);notify('Código copiado.');}catch{notify('Selecione o código e copie manualmente.');}return;
      case 'finishRecoveryBtn':if(!pendingActivationToken){setAuthView('register');return notify('Refaça o primeiro acesso para gerar um novo código.');}try{const out=await busy(()=>api.confirmRegistration(pendingActivationToken));setPendingActivationToken('');await applyAuth(out);notify('Código confirmado. Seu acesso está pronto.');}catch{}return;
      case 'togglePassword':{const p=document.getElementById('loginPass') as HTMLInputElement|null;if(p)p.type=p.type==='password'?'text':'password';return;}
      case 'prevMonth':{const d=new Date(calendarCursor);d.setMonth(d.getMonth()-1);d.setDate(1);setCalendarCursor(d);setSelectedDate(new Date(d));return;}case 'nextMonth':{const d=new Date(calendarCursor);d.setMonth(d.getMonth()+1);d.setDate(1);setCalendarCursor(d);setSelectedDate(new Date(d));return;}
      case 'syncNowBtn':case 'mobileSync':await manualRefresh();return;case 'searchBtn':case 'mobileSearch':setModal({kind:'search'});resetForm({globalSearch:''});return;case 'notifyBtn':setModal({kind:'notifications'});return;case 'mobileMore':setSheetOpen(true);return;
    }
    const action=button.dataset.action;
    if(action==='close-modal'){setModal(null);return;}if(action==='close-sheet'){setSheetOpen(false);return;}if(action==='new-transaction'){setModal({kind:'new-transaction'});resetForm({newTxDate:todayISO(),newTxType:'Despesa'});return;}if(action==='new-goal'){setModal({kind:'new-goal'});resetForm();return;}if(action==='new-event'){setModal({kind:'new-event'});resetForm({newEventDate:isoFromDate(selectedDate)});return;}if(action==='new-debt'){setModal({kind:'new-debt'});resetForm();return;}if(action==='debt-payment'){setModal({kind:'debt-payment',id:button.dataset.debt});resetForm({debtPayDate:todayISO()});return;}if(action==='goal-add'){setModal({kind:'goal-add',id:button.dataset.goal});resetForm();return;}if(action==='edit-profile'){setModal({kind:'edit-profile'});resetForm({profileDisplayName:profile.displayName});return;}if(action==='change-password'){setModal({kind:'change-password'});resetForm();return;}if(action==='recovery-code'){setModal({kind:'recovery-code'});resetForm();return;}if(action==='privacy'){setModal({kind:'privacy'});return;}if(action==='categories'){setModal({kind:'categories'});return;}if(action==='export'){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ritmo-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(url);notify('Backup exportado.');return;}if(action==='logout'){try{await api.logout();}catch{}await clearLocalAuth();setAuthenticated(false);setData(emptyData);setAuthView('login');notify('Sessão encerrada.');return;}
    if(button.id==='saveTx'){const desc=(form.newTxDesc||'').trim(),value=Math.abs(parseMoney(form.newTxValue||'')),type=(form.newTxType||'Despesa') as 'Receita'|'Despesa';if(!desc||!value)return notify('Informe descrição e valor.');try{await busy(()=>api.createTransaction({date:form.newTxDate||todayISO(),desc,cat:(form.newTxCat||'Outros').trim()||'Outros',type,value,icon:'circle-dollar-sign'}),'Transação salva.');setModal(null);await refresh();}catch{}return;}
    if(button.id==='saveGoal'){const name=(form.newGoalName||'').trim(),target=Math.abs(parseMoney(form.newGoalTarget||''));if(!name||!target)return notify('Informe nome e valor da meta.');try{await busy(()=>api.createGoal({name,target,saved:0,due:form.newGoalDue||''}),'Meta criada.');setModal(null);await refresh();}catch{}return;}
    if(button.id==='saveEvent'){const title=(form.newEventTitle||'').trim(),date=form.newEventDate||'';if(!title||!date)return notify('Informe nome e data.');try{await busy(()=>api.createEvent({title,date,time:form.newEventTime||'',note:(form.newEventNote||'').trim()}),'Evento adicionado.');setModal(null);await refresh();}catch{}return;}
    if(button.id==='saveDebt'){const name=(form.newDebtName||'').trim(),value=Math.abs(parseMoney(form.newDebtValue||'')),due=form.newDebtDue||'';if(!name||!value||!due)return notify('Informe nome, valor e vencimento.');try{await busy(()=>api.createDebt({name,total:value,remaining:value,due,category:(form.newDebtCategory||'Compromisso').trim()||'Compromisso'}),'Dívida cadastrada.');setModal(null);await refresh();}catch{}return;}
    if(button.id==='confirmPay'&&modal?.id){const value=Math.abs(parseMoney(form.debtPayValue||''));if(!value)return notify('Informe o valor pago.');try{await busy(()=>api.payDebt(modal.id!,value,form.debtPayDate||todayISO()),'Pagamento registrado.');setModal(null);await refresh();}catch{}return;}
    if(button.id==='confirmGoalAdd'&&modal?.id){const value=Math.abs(parseMoney(form.goalAddValue||''));if(!value)return notify('Informe o valor.');try{await busy(()=>api.addGoalValue(modal.id!,value),'Valor adicionado.');setModal(null);await refresh();}catch{}return;}
    if(button.id==='saveProfile'){const displayName=(form.profileDisplayName||'').trim();if(!displayName)return notify('Informe o nome de exibição.');try{const p=await busy(()=>api.saveProfile({displayName}),'Perfil atualizado.');setData(d=>({...d,profile:p}));setModal(null);await refresh();}catch{}return;}
    if(button.id==='savePassword'){const cur=form.currentPass||'',np=form.newPass||'',np2=form.newPass2||'';if(np.length<8)return notify('Use pelo menos 8 caracteres.');if(np!==np2)return notify('As senhas não conferem.');try{const out=await busy(()=>api.changePassword({currentPassword:cur,newPassword:np}));await persistAuth(out);setModal(null);notify('Senha atualizada e outras sessões encerradas.');}catch{}return;}
    if(button.id==='generateNewRecovery'){try{const out=await busy(()=>api.rotateRecoveryCode(form.recoveryCurrentPass||''));setRecoveryCode(out.recoveryCode);setModal({kind:'new-recovery-code'});resetForm();}catch{}return;}
    if(button.id==='copyModalRecovery'){try{await navigator.clipboard.writeText(recoveryCode);notify('Código copiado.');}catch{notify('Selecione e copie manualmente.');}return;}
    if(button.id==='enableBiometrics'){try{await busy(()=>registerBiometrics(),'Biometria ativada neste aparelho.');}catch{}return;}
    if(button.id==='biometricLogin'){const username=(form.loginUser||'').trim();if(!isNativeApp()&&!username)return notify('Informe o usuário antes de usar a biometria.');try{const out=await busy(()=>loginWithBiometrics(username));if(out.mode==='native'){setAuthenticated(true);setAuthView('login');await refresh();}else{await applyAuth(out.auth);}notify('Acesso biométrico confirmado.');}catch{}return;}
    if(button.id==='enablePush'){try{const push=await busy(()=>enablePushNotifications(),'Notificações ativadas.');if(push?.mode==='web')await api.sendTestPush();}catch{}return;}
    if(button.id==='installPwa'){try{const ok=await installPWA();notify(ok?'Ritmo instalado.':'A instalação não foi concluída.');}catch{notify('Use a opção “Instalar aplicativo” do navegador.');}return;}
  };

  function input(id:string,placeholder:string,type='text',extra:React.InputHTMLAttributes<HTMLInputElement>={}){return <input className="app-input" id={id} type={type} placeholder={placeholder} value={form[id]||''} onChange={e=>setField(id,e.target.value)} {...extra}/>;}
  function renderModal(){
    if(!modal)return null;const close=<button className="premium-btn btn-glass icon-btn" data-action="close-modal" style={{width:36,height:36}}><i data-lucide="x"></i></button>;
    const shell=(title:string,content:React.ReactNode)=><><div className="modal-top"><h3>{title}</h3>{close}</div>{content}</>;
    if(modal.kind==='new-transaction')return shell('Nova transação',<div className="modal-form">{input('newTxDesc','Descrição')}<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>{input('newTxValue','0,00','text',{inputMode:'decimal'})}<select className="app-input" id="newTxType" value={form.newTxType||'Despesa'} onChange={e=>setField('newTxType',e.target.value)}><option>Despesa</option><option>Receita</option></select></div>{input('newTxDate','Data','date')}{input('newTxCat','Categoria')}<button className="premium-btn btn-primary" id="saveTx" style={{height:48}}>Salvar transação</button></div>);
    if(modal.kind==='new-goal')return shell('Nova meta',<div className="modal-form">{input('newGoalName','Nome da meta')}{input('newGoalTarget','Valor alvo','text',{inputMode:'decimal'})}{input('newGoalDue','Prazo','date')}<button className="premium-btn btn-primary" id="saveGoal" style={{height:48}}>Criar meta</button></div>);
    if(modal.kind==='new-event')return shell('Novo evento',<div className="modal-form">{input('newEventTitle','Nome do compromisso')}{input('newEventDate','Data','date')}{input('newEventTime','Horário','time')}{input('newEventNote','Observação')}<button className="premium-btn btn-primary" id="saveEvent" style={{height:48}}>Adicionar evento</button></div>);
    if(modal.kind==='new-debt')return shell('Nova dívida',<div className="modal-form">{input('newDebtName','Nome do compromisso')}{input('newDebtValue','Valor total','text',{inputMode:'decimal'})}{input('newDebtDue','Vencimento','date')}{input('newDebtCategory','Categoria')}<button className="premium-btn btn-primary" id="saveDebt" style={{height:48}}>Cadastrar dívida</button></div>);
    if(modal.kind==='debt-payment'){const d=debts.find(x=>x.id===modal.id);return shell('Registrar pagamento',<div className="modal-form"><div className="row"><div className="row-main"><strong>{d?.name}</strong><small>Em aberto: {money(d?.remaining||0)}</small></div></div>{input('debtPayValue','Valor pago','text',{inputMode:'decimal'})}{input('debtPayDate','Data','date')}<button className="premium-btn btn-primary" id="confirmPay" style={{height:48}}>Confirmar pagamento</button></div>);}
    if(modal.kind==='goal-add'){const g=goals.find(x=>x.id===modal.id);return shell('Adicionar valor',<div className="modal-form"><div className="row"><div className="row-main"><strong>{g?.name}</strong><small>Atual: {money(g?.saved||0)}</small></div></div>{input('goalAddValue','Valor','text',{inputMode:'decimal'})}<button className="premium-btn btn-primary" id="confirmGoalAdd" style={{height:48}}>Adicionar</button></div>);}
    if(modal.kind==='edit-profile')return shell('Editar perfil',<div className="modal-form"><div className="immutable-username-box"><span>Nome de usuário</span><strong>@{profile.username||'usuario'}</strong><small><i data-lucide="lock-keyhole"></i> Permanente. O nome de usuário não pode ser alterado.</small></div>{input('profileDisplayName','Nome de exibição')}<button className="premium-btn btn-primary" id="saveProfile" style={{height:48}}>Salvar alterações</button></div>);
    if(modal.kind==='change-password')return shell('Alterar senha',<div className="modal-form">{input('currentPass','Senha atual','password',{autoComplete:'current-password'})}{input('newPass','Nova senha','password',{autoComplete:'new-password'})}{input('newPass2','Confirmar nova senha','password',{autoComplete:'new-password'})}<button className="premium-btn btn-primary" id="savePassword" style={{height:48}}>Atualizar senha</button></div>);
    if(modal.kind==='recovery-code')return shell('Código de recuperação',<div className="modal-form"><div className="recovery-purpose"><strong>Este código tem duas funções</strong><span>Recuperar a senha e autorizar um aparelho novo. O código atual continua válido até você gerar outro.</span></div>{input('recoveryCurrentPass','Confirme sua senha atual','password',{autoComplete:'current-password'})}<button className="premium-btn btn-primary" id="generateNewRecovery" style={{height:48}}>Gerar novo código</button>{biometricAvailable&&<button className="premium-btn btn-glass" id="enableBiometrics" style={{height:46}}><i data-lucide="scan-face"></i>Ativar biometria neste aparelho</button>}</div>);
    if(modal.kind==='new-recovery-code')return shell('Novo código de recuperação',<div className="modal-form"><div className="recovery-code-box"><span>Seu novo código</span><code id="modalRecoveryCode">{recoveryCode}</code></div><div className="recovery-note"><i data-lucide="shield-check"></i><span>Anote ou copie agora. O código anterior deixou de funcionar.</span></div><button className="premium-btn btn-primary" id="copyModalRecovery" style={{height:48}}>Copiar código</button></div>);
    if(modal.kind==='privacy')return shell('Privacidade e dispositivo',<div className="list"><div className="row"><div className="row-main"><strong>Sincronização protegida</strong><small>Dados financeiros ficam no D1; arquivos ficam no Workers KV; biometria permanece no autenticador do aparelho.</small></div></div><div className="row"><div className="row-main"><strong>Notificações push</strong><small>Ative alertas nativos para vencimentos e metas.</small></div><button className="premium-btn btn-glass" id="enablePush" style={{height:36,padding:'0 11px'}}>Ativar</button></div><div className="row"><div className="row-main"><strong>Instalar PWA</strong><small>Instale o Ritmo como aplicativo no aparelho.</small></div><button className="premium-btn btn-glass" id="installPwa" style={{height:36,padding:'0 11px'}} disabled={!pwaInstallReady}>Instalar</button></div></div>);
    if(modal.kind==='categories')return shell('Categorias',<div className="list"><div className="row"><div className="row-main"><strong>Categorias livres</strong><small>Informe a categoria ao criar cada movimentação ou dívida.</small></div></div></div>);
    if(modal.kind==='notifications'){const t=new Date(todayISO()+'T00:00:00'),near=debts.filter(d=>d.remaining>0).map(d=>({...d,days:Math.ceil((new Date(d.due+'T00:00:00').getTime()-t.getTime())/86400000)})).filter(d=>d.days>=0&&d.days<=7).sort((a,b)=>a.days-b.days);return shell('Notificações',near.length?<div className="list">{near.map(d=><button className="row" data-go="debts" key={d.id}><div className="row-icon" style={{background:'rgba(217,179,91,.14)',color:'#B57C25'}}><i data-lucide="calendar-clock"></i></div><div className="row-main"><strong>{d.name}</strong><small>{d.days===0?'Vence hoje':`Vence em ${d.days} dia${d.days===1?'':'s'}`} • {money(d.remaining)}</small></div></button>)}</div>:<div dangerouslySetInnerHTML={{__html:empty('bell-off','Nenhum alerta agora','Seus próximos vencimentos aparecerão aqui.')}}/>);}
    if(modal.kind==='search'){const q=(form.globalSearch||'').toLowerCase(),items=[...Object.entries(titles).map(([p,n])=>({n,p:p as Page})),...transactions.map(x=>({n:x.desc,p:'transactions' as Page})),...debts.map(x=>({n:x.name,p:'debts' as Page})),...goals.map(x=>({n:x.name,p:'goals' as Page}))].filter(i=>!q||i.n.toLowerCase().includes(q)).slice(0,8);return shell('Buscar no Ritmo',<div className="modal-form">{input('globalSearch','Tela, movimentação, dívida ou meta')}<div className="list" id="searchResults">{items.length?items.map((i,k)=><button className="row" data-search-go={i.p} key={`${i.p}-${i.n}-${k}`}><div className="row-main"><strong>{i.n}</strong><small>{titles[i.p]}</small></div><i data-lucide="chevron-right"></i></button>):<div dangerouslySetInnerHTML={{__html:empty('search','Nada encontrado','Tente outro termo.')}}/>}</div></div>);}
    return null;
  }

  return (
    <>
    <div className='app-bg' id='appBackground' onClick={handleClick} onInput={handleInput} onChange={handleInput}>
      

      <div className='app-shell' id='appShell'>
        

        <aside className='sidebar liquid' id='sidebar'>
          

          <div className='logo-surface'>
            <img alt='Ritmo' className='brand-logo' data-ritmo-logo='' src='/ritmo-logo.webp' />
          </div>
          

          <nav className='sidebar-nav' id='sideNav'>
            

            <button className='nav-item active' data-go='home' data-label='Início'>
              <i data-lucide='house'></i>
              <span className='sidebar-label'>
                Início
              </span>
            </button>
            

            <button className='nav-item' data-go='transactions' data-label='Movimentações'>
              <i data-lucide='arrow-left-right'></i>
              <span className='sidebar-label'>
                Movimentações
              </span>
            </button>
            

            <button className='nav-item' data-go='debts' data-label='Dívidas'>
              <i data-lucide='credit-card'></i>
              <span className='sidebar-label'>
                Dívidas
              </span>
            </button>
            

            <button className='nav-item' data-go='calendar' data-label='Planejamento'>
              <i data-lucide='calendar-days'></i>
              <span className='sidebar-label'>
                Planejamento
              </span>
            </button>
            

            <button className='nav-item' data-go='goals' data-label='Metas'>
              <i data-lucide='target'></i>
              <span className='sidebar-label'>
                Metas
              </span>
            </button>
            

            <button className='nav-item' data-go='reports' data-label='Relatórios'>
              <i data-lucide='chart-no-axes-combined'></i>
              <span className='sidebar-label'>
                Relatórios
              </span>
            </button>
            

            <button className='nav-item' data-go='profile' data-label='Perfil'>
              <i data-lucide='user-round'></i>
              <span className='sidebar-label'>
                Perfil
              </span>
            </button>
            

            <button className='nav-item' data-go='settings' data-label='Ajustes'>
              <i data-lucide='settings-2'></i>
              <span className='sidebar-label'>
                Ajustes
              </span>
            </button>
            

          </nav>
          

          <div className='sidebar-bottom liquid-soft'>
            <div className='sidebar-bottom-copy'>
              <strong>
                Mais que finanças.
              </strong>
              <small>
                Um futuro real, organizado para suas escolhas.
              </small>
            </div>
          </div>
          

        </aside>
        

        <main className='main'>
          

          <header className='topbar'>
            

            <div className='topbar-left'>
              <button className='premium-btn btn-glass icon-btn' id='sidebarToggle' title='Recolher menu lateral'>
                <i data-lucide='panel-left-close'></i>
              </button>
              <div>
                <div className='page-title-mini' id='miniTitle'>
                  Início
                </div>
              </div>
            </div>
            

            <div className='topbar-right'>
              <button aria-label='Atualizar dados' className={`premium-btn btn-glass icon-btn sync-btn ${syncing ? "syncing" : ""}`.trim()} disabled={syncing} id='syncNowBtn' title='Atualizar e sincronizar'>
                <i data-lucide='refresh-cw'></i>
              </button>
              <button className='premium-btn btn-glass icon-btn' id='searchBtn'>
                <i data-lucide='search'></i>
              </button>
              <button className='premium-btn btn-glass icon-btn' id='notifyBtn'>
                <i data-lucide='bell'></i>
              </button>
              <button className='premium-btn btn-glass' data-go='profile' style={{height: '44px', padding: '0 10px 0 5px'} as React.CSSProperties}>
                <span className='avatar' id='accountAvatar'>
                  R
                </span>
                <span id='accountName' style={{fontSize: '12px'} as React.CSSProperties}>
                  Conta
                </span>
                <i data-lucide='chevron-down' style={{width: '14px'} as React.CSSProperties}></i>
              </button>
            </div>
            

          </header>
          

          <header className='mobile-header'>
            <div className='logo-surface'>
              <img alt='Ritmo' className='brand-logo' data-ritmo-logo='' src='/ritmo-logo.webp' />
            </div>
            <div style={{display: 'flex', gap: '8px'} as React.CSSProperties}>
              <button aria-label='Atualizar dados' className={`premium-btn btn-glass icon-btn sync-btn ${syncing ? "syncing" : ""}`.trim()} disabled={syncing} id='mobileSync' title='Atualizar e sincronizar'>
                <i data-lucide='refresh-cw'></i>
              </button>
              <button className='premium-btn btn-glass icon-btn' id='mobileSearch'>
                <i data-lucide='search'></i>
              </button>
              <button className='premium-btn btn-glass icon-btn' id='mobileMore'>
                <i data-lucide='menu'></i>
              </button>
            </div>
          </header>
          

          <div className='content'>
            

            <section className={`page ${currentPage === 'home' ? "active" : ""}`.trim()} id='page-home'>
              

              <div className='reference-page-head'>
                

                <div>
                  

                  <div className='eyebrow'>
                    Visão financeira
                  </div>
                  

                  <h1 className='h1'>
                    Visão geral
                  </h1>
                  

                  <p className='lead'>
                    Acompanhe o que entrou, o que saiu e os próximos passos do seu planejamento.
                  </p>
                  

                </div>
                

              </div>
              

              <div className='kpi-grid home-kpis'>
                

                <div className='kpi liquid'>
                  

                  <div className='kpi-icon finaci-blue-soft'>
                    <i data-lucide='wallet-cards'></i>
                  </div>
                  

                  <div>
                    <div className='kpi-label'>
                      Saldo disponível
                    </div>
                    <div className='kpi-value' id='homeBalance'>
                      R$ 0,00
                    </div>
                    <div className='kpi-hint' id='homeBalanceHint'>
                      Sem movimentações
                    </div>
                  </div>
                  

                </div>
                

                <div className='kpi liquid'>
                  

                  <div className='kpi-icon finaci-green-soft'>
                    <i data-lucide='arrow-down-left'></i>
                  </div>
                  

                  <div>
                    <div className='kpi-label'>
                      Receitas
                    </div>
                    <div className='kpi-value' id='homeIncome'>
                      R$ 0,00
                    </div>
                    <div className='kpi-hint' id='homeIncomeHint'>
                      Sem movimentações
                    </div>
                  </div>
                  

                </div>
                

                <div className='kpi liquid'>
                  

                  <div className='kpi-icon finaci-red-soft'>
                    <i data-lucide='arrow-up-right'></i>
                  </div>
                  

                  <div>
                    <div className='kpi-label'>
                      Despesas
                    </div>
                    <div className='kpi-value' id='homeExpense'>
                      R$ 0,00
                    </div>
                    <div className='kpi-hint' id='homeExpenseHint'>
                      Sem movimentações
                    </div>
                  </div>
                  

                </div>
                

                <div className='kpi liquid'>
                  

                  <div className='kpi-icon finaci-gold-soft'>
                    <i data-lucide='target'></i>
                  </div>
                  

                  <div>
                    <div className='kpi-label'>
                      Metas ativas
                    </div>
                    <div className='kpi-value' id='homeGoals'>
                      0
                    </div>
                    <div className='kpi-hint' id='homeGoalsHint'>
                      Nenhuma meta cadastrada
                    </div>
                  </div>
                  

                </div>
                

              </div>
              

              <div className='home-reference-grid'>
                

                <div className='section-card liquid home-flow-card'>
                  

                  <div className='section-head'>
                    

                    <div>
                      <h2>
                        Visão do mês
                      </h2>
                      <small>
                        Receitas e despesas por período
                      </small>
                    </div>
                    

                    <button className='link' data-go='reports'>
                      Ver relatório
                    </button>
                    

                  </div>
                  

                  <div className='chart' id='homeChart'></div>
                  

                  <div className='months' id='homeMonths'></div>
                  

                </div>
                

                <div className='section-card liquid home-summary-card'>
                  

                  <div className='section-head'>
                    

                    <div>
                      <h2>
                        Seu mês
                      </h2>
                      <small>
                        Resumo financeiro
                      </small>
                    </div>
                    

                    <span className='status-chip success-chip' id='homeStatusChip'>
                      Sem dados
                    </span>
                    

                  </div>
                  

                  <div className='home-score-row'>
                    

                    <div className='reference-donut' id='homeDonut' style={{'--score': '0'} as React.CSSProperties}>
                      <span>
                        <strong id='homeSavingsRate'>
                          0%
                        </strong>
                        <small>
                          economizado
                        </small>
                      </span>
                    </div>
                    

                    <div className='home-score-copy'>
                      <strong id='homeMonthResult'>
                        R$ 0,00
                      </strong>
                      <span>
                        resultado deste mês
                      </span>
                      <small id='homeSummaryText'>
                        Adicione movimentações para gerar seu resumo.
                      </small>
                    </div>
                    

                  </div>
                  

                </div>
                

              </div>
              

              <div className='home-lower-grid'>
                

                <div className='section-card liquid'>
                  

                  <div className='section-head'>
                    <div>
                      <h2>
                        Transações recentes
                      </h2>
                      <small>
                        Últimos lançamentos
                      </small>
                    </div>
                    <button className='link' data-go='transactions'>
                      Ver todas
                    </button>
                  </div>
                  

                  <div className='list' id='homeRecentTransactions'></div>
                  

                </div>
                

                <div className='section-card liquid'>
                  

                  <div className='section-head'>
                    <div>
                      <h2>
                        Próximos compromissos
                      </h2>
                      <small>
                        Contas e vencimentos
                      </small>
                    </div>
                    <button className='link' data-go='calendar'>
                      Ver todos
                    </button>
                  </div>
                  

                  <div className='list' id='homeCommitments'></div>
                  

                </div>
                

              </div>
              

            </section>
            

            <section className={`page ${currentPage === 'transactions' ? "active" : ""}`.trim()} id='page-transactions'>
              <div className='eyebrow'>
                Movimentações
              </div>
              <h1 className='h1'>
                Entradas e saídas
              </h1>
              <p className='lead'>
                Acompanhe de onde vem e para onde vai o seu dinheiro.
              </p>
              <div className='kpi-grid'>
                <div className='kpi liquid'>
                  <div className='kpi-icon' style={{background: 'rgba(16,42,92,.10)', color: 'var(--night)'} as React.CSSProperties}>
                    <i data-lucide='wallet'></i>
                  </div>
                  <div>
                    <div className='kpi-label'>
                      Saldo total
                    </div>
                    <div className='kpi-value' id='txBalance'>
                      R$ 0,00
                    </div>
                    <div className='kpi-hint' id='txBalanceHint'>
                      Sem movimentações
                    </div>
                  </div>
                </div>
                <div className='kpi liquid'>
                  <div className='kpi-icon' style={{background: 'rgba(24,183,163,.14)', color: 'var(--emerald)'} as React.CSSProperties}>
                    <i data-lucide='arrow-down-left'></i>
                  </div>
                  <div>
                    <div className='kpi-label'>
                      Receitas
                    </div>
                    <div className='kpi-value' id='txIncome'>
                      R$ 0,00
                    </div>
                    <div className='kpi-hint' id='txIncomeHint'>
                      No período atual
                    </div>
                  </div>
                </div>
                <div className='kpi liquid'>
                  <div className='kpi-icon' style={{background: 'rgba(224,91,104,.13)', color: 'var(--danger)'} as React.CSSProperties}>
                    <i data-lucide='arrow-up-right'></i>
                  </div>
                  <div>
                    <div className='kpi-label'>
                      Despesas
                    </div>
                    <div className='kpi-value' id='txExpense'>
                      R$ 0,00
                    </div>
                    <div className='kpi-hint' id='txExpenseHint'>
                      No período atual
                    </div>
                  </div>
                </div>
                <div className='kpi liquid'>
                  <div className='kpi-icon' style={{background: 'rgba(217,179,91,.16)', color: '#B57C25'} as React.CSSProperties}>
                    <i data-lucide='piggy-bank'></i>
                  </div>
                  <div>
                    <div className='kpi-label'>
                      Economia
                    </div>
                    <div className='kpi-value' id='txSavings'>
                      0%
                    </div>
                    <div className='kpi-hint' id='txSavingsHint'>
                      Sem dados suficientes
                    </div>
                  </div>
                </div>
              </div>
              <div className='toolbar'>
                <div className='seg' id='txFilter'>
                  <button className='active' data-filter='all'>
                    Todas
                  </button>
                  <button data-filter='income'>
                    Receitas
                  </button>
                  <button data-filter='expense'>
                    Despesas
                  </button>
                </div>
                <div className='search-field liquid-soft'>
                  <i data-lucide='search'></i>
                  <input id='txSearch' placeholder='Buscar movimentação...' />
                </div>
              </div>
              <div className='table-wrap liquid'>
                <table className='table'>
                  <thead>
                    <tr>
                      <th>
                        Data
                      </th>
                      <th>
                        Descrição
                      </th>
                      <th>
                        Categoria
                      </th>
                      <th>
                        Tipo
                      </th>
                      <th>
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody id='txTable'></tbody>
                </table>
              </div>
              <div className='list' id='txMobile' style={{marginTop: '10px'} as React.CSSProperties}></div>
            </section>
            

            <section className={`page ${currentPage === 'debts' ? "active" : ""}`.trim()} id='page-debts'>
              <div className='eyebrow'>
                Compromissos
              </div>
              <h1 className='h1'>
                Dívidas
              </h1>
              <p className='lead'>
                Organize pagamentos e reduza encargos sem perder o controle do todo.
              </p>
              <div className='kpi-grid'>
                <div className='kpi liquid'>
                  <div className='kpi-icon' style={{background: 'rgba(16,42,92,.10)', color: 'var(--night)'} as React.CSSProperties}>
                    <i data-lucide='layers-3'></i>
                  </div>
                  <div>
                    <div className='kpi-label'>
                      Total em aberto
                    </div>
                    <div className='kpi-value' id='debtTotal'>
                      R$ 0,00
                    </div>
                    <div className='kpi-hint' id='debtTotalHint'>
                      Nenhum compromisso
                    </div>
                  </div>
                </div>
                <div className='kpi liquid'>
                  <div className='kpi-icon' style={{background: 'rgba(24,183,163,.14)', color: 'var(--emerald)'} as React.CSSProperties}>
                    <i data-lucide='circle-check-big'></i>
                  </div>
                  <div>
                    <div className='kpi-label'>
                      Compromissos
                    </div>
                    <div className='kpi-value' id='debtCount'>
                      0
                    </div>
                    <div className='kpi-hint' id='debtCountHint'>
                      Nenhuma dívida cadastrada
                    </div>
                  </div>
                </div>
                <div className='kpi liquid'>
                  <div className='kpi-icon' style={{background: 'rgba(217,179,91,.16)', color: '#B57C25'} as React.CSSProperties}>
                    <i data-lucide='calendar-clock'></i>
                  </div>
                  <div>
                    <div className='kpi-label'>
                      Próximo vencimento
                    </div>
                    <div className='kpi-value' id='debtNext'>
                      —
                    </div>
                    <div className='kpi-hint' id='debtNextHint'>
                      Sem vencimentos
                    </div>
                  </div>
                </div>
                <div className='kpi liquid'>
                  <div className='kpi-icon' style={{background: 'rgba(224,91,104,.13)', color: 'var(--danger)'} as React.CSSProperties}>
                    <i data-lucide='triangle-alert'></i>
                  </div>
                  <div>
                    <div className='kpi-label'>
                      Atenção
                    </div>
                    <div className='kpi-value' id='debtLate'>
                      0
                    </div>
                    <div className='kpi-hint' id='debtLateHint'>
                      Nenhuma conta em atraso
                    </div>
                  </div>
                </div>
              </div>
              <div className='table-wrap liquid' style={{marginTop: '14px'} as React.CSSProperties}>
                <table className='table'>
                  <thead>
                    <tr>
                      <th>
                        Dívida
                      </th>
                      <th>
                        Restante
                      </th>
                      <th>
                        Vencimento
                      </th>
                      <th>
                        Status
                      </th>
                      <th>
                        Progresso
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id='debtTable'></tbody>
                </table>
              </div>
              <div className='list' id='debtMobile' style={{marginTop: '10px'} as React.CSSProperties}></div>
            </section>
            

            <section className={`page ${currentPage === 'calendar' ? "active" : ""}`.trim()} id='page-calendar'>
              <div className='eyebrow'>
                Planejamento
              </div>
              <h1 className='h1'>
                Calendário
              </h1>
              <p className='lead'>
                Contas, receitas e metas reunidas por data.
              </p>
              <div className='calendar-layout'>
                <div className='calendar liquid'>
                  <div className='cal-top'>
                    <button className='premium-btn btn-glass icon-btn' id='prevMonth'>
                      <i data-lucide='chevron-left'></i>
                    </button>
                    <div className='cal-title' id='calendarTitle'></div>
                    <button className='premium-btn btn-glass icon-btn' id='nextMonth'>
                      <i data-lucide='chevron-right'></i>
                    </button>
                  </div>
                  <div className='week'>
                    <div>
                      D
                    </div>
                    <div>
                      S
                    </div>
                    <div>
                      T
                    </div>
                    <div>
                      Q
                    </div>
                    <div>
                      Q
                    </div>
                    <div>
                      S
                    </div>
                    <div>
                      S
                    </div>
                  </div>
                  <div className='days' id='calendarDays'></div>
                </div>
                <div className='section-card liquid'>
                  <div className='section-head'>
                    <h2 id='selectedDateTitle'>
                      Hoje
                    </h2>
                  </div>
                  <div className='list' id='eventList'></div>
                </div>
              </div>
            </section>
            

            <section className={`page ${currentPage === 'goals' ? "active" : ""}`.trim()} id='page-goals'>
              <div className='eyebrow'>
                Objetivos
              </div>
              <h1 className='h1'>
                Metas que viram conquistas.
              </h1>
              <p className='lead'>
                Acompanhe seu progresso e mantenha o foco no que realmente importa.
              </p>
              <div className='goal-grid' id='goalGrid'></div>
            </section>
            

            <section className={`page ${currentPage === 'reports' ? "active" : ""}`.trim()} id='page-reports'>
              <div className='eyebrow'>
                Análises
              </div>
              <h1 className='h1'>
                Relatórios
              </h1>
              <p className='lead'>
                Leitura clara do seu desempenho financeiro.
              </p>
              <div className='grid-main'>
                <div className='section-card liquid'>
                  <div className='section-head'>
                    <h2>
                      Evolução anual
                    </h2>
                    <button className='premium-btn btn-glass' style={{height: '38px', padding: '0 12px'} as React.CSSProperties}>
                      12 meses
                    </button>
                  </div>
                  <div className='chart' id='reportChart'></div>
                  <div className='months' id='reportMonths'></div>
                </div>
                <div className='section-card liquid'>
                  <div className='section-head'>
                    <h2>
                      Resumo
                    </h2>
                  </div>
                  <div className='list'>
                    <div className='row'>
                      <div className='row-main'>
                        <strong>
                          Receitas médias
                        </strong>
                        <small>
                          Últimos 12 meses
                        </small>
                      </div>
                      <div className='row-value pos' id='reportIncomeAvg'>
                        R$ 0,00
                      </div>
                    </div>
                    <div className='row'>
                      <div className='row-main'>
                        <strong>
                          Despesas médias
                        </strong>
                        <small>
                          Últimos 12 meses
                        </small>
                      </div>
                      <div className='row-value neg' id='reportExpenseAvg'>
                        R$ 0,00
                      </div>
                    </div>
                    <div className='row'>
                      <div className='row-main'>
                        <strong>
                          Taxa de economia
                        </strong>
                        <small>
                          Média mensal
                        </small>
                      </div>
                      <div className='row-value' id='reportSavingsRate' style={{color: 'var(--gold)'} as React.CSSProperties}>
                        0%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            

            <section className={`page ${currentPage === 'profile' ? "active" : ""}`.trim()} id='page-profile'>
              

              <div className='eyebrow'>
                Conta
              </div>
              <h1 className='h1'>
                Perfil
              </h1>
              <p className='lead'>
                Suas informações, preferências e segurança em um só lugar.
              </p>
              

              <div className='profile-reference-grid'>
                

                <div className='profile-card liquid'>
                  

                  <div className='profile-main'>
                    

                    <div className='profile-avatar' id='profileAvatar'>
                      R
                    </div>
                    

                    <div className='profile-data'>
                      <h2 id='profileName'>
                        Conta Ritmo
                      </h2>
                      <p id='profileUser'>
                        @usuario
                      </p>
                      <p id='profileStorage'>
                        Dados salvos neste aparelho
                      </p>
                    </div>
                    

                    <button className='premium-btn btn-glass profile-edit-btn' data-action='edit-profile'>
                      <i data-lucide='pencil'></i>
                      Editar perfil
                    </button>
                    

                  </div>
                  

                </div>
                

                <div className='profile-quote liquid-soft'>
                  

                  <span className='quote-mark'>
                    “
                  </span>
                  

                  <strong>
                    Grandes conquistas começam com boas escolhas.
                  </strong>
                  

                </div>
                

                <div className='section-card liquid profile-financial'>
                  

                  <div className='section-head'>
                    <div>
                      <h2>
                        Seu ritmo financeiro
                      </h2>
                      <small>
                        Visão consolidada
                      </small>
                    </div>
                    <button className='link' data-go='reports'>
                      Detalhes
                    </button>
                  </div>
                  

                  <div className='home-score-row'>
                    

                    <div className='reference-donut score-83' id='profileDonut' style={{'--score': '0'} as React.CSSProperties}>
                      <span>
                        <strong id='profileScore'>
                          —
                        </strong>
                        <small>
                          sem dados
                        </small>
                      </span>
                    </div>
                    

                    <div className='home-score-copy'>
                      <strong className='emerald-copy'>
                        Comece por uma movimentação
                      </strong>
                      <span>
                        Seu ritmo será calculado com dados reais.
                      </span>
                      <small>
                        Nada é preenchido automaticamente.
                      </small>
                    </div>
                    

                  </div>
                  

                </div>
                

                <div className='section-card liquid'>
                  

                  <div className='section-head'>
                    <div>
                      <h2>
                        Resumo financeiro
                      </h2>
                      <small>
                        Últimos 3 meses
                      </small>
                    </div>
                    <button className='link' data-go='transactions'>
                      Movimentações
                    </button>
                  </div>
                  

                  <div className='profile-summary-list'>
                    

                    <div>
                      <span>
                        <i data-lucide='arrow-down-left'></i>
                        Receitas
                      </span>
                      <strong className='pos' id='profileIncome'>
                        R$ 0,00
                      </strong>
                    </div>
                    

                    <div>
                      <span>
                        <i data-lucide='arrow-up-right'></i>
                        Despesas
                      </span>
                      <strong className='neg' id='profileExpense'>
                        R$ 0,00
                      </strong>
                    </div>
                    

                    <div>
                      <span>
                        <i data-lucide='wallet'></i>
                        Saldo
                      </span>
                      <strong id='profileBalance'>
                        R$ 0,00
                      </strong>
                    </div>
                    

                  </div>
                  

                </div>
                

                <div className='section-card liquid'>
                  

                  <div className='section-head'>
                    <div>
                      <h2>
                        Preferências
                      </h2>
                      <small>
                        Configuração rápida
                      </small>
                    </div>
                    <button className='link' data-go='settings'>
                      Editar
                    </button>
                  </div>
                  

                  <div className='profile-summary-list compact-summary'>
                    

                    <div>
                      <span>
                        Moeda
                      </span>
                      <strong>
                        Real (BRL)
                      </strong>
                    </div>
                    

                    <div>
                      <span>
                        Notificações
                      </span>
                      <strong id='profileNotifications'>
                        Configuráveis
                      </strong>
                    </div>
                    

                    <div>
                      <span>
                        Tema
                      </span>
                      <strong id='profileTheme'>
                        Sistema
                      </strong>
                    </div>
                    

                    <div>
                      <span>
                        Idioma
                      </span>
                      <strong>
                        Português (BR)
                      </strong>
                    </div>
                    

                  </div>
                  

                </div>
                

              </div>
              

              <div className='profile-actions profile-actions-clean liquid-soft'>
                

                <button className='home-quick export-only' data-action='export'>
                  <span className='home-quick-icon finaci-gold-soft'>
                    <i data-lucide='download'></i>
                  </span>
                  <span>
                    <strong>
                      Exportar dados
                    </strong>
                    <small>
                      Baixar resumo financeiro
                    </small>
                  </span>
                </button>
                

              </div>
              

            </section>
            

            <section className={`page ${currentPage === 'settings' ? "active" : ""}`.trim()} id='page-settings'>
              <div className='eyebrow'>
                Personalização
              </div>
              <h1 className='h1'>
                Ajustes
              </h1>
              <p className='lead'>
                Somente o essencial para adaptar o aplicativo ao seu jeito.
              </p>
              <div className='settings-grid'>
                <div className='setting-card liquid'>
                  <h3>
                    <i data-lucide='sun-moon'></i>
                    Aparência
                  </h3>
                  <p>
                    Escolha como o Ritmo deve aparecer.
                  </p>
                  <div className='theme-choices'>
                    <button className='theme-choice' data-theme-choice='light'>
                      <div className='theme-preview' style={{background: 'linear-gradient(145deg,#F7FAFD,#EAF1F6)'} as React.CSSProperties}></div>
                      Claro
                    </button>
                    <button className='theme-choice' data-theme-choice='dark'>
                      <div className='theme-preview' style={{background: 'linear-gradient(145deg,#0B1017,#172230)'} as React.CSSProperties}></div>
                      Black
                    </button>
                    <button className='theme-choice' data-theme-choice='system'>
                      <div className='theme-preview' style={{background: 'linear-gradient(90deg,#F4F6F8 0 50%,#0A1F44 50%)'} as React.CSSProperties}></div>
                      Sistema
                    </button>
                  </div>
                </div>
                <div className='setting-card liquid'>
                  <h3>
                    <i data-lucide='bell'></i>
                    Notificações
                  </h3>
                  <p>
                    Controle alertas realmente úteis.
                  </p>
                  <div className='setting-row'>
                    <div>
                      <strong>
                        Vencimentos
                      </strong>
                      <small>
                        Lembretes de contas
                      </small>
                    </div>
                    <button className='switch on' data-setting='due'></button>
                  </div>
                  <div className='setting-row'>
                    <div>
                      <strong>
                        Metas
                      </strong>
                      <small>
                        Progresso e conquistas
                      </small>
                    </div>
                    <button className='switch on' data-setting='goals'></button>
                  </div>
                </div>
                <div className='setting-card liquid'>
                  <h3>
                    <i data-lucide='shield-check'></i>
                    Segurança
                  </h3>
                  <p>
                    Proteja o acesso ao aplicativo.
                  </p>
                  <div className='setting-row'>
                    <div>
                      <strong>
                        Alterar senha
                      </strong>
                      <small>
                        Atualize suas credenciais
                      </small>
                    </div>
                    <button className='premium-btn btn-glass icon-btn' data-action='change-password' style={{width: '34px', height: '34px'} as React.CSSProperties}>
                      <i data-lucide='chevron-right'></i>
                    </button>
                  </div>
                  <div className='setting-row'>
                    <div>
                      <strong>
                        Código de recuperação
                      </strong>
                      <small>
                        Gerar uma nova chave de segurança
                      </small>
                    </div>
                    <button aria-label='Código de recuperação' className='premium-btn btn-glass icon-btn' data-action='recovery-code' style={{width: '34px', height: '34px'} as React.CSSProperties}>
                      <i data-lucide='key-round'></i>
                    </button>
                  </div>
                  <div className='setting-row'>
                    <div>
                      <strong>
                        Privacidade
                      </strong>
                      <small>
                        Controle seus dados
                      </small>
                    </div>
                    <button className='premium-btn btn-glass icon-btn' data-action='privacy' style={{width: '34px', height: '34px'} as React.CSSProperties}>
                      <i data-lucide='chevron-right'></i>
                    </button>
                  </div>
                  <div className='setting-row logout-row'>
                    <div>
                      <strong>
                        Encerrar sessão
                      </strong>
                      <small>
                        Sair com segurança
                      </small>
                    </div>
                    <button className='premium-btn btn-glass icon-btn logout-icon-btn' data-action='logout' style={{width: '34px', height: '34px'} as React.CSSProperties}>
                      <i data-lucide='log-out'></i>
                    </button>
                  </div>
                </div>
                <div className='setting-card liquid'>
                  <h3>
                    <i data-lucide='folders'></i>
                    Categorias
                  </h3>
                  <p>
                    Organize receitas e despesas.
                  </p>
                  <div className='setting-row'>
                    <div>
                      <strong>
                        Editar categorias
                      </strong>
                      <small>
                        Personalizar grupos
                      </small>
                    </div>
                    <button className='premium-btn btn-glass icon-btn' data-action='categories' style={{width: '34px', height: '34px'} as React.CSSProperties}>
                      <i data-lucide='chevron-right'></i>
                    </button>
                  </div>
                </div>
              </div>
            </section>
            

          </div>
          

          <nav className='bottom-nav' id='bottomNav'>
            <button className='active' data-go='home'>
              <i data-lucide='house'></i>
              <span>
                Início
              </span>
            </button>
            <button data-go='transactions'>
              <i data-lucide='arrow-left-right'></i>
              <span>
                Movimentos
              </span>
            </button>
            <button data-go='debts'>
              <i data-lucide='credit-card'></i>
              <span>
                Dívidas
              </span>
            </button>
            <button data-go='goals'>
              <i data-lucide='target'></i>
              <span>
                Metas
              </span>
            </button>
            <button data-go='settings'>
              <i data-lucide='ellipsis'></i>
              <span>
                Mais
              </span>
            </button>
          </nav>
          

        </main>
        

      </div>
      

    </div>
    <section aria-label='Acesso ao Ritmo' className='login-page reference-login' id='loginPage' onClick={handleClick} onInput={handleInput} onChange={handleInput} onKeyDown={handleAuthKeyDown}>
      

      <div className='login-blur-shape login-blur-a'></div>
      

      <div className='login-blur-shape login-blur-b'></div>
      

      <div className='login-blur-shape login-blur-c'></div>
      

      <div className='reference-login-shell'>
        

        <div className='reference-login-brand'>
          

          <div className='logo-surface reference-logo-hero'>
            <img alt='Ritmo' className='brand-logo' data-ritmo-logo='' src='/ritmo-logo.webp' />
          </div>
          

          <div className='reference-login-tag'>
            MAIS QUE FINANÇAS • UM FUTURO REAL
          </div>
          

        </div>
        

        <div className='login-card reference-login-card liquid' id='loginCard'>
          

          <div className='login-card-logo'>
            <img alt='Ritmo' className='brand-logo' data-ritmo-logo='' src='/ritmo-logo.webp' />
          </div>
          

          <div id='loginView' className={`auth-panel ${authView === 'login' ? "" : "hidden"}`.trim()}>
            

            <h2>
              Bem-vindo de volta
            </h2>
            

            <div className='caption'>
              Acesse sua conta para continuar.
            </div>
            

            <label className='reference-field-label'>
              Login
            </label>
            

            <div className='field liquid-soft reference-field'>
              <i data-lucide='user-round'></i>
              <input autoComplete='username' id='loginUser' placeholder='Seu usuário' />
            </div>
            

            <label className='reference-field-label'>
              Senha
            </label>
            

            <div className='field liquid-soft reference-field'>
              <i data-lucide='lock'></i>
              <input autoComplete='current-password' id='loginPass' placeholder='Sua senha' type='password' />
              <button aria-label='Mostrar senha' className='text-link' id='togglePassword' type='button'>
                <i data-lucide='eye'></i>
              </button>
            </div>
            

            <button className='premium-btn btn-emerald login-btn reference-login-button' id='loginBtn'>
              Entrar 
              <i data-lucide='arrow-right'></i>
            </button>
            {biometricAvailable && (
              <button className='premium-btn btn-glass biometric-login-btn' id='biometricLogin' type='button'>
                <i data-lucide='scan-face'></i>
                Entrar com biometria
              </button>
            )}
            

            <div className='reference-login-links'>
              

              <button className='text-link' id='firstAccessBtn'>
                Primeiro acesso
              </button>
              

              <span></span>
              

              <button className='text-link' id='forgotBtn'>
                Esqueceu a senha?
              </button>
              

            </div>
            

          </div>
          

          <div className={`auth-panel ${authView === 'register' ? "" : "hidden"}`.trim()} id='firstAccessView'>
            

            <h2>
              Primeiro acesso
            </h2>
            

            <div className='caption'>
              Informe seu nome e crie uma senha. O Ritmo gera um usuário único e um código de recuperação para você guardar.
            </div>
            

            <label className='reference-field-label' htmlFor='firstUser'>
              Nome completo
            </label>
            

            <div className='field liquid-soft reference-field'>
              <i data-lucide='user-plus'></i>
              <input autoComplete='name' id='firstUser' placeholder='Ex.: João Pedro da Silva' />
            </div>
            <div className='generated-login-hint'>
              <i data-lucide='at-sign'></i>
              <span>Seu usuário será gerado automaticamente, normalmente no formato <strong>nome.ultimosobrenome</strong>.</span>
            </div>
            

            <label className='reference-field-label'>
              Nova senha
            </label>
            

            <div className='field liquid-soft reference-field'>
              <i data-lucide='lock-keyhole'></i>
              <input id='firstPass' placeholder='Crie sua senha' type='password' />
            </div>
            <label className='reference-field-label'>
              Confirmar senha
            </label>
            <div className='field liquid-soft reference-field'>
              <i data-lucide='shield-check'></i>
              <input autoComplete='new-password' id='firstPassConfirm' placeholder='Repita sua senha' type='password' />
            </div>
            

            <button className='premium-btn btn-emerald login-btn reference-login-button' id='createAccessBtn'>
              Criar acesso e gerar código
            </button>
            

            <button className='text-link reference-back-login' id='backLoginBtn'>
              Voltar para o login
            </button>
            

          </div>
          <div className={`auth-panel ${authView === 'code' ? "" : "hidden"}`.trim()} id='recoveryCodeView'>
            <h2>
              Código de recuperação
            </h2>
            <div className='caption'>
              Guarde este código em um lugar seguro. Ele será necessário para redefinir sua senha e também para configurar o acesso em outro aparelho.
            </div>
            <div className='generated-user-box'>
              <span>Seu usuário</span>
              <strong>@{generatedUsername || 'usuario'}</strong>
              <small>Use este usuário para entrar no APK, PWA/TWA ou desktop. Ele é permanente e não pode ser alterado.</small>
            </div>
            <div className='recovery-code-box'>
              <span>
                Seu código
              </span>
              <code id='recoveryCodeText'>
                —
              </code>
            </div>
            <div className='recovery-note'>
              <i data-lucide='shield-check'></i>
              <span>
                Anote ou copie agora. Por segurança, o Ritmo não exibe o código novamente depois que você sair desta tela.
              </span>
            </div>
            <div className='recovery-actions'>
              <button className='premium-btn btn-glass' id='copyRecoveryBtn'>
                <i data-lucide='copy'></i>
                Copiar código
              </button>
              <button className='premium-btn btn-emerald' id='finishRecoveryBtn'>
                Já guardei, continuar
              </button>
            </div>
          </div>
          

          

          <div className={`auth-panel ${authView === 'recover' ? "" : "hidden"}`.trim()} id='recoverAccessView'>
            

            <h2>
              Recuperar acesso
            </h2>
            

            <div className='caption'>
              Use o código de recuperação criado no primeiro acesso para definir uma nova senha.
            </div>
            

            <div className='recovery-purpose'>
              <strong>
                Uma chave, duas funções
              </strong>
              <span>
                Este mesmo código recupera sua senha e autoriza o Ritmo quando você entra em um aparelho novo.
              </span>
            </div>
            

            <label className='reference-field-label' htmlFor='recoverUser'>
              Usuário
            </label>
            

            <div className='field liquid-soft reference-field'>
              <i data-lucide='user'></i>
              <input autoComplete='username' id='recoverUser' placeholder='Seu usuário' />
            </div>
            

            <label className='reference-field-label' htmlFor='recoverCode'>
              Código de recuperação
            </label>
            

            <div className='field liquid-soft reference-field'>
              <i data-lucide='key-round'></i>
              <input autoComplete='off' autoCapitalize='characters' id='recoverCode' placeholder='RITMO-XXXXXX-XXXX-XXXX-XXXX-XXXX-XXXX' />
            </div>
            

            <label className='reference-field-label' htmlFor='recoverPass'>
              Nova senha
            </label>
            

            <div className='field liquid-soft reference-field'>
              <i data-lucide='lock-keyhole'></i>
              <input autoComplete='new-password' id='recoverPass' placeholder='Mínimo de 8 caracteres' type='password' />
            </div>
            

            <label className='reference-field-label' htmlFor='recoverPass2'>
              Confirmar nova senha
            </label>
            

            <div className='field liquid-soft reference-field'>
              <i data-lucide='lock-keyhole'></i>
              <input autoComplete='new-password' id='recoverPass2' placeholder='Repita a nova senha' type='password' />
            </div>
            

            <button className='premium-btn btn-emerald login-btn reference-login-button' id='recoverAccessBtn'>
              Redefinir senha
            </button>
            

            <button className='text-link reference-back-login' id='backRecoveryBtn'>
              Voltar para o login
            </button>
            

          </div>
          

          <div className={`auth-panel ${authView === 'device' ? "" : "hidden"}`.trim()} id='newDeviceView'>
            

            <div className='device-verify-badge'>
              <i data-lucide='smartphone'></i>
              Novo aparelho detectado
            </div>
            

            <h2>
              Autorizar este aparelho
            </h2>
            

            <div className='caption'>
              Sua senha foi validada. Agora confirme o código de recuperação salvo no primeiro acesso.
            </div>
            

            <div className='recovery-purpose'>
              <strong>
                Proteção contra acesso em aparelho desconhecido
              </strong>
              <span>
                Depois da confirmação, este aparelho será reconhecido nas próximas entradas.
              </span>
            </div>
            

            <label className='reference-field-label' htmlFor='newDeviceCode'>
              Código de recuperação
            </label>
            

            <div className='field liquid-soft reference-field'>
              <i data-lucide='key-round'></i>
              <input autoComplete='off' autoCapitalize='characters' id='newDeviceCode' placeholder='RITMO-XXXXXX-XXXX-XXXX-XXXX-XXXX-XXXX' />
            </div>
            

            <button className='premium-btn btn-emerald login-btn reference-login-button' id='authorizeDeviceBtn'>
              Autorizar aparelho
            </button>
            

            <button className='text-link reference-back-login' id='cancelDeviceBtn'>
              Cancelar
            </button>
            

          </div>
          

        </div>
        

      </div>
      

    </section>
    <div id='modalBackdrop' className={`modal-backdrop ${modal ? "show" : ""}`.trim()} onClick={handleClick} onInput={handleInput} onChange={handleInput}>
      <div className='modal liquid' id='modalBox' role='dialog' aria-modal='true'>
        {renderModal()}
      </div>
    </div>
    <div id='sheetBackdrop' className={`sheet-backdrop ${sheetOpen ? "show" : ""}`.trim()} onClick={handleClick} onInput={handleInput} onChange={handleInput}>
      <div className='modal liquid' id='sheetBox' role='dialog' aria-modal='true' style={{width: 'min(520px,100%)'} as React.CSSProperties}>
        <div className='modal-top'>
          <h3>
            Menu
          </h3>
          <button className='premium-btn btn-glass icon-btn' data-action='close-sheet' style={{width: '36px', height: '36px'} as React.CSSProperties}>
            <i data-lucide='x'></i>
          </button>
        </div>
        <div className='list'>
          <button className='row' data-go='calendar'>
            <div className='row-icon' style={{background: 'rgba(24,183,163,.12)', color: 'var(--emerald)'} as React.CSSProperties}>
              <i data-lucide='calendar-days'></i>
            </div>
            <div className='row-main'>
              <strong>
                Planejamento
              </strong>
              <small>
                Calendário financeiro
              </small>
            </div>
          </button>
          <button className='row' data-go='reports'>
            <div className='row-icon' style={{background: 'rgba(16,42,92,.10)', color: 'var(--night)'} as React.CSSProperties}>
              <i data-lucide='chart-no-axes-combined'></i>
            </div>
            <div className='row-main'>
              <strong>
                Relatórios
              </strong>
              <small>
                Análises financeiras
              </small>
            </div>
          </button>
          <button className='row' data-go='profile'>
            <div className='row-icon' style={{background: 'rgba(217,179,91,.14)', color: '#B57C25'} as React.CSSProperties}>
              <i data-lucide='user-round'></i>
            </div>
            <div className='row-main'>
              <strong>
                Perfil
              </strong>
              <small>
                Conta e preferências
              </small>
            </div>
          </button>
        </div>
      </div>
    </div>
    <div id='toast' className={`toast ${toastState.open ? "show" : ""}`.trim()}>
      {toastState.message}
    </div>
    <button aria-expanded='false' aria-label='Ações rápidas' id='globalFab' title='Arraste para mover'>
      

      <i data-lucide='plus'></i>
      

    </button>
    <div aria-hidden='true' id='fabMenu' onClick={handleClick}>
      

      <button className='fab-action' data-action='new-transaction'>
        <span className='fab-action-icon'>
          <i data-lucide='arrow-left-right'></i>
        </span>
        <span>
          <strong>
            Nova transação
          </strong>
          <small>
            Registrar entrada ou saída
          </small>
        </span>
      </button>
      

      <button className='fab-action' data-action='new-goal'>
        <span className='fab-action-icon'>
          <i data-lucide='target'></i>
        </span>
        <span>
          <strong>
            Nova meta
          </strong>
          <small>
            Criar um objetivo financeiro
          </small>
        </span>
      </button>
      

      <button className='fab-action' data-action='new-event'>
        <span className='fab-action-icon'>
          <i data-lucide='calendar-plus'></i>
        </span>
        <span>
          <strong>
            Novo evento
          </strong>
          <small>
            Agendar compromisso financeiro
          </small>
        </span>
      </button>
      

      <button className='fab-action' data-action='new-debt'>
        <span className='fab-action-icon'>
          <i data-lucide='landmark'></i>
        </span>
        <span>
          <strong>
            Nova dívida
          </strong>
          <small>
            Cadastrar compromisso
          </small>
        </span>
      </button>
      

    </div>
    <script id="fab-drag-and-mobile-fix-v2" type="application/json"></script>
    </>
  );
}
