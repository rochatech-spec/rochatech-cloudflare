from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
worker=root/'_worker.js'
cssp=root/'public'/'styles.css'
a=app.read_text(); w=worker.read_text()


def bounds(text,name):
    starts=[text.find(f'function {name}('),text.find(f'async function {name}(')]
    starts=[x for x in starts if x>=0]
    if not starts: raise SystemExit(f'Função não encontrada: {name}')
    p=min(starts); ends=[]
    for token in ['\nfunction ','\nasync function ']:
        q=text.find(token,p+1)
        if q>p: ends.append(q)
    return p,(min(ends) if ends else len(text))

def replace_func(name,code):
    global a
    p,q=bounds(a,name); a=a[:p]+code+a[q:]

# -----------------------------------------------------------------------------
# Dívidas: AV/abatimento usa a mesma trilha contábil de pagamento, portanto
# reduz dívida e cria Saída vinculada. Mantém exclusão sincronizada já existente.
# -----------------------------------------------------------------------------
count=w.count("'Pagamento de dívida'")
if count<1:
    raise SystemExit('Descrição de pagamento de dívida não encontrada no worker')
w=w.replace("'Pagamento de dívida'","(String(b.notes||'').startsWith('[AV]')?'AV / abatimento de dívida':'Pagamento de dívida')")
worker.write_text(w)

# -----------------------------------------------------------------------------
# Desbloqueio: mantém a segurança, mas remove explicações técnicas da interface.
# -----------------------------------------------------------------------------
replace_func('showLock',r'''async function showLock(reason='timeout'){
  if(!state.data)return;
  clearTimeout(ritmoLockTimer);state.modal=null;state.profilePop=false;
  const enabled=Number(state.data.security?.webauthn_count||0)>0,p=state.data.profile,first=String(p.name||'').trim().split(/\s+/)[0]||'você';
  root.innerHTML=`<section class="secure-lock premium-lock premium-lock-simple" id="secureLock">
    <div class="premium-lock-inner">
      <div class="premium-lock-brand">${brand()}</div>
      <div class="premium-lock-avatar">${avatarMarkup('premium-lock-avatar-img')}</div>
      <div class="premium-lock-copy simple-copy"><h2>Ritmo bloqueado</h2><p>${esc(first)}, desbloqueie para continuar.</p></div>
      ${enabled?`<button class="btn btn-primary premium-unlock-btn" id="unlockBtn">${ic('shield',18)} Desbloquear</button><button class="premium-password-toggle" id="showPasswordUnlock" type="button">Usar senha</button>`:''}
      <form id="lockPasswordForm" class="premium-password-form ${enabled?'is-collapsed':''}">
        <label class="premium-password-field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="Sua senha"></label>
        <button class="btn ${enabled?'btn-secondary':'btn-primary'}" type="submit">Desbloquear</button>
      </form>
      <button class="premium-other-account" id="lockLogout" type="button">Trocar conta</button>
    </div>
  </section>`;
  $('#unlockBtn')?.addEventListener('click',unlockBio);
  $('#showPasswordUnlock')?.addEventListener('click',()=>{const f=$('#lockPasswordForm');if(!f)return;f.classList.remove('is-collapsed');$('#showPasswordUnlock')?.remove();setTimeout(()=>f.querySelector('input')?.focus(),80)});
  $('#lockPasswordForm')?.addEventListener('submit',unlockPassword);
  $('#lockLogout')?.addEventListener('click',logout)
}
''')

# -----------------------------------------------------------------------------
# Estratégia de metas: calcula ritmo real, valor mensal necessário e aceleração.
# -----------------------------------------------------------------------------
goal_helpers=r'''function goalMonthIndex(iso){if(!iso)return null;const [y,m]=String(iso).slice(0,7).split('-').map(Number);return Number.isFinite(y)&&Number.isFinite(m)?y*12+(m-1):null}
function goalRealizedContribs(g){return (state.data.goal_contributions||[]).filter(c=>c.goal_id===g.id&&(!c.date||c.date<=financeToday()))}
function goalRealizedAmount(g){const rows=goalRealizedContribs(g);return rows.length?rows.reduce((s,c)=>s+Number(c.amount||0),0):Number(g.current_amount||0)}
function goalStrategy(g){const target=Number(g.target_amount||0),current=Math.min(target,goalRealizedAmount(g)),remaining=Math.max(0,target-current),rows=goalRealizedContribs(g).slice().sort((x,y)=>String(x.date||'').localeCompare(String(y.date||'')));if(remaining<=0)return {done:true,title:'Meta alcançada',summary:'Você chegou ao objetivo. Agora escolha o próximo passo sem perder o ritmo.',tips:['Mantenha o hábito de reservar uma parte do que entra.']};const nowIdx=goalMonthIndex(financeToday()),firstIdx=rows.length?goalMonthIndex(rows[0].date):null,elapsed=firstIdx==null?0:Math.max(1,nowIdx-firstIdx+1),totalRows=rows.reduce((s,c)=>s+Number(c.amount||0),0),avg=elapsed?totalRows/elapsed:0;let deadlineMonths=null,required=null,deadlinePast=false;if(g.deadline){const endIdx=goalMonthIndex(g.deadline);if(endIdx!=null){deadlinePast=String(g.deadline)<financeToday();deadlineMonths=Math.max(1,endIdx-nowIdx+1);required=remaining/deadlineMonths}}const forecastMonths=avg>0?Math.ceil(remaining/avg):null,base=avg>0?avg:(required&&required>0?required:Math.max(remaining/12,1)),boost=base*1.10,boostMonths=Math.ceil(remaining/boost),tips=[];if(!rows.length)tips.push(`Comece com um aporte recorrente de ${money(base)} por mês. O mais importante agora é criar constância.`);else tips.push(`Seu ritmo médio está em ${money(avg)} por mês${forecastMonths?` — mantendo assim, faltam cerca de ${forecastMonths} mês(es).`:''}`);if(deadlinePast)tips.push('O prazo da meta já passou. Ajuste a data para o Ritmo montar um plano possível.');else if(required){const weekly=required/4.33;if(avg&&avg>=required)tips.push(`Você está no ritmo para o prazo. Tente manter pelo menos ${money(required)} por mês.`);else tips.push(`Para chegar até ${dateBR(g.deadline)}, mire em ${money(required)} por mês — aproximadamente ${money(weekly)} por semana.`)}if(avg>0){const gain=Math.max(0,(forecastMonths||0)-boostMonths);tips.push(`Se conseguir elevar o aporte em 10% para ${money(boost)}, ${gain>0?`você pode encurtar o caminho em cerca de ${gain} mês(es).`:'você cria uma margem de segurança para meses mais apertados.'}`)}else if(required)tips.push('Programe o aporte logo após a principal entrada do mês para reduzir a chance de gastar esse valor antes.');return {done:false,title:'Estratégia do Ritmo',summary:state.data.scope==='shared'?'O plano considera os aportes realizados pelos dois.':'O plano se ajusta aos seus aportes realizados.',tips:tips.slice(0,3)}}
function goalStrategyHtml(g){const s=goalStrategy(g);return `<div class="goal-strategy ${s.done?'done':''}"><div class="goal-strategy-head"><span>${ic(s.done?'check':'spark',16)}</span><div><strong>${s.title}</strong><small>${s.summary}</small></div></div><div class="goal-strategy-tips">${s.tips.map((t,i)=>`<div><b>${i+1}</b><span>${t}</span></div>`).join('')}</div></div>`}
'''
# Insere antes do goalCard atual.
p,_=bounds(a,'goalCard')
a=a[:p]+goal_helpers+'\n'+a[p:]

replace_func('goalCard',r'''function goalCard(g){const current=goalRealizedAmount(g),pct=Math.min(100,Math.round((current/g.target_amount)*100||0)),joint=state.data.scope==='shared',contribs=(state.data.goal_contributions||[]).filter(c=>c.goal_id===g.id&&(!c.date||c.date<=financeToday()));return `<article class="goal-card"><div class="goal-head"><div><div class="goal-scope-badge ${joint?'joint':'solo'}">${joint?`${ic('users',12)} Juntos`:`${ic('user',12)} Individual`}</div><h3>${esc(g.name)}</h3><div class="meta">${esc(g.category)}${g.deadline?` • até ${dateBR(g.deadline)}`:''}${authorNote(g)}</div></div><span class="status ${pct>=100?'paid':'pending'}">${pct}%</span></div><div class="card-number">${money(current)}</div><div class="card-sub">de ${money(g.target_amount)}</div><div class="progress"><i style="width:${pct}%"></i></div>${goalStrategyHtml(g)}${joint&&contribs.length?`<div class="goal-contribs">${contribs.slice().reverse().slice(0,4).map(c=>`<div><span><b>${esc((c.user_name||'Parceiro').split(' ')[0])}</b> • ${dateBR(c.date)}</span><strong>+ ${money(c.amount)}</strong></div>`).join('')}</div>`:''}<div class="debt-actions"><button class="btn btn-secondary" data-goal-add="${g.id}">Adicionar valor</button><button class="btn btn-secondary" data-edit="goal" data-id="${g.id}">Editar</button></div><div class="card-actions"><button class="mini-btn" data-delete="goal" data-id="${g.id}">${ic('trash',12)} Excluir meta</button></div></article>`}
''')

# -----------------------------------------------------------------------------
# Dívidas: renomeia a ação e trata AV como pagamento vinculado a Saídas.
# -----------------------------------------------------------------------------
replace_func('debtCard',r'''function debtCard(d){const balance=debtCurrentBalance(d),paid=debtCurrentPaid(d),pct=d.total_amount?Math.min(100,Math.round(paid/d.total_amount*100)):0,events=(state.data.debt_events||[]).filter(e=>e.debt_id===d.id),st=debtDueState(d);return `<article class="debt-card"><div class="debt-head"><div><h3>${esc(d.creditor)}</h3><div class="meta">Valor original ${money(d.total_amount)}${d.due_date?` • vence ${dateBR(d.due_date)}`:''}${authorNote(d)}</div></div><span class="status ${st.cls}">${st.label}</span></div><div class="card-number">${money(balance)}</div><div class="card-sub">saldo devedor atual</div><div class="progress"><i style="width:${pct}%"></i></div><div class="card-sub">${pct}% efetivamente abatido</div><div class="debt-actions"><button class="btn btn-secondary" data-debt-payment="${d.id}" ${balance<=0?'disabled':''}>Pagamento</button><button class="btn btn-secondary av-btn" data-debt-credit="${d.id}" ${balance<=0?'disabled':''}>AV / Abatimento</button></div>${events.length?`<div class="event-list">${events.slice(0,5).map(e=>{const av=e.kind==='haver'||String(e.notes||'').startsWith('[AV]');return `<div class="event ${e.date>financeToday()?'future-event':''}"><span>${av?'AV / Abatimento':'Pagamento'} • ${dateBR(e.date)}${e.date>financeToday()?' • futuro':''}${authorNote(e)}</span><div><strong>${money(e.amount)}</strong> <button class="mini-btn" data-delete-event="${e.id}">×</button></div></div>`}).join('')}</div>`:''}<div class="card-actions"><button class="mini-btn" data-edit="debt" data-id="${d.id}">${ic('edit',12)} Editar</button><button class="mini-btn" data-delete="debt" data-id="${d.id}">${ic('trash',12)} Excluir</button></div></article>`}
''')

# -----------------------------------------------------------------------------
# Modal inteligente: escolhe Pessoal/Casal ao criar e simplifica AV.
# -----------------------------------------------------------------------------
p,q=bounds(a,'modalHtml')
seg=a[p:q]
if seg.startswith('function modalHtml('): seg=seg.replace('function modalHtml(','function ritmoModalHtmlCore(',1)
elif seg.startswith('async function modalHtml('): seg=seg.replace('async function modalHtml(','async function ritmoModalHtmlCore(',1)
else: raise SystemExit('Assinatura modalHtml não reconhecida')
wrapper=r'''
function modalHtml(){let html=ritmoModalHtmlCore(),m=state.modal||{};if(m.type==='credit'){html=html.replace(/Haver/gi,'AV / Abatimento').replace(/Crédito/gi,'Abatimento');html=html.replace(/<label[^>]*>[\s\S]*?name=["']cash_received["'][\s\S]*?<\/label>/i,'')}if(sharedActive()&&['income','expense','debt'].includes(m.type)){const shared=state.data.scope==='shared',scopeBlock=m.item?`<div class="couple-item-scope readonly full"><span>${shared?ic('users',17):ic('user',17)}</span><div><strong>${shared?'Conta do casal':'Conta pessoal'}</strong><small>${shared?'Visível e administrada pelos dois.':'Visível somente para você.'}</small></div></div>`:`<label class="field full couple-scope-field">Onde este lançamento fica?<select name="item_scope"><option value="personal" ${!shared?'selected':''}>Meu Ritmo — pessoal</option><option value="shared" ${shared?'selected':''}>Nosso Ritmo — casal</option></select><small>Contas da casa ficam no Nosso Ritmo. Gastos pessoais ficam só no Meu Ritmo.</small></label>`;html=html.replace('<div class="form-grid action-sheet-body">',`<div class="form-grid action-sheet-body">${scopeBlock}`)}return html}
'''
a=a[:p]+seg+wrapper+a[q:]

replace_func('submitData',r'''async function submitData(e){e.preventDefault();const f=new FormData(e.currentTarget),o=Object.fromEntries(f.entries()),m=state.modal;for(const k of ['amount','total_amount','target_amount'])if(k in o)o[k]=Number(o[k]);let targetScope=state.data.scope;const chosen=o.item_scope||o.goal_scope;if(!m.item&&chosen)targetScope=chosen==='shared'?'shared':'personal';delete o.item_scope;delete o.goal_scope;const prefix=scopePrefix(targetScope);let path='',method='POST';if(['income','expense','debt','goal'].includes(m.type)){const plural={income:'incomes',expense:'expenses',debt:'debts',goal:'goals'}[m.type];path=`${prefix}/${plural}${m.item?`/${m.item.id}`:''}`;method=m.item?'PATCH':'POST'}else if(m.type==='payment')path=`${scopePrefix()}/debts/${m.debtId}/payment`;else if(m.type==='credit'){path=`${scopePrefix()}/debts/${m.debtId}/payment`;o.notes=`[AV]${o.notes?` ${o.notes}`:''}`}else if(m.type==='contribution')path=`${scopePrefix()}/goals/${m.goalId}/contributions`;try{await api(path,{method,body:JSON.stringify(o)});if(!m.item&&['income','expense','debt','goal'].includes(m.type)&&targetScope!==state.data.scope)await api('/api/sharing/scope',{method:'POST',body:JSON.stringify({scope:targetScope})});state.data=await api('/api/bootstrap');state.modal=null;renderApp(false);toast(m.type==='credit'?'AV registrado e sincronizado com Saídas.':targetScope==='shared'?'Atualizado no Nosso Ritmo.':'Atualizado no seu Ritmo.')}catch(err){toast(err.message)}}
''')

# -----------------------------------------------------------------------------
# Compartilhamento: linguagem doméstica e ações rápidas para casal.
# -----------------------------------------------------------------------------
replace_func('scopeSwitcher',r'''function scopeSwitcher(){if(!sharedActive()||!['home','income','expenses','debts','goals','calendar','insights'].includes(state.page))return '';return `<div class="scope-bar smart-scope-bar"><div class="scope-copy"><span>${state.data.scope==='shared'?ic('users',15):ic('user',15)}</span><div><strong>${state.data.scope==='shared'?'Nosso Ritmo':'Meu Ritmo'}</strong><small>${state.data.scope==='shared'?'Contas e planos do casal':'Suas despesas e planos pessoais'}</small></div></div><div class="scope-seg"><button type="button" data-scope="personal" class="${state.data.scope==='personal'?'active':''}">Meu</button><button type="button" data-scope="shared" class="${state.data.scope==='shared'?'active':''}">Nosso</button></div></div>`}
''')

replace_func('sharingPage',r'''function sharingPage(){const sh=state.data.sharing||{},me=state.data.profile;if(sh.active){const partner=sh.partner||{};return `${head('Compartilhamento','O que é pessoal continua pessoal. O que é da casa vocês cuidam juntos.')}<div class="sharing-hero panel couple-smart-hero"><div class="couple-avatars"><span>${initials(me.name)}</span><i>${ic('users',18)}</i><span>${initials(partner.name)}</span></div><h2>${esc(me.name.split(' ')[0])} & ${esc((partner.name||'Parceiro').split(' ')[0])}</h2><p>Use o <strong>Meu Ritmo</strong> para gastos individuais e o <strong>Nosso Ritmo</strong> para contas da casa, dívidas e objetivos que pertencem aos dois.</p></div><div class="couple-space-grid"><button class="couple-space-card personal ${state.data.scope==='personal'?'active':''}" data-scope="personal"><span>${ic('user',21)}</span><div><strong>Meu Ritmo</strong><small>Despesas pessoais, metas individuais e sua organização.</small></div>${ic('chev',16)}</button><button class="couple-space-card shared ${state.data.scope==='shared'?'active':''}" data-scope="shared"><span>${ic('users',21)}</span><div><strong>Nosso Ritmo</strong><small>Contas da casa, dívidas em comum e metas do casal.</small></div>${ic('chev',16)}</button></div><section class="couple-quick panel"><div class="panel-title"><div><h3>Organizar a vida a dois</h3><small>Abra direto o que vocês querem cuidar juntos.</small></div></div><div class="couple-quick-actions"><button type="button" data-couple-page="expenses">${ic('wallet',18)}<span><strong>Contas da casa</strong><small>Água, energia, aluguel, compras e outras saídas comuns.</small></span></button><button type="button" data-couple-page="debts">${ic('wallet',18)}<span><strong>Dívidas em comum</strong><small>Acompanhem saldo, pagamentos e abatimentos juntos.</small></span></button><button type="button" data-couple-page="goals">${ic('target',18)}<span><strong>Metas juntos</strong><small>Casa, viagem, reserva e outros objetivos do casal.</small></span></button></div></section>`}const incoming=sh.incoming_invites||[],outgoing=sh.outgoing_invites||[];return `${head('Compartilhamento','Crie um espaço para as finanças que vocês têm em comum.')}<div class="sharing-grid setup"><div class="panel share-setup-card"><span class="sharing-big-icon">${ic('users',28)}</span><h2>Ritmo a dois</h2><p>Cada pessoa mantém suas despesas pessoais separadas e vocês ganham um espaço só para o que é do casal.</p><form id="shareInviteForm"><label class="field">Usuário do parceiro<input name="username" autocomplete="off" placeholder="Ex.: maria.silva" required minlength="3"></label><button class="btn btn-primary" type="submit">Convidar</button></form></div><div class="panel"><div class="panel-title"><div><h3>Tenho um código</h3><small>Use o código recebido do seu parceiro.</small></div></div><form id="shareCodeForm" class="share-code-form"><input name="code" maxlength="10" placeholder="CÓDIGO" autocomplete="off" required><button class="btn btn-secondary" type="submit">Conectar</button></form></div></div>${incoming.length?`<section class="share-list"><h3>Convites recebidos</h3>${incoming.map(i=>`<article class="share-invite"><span class="mini-avatar">${initials(i.inviter_name)}</span><div><strong>${esc(i.inviter_name)}</strong><small>@${esc(i.inviter_username)} quer criar um Ritmo a dois com você.</small></div><div class="invite-actions"><button class="btn btn-primary" data-share-accept="${i.id}">Aceitar</button><button class="mini-btn" data-share-decline="${i.id}">Recusar</button></div></article>`).join('')}</section>`:''}${outgoing.length?`<section class="share-list"><h3>Convite enviado</h3>${outgoing.map(i=>`<article class="share-invite code"><span class="mini-avatar">${initials(i.invitee_name)}</span><div><strong>${esc(i.invitee_name)}</strong><small>@${esc(i.invitee_username)}</small><button class="invite-code" data-copy-code="${esc(i.code)}">${esc(i.code)} ⧉</button></div><button class="mini-btn" data-share-cancel="${i.id}">Cancelar</button></article>`).join('')}</section>`:''}`}
''')

# Ação rápida do casal: troca para Nosso Ritmo e abre a área pedida.
a += r'''\nasync function ritmoOpenCouplePage(page){try{if(state.data?.scope!=='shared'){await api('/api/sharing/scope',{method:'POST',body:JSON.stringify({scope:'shared'})});state.data=await api('/api/bootstrap')}state.page=page;state.modal=null;renderApp()}catch(e){toast(e.message)}}\ndocument.addEventListener('click',e=>{const b=e.target.closest?.('[data-couple-page]');if(!b)return;e.preventDefault();ritmoOpenCouplePage(b.dataset.couplePage)});\n'''

app.write_text(a)

css=cssp.read_text()+r'''

/* Ritmo V1 — coaching de metas, casal inteligente e AV */
.premium-lock-simple .premium-lock-inner{gap:13px}.premium-lock-simple .premium-lock-brand{opacity:.96;margin-bottom:4px}.premium-lock-simple .simple-copy{margin:0 0 6px}.premium-lock-simple .simple-copy h2{font-size:23px}.premium-lock-simple .simple-copy p{font-size:11px}.premium-lock-simple .premium-other-account{font-size:10px;margin-top:0}.premium-lock-simple .premium-unlock-btn{max-width:330px}
.goal-strategy{margin:13px 0 2px;padding:12px;border:1px solid color-mix(in srgb,var(--sage) 25%,var(--line));border-radius:16px;background:color-mix(in srgb,var(--sage) 7%,var(--surface2))}.goal-strategy.done{border-color:color-mix(in srgb,var(--green) 24%,var(--line));background:color-mix(in srgb,var(--green) 6%,var(--surface2))}.goal-strategy-head{display:flex;align-items:flex-start;gap:9px}.goal-strategy-head>span{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto;background:color-mix(in srgb,var(--sage) 18%,var(--surface-solid));color:var(--primary)}.goal-strategy-head strong{display:block;font-size:10.5px}.goal-strategy-head small{display:block;color:var(--muted);font-size:8.5px;line-height:1.4;margin-top:2px}.goal-strategy-tips{display:grid;gap:7px;margin-top:10px}.goal-strategy-tips>div{display:grid;grid-template-columns:22px 1fr;gap:7px;align-items:start}.goal-strategy-tips b{width:22px;height:22px;border-radius:8px;display:grid;place-items:center;background:var(--surface-solid);border:1px solid var(--line);font-size:8px;color:var(--primary)}.goal-strategy-tips span{font-size:9px;line-height:1.45;color:var(--text)}
.av-btn{border-color:color-mix(in srgb,var(--gold) 34%,var(--line))!important;background:color-mix(in srgb,var(--gold) 8%,var(--surface-solid))!important}.couple-scope-field small{display:block;color:var(--muted);font-size:8px;line-height:1.4;margin-top:5px}.couple-item-scope{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:14px;background:color-mix(in srgb,var(--sage) 7%,var(--surface2));border:1px solid color-mix(in srgb,var(--sage) 20%,var(--line))}.couple-item-scope>span{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:var(--primary);background:var(--surface-solid)}.couple-item-scope strong{display:block;font-size:10px}.couple-item-scope small{display:block;font-size:8px;color:var(--muted);margin-top:2px}
.couple-smart-hero{max-width:760px;padding:24px}.couple-smart-hero h2{margin:7px 0 6px}.couple-space-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:900px;margin:12px auto}.couple-space-card{border:1px solid var(--line);border-radius:18px;background:var(--surface-solid);padding:14px;display:grid;grid-template-columns:42px 1fr 16px;gap:10px;align-items:center;text-align:left}.couple-space-card>span{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:var(--surface2);color:var(--primary)}.couple-space-card strong{display:block;font-size:11px}.couple-space-card small{display:block;color:var(--muted);font-size:8.5px;line-height:1.4;margin-top:3px}.couple-space-card.active{border-color:color-mix(in srgb,var(--primary) 35%,var(--line));background:color-mix(in srgb,var(--primary) 5%,var(--surface-solid))}.couple-quick{max-width:900px;margin:12px auto}.couple-quick-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.couple-quick-actions button{border:1px solid var(--line);background:var(--surface2);border-radius:15px;padding:12px;display:flex;gap:9px;align-items:flex-start;text-align:left;color:var(--text)}.couple-quick-actions button>svg{color:var(--primary);flex:0 0 auto;margin-top:1px}.couple-quick-actions strong{display:block;font-size:10px}.couple-quick-actions small{display:block;font-size:8px;color:var(--muted);line-height:1.4;margin-top:2px}.smart-scope-bar{transition:transform .25s ease,opacity .2s ease}
@media(max-width:760px){.goal-strategy{padding:11px;margin-top:11px}.couple-space-grid{grid-template-columns:1fr}.couple-quick-actions{grid-template-columns:1fr}.couple-smart-hero{padding:20px 16px}.premium-lock-simple .premium-lock-inner{justify-content:center}.premium-lock-simple .premium-lock-brand{transform:scale(.84)}}
'''
cssp.write_text(css)
print('Ritmo V1: metas estratégicas, AV sincronizado, casal inteligente e desbloqueio minimalista aplicados.')
