import { useState } from 'react'
import type { Debt, Expense, FinancialScope, Goal, Income } from '../domain/types'
import { todayIso } from '../lib/format'
import { Icon } from '../ui/Icon'
import { Sheet } from './Sheet'

export type EditableMovement = (Income & { kind:'income' }) | (Expense & { kind:'expense' })
export type FinancialAction =
  | { type:'income'; item?:Income; scope:FinancialScope }
  | { type:'expense'; item?:Expense; scope:FinancialScope }
  | { type:'debt'; item?:Debt; scope:FinancialScope }
  | { type:'goal'; item?:Goal; scope:FinancialScope }
  | { type:'payment'|'credit'; debt:Debt; scope:FinancialScope }
  | { type:'contribution'; goal:Goal; scope:FinancialScope }
  | { type:'transfer'; scope:'personal' }

export type FinancialPayload = { action:FinancialAction; targetScope:FinancialScope; body:Record<string,unknown> }

function ScopeChoice({ value, onChange, expense, disabled }: { value:FinancialScope; onChange:(value:FinancialScope)=>void; expense?:boolean; disabled?:boolean }) {
  return <div className="scope-field"><span>{expense?'Pagar com':'Destino da entrada'}</span><div className="scope-choice"><button type="button" disabled={disabled} className={value==='personal'?'active':''} onClick={()=>onChange('personal')}><Icon name="user"/><b>{expense?'Meu saldo pessoal':'Pessoal'}</b></button><button type="button" disabled={disabled} className={value==='shared'?'active':''} onClick={()=>onChange('shared')}><Icon name="users"/><b>{expense?'Saldo do casal':'Casal / Compartilhado'}</b></button></div></div>
}

export function FinancialSheet({ action, sharedAvailable, onClose, onSubmit }: { action:FinancialAction; sharedAvailable:boolean; onClose:()=>void; onSubmit:(payload:FinancialPayload)=>Promise<void> }) {
  const [targetScope,setTargetScope]=useState<FinancialScope>(action.scope)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const existing = 'item' in action ? action.item : undefined
  const title = action.type==='income'?(existing?'Editar entrada':'Nova entrada'):action.type==='expense'?(existing?'Editar saída':'Nova saída'):action.type==='debt'?(existing?'Editar dívida':'Nova dívida'):action.type==='goal'?(existing?'Editar meta':'Nova meta'):action.type==='payment'?'Registrar pagamento':action.type==='credit'?'Registrar Haver':action.type==='contribution'?'Adicionar à meta':'Transferir para o casal'

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setError(null);setBusy(true)
    const form=new FormData(e.currentTarget);const body:Record<string,unknown>=Object.fromEntries(form.entries())
    for(const key of ['amount','total_amount','target_amount'])if(key in body)body[key]=Number(body[key])
    if('is_emergency' in body)body.is_emergency=body.is_emergency==='on'
    const date=String(body.date||'')
    if(['payment','credit','transfer','contribution'].includes(action.type)&&date&&date>todayIso()){setError('Registre esta ação somente quando ela realmente acontecer.');setBusy(false);return}
    if(action.type==='expense'&&body.status==='pago'&&date>todayIso()){setError('Uma saída futura deve ficar como Pendente até o pagamento acontecer.');setBusy(false);return}
    try{await onSubmit({action,targetScope,body});onClose()}catch(err){setError(err instanceof Error?err.message:'Não foi possível salvar.')}finally{setBusy(false)}
  }

  return <Sheet title={title} subtitle={subtitle(action)} onClose={onClose}><form className="financial-form" onSubmit={submit}>
    {action.type==='income'&&sharedAvailable&&!existing&&<ScopeChoice value={targetScope} onChange={setTargetScope}/>} 
    {action.type==='expense'&&sharedAvailable&&!existing&&<ScopeChoice value={targetScope} onChange={setTargetScope} expense/>}
    {(action.type==='debt'||action.type==='goal')&&sharedAvailable&&!existing&&<div className="scope-field"><span>Este item pertence a</span><div className="scope-choice"><button type="button" className={targetScope==='personal'?'active':''} onClick={()=>setTargetScope('personal')}><Icon name="user"/><b>Pessoal</b></button><button type="button" className={targetScope==='shared'?'active':''} onClick={()=>setTargetScope('shared')}><Icon name="users"/><b>Casal</b></button></div></div>}
    {action.type==='income'&&<><Field label="Descrição" name="description" defaultValue={action.item?.description} placeholder="Ex.: Salário" required/><MoneyField name="amount" defaultValue={action.item?.amount}/><Select label="Categoria" name="category" defaultValue={action.item?.category||'Salário'} values={['Salário','Renda extra','Venda','Reembolso','Outros']}/><DateField name="date" label="Data" defaultValue={action.item?.date||todayIso()}/><Field label="Observação" name="notes" defaultValue={action.item?.notes||''} placeholder="Opcional"/></>}
    {action.type==='expense'&&<><Field label="Descrição" name="description" defaultValue={action.item?.description} placeholder="Ex.: Mercado" required/><MoneyField name="amount" defaultValue={action.item?.amount}/><Select label="Categoria" name="category" defaultValue={action.item?.category||'Outros'} values={['Moradia','Contas da casa','Supermercado','Alimentação','Transporte','Saúde','Lazer','Educação','Filhos','Assinaturas','Dívidas','Outros']}/><Select label="Status" name="status" defaultValue={action.item?.status||'pendente'} values={['pendente','pago']}/><DateField name="date" label="Data" defaultValue={action.item?.date||todayIso()}/><DateField name="due_date" label="Vencimento" defaultValue={action.item?.due_date||''} required={false}/><Field label="Observação" name="notes" defaultValue={action.item?.notes||''} placeholder="Opcional"/></>}
    {action.type==='debt'&&<><Field label="Dívida / credor" name="creditor" defaultValue={action.item?.creditor} placeholder="Ex.: Cartão" required/><MoneyField name="total_amount" label="Valor total" defaultValue={action.item?.total_amount}/><DateField name="start_date" label="Data inicial" defaultValue={action.item?.start_date||todayIso()}/><DateField name="due_date" label="Vencimento" defaultValue={action.item?.due_date||''} required={false}/><Field label="Observação" name="notes" defaultValue={action.item?.notes||''} placeholder="Opcional"/></>}
    {action.type==='goal'&&<><Field label="Nome da meta" name="name" defaultValue={action.item?.name} placeholder="Ex.: Viagem" required/><MoneyField name="target_amount" label="Valor alvo" defaultValue={action.item?.target_amount}/><Select label="Categoria" name="category" defaultValue={action.item?.category||'Personalizado'} values={['Viagem','Carro','Casa','Estudos','Reserva de emergência','Personalizado']}/><DateField name="deadline" label="Prazo" defaultValue={action.item?.deadline||''} required={false}/><Field label="Observação" name="notes" defaultValue={action.item?.notes||''} placeholder="Opcional"/></>}
    {(action.type==='payment'||action.type==='credit')&&<><div className="form-context"><Icon name="debt"/><span><small>{action.debt.creditor}</small><strong>Saldo atual: {new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(action.debt.balance??action.debt.total_amount))}</strong></span></div><MoneyField name="amount" label={action.type==='payment'?'Valor pago':'Valor do Haver'}/><DateField name="date" label="Data" defaultValue={todayIso()}/><Field label="Observação" name="notes" placeholder="Opcional"/></>}
    {action.type==='contribution'&&<><div className="form-context"><Icon name="goal"/><span><small>{action.goal.name}</small><strong>Adicione somente um valor já separado para a meta.</strong></span></div><MoneyField name="amount"/><DateField name="date" label="Data" defaultValue={todayIso()}/><Field label="Observação" name="notes" placeholder="Opcional"/></>}
    {action.type==='transfer'&&<><div className="form-context transfer"><Icon name="transfer"/><span><small>Pessoal → Casal</small><strong>O valor sai do seu saldo pessoal e entra no saldo do casal. Não vira nova receita.</strong></span></div><MoneyField name="amount"/><DateField name="date" label="Data" defaultValue={todayIso()}/><Field label="Descrição" name="description" placeholder="Ex.: Contas da casa"/></>}
    {error&&<div className="inline-alert">{error}</div>}
    <button className="primary-button wide sheet-submit" type="submit" disabled={busy}>{busy?'Salvando…':'Salvar'}</button>
  </form></Sheet>
}

function subtitle(action:FinancialAction){if(action.type==='transfer')return 'Uma transferência real entre suas duas carteiras.';if(action.type==='credit')return 'Haver reduz a dívida e registra a saída vinculada.';return 'Preencha apenas o que precisa. Você pode editar depois.'}
function Field({label,name,defaultValue='',placeholder,required=false}:{label:string;name:string;defaultValue?:string;placeholder?:string;required?:boolean}){return <label className="field"><span>{label}</span><input name={name} defaultValue={defaultValue} placeholder={placeholder} required={required}/></label>}
function MoneyField({name,label='Valor',defaultValue}:{name:string;label?:string;defaultValue?:number}){return <label className="field"><span>{label}</span><input name={name} type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={defaultValue||''} placeholder="0,00" required/></label>}
function DateField({name,label,defaultValue,required=true}:{name:string;label:string;defaultValue:string;required?:boolean}){return <label className="field"><span>{label}</span><input name={name} type="date" defaultValue={defaultValue} required={required}/></label>}
function Select({label,name,defaultValue,values}:{label:string;name:string;defaultValue:string;values:string[]}){return <label className="field"><span>{label}</span><select name={name} defaultValue={defaultValue}>{values.map(v=><option key={v} value={v}>{v[0].toUpperCase()+v.slice(1)}</option>)}</select></label>}
