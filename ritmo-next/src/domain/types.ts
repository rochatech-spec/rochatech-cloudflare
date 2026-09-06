export type FinancialScope = 'personal' | 'shared'
export type TransactionKind = 'income' | 'expense' | 'transfer'
export type WalletType = 'personal' | 'shared'

export interface Profile {
  id: string
  name: string
  username: string
}

export interface Partner {
  user_id: string
  name: string
  username: string
}

export interface SharingState {
  active: boolean
  partnership_id?: string | null
  partner?: Partner | null
}

export interface Income {
  id: string
  description: string
  category: string
  amount: number
  date: string
  scope?: FinancialScope
  created_by_name?: string
}

export interface Expense {
  id: string
  description: string
  category: string
  amount: number
  date: string
  due_date?: string | null
  status: 'pendente' | 'pago'
  scope?: FinancialScope
  created_by_name?: string
}

export interface Debt {
  id: string
  creditor: string
  total_amount: number
  due_date?: string | null
  scope?: FinancialScope
}

export interface Goal {
  id: string
  name: string
  target_amount: number
  current_amount?: number
  deadline?: string | null
  scope?: FinancialScope
}

export interface WalletContribution {
  owner_user_id: string
  name: string
  username?: string
  amount: number
}

export interface WalletTransfer {
  id: string
  owner_user_id: string
  created_by: string
  created_by_name?: string
  amount: number
  date: string
  description?: string | null
  source_wallet?: WalletType
  destination_wallet?: WalletType
  can_edit?: boolean
}

export interface WalletSnapshot {
  personal_balance: number
  shared_balance: number
  personal_income: number
  personal_expenses: number
  sent_to_shared: number
  shared_income: number
  shared_expenses: number
  shared_transfers: number
  contributions: WalletContribution[]
  transfers: WalletTransfer[]
}

export interface BootstrapData {
  profile: Profile
  scope: FinancialScope
  sharing: SharingState
  wallet: WalletSnapshot
  incomes: Income[]
  expenses: Expense[]
  debts: Debt[]
  goals: Goal[]
  server_time?: string
}

export interface CachedScopeSnapshot {
  key: FinancialScope
  data: BootstrapData
  savedAt: number
  version: number
}

export interface PendingMutation {
  id: string
  method: 'POST' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
  createdAt: number
  attempts: number
}
