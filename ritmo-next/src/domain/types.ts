export type FinancialScope = 'personal' | 'shared'
export type TransactionKind = 'income' | 'expense' | 'transfer'
export type WalletType = 'personal' | 'shared'
export type PageKey = 'home' | 'movements' | 'debts' | 'goals' | 'menu' | 'report' | 'sharing' | 'calendar' | 'insights' | 'settings' | 'profile' | 'notifications'
export interface Profile { id:string; name:string; username:string; avatar_key?:string|null; data_version?:number }
export interface Partner { user_id:string; name:string; username:string }
export interface SharingMember extends Partner { role?:string; joined_at?:string }
export interface SharingInvite { id:string; code?:string; expires_at?:string; inviter_name?:string; inviter_username?:string; invitee_name?:string; invitee_username?:string }
export interface SharingState { active:boolean; partnership_id?:string|null; partner?:Partner|null; members?:SharingMember[]; incoming_invites?:SharingInvite[]; outgoing_invites?:SharingInvite[] }
export interface Income { id:string; description:string; category:string; amount:number; date:string; notes?:string|null; recurrence?:string; scope?:FinancialScope; shared?:number; created_by_name?:string }
export interface Expense { id:string; description:string; category:string; amount:number; date:string; due_date?:string|null; status:'pendente'|'pago'; notes?:string|null; recurrence?:string; scope?:FinancialScope; shared?:number; created_by_name?:string; debt_id?:string|null; debt_event_id?:string|null }
export interface Debt { id:string; creditor:string; total_amount:number; paid_amount?:number; balance?:number; start_date?:string; due_date?:string|null; notes?:string|null; status?:'ativa'|'quitada'; scope?:FinancialScope; shared?:number; created_by_name?:string }
export interface DebtEvent { id:string; debt_id:string; kind:'pagamento'|'haver'; amount:number; date:string; notes?:string|null; created_by_name?:string }
export interface Goal { id:string; name:string; target_amount:number; current_amount?:number; deadline?:string|null; category?:string; notes?:string|null; is_emergency?:number; scope?:FinancialScope; shared?:number; created_by_name?:string }
export interface GoalContribution { id:string; goal_id:string; amount:number; date:string; notes?:string|null; user_name?:string }
export interface WalletContribution { owner_user_id:string; name:string; username?:string; amount:number }
export interface WalletTransfer { id:string; owner_user_id:string; created_by:string; created_by_name?:string; amount:number; date:string; description?:string|null; source_wallet?:WalletType; destination_wallet?:WalletType; can_edit?:boolean }
export interface WalletSnapshot { personal_balance:number; shared_balance:number; personal_income:number; personal_expenses:number; sent_to_shared:number; shared_income:number; shared_expenses:number; shared_transfers:number; real_income_total?:number; contributions:WalletContribution[]; transfers:WalletTransfer[] }
export interface Settings { theme?:'light'|'dark'|'system'; notifications_enabled?:number; notify_due?:number; notify_overdue?:number; notify_goals?:number; reminder_days?:number; monthly_summary?:number; auto_lock_minutes?:number; mobile_shortcuts?:string; seen_notifications?:string }
export interface SecurityState { webauthn_count?:number }
export interface BootstrapData { profile:Profile; scope:FinancialScope; sharing:SharingState; wallet:WalletSnapshot; settings?:Settings; security?:SecurityState; incomes:Income[]; expenses:Expense[]; debts:Debt[]; debt_events?:DebtEvent[]; goals:Goal[]; goal_contributions?:GoalContribution[]; server_time?:string }
export interface ReportSummary { income:number; expenses:number; receivable:number; pending:number; transfers:number; period_result:number; current_balance:number; real_income_total:number }
export interface WalletReport { scope:FinancialScope; from:string; to:string; summary:ReportSummary; personal:{incomes:Income[];expenses:Expense[]}|null; shared:{incomes:Income[];expenses:Expense[];contributions:WalletContribution[]}|null; transfers:WalletTransfer[] }
export interface CachedScopeSnapshot { key:FinancialScope; data:BootstrapData; savedAt:number; version:number }
export interface PendingMutation { id:string; method:'POST'|'PATCH'|'DELETE'; path:string; body?:unknown; createdAt:number; attempts:number }
