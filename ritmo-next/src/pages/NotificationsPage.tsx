import { useMemo } from 'react'
import type { BootstrapData } from '../domain/types'
import { money, shortDate, todayIso } from '../lib/format'
import { Icon } from '../ui/Icon'

type Notice={id:string;title:string;copy:string;kind:'due'|'overdue'|'goal'}
export function buildNotices(data:BootstrapData):Notice[]{
  const today=todayIso(),list:Notice[]=[]
  data.expenses.filter(x=>x.status!=='pago'&&x.due_date).forEach(x=>{const overdue=String(x.due_date)<today;list.push({id:`expense-${x.id}`,title:overdue?'Conta vencida':'Vencimento próximo',copy:`${x.description} · ${money(x.amount)} · ${shortDate(x.due_date)}`,kind:overdue?'overdue':'due'})})
  data.debts.filter(x=>Number(x.balance??x.total_amount)>0&&x.due_date).forEach(x=>{if(String(x.due_date)<=today)list.push({id:`debt-${x.id}`,title:'Dívida para acompanhar',copy:`${x.creditor} · ${money(Number(x.balance??x.total_amount))}`,kind:'due'})})
  data.goals.forEach(x=>{const current=Number(x.current_amount||0),pct=x.target_amount?current/x.target_amount:0;if(pct>=.75&&pct<1)list.push({id:`goal-${x.id}`,title:'Meta perto de chegar',copy:`${x.name} já está em ${Math.round(pct*100)}%.`,kind:'goal'})})
  return list.slice(0,30)
}
export function NotificationsPage({data}:{data:BootstrapData}){const notices=useMemo(()=>buildNotices(data),[data]);return <div className="page-stack"><header className="page-header"><div><small>AVISOS</small><h1>O que merece atenção</h1><p>Calculado com os dados já disponíveis no aparelho.</p></div></header><section className="premium-card content-section"><div className="premium-list">{notices.length?notices.map(n=><div className="list-row" key={n.id}><span className={`notice-badge ${n.kind}`}><Icon name={n.kind==='goal'?'goal':'bell'}/></span><div className="row-main"><strong>{n.title}</strong><small>{n.copy}</small></div></div>):<div className="empty-card">Tudo tranquilo por aqui.</div>}</div></section></div>}
