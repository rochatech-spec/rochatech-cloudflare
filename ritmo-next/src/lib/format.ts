const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

export function money(value: number | undefined | null) {
  return currency.format(Number(value || 0))
}

export function shortDate(value?: string | null) {
  if (!value) return 'Sem data'
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : date.format(parsed)
}

export function todayIso() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

export function monthStartIso() {
  return `${todayIso().slice(0, 7)}-01`
}

export function initials(name?: string | null) {
  return (name || 'Ritmo').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('')
}

export function firstName(name?: string | null) {
  return (name || '').trim().split(/\s+/)[0] || 'Você'
}
