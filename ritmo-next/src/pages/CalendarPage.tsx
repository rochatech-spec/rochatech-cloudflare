import { useMemo, useState } from 'react'
import type { BootstrapData } from '../domain/types'
import { money, shortDate, todayIso } from '../lib/format'
import { Icon } from '../ui/Icon'

type CalendarItem = { id: string; date: string; label: string; amount: number; kind: 'income'|'expense'|'debt'|'goal'; meta: string }

export function CalendarPage({ data }: { data: BootstrapData }) {
  const [month, setMonth] = useState(todayIso().slice(0,7))
  const rows = useMemo(() => {
    const items: CalendarItem[] = []
    data.incomes.forEach((x)=>items.push({id:`i-${x.id}`,date:x.date,label:x.description,amount:x.amount,kind:'income',meta:x.category}))
    data.expenses.forEach((x)=>items.push({id:`e-${x.id}`,date:x.due_date||x.date,label:x.description,amount:x.amount,kind:'expense',meta:x.status==='pago'?'Pago':'A pagar'}))
    data.debts.forEach((x)=>{if(x.due_date)items.push({id:`d-${x.id}`,date:x.due_date,label:x.creditor,amount:Number(x.balance??x.total_amount),kind:'debt',meta:'Dívida'})})
    data.goals.forEach((x)=>{if(x.deadline)items.push({id:`g-${x.id}`,date:x.deadline,label:x.name,amount:Math.max(0,x.target_amount-Number(x.current_amount||0)),kind:'goal',meta:'Prazo da meta'})})
    return items.filter((item)=>item.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date))
  },[data,month])
  const groups = useMemo(()=>Object.entries(rows.reduce<Record<string,CalendarItem[]>>((acc,row)=>{(acc[row.date]??=[]).push(row);return acc},{})),[rows])

  return <div className="page-stack">
    <header className="page-header"><div><small>CALENDÁRIO</small><h1>O mês em uma linha do tempo</h1><p>Feito com os dados já carregados no aparelho, sem consultas extras.</p></div><label className="month-picker"><span>Mês</span><input type="month" value={month} onChange={(e)=>setMonth(e.target.value)}/></label></header>
    <section className="premium-card calendar-panel">{groups.length?groups.map(([date,items])=><div className="calendar-day" key={date}><div className="calendar-date"><strong>{date.slice(8,10)}</strong><small>{shortDate(date).replace(/^\d{2}\sde\s/i,'')}</small></div><div className="calendar-items">{items.map((item)=><div className="list-row" key={item.id}><span className={`movement-badge ${item.kind}`}><Icon name={item.kind==='income'?'arrowUp':item.kind==='expense'?'arrowDown':item.kind==='debt'?'debt':'goal'}/></span><div className="row-main"><strong>{item.label}</strong><small>{item.meta}</small></div><b>{money(item.amount)}</b></div>)}</div></div>):<div className="empty-card">Nada programado para este mês.</div>}</section>
  </div>
}
