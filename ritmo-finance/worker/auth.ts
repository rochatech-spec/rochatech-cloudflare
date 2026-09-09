import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import { audit, base64url, bytesFromBase64url, clearSessionCookie, createSession, error, getCookie, hashPassword, json, normalizeText, normalizeUsername, randomToken, readJson, rpInfo, requireUser, sessionCookie, sha256, timingSafeEqual, type Env } from './utils'

type UserRow={id:string;username:string;display_name:string;password_salt:string;password_hash:string;avatar_key:string|null;created_at:string}

export async function routeAuth(request:Request,env:Env,pathname:string){
  if(pathname==='/api/auth/register'&&request.method==='POST'){
    const body=await readJson<{display_name?:string;username?:string;password?:string}>(request),displayName=normalizeText(body.display_name,60),username=normalizeUsername(body.username),password=String(body.password||'')
    if(displayName.length<2)return error('Informe seu nome.');if(username.length<3)return error('O usuário precisa ter pelo menos 3 caracteres.');if(password.length<6)return error('A senha precisa ter pelo menos 6 caracteres.')
    if(await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first())return error('Este usuário já está em uso.',409)
    const userId=crypto.randomUUID(),salt=randomToken(16),passwordHash=await hashPassword(password,salt),personalId=crypto.randomUUID(),sharedId=crypto.randomUUID()
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users(id,username,display_name,password_salt,password_hash) VALUES(?,?,?,?,?)').bind(userId,username,displayName,salt,passwordHash),
      env.DB.prepare("INSERT INTO workspaces(id,owner_id,name,type) VALUES(?,?,?,'personal')").bind(personalId,userId,'Seu Ritmo'),
      env.DB.prepare("INSERT INTO workspaces(id,owner_id,name,type) VALUES(?,?,?,'shared')").bind(sharedId,userId,'Nosso Ritmo'),
      env.DB.prepare("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'owner')").bind(personalId,userId),
      env.DB.prepare("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'owner')").bind(sharedId,userId),
      env.DB.prepare("INSERT INTO settings(user_id,theme,language) VALUES(?,'system','pt-BR')").bind(userId),
    ])
    const session=await createSession(env,userId);await audit(env,userId,personalId,'auth.register','user',userId);return json({ok:true},201,{'set-cookie':sessionCookie(session.token,session.ttlDays)})
  }
  if(pathname==='/api/auth/login'&&request.method==='POST'){
    const body=await readJson<{username?:string;password?:string}>(request),username=normalizeUsername(body.username),user=await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first<UserRow>()
    if(!user)return error('Usuário ou senha inválidos.',401);const candidate=await hashPassword(String(body.password||''),user.password_salt);if(!timingSafeEqual(candidate,user.password_hash))return error('Usuário ou senha inválidos.',401)
    const session=await createSession(env,user.id);await audit(env,user.id,null,'auth.login','user',user.id);return json({ok:true},200,{'set-cookie':sessionCookie(session.token,session.ttlDays)})
  }
  if(pathname==='/api/auth/logout'&&request.method==='POST'){const token=getCookie(request,'ritmo_session');if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();return json({ok:true},200,{'set-cookie':clearSessionCookie()})}
  return null
}

export async function routeWebAuthn(request:Request,env:Env,pathname:string){
  const {rpID,origin}=rpInfo(request)
  if(pathname==='/api/webauthn/register/options'&&request.method==='POST'){
    const user=await requireUser(request,env),credentials=await env.DB.prepare('SELECT credential_id,transports FROM webauthn_credentials WHERE user_id=?').bind(user.id).all<{credential_id:string;transports:string|null}>()
    const options=await generateRegistrationOptions({rpName:env.APP_NAME||'Ritmo Finance',rpID,userID:new TextEncoder().encode(user.id),userName:user.username,userDisplayName:user.display_name,attestationType:'none',excludeCredentials:(credentials.results||[]).map(c=>({id:c.credential_id,transports:c.transports?JSON.parse(c.transports):undefined})),authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'}})
    await env.DB.prepare("DELETE FROM webauthn_challenges WHERE user_id=? AND type='register'").bind(user.id).run();await env.DB.prepare("INSERT INTO webauthn_challenges(challenge,user_id,type,expires_at) VALUES(?,?,'register',datetime('now','+5 minutes'))").bind(options.challenge,user.id).run();return json(options)
  }
  if(pathname==='/api/webauthn/register/verify'&&request.method==='POST'){
    const user=await requireUser(request,env),body=await readJson<{response:any}>(request),challenge=await env.DB.prepare("SELECT challenge FROM webauthn_challenges WHERE user_id=? AND type='register' AND expires_at>datetime('now') ORDER BY created_at DESC LIMIT 1").bind(user.id).first<{challenge:string}>();if(!challenge)return error('Desafio biométrico expirado.')
    const verification=await verifyRegistrationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});if(!verification.verified||!verification.registrationInfo)return error('Não foi possível validar a biometria.')
    const info:any=verification.registrationInfo,credential=info.credential
    await env.DB.batch([env.DB.prepare('INSERT OR REPLACE INTO webauthn_credentials(id,user_id,credential_id,public_key,counter,transports,device_type,backed_up,last_used_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').bind(crypto.randomUUID(),user.id,credential.id,base64url(credential.publicKey),credential.counter||0,JSON.stringify(body.response?.response?.transports||credential.transports||[]),info.credentialDeviceType||null,info.credentialBackedUp?1:0),env.DB.prepare('DELETE FROM webauthn_challenges WHERE challenge=?').bind(challenge.challenge)])
    await audit(env,user.id,null,'webauthn.register','credential',credential.id);return json({ok:true})
  }
  if(pathname==='/api/webauthn/login/options'&&request.method==='POST'){const options=await generateAuthenticationOptions({rpID,userVerification:'required',allowCredentials:[]});await env.DB.prepare("INSERT INTO webauthn_challenges(challenge,user_id,type,expires_at) VALUES(?,NULL,'login',datetime('now','+5 minutes'))").bind(options.challenge).run();return json(options)}
  if(pathname==='/api/webauthn/login/verify'&&request.method==='POST'){
    const body=await readJson<{challenge?:string;response:any}>(request),challengeText=String(body.challenge||''),challenge=await env.DB.prepare("SELECT challenge FROM webauthn_challenges WHERE challenge=? AND type='login' AND expires_at>datetime('now') LIMIT 1").bind(challengeText).first<{challenge:string}>();if(!challenge)return error('Desafio biométrico expirado.')
    const cred=await env.DB.prepare('SELECT * FROM webauthn_credentials WHERE credential_id=?').bind(String(body.response?.id||'')).first<any>();if(!cred)return error('Credencial biométrica não reconhecida.',401)
    const verification=await verifyAuthenticationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,credential:{id:cred.credential_id,publicKey:bytesFromBase64url(cred.public_key),counter:Number(cred.counter||0),transports:cred.transports?JSON.parse(cred.transports):undefined},requireUserVerification:true});if(!verification.verified)return error('Biometria não validada.',401)
    await env.DB.batch([env.DB.prepare('UPDATE webauthn_credentials SET counter=?,last_used_at=CURRENT_TIMESTAMP WHERE id=?').bind((verification.authenticationInfo as any).newCounter||cred.counter||0,cred.id),env.DB.prepare('DELETE FROM webauthn_challenges WHERE challenge=?').bind(challenge.challenge)])
    const session=await createSession(env,cred.user_id);await audit(env,cred.user_id,null,'webauthn.login','credential',cred.credential_id);return json({ok:true},200,{'set-cookie':sessionCookie(session.token,session.ttlDays)})
  }
  return null
}
