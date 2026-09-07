export type Scope='personal'|'couple'
export type TxType='INCOME'|'EXPENSE'
export type TxStatus='PENDING'|'PAID'|'CANCELED'
export interface Profile{id:string;name:string;email:string;avatar_url?:string|null}
export interface Partner{id:string;name:string;email:string}
export interface MoneySource{id:string;name:string;type:string;current_balance:number;color:string;icon:string}
export interface Category{id:string;name:string;type:TxType;icon:string;color:string}
export interface Transaction{id:string;type:TxType;status:TxStatus;amount:number;description:string;date:string;due_date?:string|null;paid_at?:string|null;notes?:string|null;category_name?:string|null;category_color?:string|null;created_by_name?:string|null;money_source_name?:string|null}
export interface Goal{id:string;title:string;target_amount:number;current_amount:number;deadline?:string|null;icon:string;color:string;kind:'GOAL'|'EMERGENCY_RESERVE';status:'ACTIVE'|'COMPLETED'|'ARCHIVED'}
export interface Debt{id:string;title:string;total_amount:number;remaining_amount:number;status:'PENDING'|'PAID'|'CANCELED';due_date?:string|null;notes?:string|null}
export interface Budget{id:string;year:number;month:number;total_amount:number;categories:{id:string;category_id:string;category_name:string;limit_amount:number;spent:number;color:string}[]}
export interface Invite{id:string;invited_email:string;code?:string;expires_at:string;status:string;inviter_name?:string}
export interface Sharing{active:boolean;workspace_id?:string|null;partner?:Partner|null;incoming:Invite[];outgoing:Invite[]}
export interface Contribution{id:string;amount:number;date:string;description?:string|null;created_by_name?:string}
export interface Bootstrap{
  scope:Scope;workspace:{id:string;name:string;type:'PERSONAL'|'COUPLE'};profile:Profile;partner?:Partner|null;sharing:Sharing;
  sources:MoneySource[];categories:Category[];transactions:Transaction[];goals:Goal[];debts:Debt[];budget:Budget|null;contributions:Contribution[];
  summary:{balance:number;income:number;expenses:number;pending:number;overdue:number;monthChange:number};settings:{theme:'LIGHT'|'DARK'|'SYSTEM';notifications_enabled:number};server_time:string
}
