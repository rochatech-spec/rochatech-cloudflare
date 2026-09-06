from pathlib import Path
import sys

root=Path(sys.argv[1])
worker=root/'_worker.js'
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'
schema=root/'schema.sql'

# -----------------------------------------------------------------------------
# Banco: dados pessoais permanecem intactos; compartilhados vivem em tabelas
# próprias para evitar qualquer mistura ou migração destrutiva do histórico.
# -----------------------------------------------------------------------------
sql=schema.read_text()
sharing_sql=r'''

-- Ritmo a dois: vínculo seguro entre exatamente duas contas.
CREATE TABLE IF NOT EXISTS partnerships (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partnership_members (
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(partnership_id,user_id),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_partnership_member_user ON partnership_members(user_id);

CREATE TABLE IF NOT EXISTS partnership_invites (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partnership_invitee ON partnership_invites(invitee_user_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_partnership_outgoing ON partnership_invites(partnership_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS user_workspace_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  view_scope TEXT NOT NULL DEFAULT 'personal' CHECK(view_scope IN ('personal','shared')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shared_incomes (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  amount INTEGER NOT NULL CHECK(amount >= 0),
  date TEXT NOT NULL,
  notes TEXT,
  recurrence TEXT NOT NULL DEFAULT 'Nenhuma',
  origin TEXT NOT NULL DEFAULT 'manual',
  debt_id TEXT,
  debt_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_incomes_date ON shared_incomes(partnership_id,date DESC);

CREATE TABLE IF NOT EXISTS shared_expenses (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  amount INTEGER NOT NULL CHECK(amount >= 0),
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','pago')),
  notes TEXT,
  recurrence TEXT NOT NULL DEFAULT 'Nenhuma',
  origin TEXT NOT NULL DEFAULT 'manual',
  debt_id TEXT,
  debt_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_date ON shared_expenses(partnership_id,date DESC);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_due ON shared_expenses(partnership_id,due_date);

CREATE TABLE IF NOT EXISTS shared_debts (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  creditor TEXT NOT NULL,
  total_amount INTEGER NOT NULL CHECK(total_amount >= 0),
  start_date TEXT NOT NULL,
  due_date TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK(status IN ('ativa','quitada')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_debts ON shared_debts(partnership_id,created_at DESC);

CREATE TABLE IF NOT EXISTS shared_debt_events (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  debt_id TEXT NOT NULL REFERENCES shared_debts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('pagamento','haver')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL,
  notes TEXT,
  cash_received INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_debt_events ON shared_debt_events(partnership_id,debt_id,date DESC);

CREATE TABLE IF NOT EXISTS shared_goals (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL CHECK(target_amount > 0),
  deadline TEXT,
  category TEXT NOT NULL DEFAULT 'Personalizado',
  is_emergency INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_goals ON shared_goals(partnership_id,created_at DESC);

CREATE TABLE IF NOT EXISTS shared_goal_contributions (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  goal_id TEXT NOT NULL REFERENCES shared_goals(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_goal_contrib ON shared_goal_contributions(partnership_id,goal_id,date DESC);
'''
if 'CREATE TABLE IF NOT EXISTS partnerships (' not in sql:
    sql += sharing_sql
schema.write_text(sql)

# -----------------------------------------------------------------------------
# Backend
# -----------------------------------------------------------------------------
s=worker.read_text()

def rep(old,new,label,count=1):
    global s
    if old not in s:
        raise SystemExit('WORKER trecho não encontrado: '+label)
    s=s.replace(old,new,count)

def replace_func(name,next_name,new_code):
    global s
    a=s.find('async function '+name+'(')
    if a<0: a=s.find('function '+name+'(')
    b=s.find('\nasync function '+next_name+'(',a)
    if b<0: b=s.find('\nfunction '+next_name+'(',a)
    if a<0 or b<0:
        raise SystemExit(f'WORKER função não encontrada: {name}->{next_name}')
    s=s[:a]+new_code+s[b:]

helpers=r'''
function inviteCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=crypto.getRandomValues(new Uint8Array(10));return [...r].map(x=>chars[x%chars.length]).join('')}
async function partnershipState(env,userId){const member=await env.DB.prepare(`SELECT partnership_id FROM partnership_members WHERE user_id=?`).bind(userId).first();if(!member)return {id:null,members:[],active:false};const rows=await env.DB.prepare(`SELECT pm.user_id,pm.role,pm.joined_at,u.name,u.username FROM partnership_members pm JOIN users u ON u.id=pm.user_id WHERE pm.partnership_id=? ORDER BY pm.joined_at`).bind(member.partnership_id).all();const members=rows.results||[];return {id:member.partnership_id,members,active:members.length===2}}
async function activePartnership(env,userId){const p=await partnershipState(env,userId);return p.active?p:null}
async function touchUsers(env,userIds){const ids=[...new Set((userIds||[]).filter(Boolean))];if(!ids.length)return;await env.DB.batch(ids.map(id=>env.DB.prepare(`UPDATE users SET data_version=data_version+1,updated_at=? WHERE id=?`).bind(now(),id)))}
async function bumpPartnership(env,partnershipId,actorUserId,action='update',entityType='shared',entityId=null){const rows=await env.DB.prepare(`SELECT user_id FROM partnership_members WHERE partnership_id=?`).bind(partnershipId).all();const ids=(rows.results||[]).map(x=>x.user_id);const stmts=ids.map(id=>env.DB.prepare(`UPDATE users SET data_version=data_version+1,updated_at=? WHERE id=?`).bind(now(),id));stmts.push(env.DB.prepare(`INSERT INTO audit_log(id,user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?,?)`).bind(uid(),actorUserId,action,entityType,entityId,now()));await env.DB.batch(stmts)}
async function sharedDebtBalance(env,partnershipId,debtId){const d=await env.DB.prepare(`SELECT total_amount,status FROM shared_debts WHERE id=? AND partnership_id=?`).bind(debtId,partnershipId).first();if(!d)return null;const x=await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) paid FROM shared_debt_events WHERE debt_id=? AND partnership_id=?`).bind(debtId,partnershipId).first();return {total:Number(d.total_amount),paid:Number(x?.paid||0),balance:Math.max(0,Number(d.total_amount)-Number(x?.paid||0)),status:d.status}}
async function normalizeSharedDebtStatus(env,partnershipId,debtId){const b=await sharedDebtBalance(env,partnershipId,debtId);if(!b)return;await env.DB.prepare(`UPDATE shared_debts SET status=?,updated_at=? WHERE id=? AND partnership_id=?`).bind(b.balance<=0?'quitada':'ativa',now(),debtId,partnershipId).run()}
'''
rep('async function debtBalance(env,userId,debtId){',helpers+'\nasync function debtBalance(env,userId,debtId){','helpers compartilhamento')

bootstrap=r'''async function bootstrap(env,userId){
  const sharing=await partnershipState(env,userId);
  const [profile,settings,mobileSettings,workspace,webauthn,incoming,outgoing]=await Promise.all([
    env.DB.prepare(`SELECT id,username,name,avatar_key,data_version,created_at FROM users WHERE id=?`).bind(userId).first(),
    env.DB.prepare(`SELECT theme,notifications_enabled,notify_due,notify_overdue,notify_goals,reminder_days,monthly_summary,auto_lock_minutes FROM user_settings WHERE user_id=?`).bind(userId).first(),
    env.DB.prepare(`SELECT mobile_shortcuts,seen_notifications FROM user_mobile_settings WHERE user_id=?`).bind(userId).first(),
    env.DB.prepare(`SELECT view_scope FROM user_workspace_settings WHERE user_id=?`).bind(userId).first(),
    env.DB.prepare(`SELECT COUNT(*) count FROM webauthn_credentials WHERE user_id=?`).bind(userId).first(),
    env.DB.prepare(`SELECT i.id,i.partnership_id,i.inviter_user_id,i.code,i.expires_at,i.created_at,u.name inviter_name,u.username inviter_username FROM partnership_invites i JOIN users u ON u.id=i.inviter_user_id WHERE i.invitee_user_id=? AND i.status='pending' AND i.expires_at>? ORDER BY i.created_at DESC`).bind(userId,now()).all(),
    sharing.id?env.DB.prepare(`SELECT i.id,i.invitee_user_id,i.code,i.expires_at,i.created_at,u.name invitee_name,u.username invitee_username FROM partnership_invites i JOIN users u ON u.id=i.invitee_user_id WHERE i.partnership_id=? AND i.status='pending' AND i.expires_at>? ORDER BY i.created_at DESC`).bind(sharing.id,now()).all():Promise.resolve({results:[]})
  ]);
  const requested=workspace?.view_scope==='shared'?'shared':'personal';
  const scope=requested==='shared'&&sharing.active?'shared':'personal';
  let incomes,expenses,debts,events,goals,contribs;
  if(scope==='shared'){
    [incomes,expenses,debts,events,goals,contribs]=await Promise.all([
      env.DB.prepare(`SELECT x.*,u.name created_by_name,u.username created_by_username FROM shared_incomes x LEFT JOIN users u ON u.id=x.created_by WHERE x.partnership_id=? ORDER BY x.date DESC,x.created_at DESC`).bind(sharing.id).all(),
      env.DB.prepare(`SELECT x.*,u.name created_by_name,u.username created_by_username FROM shared_expenses x LEFT JOIN users u ON u.id=x.created_by WHERE x.partnership_id=? ORDER BY COALESCE(x.due_date,x.date) DESC,x.created_at DESC`).bind(sharing.id).all(),
      env.DB.prepare(`SELECT x.*,u.name created_by_name,u.username created_by_username FROM shared_debts x LEFT JOIN users u ON u.id=x.created_by WHERE x.partnership_id=? ORDER BY x.created_at DESC`).bind(sharing.id).all(),
      env.DB.prepare(`SELECT x.*,u.name created_by_name,u.username created_by_username FROM shared_debt_events x LEFT JOIN users u ON u.id=x.created_by WHERE x.partnership_id=? ORDER BY x.date DESC,x.created_at DESC`).bind(sharing.id).all(),
      env.DB.prepare(`SELECT x.*,u.name created_by_name,u.username created_by_username FROM shared_goals x LEFT JOIN users u ON u.id=x.created_by WHERE x.partnership_id=? ORDER BY x.created_at DESC`).bind(sharing.id).all(),
      env.DB.prepare(`SELECT x.*,u.name user_name,u.username user_username FROM shared_goal_contributions x LEFT JOIN users u ON u.id=x.user_id WHERE x.partnership_id=? ORDER BY x.date DESC,x.created_at DESC`).bind(sharing.id).all()
    ]);
  }else{
    [incomes,expenses,debts,events,goals,contribs]=await Promise.all([
      env.DB.prepare(`SELECT * FROM incomes WHERE user_id=? ORDER BY date DESC,created_at DESC`).bind(userId).all(),
      env.DB.prepare(`SELECT * FROM expenses WHERE user_id=? ORDER BY COALESCE(due_date,date) DESC,created_at DESC`).bind(userId).all(),
      env.DB.prepare(`SELECT * FROM debts WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all(),
      env.DB.prepare(`SELECT * FROM debt_events WHERE user_id=? ORDER BY date DESC,created_at DESC`).bind(userId).all(),
      env.DB.prepare(`SELECT * FROM goals WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all(),
      env.DB.prepare(`SELECT * FROM goal_contributions WHERE user_id=? ORDER BY date DESC,created_at DESC`).bind(userId).all()
    ]);
  }
  const ev=mapMoney(events.results||[]);
  const debtRows=mapMoney(debts.results||[],['total_amount']).map(d=>{const paid=ev.filter(e=>e.debt_id===d.id).reduce((a,e)=>a+e.amount,0);return {...d,scope,shared:scope==='shared'?1:0,paid_amount:paid,balance:Math.max(0,d.total_amount-paid)}});
  const contrib=mapMoney(contribs.results||[]).map(x=>({...x,scope,shared:scope==='shared'?1:0}));
  const goalRows=mapMoney(goals.results||[],['target_amount']).map(g=>({...g,scope,shared:scope==='shared'?1:0,current_amount:contrib.filter(c=>c.goal_id===g.id).reduce((a,c)=>a+c.amount,0)}));
  const baseSettings=settings||{theme:'system',notifications_enabled:1,notify_due:1,notify_overdue:1,notify_goals:1,reminder_days:3,monthly_summary:1,auto_lock_minutes:5};
  const members=sharing.members||[];const partner=members.find(x=>x.user_id!==userId)||null;
  return {profile,scope,sharing:{partnership_id:sharing.id,active:sharing.active,members,partner,incoming_invites:incoming.results||[],outgoing_invites:outgoing.results||[]},settings:{...baseSettings,mobile_shortcuts:mobileSettings?.mobile_shortcuts||'["expenses","debts","goals"]',seen_notifications:mobileSettings?.seen_notifications||'[]'},incomes:mapMoney(incomes.results||[]).map(x=>({...x,scope,shared:scope==='shared'?1:0})),expenses:mapMoney(expenses.results||[]).map(x=>({...x,scope,shared:scope==='shared'?1:0})),debts:debtRows,debt_events:ev.map(x=>({...x,scope,shared:scope==='shared'?1:0})),goals:goalRows,goal_contributions:contrib,security:{webauthn_count:Number(webauthn?.count||0)},server_time:now()};
}'''
replace_func('bootstrap','handleAuth',bootstrap)

# Permite Compartilhamento como um atalho salvo na nuvem.
rep("new Set(['expenses','debts','goals','calendar','insights','settings'])","new Set(['expenses','debts','goals','calendar','insights','sharing','settings'])",'atalho compartilhamento backend')

# APIs de vínculo antes do perfil/configurações.
anchor="  if(path==='/api/profile'&&request.method==='PATCH'){"
if anchor not in s: raise SystemExit('WORKER âncora profile não encontrada')
sharing_routes=r'''
  if(path==='/api/sharing/scope'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);const b=await body(request);let scope=b.scope==='shared'?'shared':'personal';if(scope==='shared'&&!await activePartnership(env,userId))return json({error:'Conecte seu parceiro antes de abrir o Nosso Ritmo.'},400);await env.DB.prepare(`INSERT INTO user_workspace_settings(user_id,view_scope,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET view_scope=excluded.view_scope,updated_at=excluded.updated_at`).bind(userId,scope,now()).run();return json({ok:true,scope});
  }
  if(path==='/api/sharing/invite'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);if(!await rateLimit(env,request,'share-invite',20,600))return json({error:'Muitas tentativas de convite. Tente novamente mais tarde.'},429);const b=await body(request),username=cleanUsername(b.username);if(username.length<3)return json({error:'Informe o usuário do seu parceiro.'},400);const target=await env.DB.prepare(`SELECT id,name,username FROM users WHERE username_norm=?`).bind(username).first();if(!target)return json({error:'Esse usuário ainda não foi encontrado no Ritmo.'},404);if(target.id===userId)return json({error:'Escolha outra conta para compartilhar.'},400);
    let mine=await partnershipState(env,userId);if(mine.active)return json({error:'Você já possui um parceiro conectado.'},409);const theirs=await partnershipState(env,target.id);if(theirs.id)return json({error:'Esse usuário já participa de outro compartilhamento.'},409);let pid=mine.id;if(!pid){pid=uid();await env.DB.batch([env.DB.prepare(`INSERT INTO partnerships(id,created_by,created_at,updated_at) VALUES(?,?,?,?)`).bind(pid,userId,now(),now()),env.DB.prepare(`INSERT INTO partnership_members(partnership_id,user_id,role,joined_at) VALUES(?,?,?,?)`).bind(pid,userId,'admin',now())])}
    await env.DB.prepare(`UPDATE partnership_invites SET status='cancelled',updated_at=? WHERE partnership_id=? AND status='pending'`).bind(now(),pid).run();const id=uid(),code=inviteCode(),expires=new Date(Date.now()+7*864e5).toISOString();await env.DB.prepare(`INSERT INTO partnership_invites(id,partnership_id,inviter_user_id,invitee_user_id,code,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?,?)`).bind(id,pid,userId,target.id,code,expires,now(),now()).run();await touchUsers(env,[userId,target.id]);return json({ok:true,id,code,partner:{name:target.name,username:target.username},expires_at:expires},201);
  }
  let shareMatch=path.match(/^\/api\/sharing\/invites\/([a-f0-9-]+)\/(accept|decline|cancel)$/i);
  if(shareMatch&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);const id=shareMatch[1],action=shareMatch[2];const inv=await env.DB.prepare(`SELECT * FROM partnership_invites WHERE id=? AND status='pending'`).bind(id).first();if(!inv)return json({error:'Convite não encontrado ou já utilizado.'},404);
    if(action==='cancel'){if(inv.inviter_user_id!==userId)return json({error:'Sem permissão para cancelar este convite.'},403);await env.DB.prepare(`UPDATE partnership_invites SET status='cancelled',updated_at=? WHERE id=?`).bind(now(),id).run();await touchUsers(env,[inv.inviter_user_id,inv.invitee_user_id]);return json({ok:true})}
    if(inv.invitee_user_id!==userId)return json({error:'Este convite pertence a outra conta.'},403);if(action==='decline'){await env.DB.prepare(`UPDATE partnership_invites SET status='declined',updated_at=? WHERE id=?`).bind(now(),id).run();await touchUsers(env,[inv.inviter_user_id,userId]);return json({ok:true})}
    if(inv.expires_at<=now())return json({error:'Este convite expirou. Peça um novo convite.'},410);if((await partnershipState(env,userId)).id)return json({error:'Sua conta já está vinculada a outro compartilhamento.'},409);const count=await env.DB.prepare(`SELECT COUNT(*) count FROM partnership_members WHERE partnership_id=?`).bind(inv.partnership_id).first();if(Number(count?.count||0)>=2)return json({error:'Este compartilhamento já possui duas pessoas.'},409);await env.DB.batch([env.DB.prepare(`INSERT INTO partnership_members(partnership_id,user_id,role,joined_at) VALUES(?,?,?,?)`).bind(inv.partnership_id,userId,'admin',now()),env.DB.prepare(`UPDATE partnership_invites SET status='accepted',updated_at=? WHERE id=?`).bind(now(),id)]);const members=await env.DB.prepare(`SELECT user_id FROM partnership_members WHERE partnership_id=?`).bind(inv.partnership_id).all();await touchUsers(env,(members.results||[]).map(x=>x.user_id));return json({ok:true,partnership_id:inv.partnership_id});
  }
  if(path==='/api/sharing/accept-code'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);if(!await rateLimit(env,request,'share-code',25,600))return json({error:'Muitas tentativas. Tente novamente mais tarde.'},429);const b=await body(request),code=String(b.code||'').trim().toUpperCase();const inv=await env.DB.prepare(`SELECT id FROM partnership_invites WHERE code=? AND invitee_user_id=? AND status='pending' AND expires_at>?`).bind(code,userId,now()).first();if(!inv)return json({error:'Código inválido, expirado ou destinado a outra conta.'},404);const count=await env.DB.prepare(`SELECT COUNT(*) count FROM partnership_members pm JOIN partnership_invites i ON i.partnership_id=pm.partnership_id WHERE i.id=?`).bind(inv.id).first();if(Number(count?.count||0)>=2)return json({error:'Este compartilhamento já está completo.'},409);if((await partnershipState(env,userId)).id)return json({error:'Sua conta já está vinculada a outro compartilhamento.'},409);const full=await env.DB.prepare(`SELECT * FROM partnership_invites WHERE id=?`).bind(inv.id).first();await env.DB.batch([env.DB.prepare(`INSERT INTO partnership_members(partnership_id,user_id,role,joined_at) VALUES(?,?,?,?)`).bind(full.partnership_id,userId,'admin',now()),env.DB.prepare(`UPDATE partnership_invites SET status='accepted',updated_at=? WHERE id=?`).bind(now(),full.id)]);const members=await env.DB.prepare(`SELECT user_id FROM partnership_members WHERE partnership_id=?`).bind(full.partnership_id).all();await touchUsers(env,(members.results||[]).map(x=>x.user_id));return json({ok:true,partnership_id:full.partnership_id});
  }
'''
s=s.replace(anchor,sharing_routes+'\n'+anchor,1)

# CRUD compartilhado é separado do CRUD pessoal.
shared_crud=r'''
  const sharedCreate=path.match(/^\/api\/shared\/(incomes|expenses|debts|goals)$/i);
  if(sharedCreate&&request.method==='POST'){
    const p=await activePartnership(env,userId);if(!p)return json({error:'O Nosso Ritmo precisa de duas contas conectadas.'},400);const table=sharedCreate[1],id=uid();
    if(table==='incomes')await env.DB.prepare(`INSERT INTO shared_incomes(id,partnership_id,created_by,updated_by,description,category,amount,date,notes,recurrence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,p.id,userId,userId,String(b.description||'Entrada').trim(),String(b.category||'Outros'),cents(b.amount),b.date||today(),b.notes||null,b.recurrence||'Nenhuma',now(),now()).run();
    if(table==='expenses')await env.DB.prepare(`INSERT INTO shared_expenses(id,partnership_id,created_by,updated_by,description,category,amount,date,due_date,status,notes,recurrence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,p.id,userId,userId,String(b.description||'Saída').trim(),String(b.category||'Outros'),cents(b.amount),b.date||today(),b.due_date||null,b.status==='pago'?'pago':'pendente',b.notes||null,b.recurrence||'Nenhuma',now(),now()).run();
    if(table==='debts')await env.DB.prepare(`INSERT INTO shared_debts(id,partnership_id,created_by,updated_by,creditor,total_amount,start_date,due_date,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'ativa',?,?)`).bind(id,p.id,userId,userId,String(b.creditor||'Dívida').trim(),cents(b.total_amount),b.start_date||today(),b.due_date||null,b.notes||null,now(),now()).run();
    if(table==='goals')await env.DB.prepare(`INSERT INTO shared_goals(id,partnership_id,created_by,updated_by,name,target_amount,deadline,category,is_emergency,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,p.id,userId,userId,String(b.name||'Meta').trim(),cents(b.target_amount),b.deadline||null,b.category||'Personalizado',b.is_emergency?1:0,b.notes||null,now(),now()).run();
    await bumpPartnership(env,p.id,userId,'create',`shared_${table}`,id);return json({ok:true,id},201);
  }
  let sharedMatch=path.match(/^\/api\/shared\/(incomes|expenses|debts|goals)\/([a-f0-9-]+)$/i);
  if(sharedMatch){const p=await activePartnership(env,userId);if(!p)return json({error:'Compartilhamento indisponível.'},400);const kind=sharedMatch[1],table=`shared_${kind}`,id=sharedMatch[2],row=await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND partnership_id=?`).bind(id,p.id).first();if(!row)return json({error:'Item compartilhado não encontrado.'},404);
    if(request.method==='DELETE'){
      if(kind==='debts')await env.DB.batch([env.DB.prepare(`DELETE FROM shared_expenses WHERE debt_id=? AND partnership_id=?`).bind(id,p.id),env.DB.prepare(`DELETE FROM shared_incomes WHERE debt_id=? AND partnership_id=?`).bind(id,p.id),env.DB.prepare(`DELETE FROM shared_debt_events WHERE debt_id=? AND partnership_id=?`).bind(id,p.id),env.DB.prepare(`DELETE FROM shared_debts WHERE id=? AND partnership_id=?`).bind(id,p.id)]);
      else if(kind==='goals')await env.DB.batch([env.DB.prepare(`DELETE FROM shared_goal_contributions WHERE goal_id=? AND partnership_id=?`).bind(id,p.id),env.DB.prepare(`DELETE FROM shared_goals WHERE id=? AND partnership_id=?`).bind(id,p.id)]);
      else await env.DB.prepare(`DELETE FROM ${table} WHERE id=? AND partnership_id=?`).bind(id,p.id).run();await bumpPartnership(env,p.id,userId,'delete',table,id);return json({ok:true});
    }
    if(request.method==='PATCH'){
      if(kind==='incomes')await env.DB.prepare(`UPDATE shared_incomes SET description=?,category=?,amount=?,date=?,notes=?,recurrence=?,updated_by=?,updated_at=? WHERE id=? AND partnership_id=?`).bind(b.description,b.category||'Outros',cents(b.amount),b.date||today(),b.notes||null,b.recurrence||'Nenhuma',userId,now(),id,p.id).run();
      if(kind==='expenses')await env.DB.prepare(`UPDATE shared_expenses SET description=?,category=?,amount=?,date=?,due_date=?,status=?,notes=?,recurrence=?,updated_by=?,updated_at=? WHERE id=? AND partnership_id=?`).bind(b.description,b.category||'Outros',cents(b.amount),b.date||today(),b.due_date||null,b.status==='pago'?'pago':'pendente',b.notes||null,b.recurrence||'Nenhuma',userId,now(),id,p.id).run();
      if(kind==='debts')await env.DB.prepare(`UPDATE shared_debts SET creditor=?,total_amount=?,start_date=?,due_date=?,notes=?,updated_by=?,updated_at=? WHERE id=? AND partnership_id=?`).bind(b.creditor,cents(b.total_amount),b.start_date||today(),b.due_date||null,b.notes||null,userId,now(),id,p.id).run();
      if(kind==='goals')await env.DB.prepare(`UPDATE shared_goals SET name=?,target_amount=?,deadline=?,category=?,is_emergency=?,notes=?,updated_by=?,updated_at=? WHERE id=? AND partnership_id=?`).bind(b.name,cents(b.target_amount),b.deadline||null,b.category||'Personalizado',b.is_emergency?1:0,b.notes||null,userId,now(),id,p.id).run();
      if(kind==='debts')await normalizeSharedDebtStatus(env,p.id,id);await bumpPartnership(env,p.id,userId,'update',table,id);return json({ok:true});
    }
  }
  sharedMatch=path.match(/^\/api\/shared\/debts\/([a-f0-9-]+)\/(payment|credit)$/i);
  if(sharedMatch&&request.method==='POST'){
    const p=await activePartnership(env,userId);if(!p)return json({error:'Compartilhamento indisponível.'},400);const debtId=sharedMatch[1],kind=sharedMatch[2]==='payment'?'pagamento':'haver',d=await sharedDebtBalance(env,p.id,debtId);if(!d)return json({error:'Dívida compartilhada não encontrada.'},404);const amount=Math.min(cents(b.amount),d.balance);if(amount<=0)return json({error:'Informe um valor válido.'},400);const eventId=uid(),date=b.date||today(),stmts=[env.DB.prepare(`INSERT INTO shared_debt_events(id,partnership_id,created_by,debt_id,kind,amount,date,notes,cash_received,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(eventId,p.id,userId,debtId,kind,amount,date,b.notes||null,b.cash_received?1:0,now(),now())];
    if(kind==='pagamento')stmts.push(env.DB.prepare(`INSERT INTO shared_expenses(id,partnership_id,created_by,updated_by,description,category,amount,date,due_date,status,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'pago',?,'divida',?,?,?,?)`).bind(uid(),p.id,userId,userId,'Pagamento de dívida','Dívidas',amount,date,date,b.notes||null,debtId,eventId,now(),now()));
    if(kind==='haver'&&b.cash_received)stmts.push(env.DB.prepare(`INSERT INTO shared_incomes(id,partnership_id,created_by,updated_by,description,category,amount,date,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'divida',?,?,?,?)`).bind(uid(),p.id,userId,userId,'Haver recebido','Haver',amount,date,b.notes||null,debtId,eventId,now(),now()));
    await env.DB.batch(stmts);await normalizeSharedDebtStatus(env,p.id,debtId);await bumpPartnership(env,p.id,userId,'create',`shared_${kind}`,eventId);return json({ok:true,id:eventId});
  }
  sharedMatch=path.match(/^\/api\/shared\/debt-events\/([a-f0-9-]+)$/i);
  if(sharedMatch&&request.method==='DELETE'){
    const p=await activePartnership(env,userId);if(!p)return json({error:'Compartilhamento indisponível.'},400);const id=sharedMatch[1],e=await env.DB.prepare(`SELECT * FROM shared_debt_events WHERE id=? AND partnership_id=?`).bind(id,p.id).first();if(!e)return json({error:'Lançamento compartilhado não encontrado.'},404);await env.DB.batch([env.DB.prepare(`DELETE FROM shared_expenses WHERE debt_event_id=? AND partnership_id=?`).bind(id,p.id),env.DB.prepare(`DELETE FROM shared_incomes WHERE debt_event_id=? AND partnership_id=?`).bind(id,p.id),env.DB.prepare(`DELETE FROM shared_debt_events WHERE id=? AND partnership_id=?`).bind(id,p.id)]);await normalizeSharedDebtStatus(env,p.id,e.debt_id);await bumpPartnership(env,p.id,userId,'delete','shared_debt_event',id);return json({ok:true});
  }
  sharedMatch=path.match(/^\/api\/shared\/goals\/([a-f0-9-]+)\/contributions$/i);
  if(sharedMatch&&request.method==='POST'){
    const p=await activePartnership(env,userId);if(!p)return json({error:'Compartilhamento indisponível.'},400);const goalId=sharedMatch[1],g=await env.DB.prepare(`SELECT id FROM shared_goals WHERE id=? AND partnership_id=?`).bind(goalId,p.id).first();if(!g)return json({error:'Meta conjunta não encontrada.'},404);const id=uid();await env.DB.prepare(`INSERT INTO shared_goal_contributions(id,partnership_id,user_id,goal_id,amount,date,notes,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id,p.id,userId,goalId,cents(b.amount),b.date||today(),b.notes||null,now()).run();await bumpPartnership(env,p.id,userId,'create','shared_goal_contribution',id);return json({ok:true,id},201);
  }
  sharedMatch=path.match(/^\/api\/shared\/goal-contributions\/([a-f0-9-]+)$/i);
  if(sharedMatch&&request.method==='DELETE'){
    const p=await activePartnership(env,userId);if(!p)return json({error:'Compartilhamento indisponível.'},400);const id=sharedMatch[1],row=await env.DB.prepare(`SELECT id FROM shared_goal_contributions WHERE id=? AND partnership_id=?`).bind(id,p.id).first();if(!row)return json({error:'Contribuição não encontrada.'},404);await env.DB.prepare(`DELETE FROM shared_goal_contributions WHERE id=? AND partnership_id=?`).bind(id,p.id).run();await bumpPartnership(env,p.id,userId,'delete','shared_goal_contribution',id);return json({ok:true});
  }
'''
anchor="  if(path==='/api/incomes'&&request.method==='POST'){"
if anchor not in s: raise SystemExit('WORKER âncora CRUD pessoal não encontrada')
s=s.replace(anchor,shared_crud+'\n'+anchor,1)
worker.write_text(s)

# -----------------------------------------------------------------------------
# Frontend
# -----------------------------------------------------------------------------
a=app.read_text()

def arep(old,new,label,count=1):
    global a
    if old not in a:
        raise SystemExit('APP trecho não encontrado: '+label)
    a=a.replace(old,new,count)

def areplace_func(name,next_name,new_code):
    global a
    p=a.find('function '+name+'(')
    q=a.find('\nfunction '+next_name+'(',p)
    if p<0 or q<0: raise SystemExit(f'APP função não encontrada: {name}->{next_name}')
    a=a[:p]+new_code+a[q:]

# Ícone de dupla.
arep("message:'<path d=\"M20 14.5", "users:'<circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M3 20a6 6 0 0 1 12 0\"/><circle cx=\"17\" cy=\"9\" r=\"2.5\"/><path d=\"M15 15.5a5 5 0 0 1 6 4.5\"/>',message:'<path d=\"M20 14.5", 'icone users')

arep("['goals','Metas','target'],['calendar'", "['goals','Metas','target'],['sharing','Compartilhamento','users'],['calendar'", 'nav compartilhamento')
arep("insights:['insights','Insights','spark'],settings:", "insights:['insights','Insights','spark'],sharing:['sharing','Compartilhar','users'],settings:", 'shortcut compartilhamento')

scope_helpers=r'''
function scopePrefix(scope=state.data?.scope){return scope==='shared'?'/api/shared':'/api'}
function sharedActive(){return !!state.data?.sharing?.active}
function scopeSwitcher(){if(!sharedActive()||!['home','income','expenses','debts','goals','calendar','insights'].includes(state.page))return '';const partner=state.data.sharing.partner?.name||'parceiro';return `<div class="scope-bar"><div class="scope-copy"><span>${state.data.scope==='shared'?ic('users',15):ic('user',15)}</span><div><strong>${state.data.scope==='shared'?'Nosso Ritmo':'Meu Ritmo'}</strong><small>${state.data.scope==='shared'?`Compartilhado com ${esc(partner)}`:'Somente seus dados pessoais'}</small></div></div><div class="scope-seg"><button type="button" data-scope="personal" class="${state.data.scope==='personal'?'active':''}">Meu</button><button type="button" data-scope="shared" class="${state.data.scope==='shared'?'active':''}">Nosso</button></div></div>`}
async function switchScope(scope){if(scope===state.data.scope)return;try{await api('/api/sharing/scope',{method:'POST',body:JSON.stringify({scope})});state.data=await api('/api/bootstrap');renderApp(false);toast(scope==='shared'?'Nosso Ritmo aberto.':'Seu Ritmo pessoal aberto.')}catch(e){toast(e.message)}}
function initials(name){return String(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()}
function authorNote(x){return state.data?.scope==='shared'&&x?.created_by_name?` • por ${esc(x.created_by_name.split(' ')[0])}`:''}
'''
arep('function currentStats(){',scope_helpers+'\nfunction currentStats(){','helpers scope')

# Render global com seletor de espaço e rota de compartilhamento.
arep('<main class="main">${pageHtml()}</main>','<main class="main">${scopeSwitcher()}${pageHtml()}</main>','scope bar render')
arep("['calendar','insights','settings','profile','shortcuts'].includes(state.page)","['calendar','insights','sharing','settings','profile','shortcuts'].includes(state.page)",'bottom active sharing')
arep('profile:profilePage,more:morePage,shortcuts:shortcutsPage','profile:profilePage,sharing:sharingPage,more:morePage,shortcuts:shortcutsPage','router sharing')

# Home contextual.
arep("function homePage(){const s=currentStats(),next=", "function homePage(){const shared=state.data.scope==='shared',s=currentStats(),next=", 'home shared state')
arep("${head(`Olá, ${esc(state.data.profile.name.split(' ')[0])}`, 'Aqui está o ritmo da sua vida financeira.')}", "${head(shared?'Nosso Ritmo':`Olá, ${esc(state.data.profile.name.split(' ')[0])}`,shared?`Sua visão financeira junto com ${esc(state.data.sharing.partner?.name?.split(' ')[0]||'seu parceiro')}.`:'Aqui está o ritmo da sua vida financeira.')}", 'home head contextual')

# Autoria nos cards compartilhados.
arep("${x.origin==='divida'?' • vinculado à dívida':''}</p>", "${x.origin==='divida'?' • vinculado à dívida':''}${authorNote(x)}</p>", 'autor item')
arep("${d.due_date?` • vence ${dateBR(d.due_date)}`:''}</div>", "${d.due_date?` • vence ${dateBR(d.due_date)}`:''}${authorNote(d)}</div>", 'autor divida')
arep("${e.kind==='pagamento'?'Pagamento':'Haver'} • ${dateBR(e.date)}</span>", "${e.kind==='pagamento'?'Pagamento':'Haver'} • ${dateBR(e.date)}${authorNote(e)}</span>", 'autor evento divida')

# Metas: Individual/Juntos e histórico de contribuições por pessoa.
goal_card=r'''function goalCard(g){const pct=Math.min(100,Math.round((g.current_amount/g.target_amount)*100||0)),joint=state.data.scope==='shared',contribs=state.data.goal_contributions.filter(c=>c.goal_id===g.id);return `<article class="goal-card"><div class="goal-head"><div><div class="goal-scope-badge ${joint?'joint':'solo'}">${joint?`${ic('users',12)} Juntos`:`${ic('user',12)} Individual`}</div><h3>${esc(g.name)}</h3><div class="meta">${esc(g.category)}${g.deadline?` • até ${dateBR(g.deadline)}`:''}${authorNote(g)}</div></div><span class="status ${pct>=100?'paid':'pending'}">${pct}%</span></div><div class="card-number">${money(g.current_amount)}</div><div class="card-sub">de ${money(g.target_amount)}</div><div class="progress"><i style="width:${pct}%"></i></div>${joint&&contribs.length?`<div class="goal-contribs">${contribs.slice(0,4).map(c=>`<div><span><b>${esc((c.user_name||'Parceiro').split(' ')[0])}</b> • ${dateBR(c.date)}</span><strong>+ ${money(c.amount)}</strong></div>`).join('')}</div>`:''}<div class="debt-actions"><button class="btn btn-secondary" data-goal-add="${g.id}">Adicionar valor</button><button class="btn btn-secondary" data-edit="goal" data-id="${g.id}">Editar</button></div><div class="card-actions"><button class="mini-btn" data-delete="goal" data-id="${g.id}">${ic('trash',12)} Excluir meta</button></div></article>`}'''
areplace_func('goalCard','updateSystemNow',goal_card)

# Menu reorganizado com bloco Conexões.
p=a.find('function morePage(){');q=a.find('\nfunction shortcutsPage(',p)
if p<0 or q<0: raise SystemExit('APP morePage não encontrada')
more=r'''function morePage(){const update=`<button type="button" class="system-update-btn menu-update-btn" data-system-update aria-label="Atualizar Sistema" title="Atualizar Sistema"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.4 9A7 7 0 0 0 6.2 6.2L4 8"/><path d="M5.6 15A7 7 0 0 0 17.8 17.8L20 16"/></svg></button>`;return `${head('Menu','Acesse ferramentas, conexões, conta e informações do Ritmo.',update)}<div class="more-sections"><section class="more-section"><h3>Ferramentas</h3><div class="more-grid"><button class="more-card" data-page="calendar"><span class="more-icon calendar-tone">${ic('calendar',22)}</span><div><strong>Calendário</strong><small>Movimentações e vencimentos por dia.</small></div>${ic('chev',16)}</button><button class="more-card" data-page="insights"><span class="more-icon insight-tone">${ic('spark',22)}</span><div><strong>Insights</strong><small>Entenda melhor seus dados financeiros.</small></div>${ic('chev',16)}</button><button class="more-card" data-page="shortcuts"><span class="more-icon shortcut-tone">${ic('menu',22)}</span><div><strong>Personalizar atalhos</strong><small>Escolha e ordene os atalhos da barra inferior.</small></div>${ic('chev',16)}</button></div></section><section class="more-section"><h3>Conexões</h3><div class="more-grid"><button class="more-card sharing-menu-card" data-page="sharing"><span class="more-icon sharing-tone">${ic('users',22)}</span><div><strong>Compartilhamento</strong><small>${state.data.sharing?.active?`Conectado com ${esc(state.data.sharing.partner?.name||'seu parceiro')}`:'Crie um espaço financeiro a dois.'}</small></div>${ic('chev',16)}</button></div></section><section class="more-section"><h3>Sua conta</h3><div class="more-grid"><button class="more-card" data-page="profile"><span class="more-icon">${ic('user',22)}</span><div><strong>Editar perfil</strong><small>Nome, usuário e senha.</small></div>${ic('chev',16)}</button></div></section><section class="more-section"><h3>Aplicativo</h3><div class="more-grid"><button class="more-card" data-page="settings"><span class="more-icon settings-tone">${ic('gear',22)}</span><div><strong>Configurações</strong><small>Aparência, notificações e segurança.</small></div>${ic('chev',16)}</button><button class="more-card" data-settings-open="about"><span class="more-icon info-tone">${ic('info',22)}</span><div><strong>Sobre o Ritmo</strong><small>Versão e informações do aplicativo.</small></div>${ic('chev',16)}</button><a class="more-card" href="https://wa.me/5574998029574?text=Ol%C3%A1%20Fl%C3%A1vio%2C%20eu%20gostaria%20de%20suporte%20no%20Ritmo." target="_blank" rel="noopener"><span class="more-icon support-tone">${ic('message',22)}</span><div><strong>Suporte Rocha Tech</strong><small>Fale diretamente pelo WhatsApp.</small></div>${ic('chev',16)}</a></div></section></div>`}'''
a=a[:p]+more+a[q:]

sharing_page=r'''
function sharingPage(){const sh=state.data.sharing||{},me=state.data.profile;if(sh.active){const partner=sh.partner||{},members=sh.members||[];return `${head('Compartilhamento','Um espaço financeiro administrado por vocês dois.')}<div class="sharing-hero panel"><div class="couple-avatars"><span>${initials(me.name)}</span><i>${ic('users',18)}</i><span>${initials(partner.name)}</span></div><span class="eyebrow">RITMO A DOIS</span><h2>${esc(me.name.split(' ')[0])} & ${esc((partner.name||'Parceiro').split(' ')[0])}</h2><p>Cada pessoa continua com seu próprio login, senha e proteção do aparelho. No <strong>Nosso Ritmo</strong>, os dois podem criar, editar e administrar os dados em conjunto.</p><div class="sharing-admins">${members.map(m=>`<div><span class="mini-avatar">${initials(m.name)}</span><div><strong>${esc(m.name)}</strong><small>@${esc(m.username)} • administrador</small></div>${ic('check',16)}</div>`).join('')}</div></div><div class="sharing-grid"><div class="panel"><div class="panel-title"><div><h3>Escolha o espaço</h3><small>Você pode alternar quando quiser.</small></div></div><div class="big-scope-choice"><button data-scope="personal" class="${state.data.scope==='personal'?'active':''}">${ic('user',21)}<strong>Meu Ritmo</strong><small>Dados somente seus</small></button><button data-scope="shared" class="${state.data.scope==='shared'?'active':''}">${ic('users',21)}<strong>Nosso Ritmo</strong><small>Administrado pelos dois</small></button></div></div><div class="panel"><div class="panel-title"><div><h3>Metas em conjunto</h3><small>Cada contribuição mostra quem participou.</small></div></div><p class="sharing-tip">Ao criar uma meta, escolha <strong>Individual</strong> ou <strong>Juntos</strong>. Nas metas conjuntas, o progresso soma as contribuições das duas contas.</p><button class="btn btn-secondary" data-page="goals">Ver metas</button></div></div>`}
  const incoming=sh.incoming_invites||[],outgoing=sh.outgoing_invites||[];return `${head('Compartilhamento','Conecte duas contas do Ritmo sem compartilhar senha.')}<div class="sharing-grid setup"><div class="panel share-setup-card"><span class="sharing-big-icon">${ic('users',28)}</span><h2>Ritmo a dois</h2><p>Convide seu parceiro pelo nome de usuário. Quando ele aceitar, cada um entra com sua própria conta e vocês ganham um espaço compartilhado.</p><form id="shareInviteForm"><label class="field">Usuário do parceiro<input name="username" autocomplete="off" placeholder="Ex.: maria.silva" required minlength="3"></label><button class="btn btn-primary" type="submit">Criar convite</button></form></div><div class="panel"><div class="panel-title"><div><h3>Tenho um código</h3><small>Use o código recebido do seu parceiro.</small></div></div><form id="shareCodeForm" class="share-code-form"><input name="code" maxlength="10" placeholder="CÓDIGO" autocomplete="off" required><button class="btn btn-secondary" type="submit">Conectar</button></form></div></div>${incoming.length?`<section class="share-list"><h3>Convites recebidos</h3>${incoming.map(i=>`<article class="share-invite"><span class="mini-avatar">${initials(i.inviter_name)}</span><div><strong>${esc(i.inviter_name)}</strong><small>@${esc(i.inviter_username)} quer compartilhar o Ritmo com você.</small></div><div class="invite-actions"><button class="btn btn-primary" data-share-accept="${i.id}">Aceitar</button><button class="mini-btn" data-share-decline="${i.id}">Recusar</button></div></article>`).join('')}</section>`:''}${outgoing.length?`<section class="share-list"><h3>Convite enviado</h3>${outgoing.map(i=>`<article class="share-invite code"><span class="mini-avatar">${initials(i.invitee_name)}</span><div><strong>${esc(i.invitee_name)}</strong><small>@${esc(i.invitee_username)} • válido por 7 dias</small><button class="invite-code" data-copy-code="${esc(i.code)}">${esc(i.code)} ${ic('copy',12)}</button></div><button class="mini-btn" data-share-cancel="${i.id}">Cancelar</button></article>`).join('')}</section>`:''}`}
'''
# copy icon not in catalog: use textual fallback by replacing ic('copy') below with small copy glyph via users-independent svg
sharing_page=sharing_page.replace("${ic('copy',12)}","⧉")
arep('function shortcutsPage(){',sharing_page+'\nfunction shortcutsPage(){','sharingPage')

# Meta nova escolhe Individual/Juntos.
old="if(type==='goal'){title=item?'Editar meta':'Nova meta';fields=`${input('name','Nome da meta',item?.name,'Ex.: Viagem')}${moneyInput('target_amount','Valor alvo',item?.target_amount)}${select('category','Categoria',['Viagem','Carro','Casa','Estudos','Reserva de emergência','Personalizado'],item?.category)}${dateInput('deadline','Prazo',item?.deadline||'')}${input('notes','Observação',item?.notes,'Opcional','full')}`}`"
new="if(type==='goal'){title=item?'Editar meta':'Nova meta';const mode=item?`<div class=\"goal-mode-readonly full\"><span>${state.data.scope==='shared'?ic('users',17):ic('user',17)}</span><div><strong>${state.data.scope==='shared'?'Meta em conjunto':'Meta individual'}</strong><small>O tipo não muda durante a edição.</small></div></div>`:sharedActive()?`<label class=\"field full\">Tipo da meta<select name=\"goal_scope\"><option value=\"personal\" ${state.data.scope==='personal'?'selected':''}>Individual</option><option value=\"shared\" ${state.data.scope==='shared'?'selected':''}>Juntos</option></select></label>`:`<input type=\"hidden\" name=\"goal_scope\" value=\"personal\"><div class=\"goal-mode-readonly full\"><span>${ic('user',17)}</span><div><strong>Meta individual</strong><small>Conecte um parceiro em Compartilhamento para criar metas juntos.</small></div></div>`;fields=`${mode}${input('name','Nome da meta',item?.name,'Ex.: Viagem')}${moneyInput('target_amount','Valor alvo',item?.target_amount)}${select('category','Categoria',['Viagem','Carro','Casa','Estudos','Reserva de emergência','Personalizado'],item?.category)}${dateInput('deadline','Prazo',item?.deadline||'')}${input('notes','Observação',item?.notes,'Opcional','full')}`}`"
arep(old,new,'tipo meta')

# Eventos da área compartilhada.
arep("document.querySelector('[data-system-update]')?.addEventListener('click',updateSystemNow);", "document.querySelector('[data-system-update]')?.addEventListener('click',updateSystemNow);$$('[data-scope]').forEach(b=>b.addEventListener('click',()=>switchScope(b.dataset.scope)));$('#shareInviteForm')?.addEventListener('submit',sendShareInvite);$('#shareCodeForm')?.addEventListener('submit',acceptShareCode);$$('[data-share-accept]').forEach(b=>b.onclick=()=>shareInviteAction(b.dataset.shareAccept,'accept'));$$('[data-share-decline]').forEach(b=>b.onclick=()=>shareInviteAction(b.dataset.shareDecline,'decline'));$$('[data-share-cancel]').forEach(b=>b.onclick=()=>shareInviteAction(b.dataset.shareCancel,'cancel'));$$('[data-copy-code]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copyCode);toast('Código copiado.')}catch{toast(`Código: ${b.dataset.copyCode}`)}});", 'bind compartilhamento')

# Rotas de CRUD respeitam o espaço atual. Meta pode escolher outro espaço ao criar.
submit=r'''async function submitData(e){e.preventDefault();const f=new FormData(e.currentTarget),o=Object.fromEntries(f.entries()),m=state.modal;for(const k of ['amount','total_amount','target_amount'])if(k in o)o[k]=Number(o[k]);if(m.type==='credit')o.cash_received=f.get('cash_received')==='on';let targetScope=state.data.scope;if(m.type==='goal'&&!m.item&&o.goal_scope){targetScope=o.goal_scope==='shared'?'shared':'personal'}delete o.goal_scope;const prefix=scopePrefix(targetScope);let path='',method='POST';if(['income','expense','debt','goal'].includes(m.type)){const plural={income:'incomes',expense:'expenses',debt:'debts',goal:'goals'}[m.type];path=`${prefix}/${plural}${m.item?`/${m.item.id}`:''}`;method=m.item?'PATCH':'POST'}else if(m.type==='payment')path=`${scopePrefix()}/debts/${m.debtId}/payment`;else if(m.type==='credit')path=`${scopePrefix()}/debts/${m.debtId}/credit`;else if(m.type==='contribution')path=`${scopePrefix()}/goals/${m.goalId}/contributions`;try{await api(path,{method,body:JSON.stringify(o)});if(m.type==='goal'&&!m.item&&targetScope!==state.data.scope)await api('/api/sharing/scope',{method:'POST',body:JSON.stringify({scope:targetScope})});state.data=await api('/api/bootstrap');state.modal=null;renderApp(false);toast(targetScope==='shared'?'Atualizado no Nosso Ritmo.':'Atualizado no seu Ritmo.')}catch(err){toast(err.message)}}'''
arep(a[a.find('async function submitData('):a.find('\nasync function deleteItem(',a.find('async function submitData('))],submit,'submitData scope')

arep("await mutate(`/api/${plural}/${id}`,{method:'DELETE'},'Item excluído.')","await mutate(`${scopePrefix()}/${plural}/${id}`,{method:'DELETE'},'Item excluído.')",'delete scope')
arep("await mutate(`/api/debt-events/${id}`,{method:'DELETE'},'Dívida recalculada.')","await mutate(`${scopePrefix()}/debt-events/${id}`,{method:'DELETE'},'Dívida recalculada.')",'delete debt event scope')
arep("await mutate(`/api/expenses/${id}`,{method:'PATCH'","await mutate(`${scopePrefix()}/expenses/${id}`,{method:'PATCH'",'pay expense scope')

sharing_actions=r'''
async function sendShareInvite(e){e.preventDefault();const username=new FormData(e.currentTarget).get('username');try{const r=await api('/api/sharing/invite',{method:'POST',body:JSON.stringify({username})});state.data=await api('/api/bootstrap');renderApp(false);toast(`Convite criado: ${r.code}`)}catch(err){toast(err.message)}}
async function acceptShareCode(e){e.preventDefault();const code=String(new FormData(e.currentTarget).get('code')||'').trim().toUpperCase();try{await api('/api/sharing/accept-code',{method:'POST',body:JSON.stringify({code})});state.data=await api('/api/bootstrap');renderApp(false);toast('Vocês agora têm um Nosso Ritmo.')}catch(err){toast(err.message)}}
async function shareInviteAction(id,action){try{await api(`/api/sharing/invites/${id}/${action}`,{method:'POST',body:'{}'});state.data=await api('/api/bootstrap');renderApp(false);toast(action==='accept'?'Compartilhamento ativado.':action==='cancel'?'Convite cancelado.':'Convite recusado.')}catch(err){toast(err.message)}}
'''
arep('async function saveSettings(',sharing_actions+'\nasync function saveSettings(','sharing actions')

app.write_text(a)

# -----------------------------------------------------------------------------
# Estilos
# -----------------------------------------------------------------------------
css=cssp.read_text()
css += r'''

/* Ritmo a dois */
.scope-bar{max-width:1180px;margin:0 auto 18px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 12px 10px 14px;border:1px solid var(--line);border-radius:18px;background:var(--surface-solid);box-shadow:var(--shadow)}.scope-copy{display:flex;align-items:center;gap:9px}.scope-copy>span{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:var(--primary);background:color-mix(in srgb,var(--primary) 10%,var(--surface2))}.scope-copy strong{display:block;font-size:11px}.scope-copy small{display:block;font-size:8.5px;color:var(--muted);margin-top:2px}.scope-seg{display:flex;padding:3px;background:var(--surface2);border-radius:12px}.scope-seg button{border:0;background:none;border-radius:9px;padding:7px 11px;font-size:9px;font-weight:800;color:var(--muted)}.scope-seg button.active{background:var(--surface-solid);color:var(--primary);box-shadow:0 2px 8px rgba(0,0,0,.07)}.sharing-tone{color:var(--sage)!important;background:color-mix(in srgb,var(--sage) 13%,var(--surface2))!important}.sharing-menu-card{border-color:color-mix(in srgb,var(--sage) 28%,var(--line))!important}.sharing-hero{text-align:center;padding:28px;max-width:820px;margin:0 auto}.couple-avatars{display:flex;align-items:center;justify-content:center;margin-bottom:17px}.couple-avatars>span{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,var(--sage),var(--primary));color:white;font-size:17px;font-weight:850;border:4px solid var(--surface-solid);box-shadow:var(--shadow)}.couple-avatars>span:last-child{margin-left:-7px;background:linear-gradient(145deg,var(--gold),var(--primary))}.couple-avatars i{width:36px;height:36px;border-radius:50%;background:var(--surface-solid);display:grid;place-items:center;color:var(--gold);z-index:2;margin:0 -7px;border:1px solid var(--line)}.sharing-hero h2,.share-setup-card h2{font-size:27px;letter-spacing:-.04em;margin:8px 0}.sharing-hero>p,.share-setup-card>p,.sharing-tip{color:var(--muted);font-size:11px;line-height:1.65;max-width:620px;margin:0 auto}.sharing-admins{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:20px}.sharing-admins>div,.share-invite{display:grid;grid-template-columns:38px 1fr auto;gap:10px;align-items:center;text-align:left;background:var(--surface2);border:1px solid var(--line);border-radius:15px;padding:10px}.mini-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,var(--sage),var(--primary));color:white;font-size:10px;font-weight:850}.sharing-admins strong,.share-invite strong{display:block;font-size:11px}.sharing-admins small,.share-invite small{display:block;color:var(--muted);font-size:8.5px;margin-top:2px}.sharing-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;max-width:900px;margin:14px auto}.sharing-grid.setup{align-items:start}.share-setup-card{text-align:center}.sharing-big-icon{width:58px;height:58px;margin:0 auto 12px;border-radius:18px;display:grid;place-items:center;background:color-mix(in srgb,var(--sage) 16%,var(--surface2));color:var(--primary)}.big-scope-choice{display:grid;grid-template-columns:1fr 1fr;gap:8px}.big-scope-choice button{border:1px solid var(--line);border-radius:16px;background:var(--surface2);padding:17px 12px;display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--muted)}.big-scope-choice button.active{border-color:color-mix(in srgb,var(--primary) 46%,var(--line));background:color-mix(in srgb,var(--primary) 9%,var(--surface-solid));color:var(--primary)}.big-scope-choice strong{font-size:11px}.big-scope-choice small{font-size:8.5px}.share-code-form{display:flex;gap:8px}.share-code-form input{min-width:0;flex:1;border:1px solid var(--line);background:var(--surface2);border-radius:13px;padding:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:800}.share-list{max-width:900px;margin:18px auto}.share-list>h3{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.share-invite{margin-top:8px;background:var(--surface-solid);box-shadow:var(--shadow)}.invite-actions{display:flex;gap:6px;align-items:center}.invite-actions .btn{min-height:36px;font-size:9px}.invite-code{display:inline-flex;align-items:center;gap:5px;border:0;background:color-mix(in srgb,var(--gold) 18%,var(--surface2));color:#9a6321;border-radius:9px;padding:6px 9px;font-weight:850;letter-spacing:.1em;margin-top:7px}.goal-scope-badge{display:inline-flex;align-items:center;gap:4px;border-radius:99px;padding:5px 8px;font-size:8px;font-weight:850;margin-bottom:7px}.goal-scope-badge.joint{background:color-mix(in srgb,var(--sage) 15%,var(--surface2));color:var(--primary)}.goal-scope-badge.solo{background:var(--surface2);color:var(--muted)}.goal-contribs{margin:12px 0 2px;border-top:1px solid var(--line);padding-top:8px;display:grid;gap:5px}.goal-contribs>div{display:flex;justify-content:space-between;gap:8px;font-size:8.5px}.goal-contribs span{color:var(--muted)}.goal-mode-readonly{display:flex;gap:9px;align-items:center;padding:10px;border:1px solid var(--line);background:var(--surface2);border-radius:14px;margin:8px 0}.goal-mode-readonly>span{color:var(--primary)}.goal-mode-readonly strong{display:block;font-size:10px}.goal-mode-readonly small{display:block;font-size:8px;color:var(--muted);margin-top:2px}
@media(max-width:760px){.scope-bar{margin:-2px 0 14px;border-radius:16px;padding:8px 9px}.scope-copy small{max-width:145px}.scope-seg button{padding:7px 9px}.sharing-grid,.sharing-admins{grid-template-columns:1fr}.sharing-hero{padding:20px 16px}.sharing-hero h2,.share-setup-card h2{font-size:24px}.share-invite{grid-template-columns:38px 1fr}.share-invite>.invite-actions,.share-invite>button{grid-column:1/-1}.invite-actions{justify-content:flex-end}.share-code-form{flex-direction:column}.share-code-form .btn{width:100%}}
'''
cssp.write_text(css)
print('Ritmo V1: compartilhamento a dois, Meu/Nosso Ritmo e metas Individual/Juntos adicionados.')
