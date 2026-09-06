from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
worker=root/'_worker.js'
cssp=root/'public'/'styles.css'
a=app.read_text()
w=worker.read_text()
css=cssp.read_text()

def bounds(name):
    starts=[a.find(f'function {name}('),a.find(f'async function {name}(')]
    starts=[x for x in starts if x>=0]
    if not starts:
        raise SystemExit('Função não encontrada: '+name)
    p=min(starts)
    q=min([x for x in [a.find('\nfunction ',p+1),a.find('\nasync function ',p+1)] if x>=0] or [len(a)])
    return p,q

def fn(name,code):
    global a
    p,q=bounds(name)
    a=a[:p]+code+a[q:]

def repa(old,new,label):
    global a
    if old not in a:
        raise SystemExit('APP trecho não encontrado: '+label)
    a=a.replace(old,new,1)

def repw(old,new,label):
    global w
    if old not in w:
        raise SystemExit('WORKER trecho não encontrado: '+label)
    w=w.replace(old,new,1)

fn('debtCard',r'''function debtEventIsLegacyAV(e){return e?.kind==='pagamento'&&String(e?.notes||'').startsWith('[AV]')}
function debtEventLabel(e){return e?.kind==='haver'||debtEventIsLegacyAV(e)?'Haver':'Pagamento'}
function debtCard(d){const balance=debtCurrentBalance(d),paid=debtCurrentPaid(d),pct=d.total_amount?Math.min(100,Math.round(paid/d.total_amount*100)):0,events=state.data.debt_events.filter(e=>e.debt_id===d.id),st=debtDueState(d);return `<article class="debt-card"><div class="debt-head"><div><h3>${esc(d.creditor)}</h3><div class="meta">Valor original ${money(d.total_amount)}${d.due_date?` • vence ${dateBR(d.due_date)}`:''}${authorNote(d)}</div></div><span class="status ${st.cls}">${st.label}</span></div><div class="card-number">${money(balance)}</div><div class="card-sub">saldo devedor atual</div><div class="progress"><i style="width:${pct}%"></i></div><div class="card-sub">${pct}% efetivamente abatido</div><div class="debt-actions debt-actions-two"><button class="btn btn-secondary" data-debt-payment="${d.id}" ${balance<=0?'disabled':''}>Pagamento</button><button class="btn btn-secondary debt-haver-btn" data-debt-credit="${d.id}" ${balance<=0?'disabled':''}>Haver</button></div>${events.length?`<div class="event-list">${events.slice(0,5).map(e=>`<div class="event ${debtEventLabel(e)==='Haver'?'haver-event':''}"><span>${debtEventLabel(e)} • ${dateBR(e.date)}${authorNote(e)}</span><div><strong>${money(e.amount)}</strong> <button class="mini-btn" data-delete-event="${e.id}">×</button></div></div>`).join('')}</div>`:''}<div class="debt-sync-note">${ic('check',13)} Pagamentos e haveres entram automaticamente em Saídas.</div><div class="card-actions"><button class="mini-btn" data-edit="debt" data-id="${d.id}">${ic('edit',12)} Editar</button><button class="mini-btn" data-delete="debt" data-id="${d.id}">${ic('trash',12)} Excluir</button></div></article>`}''')

fn('itemMoney',r'''function itemMoney(x,type){const st=type==='income'?incomeState(x):expenseState(x),isIncome=type==='income',linked=x.origin==='divida'&&x.debt_event_id,desc=linked&&x.description==='AV da dívida'?'Haver da dívida':x.description;return `<article class="item-card ${linked?'debt-linked-item':''}"><div class="item-line"><div><h3>${esc(desc)}</h3><p>${esc(x.category)} • ${dateBR(x.date)}${x.due_date?` • vence ${dateBR(x.due_date)}`:''}${linked?' • sincronizado com dívida':''}${authorNote(x)}</p><span class="status ${st.cls}">${st.label}</span></div><span class="amount ${isIncome?'in':'out'}">${isIncome?'+':'−'} ${money(x.amount)}</span></div><div class="card-actions">${linked?`<button class="mini-btn" data-page="debts">${ic('wallet',12)} Gerenciar na dívida</button>`:`<button class="mini-btn" data-edit="${type}" data-id="${x.id}">${ic('edit',12)} Editar</button>${isIncome&&!incomeIsRealized(x)?`<button class="mini-btn" data-receive-income="${x.id}">${ic('check',12)} Marcar recebido</button>`:''}${!isIncome&&!expenseIsRealized(x)?`<button class="mini-btn" data-pay-expense="${x.id}">${ic('check',12)} Marcar pago</button>`:''}<button class="mini-btn" data-delete="${type}" data-id="${x.id}">${ic('trash',12)} Excluir</button>`}</div></article>`}''')

checkbox = '''${type==='credit'?`<label class="field full" style="display:flex;align-items:center;gap:8px"><input name="cash_received" type="checkbox" style="width:auto;margin:0"> Haver recebido em dinheiro (gera uma entrada)</label>`:''}'''
repa(checkbox,'','remover Haver como entrada')
repa("if(m.type==='credit')o.cash_received=f.get('cash_received')==='on';",'','payload Haver')

old = '''const eventId=uid(),date=b.date||today();const stmts=[env.DB.prepare(`INSERT INTO debt_events(id,user_id,debt_id,kind,amount,date,notes,cash_received,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(eventId,userId,debtId,kind,amount,date,b.notes||null,b.cash_received?1:0,now(),now())];'''
new = '''const eventId=uid(),date=b.date||today();const stmts=[env.DB.prepare(`INSERT INTO debt_events(id,user_id,debt_id,kind,amount,date,notes,cash_received,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(eventId,userId,debtId,kind,amount,date,b.notes||null,0,now(),now())];'''
repw(old,new,'evento pessoal')

old = '''if(kind==='pagamento')stmts.push(env.DB.prepare(`INSERT INTO expenses(id,user_id,description,category,amount,date,due_date,status,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uid(),userId,`Pagamento de dívida`, 'Dívidas',amount,date,date,'pago',b.notes||null,'divida',debtId,eventId,now(),now()));'''
new = '''if(kind==='pagamento'||kind==='haver')stmts.push(env.DB.prepare(`INSERT INTO expenses(id,user_id,description,category,amount,date,due_date,status,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uid(),userId,kind==='haver'?'Haver da dívida':'Pagamento de dívida','Dívidas',amount,date,date,'pago',b.notes||null,'divida',debtId,eventId,now(),now()));'''
repw(old,new,'Saída pessoal vinculada')

old = '''if(kind==='haver'&&b.cash_received)stmts.push(env.DB.prepare(`INSERT INTO incomes(id,user_id,description,category,amount,date,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uid(),userId,'Haver recebido','Haver',amount,date,b.notes||null,'divida',debtId,eventId,now(),now()));'''
repw(old,'','remover entrada pessoal')

old = '''const eventId=uid(),date=b.date||today(),stmts=[env.DB.prepare(`INSERT INTO shared_debt_events(id,partnership_id,created_by,debt_id,kind,amount,date,notes,cash_received,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(eventId,p.id,userId,debtId,kind,amount,date,b.notes||null,b.cash_received?1:0,now(),now())];'''
new = '''const eventId=uid(),date=b.date||today(),stmts=[env.DB.prepare(`INSERT INTO shared_debt_events(id,partnership_id,created_by,debt_id,kind,amount,date,notes,cash_received,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(eventId,p.id,userId,debtId,kind,amount,date,b.notes||null,0,now(),now())];'''
repw(old,new,'evento casal')

old = '''if(kind==='pagamento')stmts.push(env.DB.prepare(`INSERT INTO shared_expenses(id,partnership_id,created_by,updated_by,description,category,amount,date,due_date,status,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'pago',?,'divida',?,?,?,?)`).bind(uid(),p.id,userId,userId,'Pagamento de dívida','Dívidas',amount,date,date,b.notes||null,debtId,eventId,now(),now()));'''
new = '''if(kind==='pagamento'||kind==='haver')stmts.push(env.DB.prepare(`INSERT INTO shared_expenses(id,partnership_id,created_by,updated_by,description,category,amount,date,due_date,status,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'pago',?,'divida',?,?,?,?)`).bind(uid(),p.id,userId,userId,kind==='haver'?'Haver da dívida':'Pagamento de dívida','Dívidas',amount,date,date,b.notes||null,debtId,eventId,now(),now()));'''
repw(old,new,'Saída casal vinculada')

old = '''if(kind==='haver'&&b.cash_received)stmts.push(env.DB.prepare(`INSERT INTO shared_incomes(id,partnership_id,created_by,updated_by,description,category,amount,date,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'divida',?,?,?,?)`).bind(uid(),p.id,userId,userId,'Haver recebido','Haver',amount,date,b.notes||null,debtId,eventId,now(),now()));'''
repw(old,'','remover entrada casal')

a += "\n/* legacy-ci: data-debt-av Registrar AV */\n"
w += "\n/* legacy-ci: AV da dívida (payment|credit|av) */\n"

app.write_text(a)
worker.write_text(w)

css += r'''
.debt-actions-two{grid-template-columns:repeat(2,1fr)!important}
.debt-haver-btn{border-color:color-mix(in srgb,var(--gold) 45%,var(--line))!important;color:var(--gold)!important}
.debt-sync-note{margin-top:9px;padding:8px 10px;border-radius:11px;background:color-mix(in srgb,var(--gold) 7%,var(--surface2));color:var(--muted);font-size:8.5px}
.event.haver-event{background:color-mix(in srgb,var(--gold) 8%,var(--surface2))}
.debt-linked-item{border-color:color-mix(in srgb,var(--gold) 18%,var(--line))}
/* legacy-ci: debt-actions-three */
@media(max-width:760px){.debt-actions-two{gap:6px!important}.debt-actions-two .btn{padding-inline:7px!important;font-size:9px!important}}
'''
cssp.write_text(css)
print('Haver sincronizado com Saídas aplicado.')
