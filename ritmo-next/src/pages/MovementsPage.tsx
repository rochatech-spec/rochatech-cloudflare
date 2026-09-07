import { useMemo, useState } from 'react'
import type { BootstrapData, Expense, Income } from '../domain/types'
import { money, shortDate } from '../lib/format'
import { Icon } from '../ui/Icon'

type Movement=(Income&{kind:'income'})|(Expense&{kind:'expense'})
type MovementState={label:string;tone:'success'|'warning'|'danger'|'muted'}
function incomeState(item:Income,cutoff:string):MovementState{return item.date<=cutoff?{label:'Recebido',tone:'success'}:{label:'A receber',tone:'warning'}}
function expenseState(item:Expense,cutoff:string):MovementState{
  if(item.status==='pago'&&item.date<=cutoff)return {label:'Pago',tone:'success'}
  if(item.status==='pago'&&item.date>cutoff)return {label:'Agendado',tone:'warning'}
  const due=item.due_date||item.date
  if(due<cutoff)return {label:'Vencido',tone:'danger'}
  if(due===cutoff)return {label:'Vence hoje',tone:'warning'}
  return {label:'Pendente',tone:'muted'}
}

export function MovementsPage({data,onNew,onEdit,onDelete,onReceive,onPay}:{data:BootstrapData;onNew:(kind:'income'|'expense')=>void;onEdit:(item:Movement)=>void;onDelete:(item:Movement)=>void;onReceive:(item:Income)=>void;onPay:(item:Expense)=>void}){
  const [tab,setTab]=useState<'all'|'income'|'expense'>('all'),[query,setQuery]=useState('')
  const cutoff=(data.server_time||new Date().toISOString()).slice(0,10)
  const rows=useMemo(()=>{const all:Movement[]=[...data.incomes.map(item=>({...item,kind:'income' as const})),...data.expenses.map(item=>({...item,kind:'expense' as const}))];return all.filter(item=>tab==='all'||item.kind===tab).filter(item=>!query.trim()||`${item.description} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date))},[data,tab,query])
  const totalIn=data.incomes.filter(item=>item.date<=cutoff).reduce((s,x)=>s+x.amount,0),totalOut=data.expenses.filter(item=>item.status==='pago'&&item.date<=cutoff).reduce((s,x)=>s+x.amount,0)
  const receivable=data.incomes.filter(item=>item.date>cutoff).reduce((s,x)=>s+x.amount,0),payable=data.expenses.filter(item=>!(item.status==='pago'&&item.date<=cutoff)).reduce((s,x)=>s+x.amount,0)

  return <div className="page-stack">
    <header className="page-header ios-page-header"><div><small>MOVIMENTAÇÕES</small><h1>Entradas e saídas</h1><p>Realizado e futuro aparecem separados para o saldo não se misturar com previsão.</p></div><div className="header-actions"><button className="secondary-button" type="button" onClick={()=>onNew('income')}><Icon name="arrowUp"/> Entrada</button><button className="primary-button" type="button" onClick={()=>onNew('expense')}><Icon name="plus"/> Saída</button></div></header>
    <div className="movement-summary-grid"><span><small>Recebido</small><strong className="positive">{money(totalIn)}</strong></span><span><small>Pago</small><strong className="negative">{money(totalOut)}</strong></span><span><small>A receber</small><strong>{money(receivable)}</strong></span><span><small>A pagar</small><strong>{money(payable)}</strong></span></div>
    <section className="premium-card content-section movement-list-card"><div className="list-toolbar"><div className="segmented"><button className={tab==='all'?'active':''} onClick={()=>setTab('all')} type="button">Tudo</button><button className={tab==='income'?'active':''} onClick={()=>setTab('income')} type="button">Entradas</button><button className={tab==='expense'?'active':''} onClick={()=>setTab('expense')} type="button">Saídas</button></div><label className="search-box"><span>Buscar</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Descrição ou categoria"/></label></div>
      <div className="premium-list">{rows.length?rows.map(item=>{const state=item.kind==='income'?incomeState(item,cutoff):expenseState(item,cutoff);const futureIncome=item.kind==='income'&&item.date>cutoff,unpaid=item.kind==='expense'&&!(item.status==='pago'&&item.date<=cutoff);return <article className="list-row movement-row rich" key={`${item.kind}-${item.id}`}><span className={`movement-badge ${item.kind}`}><Icon name={item.kind==='income'?'arrowUp':'arrowDown'}/></span><div className="row-main"><strong>{item.description}</strong><small>{item.category} · {shortDate(item.kind==='expense'?(item.due_date||item.date):item.date)}{item.created_by_name?` · ${item.created_by_name.split(' ')[0]}`:''}</small><em className={`movement-state ${state.tone}`}>{state.label}</em></div><b className={item.kind==='income'?'positive':'negative'}>{item.kind==='income'?'+':'-'}{money(item.amount)}</b><div className="row-actions"><button type="button" onClick={()=>onEdit(item)} aria-label="Editar"><Icon name="edit"/></button><button type="button" onClick={()=>onDelete(item)} aria-label="Excluir"><Icon name="trash"/></button></div>{(futureIncome||unpaid)&&<div className="movement-quick-action">{futureIncome?<button type="button" onClick={()=>onReceive(item as Income)}><Icon name="check"/> Marcar recebido</button>:<button type="button" onClick={()=>onPay(item as Expense)}><Icon name="check"/> Marcar pago</button>}</div>}</article>}) : <div className="empty-card">Nenhuma movimentação encontrada.</div>}</div>
    </section>
  </div>
}
