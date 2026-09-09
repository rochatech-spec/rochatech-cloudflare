export type WorkspaceType = 'personal' | 'shared'
export type TransactionType = 'income' | 'expense'

export interface UserProfile {
  id: string
  username: string
  display_name: string
  avatar_key?: string | null
  created_at: string
}

export interface Workspace {
  id: string
  name: string
  type: WorkspaceType
  role: 'owner' | 'member'
}

export interface Transaction {
  id: string
  workspace_id: string
  type: TransactionType
  description: string
  category: string
  amount_cents: number
  date: string
  due_date?: string | null
  status: 'paid' | 'pending'
  notes?: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface Goal {
  id: string
  workspace_id: string
  title: string
  target_cents: number
  current_cents: number
  deadline?: string | null
  icon: string
  version: number
  created_at: string
  updated_at: string
}

export interface Debt {
  id: string
  workspace_id: string
  title: string
  creditor: string
  total_cents: number
  paid_cents: number
  due_date?: string | null
  status: 'active' | 'paid'
  version: number
  created_at: string
  updated_at: string
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  language: 'pt-BR'
}

export interface BootstrapData {
  profile: UserProfile
  workspaces: Workspace[]
  active_workspace: Workspace
  transactions: Transaction[]
  goals: Goal[]
  debts: Debt[]
  settings: AppSettings
  passkeys: number
  server_time: string
}

export interface QueuedMutation {
  id: string
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  path: string
  body?: unknown
  headers?: Record<string, string>
  createdAt: number
}
