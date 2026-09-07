import { useEffect, useState } from 'react'
import { fetchReport } from '../api/client'
import type { FinancialScope, WalletReport } from '../domain/types'
import { buildReportPdf, deliverPdf } from '../lib/pdf'
import { money, monthStartIso, shortDate, todayIso } from '../lib/format'
import { Icon } from '../ui/Icon'

export function ReportPage({ initialScope, sharedAvailable, profileName }: { initialScope: FinancialScope; sharedAvailable: boolean; profileName: string }) {
  const [scope, setScope] = useState<FinancialScope>(initialScope)
  const [from, setFrom] = useState(monthStartIso())
  const [to, setTo] = useState(todayIso())
  const [report, setReport] = useState<WalletReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setBusy(true); setError(null)
    try { setReport(await fetchReport(scope, from, to)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar o relatório.') }
    finally { setBusy(false) }
  }

  useEffect(() => { void load() }, [scope])

  async function pdf() {
    if (!report) return
    const blob = buildReportPdf(report, profileName)
    await deliverPdf(blob, `Ritmo-Relatorio-${report.scope}-${report.from}-${report.to}.pdf`)
  }

  return <div className="page-stack">
    <header className="page-header"><div><small>FINANCEIRO</small><h1>Relatório</h1><p>Consulte Pessoal ou Casal sem mudar o perfil ativo do Ritmo. Transferências entre carteiras não viram receita nova.</p></div><button className="primary-button" type="button" onClick={pdf} disabled={!report || busy}><Icon name="report"/> Gerar PDF</button></header>
    <section className="premium-card report-filter"><div className="report-scope-field"><span>Relatório de</span><div className="segmented report-scope"><button className={scope==='personal'?'active':''} onClick={()=>setScope('personal')} type="button">Pessoal</button>{sharedAvailable&&<button className={scope==='shared'?'active':''} onClick={()=>setScope('shared')} type="button">Casal</button>}</div></div><label><span>Data inicial</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label><label><span>Data final</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label><button className="secondary-button" type="button" onClick={load} disabled={busy}>{busy?'Aplicando…':'Aplicar'}</button></section>
    {error&&<div className="inline-alert">{error}</div>}
    {report&&<>
      <section className="report-summary-grid"><article><small>Saldo atual</small><strong>{money(report.summary.current_balance)}</strong></article><article><small>Entradas</small><strong className="positive">{money(report.summary.income)}</strong></article><article><small>Saídas</small><strong className="negative">{money(report.summary.expenses)}</strong></article><article><small>Resultado do período</small><strong>{money(report.summary.period_result)}</strong></article></section>
      <section className="premium-card content-section"><div className="section-title"><div><small>{shortDate(report.from)} — {shortDate(report.to)}</small><h2>Entradas</h2></div></div><div className="premium-list">{(scope==='shared'?report.shared?.incomes:report.personal?.incomes)?.map((item)=><div className="list-row" key={item.id}><span className="movement-badge income"><Icon name="arrowUp"/></span><div className="row-main"><strong>{item.description}</strong><small>{item.category} · {shortDate(item.date)}{item.created_by_name?` · ${item.created_by_name.split(' ')[0]}`:''}</small></div><b className="positive">+{money(item.amount)}</b></div>)||<div className="empty-card">Nenhuma entrada.</div>}</div></section>
      <section className="premium-card content-section"><div className="section-title"><div><small>{shortDate(report.from)} — {shortDate(report.to)}</small><h2>Saídas</h2></div></div><div className="premium-list">{(scope==='shared'?report.shared?.expenses:report.personal?.expenses)?.map((item)=><div className="list-row" key={item.id}><span className="movement-badge expense"><Icon name="arrowDown"/></span><div className="row-main"><strong>{item.description}</strong><small>{item.category} · {shortDate(item.date)} · {item.status}</small></div><b className="negative">-{money(item.amount)}</b></div>)||<div className="empty-card">Nenhuma saída.</div>}</div></section>
      {report.transfers.length>0&&<section className="premium-card content-section"><div className="section-title"><div><small>NÃO CONTA COMO RECEITA</small><h2>{scope==='shared'?'Contribuições ao casal':'Transferências ao casal'}</h2></div></div><div className="premium-list">{report.transfers.map((item)=><div className="list-row" key={item.id}><span className="movement-badge transfer"><Icon name="transfer"/></span><div className="row-main"><strong>{item.created_by_name||profileName}</strong><small>{shortDate(item.date)}{item.description?` · ${item.description}`:''}</small></div><b>{money(item.amount)}</b></div>)}</div></section>}
    </>}
  </div>
}
