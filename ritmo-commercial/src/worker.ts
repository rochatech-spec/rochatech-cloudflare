import { scrypt } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { sendPushNotification } from '@mmmike/web-push/send';

export interface Env {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  FILES?: R2Bucket;
  APP_ORIGIN: string;
  RP_ID: string;
  RP_NAME: string;
  RECOVERY_PEPPER: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

type UserRow = { id:string; username:string; display_name:string; password_hash:string; password_salt:string; recovery_hash:string; session_version:number; activated_at:string|null };
type Session = { userId:string; username:string; displayName:string; sessionVersion:number; deviceHash:string };
type Ctx = { user: UserRow; sessionToken: string; session: Session };
const enc = new TextEncoder();
const SESSION_TTL = 60 * 60 * 24 * 30;
const DEVICE_VERIFY_TTL = 60 * 10;
const WEBAUTHN_TTL = 60 * 5;

function now() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID(); }
function json(data: unknown, status = 200, headers: HeadersInit = {}) { return Response.json(data, { status, headers }); }
function error(message:string, status=400, code='BAD_REQUEST') { return json({ message, code }, status); }
function b64url(bytes: ArrayBuffer | Uint8Array) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s=''; for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromB64url(value:string) {
  const b64=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);
  const s=atob(b64); return Uint8Array.from(s, c=>c.charCodeAt(0));
}
function randomToken(bytes=32) { const v=new Uint8Array(bytes); crypto.getRandomValues(v); return b64url(v); }
async function sha256(value:string) { return b64url(await crypto.subtle.digest('SHA-256', enc.encode(value))); }
async function hmac(value:string, secret:string) {
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64url(await crypto.subtle.sign('HMAC',key,enc.encode(value)));
}
async function hashPassword(password:string, salt = randomToken(16)) {
  const derived = await new Promise<Uint8Array>((resolve,reject) => {
    scrypt(password, fromB64url(salt), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err,key) => {
      if (err) return reject(err);
      resolve(new Uint8Array(key));
    });
  });
  return { salt, hash:b64url(derived) };
}
async function safeEqual(a:string,b:string) {
  const aa=enc.encode(a),bb=enc.encode(b); if (aa.length!==bb.length) return false;
  let diff=0; for(let i=0;i<aa.length;i++) diff|=aa[i]^bb[i]; return diff===0;
}
async function verifyPassword(password:string,user:UserRow) { const h=await hashPassword(password,user.password_salt); return safeEqual(h.hash,user.password_hash); }
function normalizeUsername(value:unknown) { return String(value||'').trim().toLowerCase(); }
function validUsername(u:string){ return /^[a-z0-9._-]{3,40}$/i.test(u); }
function validPassword(p:string){ return p.length>=8 && p.length<=128; }
function validDate(value:unknown){
  const s=String(value||''); if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d=new Date(`${s}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===s;
}
function validTime(value:unknown){ const s=String(value||''); return !s || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s); }
async function recoveryCode(username:string) {
  const tag=(await sha256(username)).replace(/[^A-Z0-9]/gi,'').slice(0,6).toUpperCase().padEnd(6,'X');
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let body=''; const rnd=new Uint8Array(20); crypto.getRandomValues(rnd);
  for(const n of rnd) body+=alphabet[n%alphabet.length];
  return `RITMO-${tag}-${body.match(/.{4}/g)!.join('-')}`;
}
async function recoveryHash(code:string,env:Env){ return hmac(code.trim().toUpperCase(),env.RECOVERY_PEPPER); }
function cents(v:unknown){ const n=Number(v); if(!Number.isFinite(n)) throw new Error('Valor inválido'); return Math.round(n*100); }
function moneyNumber(v:number){ return v/100; }

function cors(request:Request, env:Env) {
  const origin=request.headers.get('Origin')||'';
  const allow = origin && (origin===env.APP_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) ? origin : env.APP_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Device-Token,X-Idempotency-Key',
    'Access-Control-Max-Age': '86400',
  };
}
async function body<T=any>(request:Request):Promise<T>{
  const ct=request.headers.get('content-type')||''; if(!ct.includes('application/json')) throw new Error('Content-Type inválido'); return (await request.json()) as T;
}
async function userByUsername(env:Env,username:string){ return env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first<UserRow>(); }
async function userById(env:Env,id:string){ return env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<UserRow>(); }
async function issueSession(env:Env,user:UserRow,deviceToken:string){
  const token=randomToken(32);
  const session:Session={userId:user.id,username:user.username,displayName:user.display_name,sessionVersion:user.session_version,deviceHash:await sha256(deviceToken)};
  await env.SESSION_KV.put(`session:${token}`,JSON.stringify(session),{expirationTtl:SESSION_TTL});
  return token;
}
async function trustDevice(env:Env,userId:string,label='Aparelho'){
  const token=randomToken(32),hash=await sha256(token),ts=now();
  await env.DB.prepare('INSERT INTO trusted_devices(id,user_id,token_hash,label,created_at,last_seen_at) VALUES(?,?,?,?,?,?)').bind(uuid(),userId,hash,label,ts,ts).run();
  return token;
}
async function knownDevice(env:Env,userId:string,token:string){
  if(!token) return false; const hash=await sha256(token);
  const row=await env.DB.prepare('SELECT id FROM trusted_devices WHERE user_id=? AND token_hash=? AND revoked_at IS NULL').bind(userId,hash).first<{id:string}>();
  if(row) await env.DB.prepare('UPDATE trusted_devices SET last_seen_at=? WHERE id=?').bind(now(),row.id).run();
  return Boolean(row);
}
async function auth(request:Request,env:Env):Promise<Ctx|null>{
  const raw=request.headers.get('Authorization')||'';
  const deviceToken=request.headers.get('X-Device-Token')||'';
  if(!raw.startsWith('Bearer ')||!deviceToken) return null;
  const token=raw.slice(7);
  const session=await env.SESSION_KV.get<Session>(`session:${token}`,'json'); if(!session) return null;
  const suppliedDeviceHash=await sha256(deviceToken);
  if(!(await safeEqual(suppliedDeviceHash,session.deviceHash))){await env.SESSION_KV.delete(`session:${token}`);return null;}
  const user=await userById(env,session.userId); if(!user || user.session_version!==session.sessionVersion){ await env.SESSION_KV.delete(`session:${token}`); return null; }
  return {user,sessionToken:token,session};
}
async function requireAuth(request:Request,env:Env){ const ctx=await auth(request,env); if(!ctx) throw Object.assign(new Error('Sessão expirada.'),{status:401,code:'UNAUTHORIZED'}); return ctx; }
async function rateLimit(request:Request,env:Env,key:string,limit=12){
  const ip=request.headers.get('CF-Connecting-IP')||'local';
  const bucket=Math.floor(Date.now()/60000);
  const bucketKey=await sha256(`${key}:${ip}:${bucket}`);
  const expiresAt=new Date((bucket+2)*60_000).toISOString();
  await env.DB.prepare('INSERT INTO auth_rate_limits(bucket_key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket_key) DO UPDATE SET hits=hits+1').bind(bucketKey,expiresAt).run();
  const row=await env.DB.prepare('SELECT hits FROM auth_rate_limits WHERE bucket_key=?').bind(bucketKey).first<{hits:number}>();
  if(Math.random()<0.05) await env.DB.prepare('DELETE FROM auth_rate_limits WHERE expires_at<?').bind(now()).run();
  if(Number(row?.hits||0)>limit) throw Object.assign(new Error('Muitas tentativas. Aguarde um pouco.'),{status:429,code:'RATE_LIMIT'});
}

function isDataMutation(request: Request, path: string) {
  if (!['POST','PUT','PATCH','DELETE'].includes(request.method)) return false;
  return /^(\/transactions|\/debts|\/goals|\/events|\/profile)(?:\/|$)/.test(path);
}

async function runIdempotent(request: Request, env: Env, path: string, runner: () => Promise<Response | null>) {
  if (!isDataMutation(request, path)) return runner();
  const ctx = await requireAuth(request, env);
  const key = String(request.headers.get('X-Idempotency-Key') || '').trim();
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) return error('Chave de idempotência ausente ou inválida.', 400, 'INVALID_IDEMPOTENCY_KEY');
  const previous = await env.DB.prepare('SELECT status,response_body FROM idempotency_keys WHERE user_id=? AND idempotency_key=? AND method=? AND path=?').bind(ctx.user.id,key,request.method,path).first<{status:number;response_body:string|null}>();
  if (previous) {
    if (Number(previous.status) === 204) return new Response(null,{status:204});
    return new Response(previous.response_body || '{}',{status:Number(previous.status)||200,headers:{'Content-Type':'application/json; charset=utf-8','X-Idempotent-Replay':'1'}});
  }
  const response = await runner();
  if (!response) return response;
  if (response.status >= 200 && response.status < 300) {
    const bodyText = response.status === 204 ? null : await response.clone().text();
    await env.DB.prepare('INSERT OR IGNORE INTO idempotency_keys(user_id,idempotency_key,method,path,status,response_body,created_at) VALUES(?,?,?,?,?,?,?)').bind(ctx.user.id,key,request.method,path,response.status,bodyText,now()).run();
    // Limpeza oportunista para impedir crescimento sem limite.
    await env.DB.prepare("DELETE FROM idempotency_keys WHERE user_id=? AND created_at < datetime('now','-35 days')").bind(ctx.user.id).run();
  }
  return response;
}

async function authResponse(env:Env,user:UserRow,deviceToken?:string){
  const dev=deviceToken||await trustDevice(env,user.id);
  const sessionToken=await issueSession(env,user,dev);
  return {user:{id:user.id,username:user.username,displayName:user.display_name},sessionToken,deviceToken:dev};
}

async function handleAuth(request:Request,env:Env,path:string){
  if(path==='/auth/session' && request.method==='GET'){
    const ctx=await auth(request,env); return ctx ? json({authenticated:true,user:{id:ctx.user.id,username:ctx.user.username,displayName:ctx.user.display_name}}) : json({authenticated:false});
  }
  if(path==='/auth/register' && request.method==='POST'){
    await rateLimit(request,env,'register',6); const b=await body(request); const username=normalizeUsername(b.username),password=String(b.password||'');
    if(!validUsername(username)) return error('Use um usuário de 3 a 40 caracteres com letras, números, ponto, hífen ou sublinhado.',400,'INVALID_USERNAME');
    if(!validPassword(password)) return error('A senha precisa ter entre 8 e 128 caracteres.',400,'INVALID_PASSWORD');
    const existing=await userByUsername(env,username); if(existing?.activated_at) return error('Este usuário já existe.',409,'USERNAME_EXISTS');
    const code=await recoveryCode(username), rh=await recoveryHash(code,env), ph=await hashPassword(password),id=existing?.id||uuid(),ts=now();
    if(existing){
      await env.DB.prepare('UPDATE users SET display_name=?,password_hash=?,password_salt=?,recovery_hash=?,updated_at=? WHERE id=?').bind(username,ph.hash,ph.salt,rh,ts,id).run();
    }else{
      await env.DB.batch([
        env.DB.prepare('INSERT INTO users(id,username,display_name,password_hash,password_salt,recovery_hash,activated_at,created_at,updated_at) VALUES(?,?,?,?,?,?,NULL,?,?)').bind(id,username,username,ph.hash,ph.salt,rh,ts,ts),
        env.DB.prepare('INSERT INTO profiles(user_id,theme,due_notifications,goal_notifications,updated_at) VALUES(?,?,?,?,?)').bind(id,'system',1,1,ts),
      ]);
    }
    const activationToken=randomToken(24); await env.SESSION_KV.put(`activate:${activationToken}`,JSON.stringify({userId:id}),{expirationTtl:60*30});
    return json({user:{id,username,displayName:username},activationToken,recoveryCode:code},201);
  }
  if(path==='/auth/register/confirm' && request.method==='POST'){
    const b=await body(request),token=String(b.activationToken||''),pending=await env.SESSION_KV.get<{userId:string}>(`activate:${token}`,'json');
    if(!pending) return error('A confirmação do primeiro acesso expirou. Refaça o primeiro acesso para gerar um novo código.',410,'ACTIVATION_EXPIRED');
    await env.DB.prepare('UPDATE users SET activated_at=?,updated_at=? WHERE id=? AND activated_at IS NULL').bind(now(),now(),pending.userId).run(); await env.SESSION_KV.delete(`activate:${token}`);
    const user=await userById(env,pending.userId); if(!user) return error('Conta não encontrada.',404,'NOT_FOUND'); return json(await authResponse(env,user));
  }
  if(path==='/auth/login' && request.method==='POST'){
    await rateLimit(request,env,'login'); const b=await body(request); const username=normalizeUsername(b.username),password=String(b.password||''); const user=await userByUsername(env,username);
    if(!user || !user.activated_at || !(await verifyPassword(password,user))) return error('Usuário ou senha incorretos.',401,'INVALID_CREDENTIALS');
    const supplied=request.headers.get('X-Device-Token')||'';
    if(!(await knownDevice(env,user.id,supplied))){ const verificationId=randomToken(24); await env.SESSION_KV.put(`deviceverify:${verificationId}`,JSON.stringify({userId:user.id}),{expirationTtl:DEVICE_VERIFY_TTL}); return json({requiresDeviceVerification:true,verificationId,username:user.username},428); }
    return json(await authResponse(env,user,supplied));
  }
  if(path==='/auth/device/verify' && request.method==='POST'){
    await rateLimit(request,env,'device-verify'); const b=await body(request); const id=String(b.verificationId||''), code=String(b.recoveryCode||'').trim().toUpperCase();
    const pending=await env.SESSION_KV.get<{userId:string}>(`deviceverify:${id}`,'json'); if(!pending) return error('A autorização deste aparelho expirou. Entre novamente.',410,'VERIFICATION_EXPIRED');
    const user=await userById(env,pending.userId); if(!user || !(await safeEqual(await recoveryHash(code,env),user.recovery_hash))) return error('Código de recuperação inválido.',401,'INVALID_RECOVERY_CODE');
    await env.SESSION_KV.delete(`deviceverify:${id}`); return json(await authResponse(env,user));
  }
  if(path==='/auth/recover' && request.method==='POST'){
    await rateLimit(request,env,'recover',8); const b=await body(request); const username=normalizeUsername(b.username),code=String(b.recoveryCode||'').trim().toUpperCase(),newPassword=String(b.newPassword||'');
    if(!validPassword(newPassword)) return error('A nova senha precisa ter entre 8 e 128 caracteres.',400,'INVALID_PASSWORD'); const user=await userByUsername(env,username);
    if(!user || !user.activated_at || !(await safeEqual(await recoveryHash(code,env),user.recovery_hash))) return error('Usuário ou código de recuperação inválidos.',401,'INVALID_RECOVERY_CODE');
    const ph=await hashPassword(newPassword); await env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,session_version=session_version+1,updated_at=? WHERE id=?').bind(ph.hash,ph.salt,now(),user.id).run();
    const refreshed=(await userById(env,user.id))!; return json(await authResponse(env,refreshed));
  }
  if(path==='/auth/logout' && request.method==='POST'){
    const ctx=await auth(request,env); if(ctx) await env.SESSION_KV.delete(`session:${ctx.sessionToken}`); return new Response(null,{status:204});
  }
  if(path==='/auth/password' && request.method==='PUT'){
    const ctx=await requireAuth(request,env),b=await body(request),cur=String(b.currentPassword||''),np=String(b.newPassword||'');
    if(!(await verifyPassword(cur,ctx.user))) return error('Senha atual incorreta.',401,'INVALID_PASSWORD'); if(!validPassword(np)) return error('A nova senha precisa ter entre 8 e 128 caracteres.',400,'INVALID_PASSWORD');
    const ph=await hashPassword(np); await env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,session_version=session_version+1,updated_at=? WHERE id=?').bind(ph.hash,ph.salt,now(),ctx.user.id).run();
    await env.SESSION_KV.delete(`session:${ctx.sessionToken}`);
    const refreshed=(await userById(env,ctx.user.id))!; const supplied=request.headers.get('X-Device-Token')||''; const dev=(await knownDevice(env,ctx.user.id,supplied))?supplied:undefined;
    return json(await authResponse(env,refreshed,dev));
  }
  if(path==='/auth/recovery-code' && request.method==='POST'){
    const ctx=await requireAuth(request,env),b=await body(request); if(!(await verifyPassword(String(b.currentPassword||''),ctx.user))) return error('Senha atual incorreta.',401,'INVALID_PASSWORD');
    const code=await recoveryCode(ctx.user.username); await env.DB.prepare('UPDATE users SET recovery_hash=?,updated_at=? WHERE id=?').bind(await recoveryHash(code,env),now(),ctx.user.id).run(); return json({recoveryCode:code});
  }
  return null;
}

async function handlePasskeys(request:Request,env:Env,path:string){
  if(path==='/auth/passkeys' && request.method==='GET'){
    const ctx=await requireAuth(request,env); const r=await env.DB.prepare('SELECT credential_id AS id,created_at AS createdAt,name FROM passkeys WHERE user_id=? ORDER BY created_at DESC').bind(ctx.user.id).all(); return json(r.results);
  }
  if(path==='/auth/passkeys/register/options' && request.method==='POST'){
    const ctx=await requireAuth(request,env); const existing=await env.DB.prepare('SELECT credential_id,transports FROM passkeys WHERE user_id=?').bind(ctx.user.id).all<any>();
    const options=await generateRegistrationOptions({rpName:env.RP_NAME,rpID:env.RP_ID,userName:ctx.user.username,userDisplayName:ctx.user.display_name,userID:enc.encode(ctx.user.id),attestationType:'none',excludeCredentials:existing.results.map((p:any)=>({id:p.credential_id,transports:JSON.parse(p.transports||'[]')})),authenticatorSelection:{residentKey:'preferred',userVerification:'required',authenticatorAttachment:'platform'}});
    await env.SESSION_KV.put(`webauthn:reg:${ctx.user.id}`,options.challenge,{expirationTtl:WEBAUTHN_TTL}); return json(options);
  }
  if(path==='/auth/passkeys/register/verify' && request.method==='POST'){
    const ctx=await requireAuth(request,env),response=await body<any>(request),challenge=await env.SESSION_KV.get(`webauthn:reg:${ctx.user.id}`); if(!challenge) return error('Cerimônia biométrica expirada.',410,'WEBAUTHN_EXPIRED');
    const verification=await verifyRegistrationResponse({response,expectedChallenge:challenge,expectedOrigin:env.APP_ORIGIN,expectedRPID:env.RP_ID,requireUserVerification:true});
    if(!verification.verified || !verification.registrationInfo) return error('Não foi possível registrar a biometria.',400,'WEBAUTHN_FAILED');
    const {credential,credentialDeviceType,credentialBackedUp}=verification.registrationInfo;
    await env.DB.prepare('INSERT OR REPLACE INTO passkeys(credential_id,user_id,public_key,counter,transports,device_type,backed_up,name,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(credential.id,ctx.user.id,b64url(credential.publicKey),credential.counter,JSON.stringify(credential.transports||[]),credentialDeviceType,credentialBackedUp?1:0,'Biometria do aparelho',now()).run();
    await env.SESSION_KV.delete(`webauthn:reg:${ctx.user.id}`); return json({verified:true});
  }
  if(path==='/auth/passkeys/login/options' && request.method==='POST'){
    const b=await body(request),username=normalizeUsername(b.username),user=await userByUsername(env,username); if(!user) return error('Nenhuma biometria disponível para este usuário.',404,'PASSKEY_NOT_FOUND');
    const rows=await env.DB.prepare('SELECT credential_id,transports FROM passkeys WHERE user_id=?').bind(user.id).all<any>(); if(!rows.results.length) return error('Nenhuma biometria cadastrada.',404,'PASSKEY_NOT_FOUND');
    const options=await generateAuthenticationOptions({rpID:env.RP_ID,userVerification:'required',allowCredentials:rows.results.map((p:any)=>({id:p.credential_id,transports:JSON.parse(p.transports||'[]')}))});
    await env.SESSION_KV.put(`webauthn:auth:${user.id}`,options.challenge,{expirationTtl:WEBAUTHN_TTL}); return json(options);
  }
  if(path==='/auth/passkeys/login/verify' && request.method==='POST'){
    const b=await body<any>(request),username=normalizeUsername(b.username),response=b.credential,user=await userByUsername(env,username); if(!user) return error('Usuário inválido.',401,'UNAUTHORIZED');
    const supplied=request.headers.get('X-Device-Token')||''; if(!(await knownDevice(env,user.id,supplied))) return error('Este aparelho ainda não foi autorizado. Entre com sua senha e confirme o código de recuperação primeiro.',428,'NEW_DEVICE_RECOVERY_REQUIRED');
    const challenge=await env.SESSION_KV.get(`webauthn:auth:${user.id}`); if(!challenge) return error('Cerimônia biométrica expirada.',410,'WEBAUTHN_EXPIRED');
    const p=await env.DB.prepare('SELECT * FROM passkeys WHERE user_id=? AND credential_id=?').bind(user.id,response.id).first<any>(); if(!p) return error('Biometria não reconhecida.',401,'PASSKEY_NOT_FOUND');
    const credential:WebAuthnCredential={id:p.credential_id,publicKey:fromB64url(p.public_key),counter:p.counter,transports:JSON.parse(p.transports||'[]')};
    const verification=await verifyAuthenticationResponse({response,expectedChallenge:challenge,expectedOrigin:env.APP_ORIGIN,expectedRPID:env.RP_ID,credential,requireUserVerification:true}); if(!verification.verified) return error('Falha na autenticação biométrica.',401,'WEBAUTHN_FAILED');
    await env.DB.prepare('UPDATE passkeys SET counter=? WHERE credential_id=?').bind(verification.authenticationInfo.newCounter,p.credential_id).run(); await env.SESSION_KV.delete(`webauthn:auth:${user.id}`); return json(await authResponse(env,user,supplied));
  }
  return null;
}

async function bootstrap(env:Env,userId:string){
  const [profile,tx,debts,goals,events]=await env.DB.batch([
    env.DB.prepare('SELECT u.display_name,p.theme,p.due_notifications,p.goal_notifications FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=?').bind(userId),
    env.DB.prepare('SELECT id,date,description AS desc,category AS cat,type,value_cents,icon FROM transactions WHERE user_id=? ORDER BY date DESC,created_at DESC').bind(userId),
    env.DB.prepare('SELECT id,name,total_cents,remaining_cents,due,category FROM debts WHERE user_id=? ORDER BY due').bind(userId),
    env.DB.prepare('SELECT id,name,target_cents,saved_cents,due FROM goals WHERE user_id=? ORDER BY created_at DESC').bind(userId),
    env.DB.prepare('SELECT id,title,date,time,note FROM events WHERE user_id=? ORDER BY date,time').bind(userId),
  ]);
  const pr:any=profile.results?.[0]||{};
  return {profile:{displayName:pr.display_name||'',theme:pr.theme||'system',dueNotifications:Boolean(pr.due_notifications),goalNotifications:Boolean(pr.goal_notifications)},transactions:(tx.results as any[]).map(x=>({...x,value:moneyNumber(x.value_cents),value_cents:undefined})),debts:(debts.results as any[]).map(x=>({...x,total:moneyNumber(x.total_cents),remaining:moneyNumber(x.remaining_cents),total_cents:undefined,remaining_cents:undefined})),goals:(goals.results as any[]).map(x=>({...x,target:moneyNumber(x.target_cents),saved:moneyNumber(x.saved_cents),target_cents:undefined,saved_cents:undefined})),events:events.results};
}

async function handleData(request:Request,env:Env,path:string){
  const ctx=await requireAuth(request,env),uid=ctx.user.id,ts=now();
  if(path==='/bootstrap'&&request.method==='GET') return json(await bootstrap(env,uid));
  if(path==='/profile'&&request.method==='PATCH'){
    const b=await body<any>(request),sets:string[]=[],vals:any[]=[];
    if(typeof b.displayName==='string'&&b.displayName.trim()){ await env.DB.prepare('UPDATE users SET display_name=?,updated_at=? WHERE id=?').bind(b.displayName.trim().slice(0,80),ts,uid).run(); }
    if(['light','dark','system'].includes(b.theme)){sets.push('theme=?');vals.push(b.theme)} if(typeof b.dueNotifications==='boolean'){sets.push('due_notifications=?');vals.push(b.dueNotifications?1:0)} if(typeof b.goalNotifications==='boolean'){sets.push('goal_notifications=?');vals.push(b.goalNotifications?1:0)}
    if(sets.length){vals.push(ts,uid);await env.DB.prepare(`UPDATE profiles SET ${sets.join(',')},updated_at=? WHERE user_id=?`).bind(...vals).run();}
    return json((await bootstrap(env,uid)).profile);
  }
  if(path==='/transactions'&&request.method==='POST'){
    const b=await body<any>(request),id=uuid(),type=b.type==='Receita'?'Receita':'Despesa',value=Math.abs(cents(b.value)); if(!String(b.desc||'').trim()||!validDate(b.date)||!value) return error('Descrição, data e valor são obrigatórios.');
    const signed=type==='Receita'?value:-value; await env.DB.prepare('INSERT INTO transactions(id,user_id,date,description,category,type,value_cents,icon,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,uid,b.date,String(b.desc).trim().slice(0,120),String(b.cat||'Outros').trim().slice(0,60),type,signed,String(b.icon||'circle-dollar-sign'),ts,ts).run(); return json({id,date:b.date,desc:String(b.desc).trim(),cat:String(b.cat||'Outros').trim(),type,value:moneyNumber(signed),icon:b.icon||'circle-dollar-sign'},201);
  }
  const txm=path.match(/^\/transactions\/([^/]+)$/); if(txm&&request.method==='DELETE'){await env.DB.prepare('DELETE FROM transactions WHERE id=? AND user_id=?').bind(txm[1],uid).run();return new Response(null,{status:204});}
  if(path==='/debts'&&request.method==='POST'){
    const b=await body<any>(request),id=uuid(),value=Math.abs(cents(b.total)); if(!String(b.name||'').trim()||!validDate(b.due)||!value)return error('Nome, valor e vencimento são obrigatórios.'); await env.DB.prepare('INSERT INTO debts(id,user_id,name,total_cents,remaining_cents,due,category,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,uid,String(b.name).trim().slice(0,120),value,value,b.due,String(b.category||'Compromisso').trim().slice(0,60),ts,ts).run(); return json({id,name:String(b.name).trim(),total:moneyNumber(value),remaining:moneyNumber(value),due:b.due,category:String(b.category||'Compromisso')},201);
  }
  const pay=path.match(/^\/debts\/([^/]+)\/payments$/); if(pay&&request.method==='POST'){
    const b=await body<any>(request),value=Math.abs(cents(b.value)),d=await env.DB.prepare('SELECT * FROM debts WHERE id=? AND user_id=?').bind(pay[1],uid).first<any>(); if(!d||!value)return error('Dívida ou valor inválido.',404,'NOT_FOUND'); const rem=Math.max(0,d.remaining_cents-value); await env.DB.batch([env.DB.prepare('UPDATE debts SET remaining_cents=?,updated_at=? WHERE id=? AND user_id=?').bind(rem,ts,d.id,uid),env.DB.prepare('INSERT INTO debt_payments(id,debt_id,user_id,value_cents,paid_at,created_at) VALUES(?,?,?,?,?,?)').bind(uuid(),d.id,uid,Math.min(value,d.remaining_cents),String(validDate(b.date)?b.date:ts.slice(0,10)),ts)]); return json({id:d.id,name:d.name,total:moneyNumber(d.total_cents),remaining:moneyNumber(rem),due:d.due,category:d.category});
  }
  if(path==='/goals'&&request.method==='POST'){
    const b=await body<any>(request),target=Math.abs(cents(b.target)),id=uuid(); if(!String(b.name||'').trim()||!target||Boolean(b.due)&&!validDate(b.due))return error('Nome, valor e prazo da meta são inválidos.'); await env.DB.prepare('INSERT INTO goals(id,user_id,name,target_cents,saved_cents,due,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,uid,String(b.name).trim().slice(0,120),target,0,b.due||null,ts,ts).run(); return json({id,name:String(b.name).trim(),target:moneyNumber(target),saved:0,due:b.due||''},201);
  }
  const contrib=path.match(/^\/goals\/([^/]+)\/contributions$/); if(contrib&&request.method==='POST'){
    const b=await body<any>(request),value=Math.abs(cents(b.value)),g=await env.DB.prepare('SELECT * FROM goals WHERE id=? AND user_id=?').bind(contrib[1],uid).first<any>(); if(!g||!value)return error('Meta ou valor inválido.',404,'NOT_FOUND'); const saved=Math.min(g.target_cents,g.saved_cents+value); await env.DB.batch([env.DB.prepare('UPDATE goals SET saved_cents=?,updated_at=? WHERE id=? AND user_id=?').bind(saved,ts,g.id,uid),env.DB.prepare('INSERT INTO goal_contributions(id,goal_id,user_id,value_cents,created_at) VALUES(?,?,?,?,?)').bind(uuid(),g.id,uid,Math.min(value,g.target_cents-g.saved_cents),ts)]); return json({id:g.id,name:g.name,target:moneyNumber(g.target_cents),saved:moneyNumber(saved),due:g.due||''});
  }
  if(path==='/events'&&request.method==='POST'){
    const b=await body<any>(request),id=uuid();if(!String(b.title||'').trim()||!validDate(b.date)||!validTime(b.time))return error('Nome, data ou horário inválido.');await env.DB.prepare('INSERT INTO events(id,user_id,title,date,time,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,uid,String(b.title).trim().slice(0,120),b.date,b.time||null,String(b.note||'').slice(0,400),ts,ts).run();return json({id,title:String(b.title).trim(),date:b.date,time:b.time||'',note:String(b.note||'')},201);
  }
  const ev=path.match(/^\/events\/([^/]+)$/);if(ev&&request.method==='DELETE'){await env.DB.prepare('DELETE FROM events WHERE id=? AND user_id=?').bind(ev[1],uid).run();return new Response(null,{status:204});}
  return null;
}

async function handlePush(request:Request,env:Env,path:string){
  if(path==='/push/vapid-public-key'&&request.method==='GET'){await requireAuth(request,env);return json({publicKey:env.VAPID_PUBLIC_KEY});}
  if(path==='/push/subscribe'&&request.method==='POST'){
    const ctx=await requireAuth(request,env),b=await body<any>(request);if(!b.endpoint||!b.keys?.p256dh||!b.keys?.auth)return error('Assinatura push inválida.');const ts=now();await env.DB.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=excluded.updated_at').bind(uuid(),ctx.user.id,b.endpoint,b.keys.p256dh,b.keys.auth,ts,ts).run();return json({ok:true});
  }
  if(path==='/push/test'&&request.method==='POST'){
    const ctx=await requireAuth(request,env),rows=await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').bind(ctx.user.id).all<any>();let delivered=0;
    for(const s of rows.results){try{await sendPushNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},{title:'Ritmo',body:'Notificações ativadas com sucesso.',url:'/',tag:'ritmo-notification'},{publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY,subject:env.VAPID_SUBJECT});delivered++;}catch(e:any){if(e?.statusCode===404||e?.statusCode===410)await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(s.id).run();}}
    return json({delivered});
  }
  return null;
}

async function handleFiles(request:Request,env:Env,path:string){
  if(path.startsWith('/files')&&!env.FILES)return error('Armazenamento de arquivos temporariamente indisponível.',503,'FILES_STORAGE_UNAVAILABLE');
  const filesStore=env.FILES;
  const ctx=await requireAuth(request,env);
  if(path==='/files'&&request.method==='POST'){
    const form=await request.formData(),file=form.get('file');if(!(file instanceof File))return error('Arquivo obrigatório.');if(file.size>10*1024*1024)return error('O arquivo deve ter no máximo 10 MB.',413,'FILE_TOO_LARGE');const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf']);if(!allowed.has(file.type))return error('Formato não permitido.',415,'UNSUPPORTED_FILE');
    const id=uuid(),key=`${ctx.user.id}/${id}`;await filesStore!.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{originalName:file.name}});await env.DB.prepare('INSERT INTO files(id,user_id,object_key,original_name,content_type,size,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,ctx.user.id,key,file.name,file.type,file.size,now()).run();return json({id,name:file.name,contentType:file.type,size:file.size},201);
  }
  const m=path.match(/^\/files\/([^/]+)$/);if(m&&request.method==='GET'){const f=await env.DB.prepare('SELECT * FROM files WHERE id=? AND user_id=?').bind(m[1],ctx.user.id).first<any>();if(!f)return error('Arquivo não encontrado.',404,'NOT_FOUND');const obj=await filesStore!.get(f.object_key);if(!obj)return error('Arquivo não encontrado.',404,'NOT_FOUND');const h=new Headers();obj.writeHttpMetadata(h);h.set('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);return new Response(obj.body,{headers:h});}
  return null;
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const headers=cors(request,env); if(request.method==='OPTIONS')return new Response(null,{status:204,headers}); const path=new URL(request.url).pathname.replace(/^\/api(?=\/)/,'');
    try{
      if(path==='/health' && request.method==='GET') return json({ok:true,service:'ritmo',time:now()},200,{...headers,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      let r=await handleAuth(request,env,path); if(!r)r=await handlePasskeys(request,env,path); if(!r)r=await handlePush(request,env,path); if(!r)r=await handleFiles(request,env,path); if(!r)r=await runIdempotent(request,env,path,()=>handleData(request,env,path)); if(!r)r=error('Rota não encontrada.',404,'NOT_FOUND');
      const h=new Headers(r.headers);for(const [k,v] of Object.entries(headers))h.set(k,v);h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','no-referrer');return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});
    }catch(e:any){
      const requestId=crypto.randomUUID();
      console.error('[ritmo]',requestId,e);
      const status=Number(e?.status)||500;
      const code=typeof e?.code==='string'&&e.code ? e.code : 'INTERNAL_ERROR';
      const message=status===500?'Erro interno do servidor.':String(e?.message||'Falha na requisição.');
      const r=json({message,code,requestId},status);
      const h=new Headers(r.headers);for(const [k,v] of Object.entries(headers))h.set(k,v);h.set('X-Request-Id',requestId);
      return new Response(r.body,{status:r.status,headers:h});
    }
  }
} satisfies ExportedHandler<Env>;
