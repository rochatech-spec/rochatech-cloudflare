import type { BootstrapData, Goal } from '../domain/types'
import { money, shortDate } from '../lib/format'
import { Icon } from '../ui/Icon'

export function GoalsPage({ data, onNew, onEdit, onDelete, onContribution }: { data: BootstrapData; onNew: () => void; onEdit: (goal: Goal) => void; onDelete: (goal: Goal) => void; onContribution: (goal: Goal) => void }) {
  return <div className="page-stack">
    <header className="page-header"><div><small>METAS</small><h1>Planos com progresso visível</h1><p>Veja quanto já avançou e o que falta para chegar lá.</p></div><button className="primary-button" type="button" onClick={onNew}><Icon name="plus"/> Nova meta</button></header>
    <div className="cards-grid">{data.goals.length ? data.goals.map((goal) => {
      const current = Number(goal.current_amount || 0)
      const progress = goal.target_amount > 0 ? Math.min(100, Math.max(0, (current/goal.target_amount)*100)) : 0
      const remaining = Math.max(0, goal.target_amount-current)
      return <article className="premium-card goal-card" key={goal.id}><div className="card-top"><span className="card-icon goal"><Icon name="goal"/></span><div className="card-heading"><small>{goal.category || 'META'}</small><h2>{goal.name}</h2><p>{goal.deadline?`Prazo ${shortDate(goal.deadline)}`:'Sem prazo definido'}</p></div><div className="card-actions"><button type="button" onClick={()=>onEdit(goal)} aria-label="Editar"><Icon name="edit"/></button><button type="button" onClick={()=>onDelete(goal)} aria-label="Excluir"><Icon name="trash"/></button></div></div><div className="goal-progress-label"><strong>{money(current)}</strong><span>de {money(goal.target_amount)}</span></div><div className="progress-track goal"><span style={{width:`${progress}%`}}/></div><div className="goal-footer"><span><b>{Math.round(progress)}%</b><small> concluído</small></span><span><small>Falta </small><b>{money(remaining)}</b></span></div>{remaining>0 && <button className="wide-secondary-button" type="button" onClick={()=>onContribution(goal)}><Icon name="plus"/> Adicionar à meta</button>}</article>
    }) : <div className="premium-card empty-card">Crie uma meta para acompanhar seu progresso sem misturar o dinheiro do outro perfil.</div>}</div>
  </div>
}
