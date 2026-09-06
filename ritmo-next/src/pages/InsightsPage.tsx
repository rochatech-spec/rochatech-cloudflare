import { useMemo } from 'react'
import type { BootstrapData } from '../domain/types'
import { money } from '../lib/format'
import { Icon } from '../ui/Icon'

export function InsightsPage({ data }: { data: BootstrapData }) {
  const insights = useMemo(()=>{
    const paid = data.expenses.filter((x)=>x.status==='pago')
    const totalOut = paid.reduce((s,x)=>s+x.amount,0)
    const totalIn = data.incomes.reduce((s,x)=>s+x.amount,0)
    const categories = paid.reduce<Record<string,number>>((acc,x)=>{acc[x.category]=(acc[x.category]||0)+x.amount;return acc},{})
    const top = Object.entries(categories).sort((a,b)=>b[1]-a[1])[0]
    const pending = data.expenses.filter((x)=>x.status!=='pago').reduce((s,x)=>s+x.amount,0)
    const debt = data.debts.reduce((s,x)=>s+Number(x.balance??x.total_amount),0)
    const goals = data.goals.reduce((s,x)=>s+Math.max(0,x.target_amount-Number(x.current_amount||0)),0)
    const saving = totalIn-totalOut
    return {totalOut,totalIn,top,pending,debt,goals,saving}
  },[data])

  return <div className="page-stack">
    <header className="page-header"><div><small>INSIGHTS</small><h1>O que seus números estão dizendo</h1><p>Análise feita no aparelho com os dados já sincronizados.</p></div></header>
    <section className="insight-hero"><span><Icon name="spark"/></span><div><small>RESULTADO REALIZADO</small><strong>{money(insights.saving)}</strong><p>{insights.saving>=0?'Entrou mais dinheiro do que saiu no período carregado.':'As saídas realizadas estão acima das entradas carregadas.'}</p></div></section>
    <div className="insight-grid">
      <article className="premium-card insight-card"><span className="insight-icon"><Icon name="arrowDown"/></span><small>Maior categoria de saída</small><strong>{insights.top?.[0]||'Sem dados'}</strong><p>{insights.top?money(insights.top[1]):'Nenhuma saída paga ainda.'}</p></article>
      <article className="premium-card insight-card"><span className="insight-icon"><Icon name="calendar"/></span><small>Compromissos pendentes</small><strong>{money(insights.pending)}</strong><p>Valor que ainda pode sair do saldo.</p></article>
      <article className="premium-card insight-card"><span className="insight-icon"><Icon name="debt"/></span><small>Dívidas em aberto</small><strong>{money(insights.debt)}</strong><p>Saldo devedor atual.</p></article>
      <article className="premium-card insight-card"><span className="insight-icon"><Icon name="goal"/></span><small>Falta para as metas</small><strong>{money(insights.goals)}</strong><p>Soma do que ainda falta alcançar.</p></article>
    </div>
  </div>
}
