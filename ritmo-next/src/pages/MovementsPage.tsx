import { useMemo, useState } from 'react'
import type { BootstrapData, Expense, Income } from '../domain/types'
import { money, shortDate } from '../lib/format'
import { Icon } from '../ui/Icon'

type Movement = (Income & { kind: 'income' }) | (Expense & { kind: 'expense' })

export function MovementsPage({ data, onNew, onEdit, onDelete }: { data: BootstrapData; onNew: (kind: 'income' | 'expense') => void; onEdit: (item: Movement) => void; onDelete: (item: Movement) => void }) {
  const [tab, setTab] = useState<'all' | 'income' | 'expense'>('all')
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const all: Movement[] = [...data.incomes.map((item) => ({ ...item, kind: 'income' as const })), ...data.expenses.map((item) => ({ ...item, kind: 'expense' as const }))]
    return all.filter((item) => tab === 'all' || item.kind === tab).filter((item) => !query.trim() || `${item.description} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b.date.localeCompare(a.date))
  }, [data, tab, query])
  const totalIn = data.incomes.reduce((sum, item) => sum + item.amount, 0)
  const totalOut = data.expenses.filter((item) => item.status === 'pago').reduce((sum, item) => sum + item.amount, 0)

  return <div className="page-stack">
    <header className="page-header"><div><small>MOVIMENTAÇÕES</small><h1>Entradas e saídas</h1><p>Organizadas no perfil que está aberto.</p></div><div className="header-actions"><button className="secondary-button" type="button" onClick={() => onNew('income')}><Icon name="arrowUp"/> Entrada</button><button className="primary-button" type="button" onClick={() => onNew('expense')}><Icon name="plus"/> Saída</button></div></header>
    <div className="summary-strip"><span><small>Entradas</small><strong className="positive">{money(totalIn)}</strong></span><span><small>Saídas pagas</small><strong className="negative">{money(totalOut)}</strong></span><span><small>Resultado</small><strong>{money(totalIn-totalOut)}</strong></span></div>
    <section className="premium-card content-section">
      <div className="list-toolbar"><div className="segmented"><button className={tab==='all'?'active':''} onClick={() => setTab('all')} type="button">Tudo</button><button className={tab==='income'?'active':''} onClick={() => setTab('income')} type="button">Entradas</button><button className={tab==='expense'?'active':''} onClick={() => setTab('expense')} type="button">Saídas</button></div><label className="search-box"><span>Buscar</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Descrição ou categoria"/></label></div>
      <div className="premium-list">{rows.length ? rows.map((item) => <article className="list-row movement-row" key={`${item.kind}-${item.id}`}><span className={`movement-badge ${item.kind}`}><Icon name={item.kind==='income'?'arrowUp':'arrowDown'}/></span><div className="row-main"><strong>{item.description}</strong><small>{item.category} · {shortDate(item.date)}{item.kind==='expense' ? ` · ${item.status==='pago'?'Pago':'Pendente'}` : ''}{item.created_by_name?` · ${item.created_by_name.split(' ')[0]}`:''}</small></div><b className={item.kind==='income'?'positive':'negative'}>{item.kind==='income'?'+':'-'}{money(item.amount)}</b><div className="row-actions"><button type="button" onClick={()=>onEdit(item)} aria-label="Editar"><Icon name="edit"/></button><button type="button" onClick={()=>onDelete(item)} aria-label="Excluir"><Icon name="trash"/></button></div></article>) : <div className="empty-card">Nenhuma movimentação encontrada.</div>}</div>
    </section>
  </div>
}
