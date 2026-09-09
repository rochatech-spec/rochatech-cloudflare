import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import {
  House, ListBullets, Target, CreditCard, CalendarBlank, ChartDonut,
  MagnifyingGlass, Bell, GearSix, CaretRight, ArrowUpRight, ArrowDownRight,
  ShoppingCart, Briefcase, Car, GraduationCap, ForkKnife, Plus, AirplaneTilt,
  ShieldCheck, Laptop, Trophy, UserCircle, Swap, DownloadSimple, Eye,
  LockKey, User, SignOut, Question, Moon, Translate, CloudArrowUp, Wallet,
  CheckCircle, SidebarSimple, HandWaving, CaretLeft, X, Fingerprint, Sun,
  Desktop, Trash, Camera, WifiSlash, CircleNotch
} from '@phosphor-icons/react'
import type { BootstrapData, Debt, Goal, Transaction, Workspace } from '../types'

export const navItems = [
  { id: 'dashboard', label: 'Início', icon: House },
  { id: 'movements', label: 'Movimentações', icon: ListBullets },
  { id: 'goals', label: 'Metas', icon: Target },
  { id: 'debts', label: 'Dívidas', icon: CreditCard },
  { id: 'calendar', label: 'Calendário', icon: CalendarBlank },
  { id: 'reports', label: 'Relatórios', icon: ChartDonut },
] as const

export type Page = typeof navItems[number]['id'] | 'profile' | 'profiles' | 'settings'
export type ModalKind = 'transaction' | 'goal' | 'debt' | null

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const money = (cents: number) => brl.format((Number(cents) || 0) / 100)
export const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${value}T12:00:00`)) : ''
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'R'

export const categoryMeta: Record<string, { icon: typeof ShoppingCart; tone: string }> = {
  Alimentação: { icon: ShoppingCart, tone: 'red' },
  Trabalho: { icon: Briefcase, tone: 'green' },
  Transporte: { icon: Car, tone: 'dark' },
  Saúde: { icon: GraduationCap, tone: 'yellow' },
  Moradia: { icon: House, tone: 'purple' },
  Lazer: { icon: ForkKnife, tone: 'orange' },
  Outros: { icon: Wallet, tone: 'dark' },
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return <img className={`logo ${compact ? 'logo--compact' : ''}`} src="/assets/ritmo-logo.png" alt="Ritmo" />
}

export function Avatar({ profile, small = false, cacheKey = 0 }: { profile: BootstrapData['profile']; small?: boolean; cacheKey?: number }) {
  if (profile.avatar_key) {
    return <span className={`avatar avatar--image ${small ? 'avatar--small' : ''}`}><img src={`/api/profile/avatar?v=${cacheKey}`} alt={`Foto de ${profile.display_name}`} /></span>
  }
  return <span className={`avatar ${small ? 'avatar--small' : ''}`} aria-label={`Perfil de ${profile.display_name}`}>{initials(profile.display_name)}</span>
}

export function Sidebar({ page, setPage, collapsed, setCollapsed, data, cacheKey }: { page: Page; setPage: (p: Page) => void; collapsed: boolean; setCollapsed: (v: boolean) => void; data: BootstrapData; cacheKey: number }) {
  return <aside className="sidebar">
    <div className="sidebar__brand"><Logo /><button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} title={collapsed ? 'Expandir menu' : 'Recolher menu'}><SidebarSimple weight="bold" /></button></div>
    <nav aria-label="Navegação principal">
      {navItems.map(({ id, label, icon: Icon }) => <button key={id} title={collapsed ? label : undefined} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><Icon weight={page === id ? 'fill' : 'regular'} /><span>{label}</span></button>)}
    </nav>
    <div className="sidebar__footer">
      <button className="profile-switch" onClick={() => setPage('profiles')}><Avatar profile={data.profile} small cacheKey={cacheKey}/><span><strong>{data.active_workspace.name}</strong><small>Perfil ativo</small></span><CaretRight /></button>
      <button className="nav-item" onClick={() => setPage('settings')}><GearSix /><span>Configurações</span></button>
    </div>
  </aside>
}

export function MobileNav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  return <nav className="mobile-nav" aria-label="Navegação principal no celular">
    {navItems.slice(0, 5).map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon weight={page === id ? 'fill' : 'regular'} /><span>{label}</span></button>)}
  </nav>
}

export function Topbar({ setPage, data, online, cacheKey }: { setPage: (p: Page) => void; data: BootstrapData; online: boolean; cacheKey: number }) {
  return <header className="topbar">
    <div className="mobile-logo"><Logo compact /></div>
    <div className="welcome"><h1>Olá, {firstName(data.profile.display_name)}! <HandWaving weight="fill" aria-hidden="true" /></h1><p>{online ? 'Aqui está o panorama da sua vida financeira.' : 'Você está offline. As alterações serão sincronizadas depois.'}</p></div>
    <label className="search"><MagnifyingGlass /><input aria-label="Buscar" placeholder="Buscar..." /></label>
    <button className={`icon-button ${online ? '' : 'offline'}`} aria-label={online ? 'Online' : 'Offline'}>{online ? <Bell /> : <WifiSlash />}</button>
    <button className="avatar-button" onClick={() => setPage('profile')} aria-label="Abrir perfil"><Avatar profile={data.profile} small cacheKey={cacheKey}/></button>
  </header>
}

export function StatCard({ label, value, trend, tone, icon: Icon }: { label: string; value: string; trend: string; tone: 'balance' | 'income' | 'expense' | 'debt'; icon: typeof Eye }) {
  return <article className={`stat-card stat-card--${tone}`}><div className="stat-card__top"><span>{label}</span><Icon /></div><strong>{value}</strong><small className={tone === 'expense' ? 'negative' : 'positive'}>{tone === 'expense' ? <ArrowDownRight /> : <ArrowUpRight />}{trend}</small></article>
}

export function BalanceChart({ transactions }: { transactions: Transaction[] }) {
  const points = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 11 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 10 + i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    let balance = 0
    const values = months.map((month) => {
      const delta = transactions.filter((t) => t.date.startsWith(month) && t.status === 'paid').reduce((sum, t) => sum + (t.type === 'income' ? t.amount_cents : -t.amount_cents), 0)
      balance += delta
      return balance
    })
    const min = Math.min(...values, 0), max = Math.max(...values, 1), span = Math.max(1, max - min)
    return values.map((value, i) => `${i * 40},${100 - ((value - min) / span) * 90}`).join(' ')
  }, [transactions])
  return <section className="card balance-chart"><div className="section-head"><h2>Evolução do saldo</h2><button className="select-button">Últimos meses <CaretRight /></button></div><div className="chart-wrap" aria-label="Gráfico de evolução do saldo"><div className="y-labels"><span>+</span><span></span><span></span><span>0</span></div><svg viewBox="0 0 400 110" role="img" aria-hidden="true"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#31b879" stopOpacity=".28"/><stop offset="100%" stopColor="#31b879" stopOpacity="0"/></linearGradient></defs><path d={`M ${points.replaceAll(' ', ' L ')} L400,110 L0,110 Z`} fill="url(#area)"/><polyline points={points} fill="none" stroke="#20a46b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg><div className="x-labels">{['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov'].map(m => <span key={m}>{m}</span>)}</div></div></section>
}

export function DonutCard({ transactions }: { transactions: Transaction[] }) {
  const expenses = transactions.filter((t) => t.type === 'expense' && t.status === 'paid')
  const total = expenses.reduce((sum, t) => sum + t.amount_cents, 0)
  const categories = Object.entries(expenses.reduce<Record<string, number>>((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount_cents; return acc }, {})).sort((a,b) => b[1] - a[1]).slice(0, 5)
  return <section className="card donut-card"><div className="section-head"><h2>Gastos por categoria</h2><button className="select-button">Este perfil <CaretRight /></button></div><div className="donut-content"><div className="donut"><span>{money(total)}</span></div><ul className="legend">{categories.length ? categories.map(([name, value], i) => <li key={name}><i className={`c${(i % 5) + 1}`}/>{name}<strong>{total ? Math.round(value / total * 100) : 0}%</strong></li>) : <li><i className="c1"/>Sem gastos<strong>0%</strong></li>}</ul></div></section>
}

export function ListCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="card list-card"><div className="section-head"><h2>{title}</h2>{action}</div>{children}</section>
}

export function TransactionRow({ item, onDelete }: { item: Transaction; onDelete?: (item: Transaction) => void }) {
  const meta = categoryMeta[item.category] || categoryMeta.Outros
  const Icon = meta.icon
  return <div className="list-row"><span className={`row-icon ${item.type === 'income' ? 'green' : meta.tone}`}><Icon weight="fill" /></span><span className="row-copy"><strong>{item.description}</strong><small>{item.category} · {dateLabel(item.date)}{item.status === 'pending' ? ' · Pendente' : ''}</small></span><strong className={`row-value ${item.type === 'income' ? 'positive' : 'negative'}`}>{item.type === 'income' ? '+' : '−'} {money(item.amount_cents)}</strong>{onDelete && <button className="row-delete" onClick={() => onDelete(item)} aria-label={`Excluir ${item.description}`}><Trash /></button>}</div>
}
