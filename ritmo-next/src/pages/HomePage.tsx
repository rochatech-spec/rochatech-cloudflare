import { useMemo } from 'react'
import type { BootstrapData, FinancialScope } from '../domain/types'
import { firstName, initials, money, shortDate } from '../lib/format'
import { Icon } from '../ui/Icon'

function Metric({ label, value, kind }: { label: string; value: number; kind: 'income' | 'expense' | 'pending' | 'debt' }) {
  const icon = kind === 'income' ? 'arrowUp' : kind === 'expense' ? 'arrowDown' : kind === 'debt' ? 'debt' : 'calendar'
  return <article className={`metric-card ${kind}`}><span className="metric-icon"><Icon name={icon} /></span><div><small>{label}</small><strong>{money(value)}</strong></div></article>
}

export function HomePage({ data, scope, onQuick, onReport, onSharing }: { data: BootstrapData; scope: FinancialScope; onQuick: (kind: 'income' | 'expense' | 'transfer') => void; onReport: () => void; onSharing: () => void }) {
  const shared = scope === 'shared'
  const partner = data.sharing?.partner
  const balance = shared ? data.wallet.shared_balance : data.wallet.personal_balance
  const stats = useMemo(() => {
    const income = data.incomes.filter((item) => item.date <= (data.server_time || '').slice(0, 10) || true).reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const paid = data.expenses.filter((item) => item.status === 'pago').reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const pending = data.expenses.filter((item) => item.status !== 'pago').reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const debt = data.debts.reduce((sum, item) => sum + Number(item.balance ?? item.total_amount ?? 0), 0)
    return { income, paid, pending, debt }
  }, [data])
  const recent = useMemo(() => [...data.incomes.map((x) => ({ ...x, type: 'income' as const })), ...data.expenses.map((x) => ({ ...x, type: 'expense' as const }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [data])

  return <div className="page-stack">
    <section className={`finance-hero ${shared ? 'shared' : 'personal'}`}>
      <div className="hero-profile-line">
        <div className="hero-identity">
          {shared ? <span className="hero-avatar-pair"><i>{initials(data.profile.name).slice(0, 1)}</i><i>{initials(partner?.name).slice(0, 1)}</i></span> : <span className="hero-avatar">{initials(data.profile.name)}</span>}
          <div><small>{shared ? 'PERFIL DO CASAL' : 'PERFIL PESSOAL'}</small><h1>{shared ? `${firstName(data.profile.name)} & ${firstName(partner?.name)}` : firstName(data.profile.name)}</h1><p>{shared ? 'Tudo que vocês decidiram administrar juntos.' : 'Seu dinheiro continua só seu.'}</p></div>
        </div>
        <span className="profile-type-pill"><Icon name={shared ? 'users' : 'user'} />{shared ? 'Casal' : 'Pessoal'}</span>
      </div>
      <div className="hero-balance"><span>{shared ? 'Saldo do casal' : 'Saldo pessoal'}</span><strong>{money(balance)}</strong><small>{shared ? `${money(data.wallet.shared_transfers)} em contribuições` : data.sharing?.active ? `${money(data.wallet.sent_to_shared)} transferidos ao casal` : 'Disponível agora'}</small></div>
      <div className="hero-actions">
        <button type="button" className="hero-action primary" onClick={() => onQuick('income')}><Icon name="plus" /><span>Entrada</span></button>
        <button type="button" className="hero-action" onClick={() => onQuick('expense')}><Icon name="arrowDown" /><span>Saída</span></button>
        {data.sharing?.active && !shared && <button type="button" className="hero-action" onClick={() => onQuick('transfer')}><Icon name="transfer" /><span>Ao casal</span></button>}
        <button type="button" className="hero-action" onClick={onReport}><Icon name="report" /><span>Relatório</span></button>
      </div>
    </section>

    <section className="content-section">
      <div className="section-title"><div><small>VISÃO GERAL</small><h2>Este perfil</h2></div></div>
      <div className="metrics-grid"><Metric label="Entradas" value={stats.income} kind="income"/><Metric label="Saídas" value={stats.paid} kind="expense"/><Metric label="A pagar" value={stats.pending} kind="pending"/><Metric label="Dívidas" value={stats.debt} kind="debt"/></div>
    </section>

    {shared && <section className="premium-card content-section">
      <div className="section-title"><div><small>CONTRIBUIÇÕES</small><h2>Construído pelos dois</h2></div><button className="text-button" type="button" onClick={onSharing}>Detalhes</button></div>
      <div className="premium-list">{data.wallet.contributions.length ? data.wallet.contributions.map((item) => <div className="list-row" key={item.owner_user_id}><span className="row-avatar">{initials(item.name)}</span><div className="row-main"><strong>{item.name}</strong><small>Contribuiu para o saldo do casal</small></div><b>{money(item.amount)}</b></div>) : <div className="empty-card">As contribuições aparecerão aqui.</div>}</div>
    </section>}

    <section className="premium-card content-section">
      <div className="section-title"><div><small>MOVIMENTAÇÕES</small><h2>Recentes</h2></div></div>
      <div className="premium-list">{recent.length ? recent.map((item) => <div className="list-row" key={`${item.type}-${item.id}`}><span className={`movement-badge ${item.type}`}><Icon name={item.type === 'income' ? 'arrowUp' : 'arrowDown'} /></span><div className="row-main"><strong>{item.description}</strong><small>{item.category} · {shortDate(item.date)}{item.created_by_name ? ` · ${firstName(item.created_by_name)}` : ''}</small></div><b className={item.type === 'income' ? 'positive' : 'negative'}>{item.type === 'income' ? '+' : '-'}{money(item.amount)}</b></div>) : <div className="empty-card">Nenhuma movimentação neste perfil ainda.</div>}</div>
    </section>
  </div>
}
