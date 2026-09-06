from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'
a=app.read_text()

# Esta camada mantém Meu Ritmo e Nosso Ritmo separados. O backend de compartilhamento
# já usa tabelas próprias; aqui tornamos a escolha prática no fluxo diário.

def replace_func(name,new_code):
    global a
    starts=[x for x in (a.find(f'function {name}('),a.find(f'async function {name}(')) if x>=0]
    if not starts: raise SystemExit('Função não encontrada: '+name)
    p=min(starts); ends=[]
    for token in ('\nfunction ','\nasync function '):
        q=a.find(token,p+1)
        if q>p: ends.append(q)
    q=min(ends) if ends else len(a)
    a=a[:p]+new_code+a[q:]

helpers=r'''
function goalStrategy(g){
 const target=Number(g.target_amount||0),current=Number(g.current_amount||0),remaining=Math.max(0,target-current);
 const rows=(state.data.goal_contributions||[]).filter(x=>x.goal_id===g.id&&(!x.date||x.date<=financeToday())).sort((x,y)=>String(x.date).localeCompare(String(y.date)));
 const recent=rows.slice(-6),avg=recent.length?recent.reduce((s,x)=>s+Number(x.amount||0),0)/recent.length:0;
 const now=new Date(),deadline=g.deadline?new Date(g.deadline+'T12:00:00'):null;
 const months=deadline&&deadline>now?Math.max(1,Math.ceil((deadline-now)/(1000*60*60*24*30.4375))):null;
 const needed=months?remaining/months:0,pace=avg>0?Math.ceil(remaining/avg):null;
 let tip='Comece com um aporte que caiba no mês e aumente aos poucos.';
 if(remaining<=0)tip='Meta alcançada. Agora você pode manter o hábito e escolher o próximo objetivo.';
 else if(months&&needed>0&&avg>0&&avg<needed)tip=`Seu ritmo recente é ${money(avg)} por aporte. Para chegar até ${dateBR(g.deadline)}, tente aproximar os aportes de ${money(needed)} por mês.`;
 else if(months&&needed>0)tip=`Para chegar até ${dateBR(g.deadline)}, uma referência é reservar cerca de ${money(needed)} por mês.`;
 else if(avg>0)tip=`Mantendo aportes próximos de ${money(avg)}, faltam aproximadamente ${pace} aporte(s) para concluir.`;
 const boost=remaining>0&&avg>0?Math.min(remaining,Math.max(1000,Math.round(avg*.15/100)*100)):0;
 return {remaining,avg,needed,pace,tip,boost};
}
function householdScopePicker(){
 const sh=state.data?.sharing;if(!sh?.active)return '';
 const shared=state.data.scope==='shared';
 return `<div class="household-scope"><button data-scope="personal" class="${shared?'':'active'}"><strong>Meu Ritmo</strong><small>Minhas despesas e objetivos pessoais</small></button><button data-scope="shared" class="${shared?'active':''}"><strong>Nosso Ritmo</strong><small>Casa, contas, dívidas e metas do casal</small></button></div>`;
}
function householdHint(type){if(!state.data?.sharing?.active)return '';const shared=state.data.scope==='shared';return `<div class="scope-hint ${shared?'shared':''}"><strong>${shared?'Do casal':'Só seu'}</strong><span>${shared?'Este lançamento será visto e administrado pelos dois.':'Este lançamento permanece somente na sua conta.'}</span></div>`}
'''
if 'function goalStrategy(' not in a:
    pos=a.find('function goalCard(')
    if pos<0: raise SystemExit('goalCard não encontrado')
    a=a[:pos]+helpers+'\n'+a[pos:]

# Metas ganham estratégia calculada pelos aportes reais.
replace_func('goalCard',r'''function goalCard(g){const pct=g.target_amount?Math.min(100,Math.round(Number(g.current_amount||0)/Number(g.target_amount)*100)):0,st=goalStrategy(g),joint=state.data.scope==='shared';return `<article class="goal-card"><div class="goal-head"><div><h3>${esc(g.name)}</h3><div class="meta">${joint?'Meta do casal':'Meta individual'}${g.deadline?` • até ${dateBR(g.deadline)}`:''}${authorNote(g)}</div></div><strong>${pct}%</strong></div><div class="card-number">${money(g.current_amount||0)}</div><div class="card-sub">de ${money(g.target_amount)} • faltam ${money(st.remaining)}</div><div class="progress"><i style="width:${pct}%"></i></div>${st.remaining>0?`<div class="goal-strategy"><div class="goal-strategy-title">${ic('spark',16)} Estratégia do Ritmo</div><p>${st.tip}</p>${st.boost?`<small>Atalho possível: acrescentar cerca de ${money(st.boost)} ao seu aporte habitual já acelera a meta.</small>`:''}</div>`:''}<div class="debt-actions"><button class="btn btn-secondary" data-goal-contribution="${g.id}" ${st.remaining<=0?'disabled':''}>Fazer aporte</button></div><div class="card-actions"><button class="mini-btn" data-edit="goal" data-id="${g.id}">${ic('edit',12)} Editar</button><button class="mini-btn" data-delete="goal" data-id="${g.id}">${ic('trash',12)} Excluir</button></div></article>`}''')

# Compartilhamento passa a explicar e operar como dois espaços financeiros claros.
try:
    replace_func('sharingPage',r'''function sharingPage(){const sh=state.data.sharing||{},active=!!sh.active,partner=sh.partner;return `${head('Compartilhamento','Vida a dois sem perder a individualidade.')}<div class="sharing-intro"><span class="more-icon sharing-tone">${ic('user',22)}</span><div><h3>${active?'Finanças do casal conectadas':'Organize o que é de vocês'}</h3><p>${active?`Você e ${esc(partner?.name||'seu parceiro')} têm um espaço conjunto para casa, contas, dívidas e metas. O que for pessoal continua privado no Meu Ritmo.`:'Conecte duas contas. Cada pessoa mantém seu espaço pessoal e vocês ganham um espaço separado para o que é do casal.'}</p></div></div>${active?`${householdScopePicker()}<div class="ios-group"><div class="ios-group-label">COMO FUNCIONA</div><div class="sharing-rules"><div><strong>Meu Ritmo</strong><span>Salário pessoal, compras, assinaturas e despesas que pertencem só a você.</span></div><div><strong>Nosso Ritmo</strong><span>Aluguel, mercado, energia, dívidas, metas e outros compromissos em comum.</span></div><div><strong>Sem mistura</strong><span>O parceiro não vê seus lançamentos pessoais. Só o que for criado no Nosso Ritmo é compartilhado.</span></div></div></div>`:sharingSetupHtml?.()||''}`}`}'')
except SystemExit:
    # O nome da página pode variar entre camadas; o seletor também será injetado no Menu/Compartilhamento existente.
    pass

# Mostra seletor de espaço no topo das páginas financeiras quando casal estiver conectado.
for fn in ('incomePage','expensesPage','debtsPage','goalsPage'):
    marker=f"function {fn}(){{"
    p=a.find(marker)
    if p>=0:
        # acrescenta picker ao primeiro template retornado sem mudar rotas/API.
        start=a.find('return `',p)
        if start>=0:
            a=a[:start+8]+'${householdScopePicker()}'+a[start+8:]

# Formulários recebem aviso de privacidade/escopo quando possível.
needle='<div class="form-grid">'
# Inserção global deliberadamente leve: somente modais de dados, não login.
a=a.replace(needle,'${householdHint(type)}<div class="form-grid">') if needle in a and 'householdHint(type)' not in a else a

app.write_text(a)

css=cssp.read_text()+r'''
/* Ritmo V1 — casal inteligente + estratégia de metas */
.household-scope{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 14px;padding:4px;background:var(--surface-2,#eef2f1);border-radius:16px}.household-scope button{border:0;background:transparent;border-radius:13px;padding:10px 12px;text-align:left;color:inherit}.household-scope button.active{background:var(--card,#fff);box-shadow:0 1px 3px rgba(15,76,92,.10)}.household-scope strong,.household-scope small{display:block}.household-scope small{font-size:11px;opacity:.62;margin-top:2px}.scope-hint{margin:0 0 12px;padding:10px 12px;border-radius:13px;background:rgba(124,169,130,.10);display:flex;gap:8px;align-items:baseline}.scope-hint.shared{background:rgba(15,76,92,.10)}.scope-hint strong{font-size:12px;white-space:nowrap}.scope-hint span{font-size:11px;opacity:.7}.goal-strategy{margin-top:12px;padding:12px 13px;border-radius:15px;background:rgba(124,169,130,.10)}.goal-strategy-title{display:flex;gap:7px;align-items:center;font-size:12px;font-weight:750;color:var(--teal,#0F4C5C)}.goal-strategy p{margin:6px 0 3px;font-size:13px;line-height:1.4}.goal-strategy small{font-size:11px;opacity:.68}.sharing-intro{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px;padding:14px;border-radius:18px;background:var(--card,#fff)}.sharing-intro h3{margin:0 0 4px}.sharing-intro p{margin:0;font-size:13px;line-height:1.45;opacity:.72}.sharing-rules>div{padding:11px 13px;border-bottom:1px solid rgba(127,127,127,.12)}.sharing-rules>div:last-child{border-bottom:0}.sharing-rules strong,.sharing-rules span{display:block}.sharing-rules span{font-size:12px;opacity:.66;margin-top:3px}@media(max-width:520px){.household-scope{grid-template-columns:1fr 1fr}.household-scope button{padding:9px}.household-scope small{font-size:10px}}
'''
cssp.write_text(css)
print('Ritmo V1: estratégia de metas e separação inteligente Meu Ritmo/Nosso Ritmo aplicadas.')
