import type { BootstrapData, Goal } from '../domain/types'
import { money, shortDate, todayIso } from '../lib/format'
import { Icon } from '../ui/Icon'

function monthIndex(date:string){const [y,m]=date.slice(0,7).split('-').map(Number);return y*12+m-1}
function goalStrategy(data:BootstrapData,goal:Goal){
  const current=Number(goal.current_amount||0),remaining=Math.max(0,goal.target_amount-current)
  if(remaining<=0)return {done:true,title:'Meta alcançada 🎉',copy:'Você chegou ao objetivo.',monthly:0,weekly:0,months:0}
  const today=(data.server_time||todayIso()).slice(0,10),now=monthIndex(today)
  const contributions=(data.goal_contributions||[]).filter(x=>x.goal_id===goal.id&&x.date<=today)
  let average=0
  if(contributions.length){const first=Math.max(now-5,Math.min(...contributions.map(x=>monthIndex(x.date))));const months=Math.max(1,now-first+1);average=contributions.filter(x=>monthIndex(x.date)>=first).reduce((s,x)=>s+Number(x.amount||0),0)/months}
  const deadlineMonths=goal.deadline&&goal.deadline>=today?Math.max(1,monthIndex(goal.deadline)-now+1):null
  const required=deadlineMonths?remaining/deadlineMonths:0
  let monthly=required||average||remaining/12
  if(!required&&average>0)monthly=average*1.2
  monthly=Math.max(10,Math.ceil(monthly/10)*10)
  const weekly=Math.ceil((monthly/4.33)/5)*5
  const months=average>0?Math.ceil(remaining/average):Math.ceil(remaining/monthly)
  if(deadlineMonths){
    if(!average)return {done:false,title:`Mire ${money(monthly)} por mês`,copy:`Esse ritmo combina com o prazo de ${shortDate(goal.deadline!) }.`.replace('!',''),monthly,weekly,months}
    if(average+1<required){const gap=Math.ceil((required-average)/10)*10;return {done:false,title:`Aumente cerca de ${money(gap)} por mês`,copy:`Sua média recente é ${money(Math.round(average))}/mês. Para o prazo, o ideal é perto de ${money(Math.ceil(required/10)*10)}/mês.`,monthly,weekly,months}}
    return {done:false,title:'Você está no ritmo certo',copy:`Sua média de ${money(Math.round(average))}/mês acompanha o prazo definido.`,monthly,weekly,months}
  }
  return {done:false,title:average?`Acelere para ${money(monthly)} por mês`:`Plano inicial: ${money(monthly)} por mês`,copy:average?`Sua média recente é ${money(Math.round(average))}/mês.`:'O Ritmo ajusta essa sugestão conforme seus aportes reais.',monthly,weekly,months}
}

export function GoalsPage({ data, onNew, onEdit, onDelete, onContribution }: { data:BootstrapData; onNew:()=>void; onEdit:(goal:Goal)=>void; onDelete:(goal:Goal)=>void; onContribution:(goal:Goal)=>void }) {
  return <div className="page-stack">
    <header className="page-header ios-page-header"><div><small>METAS</small><h1>Planos com direção</h1><p>Além do progresso, o Ritmo mostra um caminho possível usando seus aportes reais.</p></div><button className="primary-button" type="button" onClick={onNew}><Icon name="plus"/> Nova meta</button></header>
    <div className="cards-grid">{data.goals.length?data.goals.map(goal=>{
      const current=Number(goal.current_amount||0),progress=goal.target_amount>0?Math.min(100,Math.max(0,current/goal.target_amount*100)):0,remaining=Math.max(0,goal.target_amount-current),strategy=goalStrategy(data,goal)
      const contributions=(data.goal_contributions||[]).filter(x=>x.goal_id===goal.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3)
      return <article className="premium-card goal-card goal-card-rich" key={goal.id}>
        <div className="card-top"><span className="card-icon goal"><Icon name="goal"/></span><div className="card-heading"><small>{data.scope==='shared'?'META DO CASAL':goal.category||'META'}</small><h2>{goal.name}</h2><p>{goal.deadline?`Prazo ${shortDate(goal.deadline)}`:'Sem prazo definido'}</p></div><div className="card-actions"><button type="button" onClick={()=>onEdit(goal)} aria-label="Editar"><Icon name="edit"/></button><button type="button" onClick={()=>onDelete(goal)} aria-label="Excluir"><Icon name="trash"/></button></div></div>
        <div className="goal-progress-label"><strong>{money(current)}</strong><span>de {money(goal.target_amount)}</span></div><div className="progress-track goal"><span style={{width:`${progress}%`}}/></div><div className="goal-footer"><span><b>{Math.round(progress)}%</b><small> concluído</small></span><span><small>Falta </small><b>{money(remaining)}</b></span></div>
        <div className={strategy.done?'goal-strategy-box done':'goal-strategy-box'}><div className="goal-strategy-title"><Icon name={strategy.done?'check':'spark'}/><span><strong>Estratégia do Ritmo</strong><small>Calculada com o histórico desta meta</small></span></div><h3>{strategy.title}</h3><p>{strategy.copy}</p>{!strategy.done&&<div className="goal-strategy-metrics"><span><strong>{money(strategy.weekly)}</strong><small>por semana</small></span><span><strong>{strategy.months} mês(es)</strong><small>estimativa</small></span>{data.scope==='shared'&&<span><strong>{money(Math.ceil(strategy.monthly/2/5)*5)}</strong><small>cada / mês</small></span>}</div>}</div>
        {data.scope==='shared'&&contributions.length>0&&<div className="goal-contribution-list">{contributions.map(c=><div key={c.id}><span><strong>{c.user_name?.split(' ')[0]||'Parceiro'}</strong><small>{shortDate(c.date)}</small></span><b>+ {money(c.amount)}</b></div>)}</div>}
        {remaining>0&&<button className="wide-secondary-button" type="button" onClick={()=>onContribution(goal)}><Icon name="plus"/> Adicionar à meta</button>}
      </article>
    }):<div className="premium-card empty-card">Crie uma meta para o Ritmo começar a calcular uma estratégia com seus aportes.</div>}</div>
  </div>
}
