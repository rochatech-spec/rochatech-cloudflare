export type Transaction = { id: string; date: string; desc: string; cat: string; type: 'Receita' | 'Despesa'; value: number; icon?: string };
export type Debt = { id: string; name: string; total: number; remaining: number; due: string; category: string };
export type Goal = { id: string; name: string; target: number; saved: number; due?: string };
export type EventItem = { id: string; title: string; date: string; time?: string; note?: string };
export type StoredFile = { id: string; name: string; contentType: string; size: number; createdAt: string };
export type Profile = { displayName: string; username?: string; theme?: 'light'|'dark'|'system'; dueNotifications?: boolean; goalNotifications?: boolean };
export type Bootstrap = { profile: Profile; transactions: Transaction[]; debts: Debt[]; goals: Goal[]; events: EventItem[]; files: StoredFile[] };
export type AuthUser = { id: string; username: string; displayName: string };
