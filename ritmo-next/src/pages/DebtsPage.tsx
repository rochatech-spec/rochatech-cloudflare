import type { BootstrapData, Debt } from '../domain/types'
import { money, shortDate } from '../lib/format'
import { Icon } from '../ui/Icon'

export function DebtsPage({ data, onNew, onEdit, onDelete, onEvent }: { data: BootstrapData; onNew: () => void; onEdit: (debt: Debt) => void; onDelete: (debt: Debt) => void; onEvent: (debt: Debt, kind: 'payment' | 'credit') => void }) {
  const total = data.debts.reduce((sum, debt) => sum + Number(debt.balance ?? debt.total_amount ?? 0), 0)
  return <div className="page-stack">
    <header className="page-header"><div><small>DÍVIDAS</small><h1>Compromissos sob controle</h1><p>Pagamento e Haver diminuem a dívida e movimentam o saldo corretamente.</p></div><button className="primary-button" type="button" onClick={onNew}><Icon name="plus"/> Nova dívida</button></header>
    <section className="debt-total-card"><span><Icon name="debt"/></span><div><small>SALDO DEVEDOR</small><strong>{money(total)}</strong><p>{data.debts.filter((d)=>Number(d.balance ?? d.total_amount)>0).length} dívida(s) ativa(s)</p></div></section>
    <div className="cards-grid">{data.debts.length ? data.debts.map((debt) => {
      const balance = Number(debt.balance ?? debt.total_amount ?? 0)
      const paid = Number(debt.paid_amount ?? Math.max(0, debt.total_amount-balance))
      const progress = debt.total_amount > 0 ? Math.min(100, Math.max(0, (paid/debt.total_amount)*100)) : 0
      return <article className="premium-card debt-card" key={debt.id}><div className="card-top"><span className="card-icon"><Icon name="debt"/></span><div className="card-heading"><small>{balance<=0?'QUITADA':'ATIVA'}</small><h2>{debt.creditor}</h2><p>{debt.due_date?`Vence ${shortDate(debt.due_date)}`:'Sem vencimento definido'}</p></div><div className="card-actions"><button type="button" onClick={()=>onEdit(debt)} aria-label="Editar"><Icon name="edit"/></button><button type="button" onClick={()=>onDelete(debt)} aria-label="Excluir"><Icon name="trash"/></button></div></div><div className="debt-values"><span><small>Saldo</small><strong>{money(balance)}</strong></span><span><small>Pago / Haver</small><strong>{money(paid)}</strong></span><span><small>Total</small><strong>{money(debt.total_amount)}</strong></span></div><div className="progress-track"><span style={{width:`${progress}%`}}/></div>{balance>0 && <div className="card-footer-actions"><button type="button" onClick={()=>onEvent(debt,'payment')}><Icon name="check"/> Pagamento</button><button type="button" onClick={()=>onEvent(debt,'credit')}><Icon name="transfer"/> Haver</button></div>}</article>
    }) : <div className="premium-card empty-card">Nenhuma dívida cadastrada neste perfil.</div>}</div>
  </div>
}
