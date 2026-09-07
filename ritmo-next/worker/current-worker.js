import { scrypt, pbkdf2 } from 'node:crypto';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
const te=new TextEncoder();
const td=new TextDecoder();
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const now=()=>new Date().toISOString();
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>crypto.randomUUID();
const cleanUsername=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'');
const cents=v=>Math.max(0,Math.round(Number(v||0)*100));
const fromCents=v=>Number(v||0)/100;
const b64u=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64u=s=>Uint8Array.from(atob(String(s).replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(String(s).length/4)*4,'=')),c=>c.charCodeAt(0));
const hex=buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
async function sha(s){return hex(await crypto.subtle.digest('SHA-256',te.encode(s)))}
const hexBytes=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
const scryptKey=(password,salt)=>new Promise((resolve,reject)=>scrypt(password,salt,32,{N:16384,r:8,p:1,maxmem:32*1024*1024},(err,key)=>err?reject(err):resolve(key)));
const legacyPbkdf2=(password,salt)=>new Promise((resolve,reject)=>pbkdf2(password,salt,150000,32,'sha256',(err,key)=>err?reject(err):resolve(key)));
async function hashPassword(password,saltB64){const salt=unb64u(saltB64);const key=await scryptKey(password,salt);return `scrypt$16384$8$1$${hexBytes(key)}`}
async function verifyPassword(password,saltB64,stored){const salt=unb64u(saltB64);if(String(stored||'').startsWith('scrypt$')){const got=await hashPassword(password,saltB64);return got===stored}try{return hexBytes(await legacyPbkdf2(password,salt))===stored}catch{return false}}
function cookie(request,name){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const [k,...rest]=part.trim().split('=');if(k===name)return decodeURIComponent(rest.join('='))}return null}
function sessionCookie(token,maxAge=60*60*24*30){return `ritmo_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`}
function clearSessionCookie(){return 'ritmo_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'}
async function body(request){try{return await request.json()}catch{return {}}}
function sameOrigin(request){const origin=request.headers.get('origin');if(!origin)return true;try{return new URL(origin).host===new URL(request.url).host}catch{return false}}
function appOrigin(env,request){try{return new URL(env.APP_URL||request.url).origin}catch{return new URL(request.url).origin}}
function rpId(env,request){return new URL(appOrigin(env,request)).hostname}

async function challengePut(env,key,value){if(!env.CACHE)throw new Error('KV indisponível');await env.CACHE.put(key,JSON.stringify(value),{expirationTtl:300})}
async function challengeTake(env,key){if(!env.CACHE)return null;const raw=await env.CACHE.get(key);if(raw)await env.CACHE.delete(key);try{return raw?JSON.parse(raw):null}catch{return null}}
async function rateLimit(env,request,keyPrefix,limit=25,ttl=600){if(!env.CACHE)return true;const ip=request.headers.get('cf-connecting-ip')||'unknown';const key=`rate:${keyPrefix}:${ip}`;const n=Number(await env.CACHE.get(key)||0);if(n>=limit)return false;await env.CACHE.put(key,String(n+1),{expirationTtl:ttl});return true}
async function getSession(env,request){const token=cookie(request,'ritmo_session');if(!token)return null;const h=await sha(token);const row=await env.DB.prepare(`SELECT s.id sid,s.user_id,u.id,u.username,u.name,u.avatar_key,u.data_version,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(h,now()).first();return row||null}
async function requireUser(env,request){const s=await getSession(env,request);return s}
async function newSession(env,userId,request){const token=b64u(crypto.getRandomValues(new Uint8Array(32)));const tokenHash=await sha(token);const expires=new Date(Date.now()+30*864e5).toISOString();await env.DB.prepare(`INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)`).bind(uid(),userId,tokenHash,expires).run();return {token,expires}}
async function bump(env,userId,action='update',entityType='account',entityId=null){await env.DB.batch([
  env.DB.prepare(`UPDATE users SET data_version=data_version+1,updated_at=? WHERE id=?`).bind(now(),userId),
  env.DB.prepare(`INSERT INTO audit_log(id,user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?,?)`).bind(uid(),userId,action,entityType,entityId,now())
]);}

function inviteCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=crypto.getRandomValues(new Uint8Array(10));return [...r].map(x=>chars[x%chars.length]).join('')}
async function partnershipState(env,userId){const member=await env.DB.prepare(`SELECT partnership_id FROM partnership_members WHERE user_id=?`).bind(userId).first();if(!member)return {id:null,members:[],active:false};const rows=await env.DB.prepare(`SELECT pm.user_id,pm.role,pm.joined_at,u.name,u.username FROM partnership_members pm JOIN users u ON u.id=pm.user_id WHERE pm.partnership_id=? ORDER BY pm.joined_at`).bind(member.partnership_id).all();const members=rows.results||[];return {id:member.partnership_id,members,active:members.length===2}}
async function activePartnership(env,userId){const p=await partnershipState(env,userId);return p.active?p:null}
async function touchUsers(env,userIds){const ids=[...new Set((userIds||[]).filter(Boolean))];if(!ids.length)return;await env.DB.batch(ids.map(id=>env.DB.prepare(`UPDATE users SET data_version=data_version+1,updated_at=? WHERE id=?`).bind(now(),id)))}
async function bumpPartnership(env,partnershipId,actorUserId,action='update',entityType='shared',entityId=null){const rows=await env.DB.prepare(`SELECT user_id FROM partnership_members WHERE partnership_id=?`).bind(partnershipId).all();const ids=(rows.results||[]).map(x=>x.user_id);const stmts=ids.map(id=>env.DB.prepare(`UPDATE users SET data_version=data_version+1,updated_at=? WHERE id=?`).bind(now(),id));stmts.push(env.DB.prepare(`INSERT INTO audit_log(id,user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?,?)`).bind(uid(),actorUserId,action,entityType,entityId,now()));await env.DB.batch(stmts)}
async function sharedDebtBalance(env,partnershipId,debtId){const d=await env.DB.prepare(`SELECT total_amount,status FROM shared_debts WHERE id=? AND partnership_id=?`).bind(debtId,partnershipId).first();if(!d)return null;const x=await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) paid FROM shared_debt_events WHERE debt_id=? AND partnership_id=?`).bind(debtId,partnershipId).first();return {total:Number(d.total_amount),paid:Number(x?.paid||0),balance:Math.max(0,Number(d.total_amount)-Number(x?.paid||0)),status:d.status}}
async function normalizeSharedDebtStatus(env,partnershipId,debtId){const b=await sharedDebtBalance(env,partnershipId,debtId);if(!b)return;await env.DB.prepare(`UPDATE shared_debts SET status=?,updated_at=? WHERE id=? AND partnership_id=?`).bind(b.balance<=0?'quitada':'ativa',now(),debtId,partnershipId).run()}

async function debtBalance(env,userId,debtId){const d=await env.DB.prepare(`SELECT total_amount,status FROM debts WHERE id=? AND user_id=?`).bind(debtId,userId).first();if(!d)return null;const s=await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) paid FROM debt_events WHERE debt_id=? AND user_id=?`).bind(debtId,userId).first();return {total:Number(d.total_amount),paid:Number(s?.paid||0),balance:Math.max(0,Number(d.total_amount)-Number(s?.paid||0)),status:d.status}}
async function normalizeDebtStatus(env,userId,debtId){const b=await debtBalance(env,userId,debtId);if(!b)return;const st=b.balance<=0?'quitada':'ativa';await env.DB.prepare(`UPDATE debts SET status=?,updated_at=? WHERE id=? AND user_id=?`).bind(st,now(),debtId,userId).run();}
function mapMoney(rows,fields=['amount']){return rows.map(r=>{const x={...r};for(const f of fields)if(f in x)x[f]=fromCents(x[f]);return x})}

let ritmoWalletSchemaPromise=null;
async function ensureWalletSchema(env){
  if(!ritmoWalletSchemaPromise)ritmoWalletSchemaPromise=(async()=>{
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS wallet_transactions (id TEXT PRIMARY KEY,owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,couple_id TEXT REFERENCES partnerships(id) ON DELETE CASCADE,wallet_type TEXT NOT NULL CHECK(wallet_type IN ('personal','shared')),transaction_type TEXT NOT NULL CHECK(transaction_type IN ('income','expense','transfer')),source_wallet TEXT CHECK(source_wallet IS NULL OR source_wallet IN ('personal','shared')),destination_wallet TEXT CHECK(destination_wallet IS NULL OR destination_wallet IN ('personal','shared')),created_by TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL CHECK(amount > 0),date TEXT NOT NULL,description TEXT,source_entity_type TEXT,source_entity_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK(transaction_type <> 'transfer' OR (source_wallet IS NOT NULL AND destination_wallet IS NOT NULL AND source_wallet <> destination_wallet)))`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_wallet_tx_owner_date ON wallet_transactions(owner_user_id,date DESC,created_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_wallet_tx_couple_date ON wallet_transactions(couple_id,date DESC,created_at DESC)`).run();
  })();
  try{await ritmoWalletSchemaPromise}catch(e){ritmoWalletSchemaPromise=null;throw e}
}
async function walletPersonalBalanceCents(env,userId,excludeTransferId=null){
  await ensureWalletSchema(env);const [inc,out,sent]=await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM incomes WHERE user_id=? AND date<=?`).bind(userId,today()).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id=? AND status='pago' AND date<=?`).bind(userId,today()).first(),
    excludeTransferId?env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM wallet_transactions WHERE owner_user_id=? AND transaction_type='transfer' AND source_wallet='personal' AND destination_wallet='shared' AND date<=? AND id<>?`).bind(userId,today(),excludeTransferId).first():env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM wallet_transactions WHERE owner_user_id=? AND transaction_type='transfer' AND source_wallet='personal' AND destination_wallet='shared' AND date<=?`).bind(userId,today()).first()
  ]);return Number(inc?.total||0)-Number(out?.total||0)-Number(sent?.total||0)
}
async function walletSharedBalanceCents(env,coupleId){
  await ensureWalletSchema(env);if(!coupleId)return 0;const [inc,out,transfers]=await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM shared_incomes WHERE partnership_id=? AND date<=?`).bind(coupleId,today()).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM shared_expenses WHERE partnership_id=? AND status='pago' AND date<=?`).bind(coupleId,today()).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM wallet_transactions WHERE couple_id=? AND transaction_type='transfer' AND destination_wallet='shared' AND date<=?`).bind(coupleId,today()).first()
  ]);return Number(inc?.total||0)+Number(transfers?.total||0)-Number(out?.total||0)
}
async function walletSnapshot(env,userId,sharing){
  await ensureWalletSchema(env);const active=!!sharing?.active,coupleId=active?sharing.id:null;
  const [pIncome,pExpense,pSent,sharedIncome,sharedExpense,sharedTransfers,transferRows,contribRows]=await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM incomes WHERE user_id=? AND date<=?`).bind(userId,today()).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id=? AND status='pago' AND date<=?`).bind(userId,today()).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM wallet_transactions WHERE owner_user_id=? AND transaction_type='transfer' AND source_wallet='personal' AND destination_wallet='shared' AND date<=?`).bind(userId,today()).first(),
    coupleId?env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM shared_incomes WHERE partnership_id=? AND date<=?`).bind(coupleId,today()).first():Promise.resolve({total:0}),
    coupleId?env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM shared_expenses WHERE partnership_id=? AND status='pago' AND date<=?`).bind(coupleId,today()).first():Promise.resolve({total:0}),
    coupleId?env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM wallet_transactions WHERE couple_id=? AND transaction_type='transfer' AND destination_wallet='shared' AND date<=?`).bind(coupleId,today()).first():Promise.resolve({total:0}),
    coupleId?env.DB.prepare(`SELECT t.*,u.name created_by_name,u.username created_by_username FROM wallet_transactions t JOIN users u ON u.id=t.created_by WHERE t.couple_id=? AND t.transaction_type='transfer' ORDER BY t.date DESC,t.created_at DESC LIMIT 30`).bind(coupleId).all():env.DB.prepare(`SELECT t.*,u.name created_by_name,u.username created_by_username FROM wallet_transactions t JOIN users u ON u.id=t.created_by WHERE t.owner_user_id=? AND t.transaction_type='transfer' ORDER BY t.date DESC,t.created_at DESC LIMIT 30`).bind(userId).all(),
    coupleId?env.DB.prepare(`SELECT t.owner_user_id,u.name,u.username,COALESCE(SUM(t.amount),0) amount FROM wallet_transactions t JOIN users u ON u.id=t.owner_user_id WHERE t.couple_id=? AND t.transaction_type='transfer' AND t.destination_wallet='shared' GROUP BY t.owner_user_id,u.name,u.username ORDER BY amount DESC`).bind(coupleId).all():Promise.resolve({results:[]})
  ]);
  const personalIncome=Number(pIncome?.total||0),personalExpense=Number(pExpense?.total||0),sent=Number(pSent?.total||0),sIncome=Number(sharedIncome?.total||0),sExpense=Number(sharedExpense?.total||0),sTransfers=Number(sharedTransfers?.total||0);
  return {personal_balance:fromCents(personalIncome-personalExpense-sent),shared_balance:fromCents(sIncome+sTransfers-sExpense),personal_income:fromCents(personalIncome),personal_expenses:fromCents(personalExpense),sent_to_shared:fromCents(sent),shared_income:fromCents(sIncome),shared_expenses:fromCents(sExpense),shared_transfers:fromCents(sTransfers),real_income_total:fromCents(personalIncome+sIncome),contributions:(contribRows.results||[]).map(x=>({...x,amount:fromCents(x.amount)})),transfers:(transferRows.results||[]).map(x=>({...x,amount:fromCents(x.amount),can_edit:x.owner_user_id===userId}))};
}
async function walletReport(env,userId,scope='personal',from=null,to=null){
  await ensureWalletSchema(env);const sharing=await partnershipState(env,userId),todayIso=today(),valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''));
  scope=scope==='shared'?'shared':'personal';from=valid(from)?from:todayIso.slice(0,7)+'-01';to=valid(to)?to:todayIso;if(from>to){const x=from;from=to;to=x}
  if(scope==='shared'&&!sharing.active)throw new Error('O relatório do casal precisa de duas contas conectadas.');
  const coupleId=sharing.active?sharing.id:null;
  let incomes,expenses,transfers,contributions={results:[]};
  if(scope==='personal'){
    [incomes,expenses,transfers]=await Promise.all([
      env.DB.prepare(`SELECT id,description,category,amount,date,created_at FROM incomes WHERE user_id=? AND date>=? AND date<=? ORDER BY date DESC,created_at DESC`).bind(userId,from,to).all(),
      env.DB.prepare(`SELECT id,description,category,amount,date,due_date,status,created_at FROM expenses WHERE user_id=? AND date>=? AND date<=? ORDER BY date DESC,created_at DESC`).bind(userId,from,to).all(),
      env.DB.prepare(`SELECT t.*,u.name created_by_name,u.username created_by_username FROM wallet_transactions t JOIN users u ON u.id=t.created_by WHERE t.owner_user_id=? AND t.transaction_type='transfer' AND t.source_wallet='personal' AND t.destination_wallet='shared' AND t.date>=? AND t.date<=? ORDER BY t.date DESC,t.created_at DESC`).bind(userId,from,to).all()
    ]);
  }else{
    [incomes,expenses,transfers,contributions]=await Promise.all([
      env.DB.prepare(`SELECT x.id,x.description,x.category,x.amount,x.date,x.created_at,u.name created_by_name FROM shared_incomes x LEFT JOIN users u ON u.id=x.created_by WHERE x.partnership_id=? AND x.date>=? AND x.date<=? ORDER BY x.date DESC,x.created_at DESC`).bind(coupleId,from,to).all(),
      env.DB.prepare(`SELECT x.id,x.description,x.category,x.amount,x.date,x.due_date,x.status,x.created_at,u.name created_by_name FROM shared_expenses x LEFT JOIN users u ON u.id=x.created_by WHERE x.partnership_id=? AND x.date>=? AND x.date<=? ORDER BY x.date DESC,x.created_at DESC`).bind(coupleId,from,to).all(),
      env.DB.prepare(`SELECT t.*,u.name created_by_name,u.username created_by_username FROM wallet_transactions t JOIN users u ON u.id=t.created_by WHERE t.couple_id=? AND t.transaction_type='transfer' AND t.destination_wallet='shared' AND t.date>=? AND t.date<=? ORDER BY t.date DESC,t.created_at DESC`).bind(coupleId,from,to).all(),
      env.DB.prepare(`SELECT t.owner_user_id,u.name,u.username,COALESCE(SUM(t.amount),0) amount FROM wallet_transactions t JOIN users u ON u.id=t.owner_user_id WHERE t.couple_id=? AND t.transaction_type='transfer' AND t.destination_wallet='shared' AND t.date>=? AND t.date<=? GROUP BY t.owner_user_id,u.name,u.username ORDER BY amount DESC`).bind(coupleId,from,to).all()
    ]);
  }
  const inc=mapMoney(incomes.results||[]),out=mapMoney(expenses.results||[]),trs=mapMoney(transfers.results||[]),realIn=inc.filter(x=>x.date<=todayIso).reduce((s,x)=>s+Number(x.amount||0),0),realOut=out.filter(x=>x.status==='pago'&&x.date<=todayIso).reduce((s,x)=>s+Number(x.amount||0),0),plannedIn=inc.filter(x=>x.date>todayIso).reduce((s,x)=>s+Number(x.amount||0),0),pendingOut=out.filter(x=>!(x.status==='pago'&&x.date<=todayIso)).reduce((s,x)=>s+Number(x.amount||0),0),transferTotal=trs.reduce((s,x)=>s+Number(x.amount||0),0),wallet=await walletSnapshot(env,userId,sharing),periodResult=scope==='shared'?realIn+transferTotal-realOut:realIn-realOut-transferTotal;
  return {scope,from,to,summary:{income:realIn,expenses:realOut,receivable:plannedIn,pending:pendingOut,transfers:transferTotal,period_result:periodResult,current_balance:scope==='shared'?wallet.shared_balance:wallet.personal_balance,real_income_total:realIn},personal:scope==='personal'?{incomes:inc,expenses:out}:null,shared:scope==='shared'?{incomes:inc,expenses:out,contributions:(contributions.results||[]).map(x=>({...x,amount:fromCents(x.amount)}))}:null,transfers:trs};
}
async function bootstrap(env,userId,scopeOverride=null){
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
  const requested=scopeOverride==='shared'||scopeOverride==='personal'?scopeOverride:(workspace?.view_scope==='shared'?'shared':'personal');
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
  const wallet=await walletSnapshot(env,userId,sharing);
  return {profile,scope,wallet,sharing:{partnership_id:sharing.id,active:sharing.active,members,partner,incoming_invites:incoming.results||[],outgoing_invites:outgoing.results||[]},settings:{...baseSettings,mobile_shortcuts:mobileSettings?.mobile_shortcuts||'["expenses","debts","goals"]',seen_notifications:mobileSettings?.seen_notifications||'[]'},incomes:mapMoney(incomes.results||[]).map(x=>({...x,scope,shared:scope==='shared'?1:0})),expenses:mapMoney(expenses.results||[]).map(x=>({...x,scope,shared:scope==='shared'?1:0})),debts:debtRows,debt_events:ev.map(x=>({...x,scope,shared:scope==='shared'?1:0})),goals:goalRows,goal_contributions:contrib,security:{webauthn_count:Number(webauthn?.count||0)},server_time:now()};
}
async function handleAuth(request,env,path){
  if(path==='/api/auth/register'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);
    if(!await rateLimit(env,request,'register',12))return json({error:'Muitas tentativas. Tente novamente em alguns minutos.'},429);
    const b=await body(request);const username=cleanUsername(b.username);const name=String(b.name||'').trim();const password=String(b.password||'');
    if(name.length<2)return json({error:'Informe seu nome.'},400);if(username.length<3)return json({error:'O usuário precisa ter pelo menos 3 caracteres.'},400);if(password.length<8)return json({error:'A senha precisa ter no mínimo 8 caracteres.'},400);
    const exists=await env.DB.prepare(`SELECT id FROM users WHERE username_norm=?`).bind(username).first();if(exists)return json({error:'Esse usuário já está em uso.'},409);
    const id=uid();const salt=b64u(crypto.getRandomValues(new Uint8Array(18)));const ph=await hashPassword(password,salt);
    try{await env.DB.batch([
      env.DB.prepare(`INSERT INTO users(id,username,username_norm,name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id,username,username,name,ph,salt,now(),now()),
      env.DB.prepare(`INSERT INTO user_settings(user_id) VALUES(?)`).bind(id)
    ])}catch(err){console.error('register-db',err);return json({error:'Não foi possível criar a conta. Tente outro usuário ou tente novamente.'},500)}
    const s=await newSession(env,id,request);return json({ok:true,profile:{id,username,name}},201,{'set-cookie':sessionCookie(s.token)});
  }
  if(path==='/api/auth/login'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);
    if(!await rateLimit(env,request,'login',35))return json({error:'Muitas tentativas. Tente novamente em alguns minutos.'},429);
    const b=await body(request);const username=cleanUsername(b.username);const password=String(b.password||'');const u=await env.DB.prepare(`SELECT * FROM users WHERE username_norm=?`).bind(username).first();
    if(!u)return json({error:'Usuário ou senha inválidos.'},401);if(!await verifyPassword(password,u.password_salt,u.password_hash))return json({error:'Usuário ou senha inválidos.'},401);
    const s=await newSession(env,u.id,request);return json({ok:true,profile:{id:u.id,username:u.username,name:u.name}},200,{'set-cookie':sessionCookie(s.token)});
  }
  if(path==='/api/auth/logout'&&request.method==='POST'){
    const token=cookie(request,'ritmo_session');if(token){const h=await sha(token);await env.DB.prepare(`DELETE FROM sessions WHERE token_hash=?`).bind(h).run()}return json({ok:true},200,{'set-cookie':clearSessionCookie()});
  }
  return null;
}
async function api(request,env){
  const url=new URL(request.url),path=url.pathname;
  const auth=await handleAuth(request,env,path);if(auth)return auth;
  if(path==='/api/health'){try{await env.DB.prepare(`SELECT 1 ok`).first();await env.DB.prepare(`SELECT COUNT(*) count FROM webauthn_credentials`).first();return json({ok:true,app:'Ritmo',version:'1.0',db:true,security:{kv:!!env.CACHE,webauthn:true}})}catch(err){console.error('health-db',err);return json({ok:false,app:'Ritmo',version:'1.0',db:false,security:{kv:!!env.CACHE,webauthn:false}},503)}}
  const s=await requireUser(env,request);if(!s)return json({error:'Sessão expirada.'},401);
  const userId=s.user_id;
  if(path==='/api/auth/reverify'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);
    if(!await rateLimit(env,request,'reverify',25,600))return json({error:'Muitas tentativas. Aguarde alguns minutos.'},429);
    const b=await body(request),password=String(b.password||'');
    const u=await env.DB.prepare(`SELECT password_hash,password_salt FROM users WHERE id=?`).bind(userId).first();
    if(!u||!await verifyPassword(password,u.password_salt,u.password_hash))return json({error:'Senha incorreta.'},401);
    return json({ok:true});
  }
  if(path==='/api/bootstrap'&&request.method==='GET'){const qscope=url.searchParams.get('scope'),forced=qscope==='shared'||qscope==='personal'?qscope:null;return json(await bootstrap(env,userId,forced));}
  if(path==='/api/version'&&request.method==='GET'){const u=await env.DB.prepare(`SELECT data_version FROM users WHERE id=?`).bind(userId).first();return json({version:Number(u?.data_version||0)})}
  if(path==='/api/webauthn/register/options'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);if(!env.CACHE)return json({error:'Proteção do dispositivo indisponível agora.'},503);
    const u=await env.DB.prepare(`SELECT id,username,name FROM users WHERE id=?`).bind(userId).first();const existing=await env.DB.prepare(`SELECT credential_id,transports FROM webauthn_credentials WHERE user_id=?`).bind(userId).all();
    const options=await generateRegistrationOptions({rpName:'Ritmo',rpID:rpId(env,request),userID:te.encode(userId),userName:u.username,userDisplayName:u.name,attestationType:'none',supportedAlgorithmIDs:[-7,-257],excludeCredentials:(existing.results||[]).map(x=>({id:x.credential_id,transports:JSON.parse(x.transports||'[]')})),authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',requireResidentKey:false,userVerification:'required'}});
    await challengePut(env,`webauthn:reg:${userId}`,{challenge:options.challenge,origin:appOrigin(env,request),rpID:rpId(env,request)});return json(options);
  }
  if(path==='/api/webauthn/register/verify'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);const b=await body(request);const ch=await challengeTake(env,`webauthn:reg:${userId}`);if(!ch)return json({error:'A confirmação expirou. Tente ativar novamente.'},400);
    let verification;try{verification=await verifyRegistrationResponse({response:b.credential||b,expectedChallenge:ch.challenge,expectedOrigin:ch.origin,expectedRPID:ch.rpID,requireUserVerification:true})}catch(err){console.error('webauthn-register',err);return json({error:'Não foi possível validar a biometria deste dispositivo.'},400)}
    if(!verification.verified||!verification.registrationInfo)return json({error:'Não foi possível validar a biometria deste dispositivo.'},400);const info=verification.registrationInfo,c=info.credential;const exists=await env.DB.prepare(`SELECT user_id FROM webauthn_credentials WHERE credential_id=?`).bind(c.id).first();if(exists&&exists.user_id!==userId)return json({error:'Esta credencial já está vinculada a outra conta.'},409);
    if(exists)await env.DB.prepare(`UPDATE webauthn_credentials SET public_key=?,counter=?,transports=?,device_type=?,backed_up=?,last_used_at=? WHERE credential_id=? AND user_id=?`).bind(b64u(c.publicKey),Number(c.counter||0),JSON.stringify(c.transports||[]),info.credentialDeviceType||null,info.credentialBackedUp?1:0,now(),c.id,userId).run();else await env.DB.prepare(`INSERT INTO webauthn_credentials(id,user_id,credential_id,public_key,counter,transports,device_type,backed_up,created_at,last_used_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(uid(),userId,c.id,b64u(c.publicKey),Number(c.counter||0),JSON.stringify(c.transports||[]),info.credentialDeviceType||null,info.credentialBackedUp?1:0,now(),now()).run();
    await bump(env,userId,'create','webauthn',c.id);return json({ok:true});
  }
  if(path==='/api/webauthn/auth/options'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);if(!env.CACHE)return json({error:'Proteção do dispositivo indisponível agora.'},503);const creds=await env.DB.prepare(`SELECT credential_id,transports FROM webauthn_credentials WHERE user_id=?`).bind(userId).all();if(!(creds.results||[]).length)return json({error:'Nenhuma biometria está vinculada a esta conta.'},404);
    const options=await generateAuthenticationOptions({rpID:rpId(env,request),allowCredentials:(creds.results||[]).map(x=>({id:x.credential_id,transports:JSON.parse(x.transports||'[]')})),userVerification:'required'});await challengePut(env,`webauthn:auth:${userId}`,{challenge:options.challenge,origin:appOrigin(env,request),rpID:rpId(env,request)});return json(options);
  }
  if(path==='/api/webauthn/auth/verify'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);const b=await body(request);const response=b.credential||b;const ch=await challengeTake(env,`webauthn:auth:${userId}`);if(!ch)return json({error:'A confirmação expirou. Tente novamente.'},400);const passkey=await env.DB.prepare(`SELECT * FROM webauthn_credentials WHERE credential_id=? AND user_id=?`).bind(response.id,userId).first();if(!passkey)return json({error:'Credencial não encontrada.'},404);
    let verification;try{verification=await verifyAuthenticationResponse({response,expectedChallenge:ch.challenge,expectedOrigin:ch.origin,expectedRPID:ch.rpID,credential:{id:passkey.credential_id,publicKey:unb64u(passkey.public_key),counter:Number(passkey.counter||0),transports:JSON.parse(passkey.transports||'[]')},requireUserVerification:true})}catch(err){console.error('webauthn-auth',err);return json({error:'Não foi possível confirmar a biometria.'},400)}
    if(!verification.verified)return json({error:'Não foi possível confirmar a biometria.'},400);await env.DB.prepare(`UPDATE webauthn_credentials SET counter=?,last_used_at=? WHERE credential_id=? AND user_id=?`).bind(Number(verification.authenticationInfo?.newCounter||passkey.counter||0),now(),passkey.credential_id,userId).run();return json({ok:true});
  }
  if(path==='/api/webauthn/credentials'&&request.method==='DELETE'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);await env.DB.prepare(`DELETE FROM webauthn_credentials WHERE user_id=?`).bind(userId).run();if(env.CACHE){await env.CACHE.delete(`webauthn:reg:${userId}`);await env.CACHE.delete(`webauthn:auth:${userId}`)}await bump(env,userId,'delete','webauthn',userId);return json({ok:true});
  }

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

  if(path==='/api/profile'&&request.method==='PATCH'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);const b=await body(request);const name=String(b.name||'').trim();const username=cleanUsername(b.username);const password=String(b.password||'');if(name.length<2||username.length<3)return json({error:'Confira nome e usuário.'},400);if(password&&password.length<8)return json({error:'A nova senha precisa ter no mínimo 8 caracteres.'},400);
    const dup=await env.DB.prepare(`SELECT id FROM users WHERE username_norm=? AND id<>?`).bind(username,userId).first();if(dup)return json({error:'Esse usuário já está em uso.'},409);
    if(password){const salt=b64u(crypto.getRandomValues(new Uint8Array(18)));const ph=await hashPassword(password,salt);await env.DB.prepare(`UPDATE users SET name=?,username=?,username_norm=?,password_hash=?,password_salt=?,updated_at=? WHERE id=?`).bind(name,username,username,ph,salt,now(),userId).run()}else{await env.DB.prepare(`UPDATE users SET name=?,username=?,username_norm=?,updated_at=? WHERE id=?`).bind(name,username,username,now(),userId).run()}
    await bump(env,userId,'update','profile',userId);return json({ok:true});
  }
  if(path==='/api/settings'&&request.method==='PATCH'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);
    const b=await body(request);const keys=['theme','notifications_enabled','notify_due','notify_overdue','notify_goals','reminder_days','monthly_summary','auto_lock_minutes'];const current=await env.DB.prepare(`SELECT * FROM user_settings WHERE user_id=?`).bind(userId).first();const v={...current};for(const k of keys)if(k in b)v[k]=b[k];
    await env.DB.prepare(`UPDATE user_settings SET theme=?,notifications_enabled=?,notify_due=?,notify_overdue=?,notify_goals=?,reminder_days=?,monthly_summary=?,auto_lock_minutes=?,updated_at=? WHERE user_id=?`).bind(v.theme||'system',v.notifications_enabled?1:0,v.notify_due?1:0,v.notify_overdue?1:0,v.notify_goals?1:0,Math.min(30,Math.max(0,Number(v.reminder_days||0))),v.monthly_summary?1:0,Math.min(60,Math.max(0,Number(v.auto_lock_minutes||5))),now(),userId).run();
    let mobile=await env.DB.prepare(`SELECT mobile_shortcuts,seen_notifications FROM user_mobile_settings WHERE user_id=?`).bind(userId).first();let mobileShortcuts=mobile?.mobile_shortcuts||'["expenses","debts","goals"]';let seenNotifications=mobile?.seen_notifications||'[]';
    if('mobile_shortcuts' in b){const allowed=new Set(['expenses','debts','goals','calendar','insights','sharing','settings']);const src=Array.isArray(b.mobile_shortcuts)?b.mobile_shortcuts:[];const shortcuts=[];for(const k of src){if(allowed.has(k)&&!shortcuts.includes(k))shortcuts.push(k)}if(shortcuts.length!==3)return json({error:'Escolha exatamente três atalhos.'},400);mobileShortcuts=JSON.stringify(shortcuts)}
    if('seen_notifications' in b){const src=Array.isArray(b.seen_notifications)?b.seen_notifications:[];seenNotifications=JSON.stringify(src.slice(-200).map(x=>String(x).slice(0,160)))}
    if('mobile_shortcuts' in b||'seen_notifications' in b){await env.DB.prepare(`INSERT INTO user_mobile_settings(user_id,mobile_shortcuts,seen_notifications,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mobile_shortcuts=excluded.mobile_shortcuts,seen_notifications=excluded.seen_notifications,updated_at=excluded.updated_at`).bind(userId,mobileShortcuts,seenNotifications,now()).run()}
    await bump(env,userId,'update','settings',userId);return json({ok:true});
  }
  if(path==='/api/avatar'&&request.method==='GET'){
    const u=await env.DB.prepare(`SELECT avatar_key FROM users WHERE id=?`).bind(userId).first();
    if(!u?.avatar_key)return new Response(null,{status:404});
    const avatarKey=String(u.avatar_key);
    if(avatarKey.startsWith('kv:')&&env.CACHE){
      const key=avatarKey.slice(3);const item=await env.CACHE.getWithMetadata(key,{type:'arrayBuffer'});
      if(!item?.value)return new Response(null,{status:404});
      return new Response(item.value,{headers:{'content-type':item.metadata?.contentType||'image/jpeg','cache-control':'private, max-age=3600'}});
    }
    if(env.AVATARS){const o=await env.AVATARS.get(avatarKey);if(!o)return new Response(null,{status:404});return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'image/jpeg','cache-control':'private, max-age=3600'}})}
    return new Response(null,{status:404});
  }
  if(path==='/api/avatar'&&request.method==='PUT'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);const ct=request.headers.get('content-type')||'';
    if(!/^image\/(jpeg|png|webp)$/.test(ct))return json({error:'Use JPG, PNG ou WebP.'},400);
    const buf=await request.arrayBuffer();if(buf.byteLength>1024*1024)return json({error:'A foto deve ter até 1 MB após otimização.'},413);
    const old=await env.DB.prepare(`SELECT avatar_key FROM users WHERE id=?`).bind(userId).first();let key='';
    if(env.AVATARS){const ext=ct.split('/')[1].replace('jpeg','jpg');key=`avatars/${userId}/${uid()}.${ext}`;await env.AVATARS.put(key,buf,{httpMetadata:{contentType:ct}})}
    else if(env.CACHE){const kvKey=`avatar:${userId}:${uid()}`;await env.CACHE.put(kvKey,buf,{metadata:{contentType:ct}});key=`kv:${kvKey}`}
    else return json({error:'O armazenamento de foto está temporariamente indisponível.'},503);
    await env.DB.prepare(`UPDATE users SET avatar_key=?,updated_at=? WHERE id=?`).bind(key,now(),userId).run();
    if(old?.avatar_key&&old.avatar_key!==key){const previous=String(old.avatar_key);try{if(previous.startsWith('kv:')&&env.CACHE)await env.CACHE.delete(previous.slice(3));else if(env.AVATARS)await env.AVATARS.delete(previous)}catch{}}
    await bump(env,userId,'update','avatar',userId);return json({ok:true});
  }
  const b=request.method==='GET'?{}:await body(request);

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
    const p=await activePartnership(env,userId);if(!p)return json({error:'Compartilhamento indisponível.'},400);const debtId=sharedMatch[1],kind=sharedMatch[2]==='payment'?'pagamento':'haver',d=await sharedDebtBalance(env,p.id,debtId);if(!d)return json({error:'Dívida compartilhada não encontrada.'},404);const amount=Math.min(cents(b.amount),d.balance);if(amount<=0)return json({error:'Informe um valor válido.'},400);const eventId=uid(),date=b.date||today(),stmts=[env.DB.prepare(`INSERT INTO shared_debt_events(id,partnership_id,created_by,debt_id,kind,amount,date,notes,cash_received,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(eventId,p.id,userId,debtId,kind,amount,date,b.notes||null,0,now(),now())];
    if(kind==='pagamento'||kind==='haver')stmts.push(env.DB.prepare(`INSERT INTO shared_expenses(id,partnership_id,created_by,updated_by,description,category,amount,date,due_date,status,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'pago',?,'divida',?,?,?,?)`).bind(uid(),p.id,userId,userId,kind==='haver'?'Haver da dívida':'Pagamento de dívida','Dívidas',amount,date,date,b.notes||null,debtId,eventId,now(),now()));
    
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


  if(path==='/api/wallet/report'&&request.method==='GET'){const rs=url.searchParams.get('scope'),rf=url.searchParams.get('from'),rt=url.searchParams.get('to');try{return json(await walletReport(env,userId,rs,rf,rt))}catch(e){return json({error:e.message||'Não foi possível gerar o relatório.'},400)}}
  if(path==='/api/wallet/transfers'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);await ensureWalletSchema(env);const p=await activePartnership(env,userId);if(!p)return json({error:'Conecte seu parceiro antes de transferir para o casal.'},400);const amount=cents(b.amount),date=b.date||today(),description=String(b.description||'').trim().slice(0,180)||null;if(amount<=0)return json({error:'Informe um valor válido.'},400);if(date>today())return json({error:'A transferência deve ser registrada quando o dinheiro realmente for movido.'},400);const available=await walletPersonalBalanceCents(env,userId);if(amount>available)return json({error:'O valor é maior que seu saldo pessoal disponível.'},400);const id=uid();await env.DB.prepare(`INSERT INTO wallet_transactions(id,owner_user_id,couple_id,wallet_type,transaction_type,source_wallet,destination_wallet,created_by,amount,date,description,created_at,updated_at) VALUES(?,?,?,'shared','transfer','personal','shared',?,?,?,?,?,?)`).bind(id,userId,p.id,userId,amount,date,description,now(),now()).run();await bumpPartnership(env,p.id,userId,'create','wallet_transfer',id);return json({ok:true,id},201);
  }
  const transferMatch=path.match(/^\/api\/wallet\/transfers\/([a-f0-9-]+)$/i);
  if(transferMatch){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);await ensureWalletSchema(env);const id=transferMatch[1],row=await env.DB.prepare(`SELECT * FROM wallet_transactions WHERE id=? AND transaction_type='transfer'`).bind(id).first();if(!row||row.owner_user_id!==userId)return json({error:'Transferência não encontrada.'},404);const p=await activePartnership(env,userId);if(!p||p.id!==row.couple_id)return json({error:'Transferência indisponível.'},400);
    if(request.method==='DELETE'){await env.DB.prepare(`DELETE FROM wallet_transactions WHERE id=? AND owner_user_id=?`).bind(id,userId).run();await bumpPartnership(env,p.id,userId,'delete','wallet_transfer',id);return json({ok:true})}
    if(request.method==='PATCH'){const amount=cents(b.amount),date=b.date||row.date,description=String(b.description??row.description??'').trim().slice(0,180)||null;if(amount<=0)return json({error:'Informe um valor válido.'},400);if(date>today())return json({error:'A transferência deve representar dinheiro já movimentado.'},400);const available=await walletPersonalBalanceCents(env,userId,id);if(amount>available)return json({error:'O valor é maior que seu saldo pessoal disponível.'},400);await env.DB.prepare(`UPDATE wallet_transactions SET amount=?,date=?,description=?,updated_at=? WHERE id=? AND owner_user_id=?`).bind(amount,date,description,now(),id,userId).run();await bumpPartnership(env,p.id,userId,'update','wallet_transfer',id);return json({ok:true})}
  }

  if(path==='/api/incomes'&&request.method==='POST'){
    const id=uid();await env.DB.prepare(`INSERT INTO incomes(id,user_id,description,category,amount,date,notes,recurrence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,userId,String(b.description||'Entrada').trim(),String(b.category||'Outros'),cents(b.amount),b.date||today(),b.notes||null,b.recurrence||'Nenhuma',now(),now()).run();await bump(env,userId,'create','income',id);return json({ok:true,id},201)
  }
  if(path==='/api/expenses'&&request.method==='POST'){
    const id=uid();await env.DB.prepare(`INSERT INTO expenses(id,user_id,description,category,amount,date,due_date,status,notes,recurrence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,userId,String(b.description||'Saída').trim(),String(b.category||'Outros'),cents(b.amount),b.date||today(),b.due_date||null,b.status==='pago'?'pago':'pendente',b.notes||null,b.recurrence||'Nenhuma',now(),now()).run();await bump(env,userId,'create','expense',id);return json({ok:true,id},201)
  }
  if(path==='/api/debts'&&request.method==='POST'){
    const id=uid();await env.DB.prepare(`INSERT INTO debts(id,user_id,creditor,total_amount,start_date,due_date,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,userId,String(b.creditor||'Dívida').trim(),cents(b.total_amount),b.start_date||today(),b.due_date||null,b.notes||null,'ativa',now(),now()).run();await bump(env,userId,'create','debt',id);return json({ok:true,id},201)
  }
  if(path==='/api/goals'&&request.method==='POST'){
    const id=uid();await env.DB.prepare(`INSERT INTO goals(id,user_id,name,target_amount,deadline,category,is_emergency,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,userId,String(b.name||'Meta').trim(),cents(b.target_amount),b.deadline||null,b.category||'Personalizado',b.is_emergency?1:0,b.notes||null,now(),now()).run();await bump(env,userId,'create','goal',id);return json({ok:true,id},201)
  }
  let m=path.match(/^\/api\/(incomes|expenses|debts|goals)\/([a-f0-9-]+)$/i);
  if(m){const table=m[1],id=m[2];if(request.method==='DELETE'){
      const row=await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND user_id=?`).bind(id,userId).first();if(!row)return json({error:'Item não encontrado.'},404);
      if(table==='debts'){await env.DB.batch([env.DB.prepare(`DELETE FROM expenses WHERE debt_id=? AND user_id=?`).bind(id,userId),env.DB.prepare(`DELETE FROM incomes WHERE debt_id=? AND user_id=?`).bind(id,userId),env.DB.prepare(`DELETE FROM debt_events WHERE debt_id=? AND user_id=?`).bind(id,userId),env.DB.prepare(`DELETE FROM debts WHERE id=? AND user_id=?`).bind(id,userId)])}
      else if(table==='goals'){await env.DB.batch([env.DB.prepare(`DELETE FROM goal_contributions WHERE goal_id=? AND user_id=?`).bind(id,userId),env.DB.prepare(`DELETE FROM goals WHERE id=? AND user_id=?`).bind(id,userId)])}
      else await env.DB.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`).bind(id,userId).run();await bump(env,userId,'delete',table,id);return json({ok:true})
    }
    if(request.method==='PATCH'){
      if(table==='incomes')await env.DB.prepare(`UPDATE incomes SET description=?,category=?,amount=?,date=?,notes=?,recurrence=?,updated_at=? WHERE id=? AND user_id=?`).bind(b.description,b.category||'Outros',cents(b.amount),b.date||today(),b.notes||null,b.recurrence||'Nenhuma',now(),id,userId).run();
      if(table==='expenses')await env.DB.prepare(`UPDATE expenses SET description=?,category=?,amount=?,date=?,due_date=?,status=?,notes=?,recurrence=?,updated_at=? WHERE id=? AND user_id=?`).bind(b.description,b.category||'Outros',cents(b.amount),b.date||today(),b.due_date||null,b.status==='pago'?'pago':'pendente',b.notes||null,b.recurrence||'Nenhuma',now(),id,userId).run();
      if(table==='debts')await env.DB.prepare(`UPDATE debts SET creditor=?,total_amount=?,start_date=?,due_date=?,notes=?,updated_at=? WHERE id=? AND user_id=?`).bind(b.creditor,cents(b.total_amount),b.start_date||today(),b.due_date||null,b.notes||null,now(),id,userId).run();
      if(table==='goals')await env.DB.prepare(`UPDATE goals SET name=?,target_amount=?,deadline=?,category=?,is_emergency=?,notes=?,updated_at=? WHERE id=? AND user_id=?`).bind(b.name,cents(b.target_amount),b.deadline||null,b.category||'Personalizado',b.is_emergency?1:0,b.notes||null,now(),id,userId).run();
      await bump(env,userId,'update',table,id);if(table==='debts')await normalizeDebtStatus(env,userId,id);return json({ok:true})
    }
  }
  m=path.match(/^\/api\/debts\/([a-f0-9-]+)\/(payment|credit)$/i);
  if(m&&request.method==='POST'){
    const debtId=m[1],kind=m[2]==='payment'?'pagamento':'haver';const d=await debtBalance(env,userId,debtId);if(!d)return json({error:'Dívida não encontrada.'},404);const amount=Math.min(cents(b.amount),d.balance);if(amount<=0)return json({error:'Informe um valor válido.'},400);const eventId=uid(),date=b.date||today();const stmts=[env.DB.prepare(`INSERT INTO debt_events(id,user_id,debt_id,kind,amount,date,notes,cash_received,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(eventId,userId,debtId,kind,amount,date,b.notes||null,0,now(),now())];
    if(kind==='pagamento'||kind==='haver')stmts.push(env.DB.prepare(`INSERT INTO expenses(id,user_id,description,category,amount,date,due_date,status,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uid(),userId,kind==='haver'?'Haver da dívida':'Pagamento de dívida','Dívidas',amount,date,date,'pago',b.notes||null,'divida',debtId,eventId,now(),now()));
    
    await env.DB.batch(stmts);await normalizeDebtStatus(env,userId,debtId);await bump(env,userId,'create',kind,eventId);return json({ok:true,id:eventId})
  }
  m=path.match(/^\/api\/debt-events\/([a-f0-9-]+)$/i);
  if(m&&request.method==='DELETE'){
    const id=m[1];const e=await env.DB.prepare(`SELECT * FROM debt_events WHERE id=? AND user_id=?`).bind(id,userId).first();if(!e)return json({error:'Lançamento não encontrado.'},404);await env.DB.batch([env.DB.prepare(`DELETE FROM expenses WHERE debt_event_id=? AND user_id=?`).bind(id,userId),env.DB.prepare(`DELETE FROM incomes WHERE debt_event_id=? AND user_id=?`).bind(id,userId),env.DB.prepare(`DELETE FROM debt_events WHERE id=? AND user_id=?`).bind(id,userId)]);await normalizeDebtStatus(env,userId,e.debt_id);await bump(env,userId,'delete','debt_event',id);return json({ok:true})
  }
  m=path.match(/^\/api\/goals\/([a-f0-9-]+)\/contributions$/i);
  if(m&&request.method==='POST'){
    const goalId=m[1];const g=await env.DB.prepare(`SELECT id FROM goals WHERE id=? AND user_id=?`).bind(goalId,userId).first();if(!g)return json({error:'Meta não encontrada.'},404);const id=uid();await env.DB.prepare(`INSERT INTO goal_contributions(id,user_id,goal_id,amount,date,notes,created_at) VALUES(?,?,?,?,?,?,?)`).bind(id,userId,goalId,cents(b.amount),b.date||today(),b.notes||null,now()).run();await bump(env,userId,'create','goal_contribution',id);return json({ok:true,id},201)
  }
  m=path.match(/^\/api\/goal-contributions\/([a-f0-9-]+)$/i);
  if(m&&request.method==='DELETE'){const id=m[1];await env.DB.prepare(`DELETE FROM goal_contributions WHERE id=? AND user_id=?`).bind(id,userId).run();await bump(env,userId,'delete','goal_contribution',id);return json({ok:true})}
  return json({error:'Rota não encontrada.'},404);
}
export default {async fetch(request,env){const url=new URL(request.url);try{if(url.pathname.startsWith('/api/'))return await api(request,env);return env.ASSETS.fetch(request)}catch(err){console.error(err);return url.pathname.startsWith('/api/')?json({error:'Não foi possível concluir esta operação.'},500):env.ASSETS.fetch(request)}}};

/* legacy-ci: AV da dívida (payment|credit|av) */
