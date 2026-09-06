import { useEffect, useMemo, useState } from 'react'
import type { BootstrapData, FinancialScope } from './domain/types'
import { changeScope, installLowConsumptionSync, loadScope, prefetchOtherScope } from './sync/engine'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function initials(name?: string) {
  return (name || 'Ritmo')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function formatMoney(value: number | undefined) {
  return money.format(Number(value || 0))
}

function ProfileSwitcher({
  scope,
  data,
  onChange,
  busy,
}: {
  scope: FinancialScope
  data: BootstrapData
  onChange: (scope: FinancialScope) => void
  busy: boolean
}) {
  const partner = data.sharing?.partner
  const sharedAvailable = Boolean(data.sharing?.active)

  return (
    <div className="profile-switcher" role="tablist" aria-label="Perfil financeiro">
      <button
        type="button"
        role="tab"
        aria-selected={scope === 'personal'}
        className={scope === 'personal' ? 'active' : ''}
        onClick={() => onChange('personal')}
        disabled={busy}
      >
        <span className="avatar personal-avatar">{initials(data.profile.name)}</span>
        <span className="profile-switch-copy">
          <small>Perfil</small>
          <strong>Pessoal</strong>
        </span>
      </button>

      {sharedAvailable && (
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'shared'}
          className={scope === 'shared' ? 'active' : ''}
          onClick={() => onChange('shared')}
          disabled={busy}
        >
          <span className="avatar couple-avatar">
            {initials(data.profile.name).slice(0, 1)}{initials(partner?.name).slice(0, 1)}
          </span>
          <span className="profile-switch-copy">
            <small>Perfil</small>
            <strong>Casal</strong>
          </span>
        </button>
      )}
    </div>
  )
}

function ProfileHero({ data, scope }: { data: BootstrapData; scope: FinancialScope }) {
  const shared = scope === 'shared'
  const partner = data.sharing?.partner
  const firstName = data.profile.name.split(' ')[0]
  const partnerName = partner?.name?.split(' ')[0] || 'Parceiro'
  const balance = shared ? data.wallet.shared_balance : data.wallet.personal_balance
  const movement = shared ? data.wallet.shared_transfers : data.wallet.sent_to_shared

  return (
    <section className={`profile-hero ${shared ? 'shared' : 'personal'}`}>
      <div className="profile-hero-top">
        <div className="profile-identity">
          {shared ? (
            <div className="stacked-avatars" aria-hidden="true">
              <span>{initials(data.profile.name)}</span>
              <span>{initials(partner?.name)}</span>
            </div>
          ) : (
            <span className="hero-avatar">{initials(data.profile.name)}</span>
          )}

          <div>
            <small>{shared ? 'PERFIL DO CASAL' : 'SEU PERFIL'}</small>
            <h1>{shared ? `${firstName} & ${partnerName}` : firstName}</h1>
            <p>{shared ? 'O dinheiro em comum, sem misturar o que é pessoal.' : 'Seu dinheiro pessoal, organizado no seu ritmo.'}</p>
          </div>
        </div>

        <span className="profile-pill">{shared ? 'Casal' : 'Pessoal'}</span>
      </div>

      <div className="balance-block">
        <span>{shared ? 'Saldo do casal' : 'Meu saldo'}</span>
        <strong>{formatMoney(balance)}</strong>
        <small>{shared ? `${formatMoney(movement)} em contribuições` : `${formatMoney(movement)} enviados ao casal`}</small>
      </div>

      <div className="hero-actions">
        {data.sharing?.active && <button type="button" className="primary-action">Transferir</button>}
        <button type="button">Relatório</button>
        {shared && <button type="button">Detalhes</button>}
      </div>
    </section>
  )
}

function CompactStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <article className="compact-stat">
      <span className={`stat-dot ${tone}`} />
      <div>
        <small>{label}</small>
        <strong>{formatMoney(value)}</strong>
      </div>
    </article>
  )
}

function Dashboard({ data, scope }: { data: BootstrapData; scope: FinancialScope }) {
  const stats = useMemo(() => {
    const paidExpenses = data.expenses.filter((item) => item.status === 'pago').reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const pending = data.expenses.filter((item) => item.status !== 'pago').reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const income = data.incomes.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const debt = data.debts.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
    return { income, paidExpenses, pending, debt }
  }, [data])

  const shared = scope === 'shared'
  const contributions = data.wallet.contributions || []

  return (
    <>
      <ProfileHero data={data} scope={scope} />

      <section className="section-block">
        <header className="section-heading">
          <div>
            <small>VISÃO GERAL</small>
            <h2>Seu financeiro</h2>
          </div>
        </header>

        <div className="stats-grid">
          <CompactStat label="Entradas" value={stats.income} tone="green" />
          <CompactStat label="Saídas" value={stats.paidExpenses} tone="coral" />
          <CompactStat label="A pagar" value={stats.pending} tone="gold" />
          <CompactStat label="Dívidas" value={stats.debt} tone="teal" />
        </div>
      </section>

      {shared && (
        <section className="premium-panel section-block">
          <header className="section-heading">
            <div>
              <small>CONTRIBUIÇÕES</small>
              <h2>Quem colocou no casal</h2>
            </div>
          </header>

          <div className="premium-list">
            {contributions.length ? contributions.map((item) => (
              <div className="premium-row" key={item.owner_user_id}>
                <span className="mini-avatar">{initials(item.name)}</span>
                <div className="row-copy">
                  <strong>{item.name}</strong>
                  <small>Contribuído para o casal</small>
                </div>
                <b>{formatMoney(item.amount)}</b>
              </div>
            )) : <div className="empty-state">As contribuições aparecerão aqui.</div>}
          </div>
        </section>
      )}

      <section className="premium-panel section-block">
        <header className="section-heading">
          <div>
            <small>MOVIMENTAÇÕES</small>
            <h2>Recentes</h2>
          </div>
          <button type="button" className="text-action">Ver tudo</button>
        </header>

        <div className="premium-list">
          {[...data.incomes.slice(0, 2), ...data.expenses.slice(0, 3)].slice(0, 5).map((item) => {
            const expense = 'status' in item
            return (
              <div className="premium-row" key={`${expense ? 'e' : 'i'}-${item.id}`}>
                <span className={`movement-icon ${expense ? 'expense' : 'income'}`}>{expense ? '↓' : '↑'}</span>
                <div className="row-copy">
                  <strong>{item.description}</strong>
                  <small>{item.category} · {item.date}</small>
                </div>
                <b className={expense ? 'expense-value' : 'income-value'}>{expense ? '-' : '+'}{formatMoney(item.amount)}</b>
              </div>
            )
          })}
          {!data.incomes.length && !data.expenses.length && <div className="empty-state">Nenhuma movimentação neste perfil ainda.</div>}
        </div>
      </section>
    </>
  )
}

export default function App() {
  const [scope, setScope] = useState<FinancialScope>(() => (localStorage.getItem('ritmo:scope') === 'shared' ? 'shared' : 'personal'))
  const [data, setData] = useState<BootstrapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const uninstallSync = installLowConsumptionSync()
    let alive = true

    async function boot() {
      try {
        const result = await loadScope(scope)
        if (!alive) return
        setData(result.data)
        setLoading(false)
        void prefetchOtherScope(scope)

        if (result.stale && navigator.onLine) {
          const fresh = await loadScope(scope, { forceNetwork: true }).catch(() => null)
          if (alive && fresh) setData(fresh.data)
        }
      } catch (bootError) {
        if (!alive) return
        setError(bootError instanceof Error ? bootError.message : 'Não foi possível abrir o Ritmo.')
        setLoading(false)
      }
    }

    void boot()
    return () => {
      alive = false
      uninstallSync()
    }
    // O boot ocorre uma vez. Mudanças de perfil usam handleScopeChange para evitar buscas duplicadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleScopeChange(nextScope: FinancialScope) {
    if (nextScope === scope || switching) return
    setSwitching(true)
    setError(null)

    try {
      const next = await changeScope(nextScope)
      setScope(nextScope)
      setData(next)
      localStorage.setItem('ritmo:scope', nextScope)

      const cached = await loadScope(nextScope)
      if (cached.stale && navigator.onLine) {
        const fresh = await loadScope(nextScope, { forceNetwork: true }).catch(() => null)
        if (fresh) setData(fresh.data)
      }
    } catch (scopeError) {
      setError(scopeError instanceof Error ? scopeError.message : 'Não foi possível trocar de perfil.')
    } finally {
      setSwitching(false)
    }
  }

  if (loading) {
    return <main className="app-shell"><div className="boot-card"><span className="brand-mark">R</span><p>Organizando seu Ritmo…</p></div></main>
  }

  if (!data) {
    return <main className="app-shell"><div className="boot-card"><span className="brand-mark">R</span><p>{error || 'Não foi possível abrir o Ritmo.'}</p></div></main>
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">Ritmo</div>
        <div className="topbar-actions">
          <button type="button" aria-label="Notificações">◌</button>
          <span className="top-avatar">{initials(data.profile.name)}</span>
        </div>
      </header>

      <div className="content-shell">
        <ProfileSwitcher scope={scope} data={data} onChange={handleScopeChange} busy={switching} />
        {error && <div className="inline-alert">{error}</div>}
        <div className={switching ? 'content-transition switching' : 'content-transition'}>
          <Dashboard data={data} scope={scope} />
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Navegação principal">
        <button type="button" className="active"><span>⌂</span><small>Início</small></button>
        <button type="button"><span>↕</span><small>Movimentos</small></button>
        <button type="button"><span>◇</span><small>Dívidas</small></button>
        <button type="button"><span>◎</span><small>Metas</small></button>
        <button type="button"><span>☰</span><small>Menu</small></button>
      </nav>
    </main>
  )
}
