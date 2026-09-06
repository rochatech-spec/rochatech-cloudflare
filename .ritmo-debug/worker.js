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
async function verifyTurnstile(env,request,token){if(!env.TURNSTILE_SECRET)return {ok:true};if(!token)return {ok:false};try{const fd=new FormData();fd.set('secret',env.TURNSTILE_SECRET);fd.set('response',String(token));const ip=request.headers.get('cf-connecting-ip');if(ip)fd.set('remoteip',ip);const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:fd});const d=await r.json();return {ok:!!d.success,details:d}}catch(err){console.error('turnstile',err);return {ok:false}}}
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
async function debtBalance(env,userId,debtId){const d=await env.DB.prepare(`SELECT total_amount,status FROM debts WHERE id=? AND user_id=?`).bind(debtId,userId).first();if(!d)return null;const s=await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) paid FROM debt_events WHERE debt_id=? AND user_id=?`).bind(debtId,userId).first();return {total:Number(d.total_amount),paid:Number(s?.paid||0),balance:Math.max(0,Number(d.total_amount)-Number(s?.paid||0)),status:d.status}}
async function normalizeDebtStatus(env,userId,debtId){const b=await debtBalance(env,userId,debtId);if(!b)return;const st=b.balance<=0?'quitada':'ativa';await env.DB.prepare(`UPDATE debts SET status=?,updated_at=? WHERE id=? AND user_id=?`).bind(st,now(),debtId,userId).run();}
function mapMoney(rows,fields=['amount']){return rows.map(r=>{const x={...r};for(const f of fields)if(f in x)x[f]=fromCents(x[f]);return x})}
async function bootstrap(env,userId){
  const [profile,settings,mobileSettings,incomes,expenses,debts,events,goals,contribs,webauthn]=await Promise.all([
    env.DB.prepare(`SELECT id,username,name,avatar_key,data_version,created_at FROM users WHERE id=?`).bind(userId).first(),
    env.DB.prepare(`SELECT theme,notifications_enabled,notify_due,notify_overdue,notify_goals,reminder_days,monthly_summary,auto_lock_minutes FROM user_settings WHERE user_id=?`).bind(userId).first(),
    env.DB.prepare(`SELECT mobile_shortcuts,seen_notifications FROM user_mobile_settings WHERE user_id=?`).bind(userId).first(),
    env.DB.prepare(`SELECT * FROM incomes WHERE user_id=? ORDER BY date DESC,created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM expenses WHERE user_id=? ORDER BY COALESCE(due_date,date) DESC,created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM debts WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM debt_events WHERE user_id=? ORDER BY date DESC,created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM goals WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM goal_contributions WHERE user_id=? ORDER BY date DESC,created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT COUNT(*) count FROM webauthn_credentials WHERE user_id=?`).bind(userId).first()
  ]);
  const ev=mapMoney(events.results||[]);
  const debtRows=mapMoney(debts.results||[],['total_amount']).map(d=>{const paid=ev.filter(e=>e.debt_id===d.id).reduce((a,e)=>a+e.amount,0);return {...d,paid_amount:paid,balance:Math.max(0,d.total_amount-paid)}});
  const contrib=mapMoney(contribs.results||[]);
  const goalRows=mapMoney(goals.results||[],['target_amount']).map(g=>({...g,current_amount:contrib.filter(c=>c.goal_id===g.id).reduce((a,c)=>a+c.amount,0)}));
  const baseSettings=settings||{theme:'system',notifications_enabled:1,notify_due:1,notify_overdue:1,notify_goals:1,reminder_days:3,monthly_summary:1,auto_lock_minutes:5};
  return {profile,settings:{...baseSettings,mobile_shortcuts:mobileSettings?.mobile_shortcuts||'["expenses","debts","goals"]',seen_notifications:mobileSettings?.seen_notifications||'[]'},incomes:mapMoney(incomes.results||[]),expenses:mapMoney(expenses.results||[]),debts:debtRows,debt_events:ev,goals:goalRows,goal_contributions:contrib,security:{webauthn_count:Number(webauthn?.count||0)},server_time:now()};
}
async function handleAuth(request,env,path){
  if(path==='/api/auth/register'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);
    if(!await rateLimit(env,request,'register',12))return json({error:'Muitas tentativas. Tente novamente em alguns minutos.'},429);
    const b=await body(request);const tv=await verifyTurnstile(env,request,b.turnstileToken);if(!tv.ok)return json({error:'Não foi possível validar a verificação de segurança. Tente novamente.'},403);const username=cleanUsername(b.username);const name=String(b.name||'').trim();const password=String(b.password||'');
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
    const b=await body(request);const tv=await verifyTurnstile(env,request,b.turnstileToken);if(!tv.ok)return json({error:'Não foi possível validar a verificação de segurança. Tente novamente.'},403);const username=cleanUsername(b.username);const password=String(b.password||'');const u=await env.DB.prepare(`SELECT * FROM users WHERE username_norm=?`).bind(username).first();
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
  if(path==='/api/health'){try{await env.DB.prepare(`SELECT 1 ok`).first();await env.DB.prepare(`SELECT COUNT(*) count FROM webauthn_credentials`).first();return json({ok:true,app:'Ritmo',version:'1.0',db:true,security:{kv:!!env.CACHE,turnstile:!!env.TURNSTILE_SITEKEY&&!!env.TURNSTILE_SECRET,webauthn:true}})}catch(err){console.error('health-db',err);return json({ok:false,app:'Ritmo',version:'1.0',db:false,security:{kv:!!env.CACHE,turnstile:!!env.TURNSTILE_SITEKEY&&!!env.TURNSTILE_SECRET,webauthn:false}},503)}}
  if(path==='/api/security/config'&&request.method==='GET')return json({turnstile_sitekey:env.TURNSTILE_SITEKEY||null,webauthn:true,kv:!!env.CACHE});
  const s=await requireUser(env,request);if(!s)return json({error:'Sessão expirada.'},401);
  const userId=s.user_id;
  if(path==='/api/bootstrap'&&request.method==='GET')return json(await bootstrap(env,userId));
  if(path==='/api/version'&&request.method==='GET'){const u=await env.DB.prepare(`SELECT data_version FROM users WHERE id=?`).bind(userId).first();return json({version:Number(u?.data_version||0)})}
  if(path==='/api/webauthn/register/options'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);if(!env.CACHE)return json({error:'Proteção do dispositivo indisponível agora.'},503);
    const u=await env.DB.prepare(`SELECT id,username,name FROM users WHERE id=?`).bind(userId).first();const existing=await env.DB.prepare(`SELECT credential_id,transports FROM webauthn_credentials WHERE user_id=?`).bind(userId).all();
    const options=await generateRegistrationOptions({rpName:'Ritmo',rpID:rpId(env,request),userID:te.encode(userId),userName:u.username,userDisplayName:u.name,attestationType:'none',supportedAlgorithmIDs:[-7,-257],excludeCredentials:(existing.results||[]).map(x=>({id:x.credential_id,transports:JSON.parse(x.transports||'[]')})),authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'}});
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
    if('mobile_shortcuts' in b){const allowed=new Set(['expenses','debts','goals','calendar','insights','settings']);const src=Array.isArray(b.mobile_shortcuts)?b.mobile_shortcuts:[];const shortcuts=[];for(const k of src){if(allowed.has(k)&&!shortcuts.includes(k))shortcuts.push(k)}if(shortcuts.length!==3)return json({error:'Escolha exatamente três atalhos.'},400);mobileShortcuts=JSON.stringify(shortcuts)}
    if('seen_notifications' in b){const src=Array.isArray(b.seen_notifications)?b.seen_notifications:[];seenNotifications=JSON.stringify(src.slice(-200).map(x=>String(x).slice(0,160)))}
    if('mobile_shortcuts' in b||'seen_notifications' in b){await env.DB.prepare(`INSERT INTO user_mobile_settings(user_id,mobile_shortcuts,seen_notifications,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mobile_shortcuts=excluded.mobile_shortcuts,seen_notifications=excluded.seen_notifications,updated_at=excluded.updated_at`).bind(userId,mobileShortcuts,seenNotifications,now()).run()}
    await bump(env,userId,'update','settings',userId);return json({ok:true});
  }
  if(path==='/api/avatar'&&request.method==='GET'){
    if(!env.AVATARS)return new Response(null,{status:404});const u=await env.DB.prepare(`SELECT avatar_key FROM users WHERE id=?`).bind(userId).first();if(!u?.avatar_key)return new Response(null,{status:404});const o=await env.AVATARS.get(u.avatar_key);if(!o)return new Response(null,{status:404});return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'image/jpeg','cache-control':'private, max-age=300'}})
  }
  if(path==='/api/avatar'&&request.method==='PUT'){
    if(!env.AVATARS)return json({error:'O armazenamento privado de foto ainda não está ativado.'},503);if(!sameOrigin(request))return json({error:'Origem inválida'},403);const ct=request.headers.get('content-type')||'';if(!/^image\/(jpeg|png|webp)$/.test(ct))return json({error:'Use JPG, PNG ou WebP.'},400);const buf=await request.arrayBuffer();if(buf.byteLength>2*1024*1024)return json({error:'A imagem deve ter até 2 MB.'},413);const ext=ct.split('/')[1].replace('jpeg','jpg');const key=`avatars/${userId}/${uid()}.${ext}`;const old=await env.DB.prepare(`SELECT avatar_key FROM users WHERE id=?`).bind(userId).first();await env.AVATARS.put(key,buf,{httpMetadata:{contentType:ct}});await env.DB.prepare(`UPDATE users SET avatar_key=?,updated_at=? WHERE id=?`).bind(key,now(),userId).run();if(old?.avatar_key)await env.AVATARS.delete(old.avatar_key);await bump(env,userId,'update','avatar',userId);return json({ok:true});
  }
  const b=request.method==='GET'?{}:await body(request);
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
    const debtId=m[1],kind=m[2]==='payment'?'pagamento':'haver';const d=await debtBalance(env,userId,debtId);if(!d)return json({error:'Dívida não encontrada.'},404);const amount=Math.min(cents(b.amount),d.balance);if(amount<=0)return json({error:'Informe um valor válido.'},400);const eventId=uid(),date=b.date||today();const stmts=[env.DB.prepare(`INSERT INTO debt_events(id,user_id,debt_id,kind,amount,date,notes,cash_received,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(eventId,userId,debtId,kind,amount,date,b.notes||null,b.cash_received?1:0,now(),now())];
    if(kind==='pagamento')stmts.push(env.DB.prepare(`INSERT INTO expenses(id,user_id,description,category,amount,date,due_date,status,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uid(),userId,`Pagamento de dívida`, 'Dívidas',amount,date,date,'pago',b.notes||null,'divida',debtId,eventId,now(),now()));
    if(kind==='haver'&&b.cash_received)stmts.push(env.DB.prepare(`INSERT INTO incomes(id,user_id,description,category,amount,date,notes,origin,debt_id,debt_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uid(),userId,'Haver recebido','Haver',amount,date,b.notes||null,'divida',debtId,eventId,now(),now()));
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
