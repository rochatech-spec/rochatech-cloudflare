from pathlib import Path
import sys, re
from ritmo_v1_patch_utils import js_function_bounds

root=Path(sys.argv[1])
app=root/'public'/'app.js'
worker=root/'_worker.js'
indexp=root/'public'/'index.html'
cssp=root/'public'/'styles.css'
a=app.read_text();w=worker.read_text();idx=indexp.read_text();css=cssp.read_text()

def replace_func(source,name,code):
    p,q=js_function_bounds(source,name)
    return source[:p]+code+source[q:]

def remove_func_if_present(source,name):
    if f'function {name}(' not in source and f'async function {name}(' not in source:return source
    p,q=js_function_bounds(source,name)
    return source[:p]+source[q:]

def must_replace(source,old,new,label):
    if old not in source:raise SystemExit('Trecho não encontrado: '+label)
    return source.replace(old,new,1)

# Login/cadastro sem CAPTCHA. Permanecem rate limit, Same-Origin e validação de senha.
a=a.replace("turnstileToken:'',turnstileWidget:null,",'',1)
a=a.replace(',securityConfig=null','',1)
a=remove_func_if_present(a,'getSecurityConfig')
a=remove_func_if_present(a,'prepareTurnstile')

render_auth=r'''function renderAuth(error=''){
  state.data=null;clearInterval(versionPoll);clearInterval(quoteTimer);const signup=state.authMode==='signup',saved=signup?null:ritmoSavedAccount(),savedUser=saved?.username||'';root.innerHTML=`<section class="auth"><div class="auth-hero"><div class="hero-orb"></div>${brand()}<div class="hero-center"><span class="eyebrow">SEU DINHEIRO, NO SEU RITMO</span><h1>Clareza para cuidar do que é <em>seu.</em></h1><p>Entradas, saídas, dívidas, haveres e metas reunidos em uma experiência leve que acompanha você no celular e no desktop.</p></div><div class="hero-pill">Sincronizado • Privado • Feito para sua rotina</div></div><div class="auth-side"><form class="auth-card" id="authForm">${brand()}<div class="auth-title"><span class="eyebrow">${signup?'PRIMEIRO ACESSO':'BEM-VINDO'}</span><h2>${signup?'Crie sua conta':'Acesse sua conta'}</h2><p>${signup?'Comece a organizar sua vida financeira.':saved?`Conta salva neste aparelho: @${esc(savedUser)}`:'Continue exatamente de onde parou.'}</p></div>${error?`<div class="auth-error">${esc(error)}</div>`:''}${signup?`<label class="field">Nome<input name="name" autocomplete="name" required placeholder="Como podemos chamar você?"></label>`:''}<label class="field">Usuário<input name="username" autocomplete="username" required minlength="3" value="${esc(savedUser)}" placeholder="Digite seu usuário"></label><label class="field">Senha<input name="password" type="password" autocomplete="${signup?'new-password':'current-password'}" required minlength="8" placeholder="Mínimo de 8 caracteres"></label>${signup?`<label class="field">Confirmar senha<input name="confirm" type="password" autocomplete="new-password" required minlength="8" placeholder="Repita sua senha"></label>`:''}${!signup?`<label class="remember-account"><input type="checkbox" name="remember_account" ${saved?'checked':''}><span><strong>Manter conta salva neste aparelho</strong><small>O Ritmo guarda apenas a identificação da conta. Sua senha não é salva.</small></span></label>`:''}<button class="btn btn-primary" type="submit">${signup?'Criar conta':'Entrar'} ${ic('chev',17)}</button><button class="auth-switch" type="button" id="authSwitch">${signup?'Já tenho uma conta':'Criar uma conta'}</button>${saved&&!signup?`<button class="auth-switch forget-saved" type="button" id="forgetSavedAccount">Remover conta salva</button>`:''}<div class="auth-note">Seus dados financeiros ficam vinculados somente à sua conta.</div></form></div></section>`;
  $('#authSwitch').onclick=()=>{state.authMode=signup?'login':'signup';renderAuth()};$('#forgetSavedAccount')?.addEventListener('click',()=>{localStorage.removeItem('ritmo:saved-account');renderAuth()});$('#authForm').onsubmit=authSubmit;
}'''
a=replace_func(a,'renderAuth',render_auth)

auth_submit=r'''async function authSubmit(e){e.preventDefault();const f=new FormData(e.currentTarget),username=f.get('username'),password=f.get('password');if(state.authMode==='signup'&&password!==f.get('confirm'))return renderAuth('As senhas não coincidem.');try{state.loading=true;const result=await api(`/api/auth/${state.authMode==='signup'?'register':'login'}`,{method:'POST',body:JSON.stringify({name:f.get('name'),username,password})});if(state.authMode==='login'){if(f.get('remember_account')==='on')ritmoSaveAccount(result?.profile?.username||username,result?.profile?.name||'');else localStorage.removeItem('ritmo:saved-account')}await loadApp(true)}catch(err){renderAuth(err.message)}finally{state.loading=false}}'''
a=replace_func(a,'authSubmit',auth_submit)

idx=re.sub(r'\s*<script[^>]+challenges\.cloudflare\.com/turnstile[^>]*></script>\s*','\n',idx,flags=re.I)
css=re.sub(r'[^{}]*\.turnstile-slot[^{}]*\{[^{}]*\}','',css,flags=re.I)

# Remove Turnstile também do Worker.
w=remove_func_if_present(w,'verifyTurnstile')
w=must_replace(w,"const b=await body(request);const tv=await verifyTurnstile(env,request,b.turnstileToken);if(!tv.ok)return json({error:'Não foi possível validar a verificação de segurança. Tente novamente.'},403);const username=cleanUsername(b.username);","const b=await body(request);const username=cleanUsername(b.username);",'Turnstile cadastro')
w=must_replace(w,"const b=await body(request);const tv=await verifyTurnstile(env,request,b.turnstileToken);if(!tv.ok)return json({error:'Não foi possível validar a verificação de segurança. Tente novamente.'},403);const username=cleanUsername(b.username);","const b=await body(request);const username=cleanUsername(b.username);",'Turnstile login')
w=w.replace(",turnstile:!!env.TURNSTILE_SITEKEY&&!!env.TURNSTILE_SECRET",'')
w=w.replace("  if(path==='/api/security/config'&&request.method==='GET')return json({turnstile_sitekey:env.TURNSTILE_SITEKEY||null,webauthn:true,kv:!!env.CACHE});\n",'')

# WebAuthn compatível com autenticadores de plataforma e passkeys sincronizadas.
creation=r'''function creationOptions(o){return {...o,challenge:b64uToBuf(o.challenge),user:{...o.user,id:b64uToBuf(o.user.id)},excludeCredentials:(o.excludeCredentials||[]).map(c=>({...c,id:b64uToBuf(c.id)})),authenticatorSelection:{...(o.authenticatorSelection||{}),authenticatorAttachment:'platform',residentKey:'preferred',requireResidentKey:false,userVerification:'required'},attestation:'none',timeout:Math.min(Number(o.timeout||60000),60000)}}'''
request=r'''function requestOptions(o){return {...o,challenge:b64uToBuf(o.challenge),allowCredentials:(o.allowCredentials||[]).map(c=>({...c,id:b64uToBuf(c.id)})),userVerification:'required',timeout:Math.min(Number(o.timeout||60000),60000)}}'''
a=replace_func(a,'creationOptions',creation)
a=replace_func(a,'requestOptions',request)
w=w.replace("residentKey:'discouraged',requireResidentKey:false,userVerification:'required'","residentKey:'preferred',requireResidentKey:false,userVerification:'required'",1)
w=w.replace("allowCredentials:(creds.results||[]).map(x=>({id:x.credential_id,transports:['internal']}))","allowCredentials:(creds.results||[]).map(x=>({id:x.credential_id,transports:JSON.parse(x.transports||'[]')}))",1)

# UI de segurança passa a refletir ESTE aparelho, não o total de credenciais da conta.
a=a.replace("const p=state.data.profile,sh=state.data.sharing||{},bio=Number(state.data.security?.webauthn_count||0)>0;","const p=state.data.profile,sh=state.data.sharing||{},bio=ritmoDeviceBioEnabled();")
a=a.replace("if(k==='security'){const enabled=Number(state.data.security?.webauthn_count||0)>0;","if(k==='security'){const enabled=ritmoDeviceBioEnabled();",1)

platform=r'''async function platformBioAvailable(){if(!window.PublicKeyCredential||!navigator.credentials?.create||!navigator.credentials?.get)return false;const fn=PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;if(typeof fn!=='function')return true;try{return await fn.call(PublicKeyCredential)}catch{return true}}'''
a=replace_func(a,'platformBioAvailable',platform)

block_start=a.find('let ritmoAutoBioRun=false;')
show_start=a.find('async function showLock(',block_start)
if block_start<0 or show_start<0:raise SystemExit('Bloco biométrico final não encontrado')
helpers=r'''function ritmoAccountHasBio(){return Number(state.data?.security?.webauthn_count||0)>0}
function ritmoDeviceBioEnabled(){if(!ritmoAccountHasBio())return false;try{return !!localStorage.getItem(`${bioKey()}:verified`)}catch{return false}}
function ritmoMarkDeviceBio(cred){try{localStorage.setItem(`${bioKey()}:verified`,JSON.stringify({at:Date.now(),credentialId:cred?.id||''}))}catch{}}
function ritmoClearDeviceBio(){try{localStorage.removeItem(`${bioKey()}:verified`)}catch{}}
let ritmoBioPromptBusy=false;
function ritmoBioErrorMessage(e){if(e?.status===404||e?.name==='NotFoundError')return 'Nenhuma credencial deste aparelho foi encontrada. Vá em Menu → Segurança e configure a biometria neste aparelho.';if(e?.name==='NotAllowedError'||e?.name==='AbortError')return 'A confirmação biométrica foi cancelada. Toque novamente quando quiser tentar.';if(e?.name==='SecurityError')return 'O navegador bloqueou o desbloqueio seguro. Use o app instalado ou o endereço oficial do Ritmo.';return e?.message||'Não foi possível confirmar o desbloqueio deste aparelho.'}
async function ritmoAuthenticateDevice(){if(ritmoBioPromptBusy)throw new Error('A confirmação biométrica já está aberta.');ritmoBioPromptBusy=true;try{const options=await api('/api/webauthn/auth/options',{method:'POST',body:'{}'}),pk=requestOptions(options);const cred=await navigator.credentials.get({publicKey:pk});if(!cred)throw new Error('Desbloqueio cancelado.');await api('/api/webauthn/auth/verify',{method:'POST',body:JSON.stringify({credential:credentialToJSON(cred)})});ritmoMarkDeviceBio(cred);return cred}catch(e){if(e?.status===404)ritmoClearDeviceBio();throw e}finally{ritmoBioPromptBusy=false}}
function ritmoFinishUnlock(){ritmoMarkUnlocked();document.documentElement.classList.add('ritmo-fast-unlock');renderApp(false);requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.classList.remove('ritmo-fast-unlock')));startSync();ritmoIdle(()=>syncIfNeeded(false,true),900)}
'''
a=a[:block_start]+helpers+a[show_start:]

show_lock=r'''async function showLock(reason='timeout'){
  if(!state.data)return;
  clearTimeout(ritmoLockTimer);state.modal=null;state.profilePop=false;ritmoBioPromptBusy=false;
  const enabled=ritmoAccountHasBio(),p=state.data.profile;
  root.innerHTML=`<section class="secure-lock premium-lock" id="secureLock"><div class="premium-lock-inner"><div class="premium-lock-brand">${brand()}</div><div class="premium-lock-avatar">${avatarMarkup('premium-lock-avatar-img')}</div><div class="premium-lock-copy"><h2>${reason==='launch'?'Bem-vindo de volta':'Ritmo bloqueado'}</h2><p>${enabled?`Use ${deviceBioLabel()} para continuar.`:'Digite sua senha para continuar.'}</p><span>@${esc(p.username)}</span></div>${enabled?`<button class="btn btn-primary premium-unlock-btn" id="unlockBtn">${ic('shield',18)} ${deviceBioLabel()}</button><button class="premium-password-toggle" id="showPasswordUnlock" type="button">Usar senha</button>`:''}<form id="lockPasswordForm" class="premium-password-form ${enabled?'is-collapsed':''}"><label class="premium-password-field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="Digite sua senha"></label><button class="btn ${enabled?'btn-secondary':'btn-primary'}" type="submit">Desbloquear</button></form><button class="premium-other-account" id="lockLogout" type="button">Usar outra conta</button></div></section>`;
  $('#unlockBtn')?.addEventListener('click',unlockBio);$('#showPasswordUnlock')?.addEventListener('click',()=>{const f=$('#lockPasswordForm');if(!f)return;f.classList.remove('is-collapsed');$('#showPasswordUnlock')?.remove();setTimeout(()=>f.querySelector('input')?.focus(),40)});$('#lockPasswordForm')?.addEventListener('submit',unlockPassword);$('#lockLogout')?.addEventListener('click',logout);
}'''
a=replace_func(a,'showLock',show_lock)
a=replace_func(a,'unlockBio',r'''async function unlockBio(){try{await ritmoAuthenticateDevice();ritmoFinishUnlock()}catch(e){toast(ritmoBioErrorMessage(e))}}''')
a=replace_func(a,'unlockPassword',r'''async function unlockPassword(e){e.preventDefault();const password=new FormData(e.currentTarget).get('password');try{await api('/api/auth/reverify',{method:'POST',body:JSON.stringify({password})});ritmoFinishUnlock()}catch(err){const input=e.currentTarget.querySelector('input[name="password"]');if(input){input.value='';input.focus()}toast(err.message||'Não foi possível desbloquear.')}}''')

# O switch é local: desativar neste aparelho não apaga Face ID/biometria dos demais.
toggle=r'''async function toggleBiometric(){const enabled=ritmoDeviceBioEnabled();if(enabled){if(!confirm(`Desativar ${deviceBioLabel()} somente neste aparelho?`))return;ritmoClearDeviceBio();renderApp(false);toast('Desbloqueio biométrico desativado somente neste aparelho.');return}if(!await platformBioAvailable()){toast('Este aparelho não disponibilizou biometria ou desbloqueio seguro para o Ritmo.');return}try{const options=await api('/api/webauthn/register/options',{method:'POST',body:'{}'}),pk=creationOptions(options);const cred=await navigator.credentials.create({publicKey:pk});if(!cred)throw new Error('Configuração cancelada.');await api('/api/webauthn/register/verify',{method:'POST',body:JSON.stringify({credential:credentialToJSON(cred)})});ritmoMarkDeviceBio(cred);state.data=await api('/api/bootstrap');renderApp(false);toast(`${deviceBioLabel()} ativado neste aparelho.`)}catch(e){if(e?.name==='InvalidStateError'){try{const cred=await ritmoAuthenticateDevice();ritmoMarkDeviceBio(cred);state.data=await api('/api/bootstrap');renderApp(false);toast(`${deviceBioLabel()} já estava configurado e foi confirmado neste aparelho.`);return}catch(testErr){toast(ritmoBioErrorMessage(testErr));return}}toast(e?.name==='NotAllowedError'||e?.name==='AbortError'?'Configuração biométrica cancelada.':(e.message||'Não foi possível ativar o desbloqueio deste aparelho.'))}}'''
a=replace_func(a,'toggleBiometric',toggle)

for text,name in [(a,'app.js'),(idx,'index.html'),(w,'_worker.js')]:
    if 'turnstile' in text.lower():raise SystemExit(f'Turnstile ainda presente em {name}')
for bad in ["transports:['internal']","hints=['client-device']","unlockBio(true)","residentKey:'discouraged'"]:
    if bad in a or bad in w:raise SystemExit('WebAuthn incompatível ainda presente: '+bad)
for need in ["residentKey:'preferred'","JSON.parse(x.transports||'[]')","ritmoAuthenticateDevice","ritmoDeviceBioEnabled","navigator.credentials.get({publicKey:pk})"]:
    if need not in a and need not in w:raise SystemExit('WebAuthn final ausente: '+need)

app.write_text(a);worker.write_text(w);indexp.write_text(idx);cssp.write_text(css)
print('Ritmo V1: Turnstile removido e WebAuthn refeito por aparelho com fluxo compatível para Android, Face ID/Touch ID e Windows Hello.')
