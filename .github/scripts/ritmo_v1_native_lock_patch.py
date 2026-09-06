from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
worker=root/'_worker.js'
cssp=root/'public'/'styles.css'
a=app.read_text(); w=worker.read_text()


def replace_func(name,new_code):
    global a
    starts=[a.find(f'function {name}('),a.find(f'async function {name}(')]
    starts=[x for x in starts if x>=0]
    if not starts: raise SystemExit(f'Função não encontrada: {name}')
    p=min(starts);c=[]
    for token in ['\nfunction ','\nasync function ']:
        q=a.find(token,p+1)
        if q>p:c.append(q)
    q=min(c) if c else len(a)
    a=a[:p]+new_code+a[q:]

# Endpoint de revalidação por senha dentro da sessão atual.
needle="  const userId=s.user_id;\n  if(path==='/api/bootstrap'&&request.method==='GET')return json(await bootstrap(env,userId));"
if needle not in w: raise SystemExit('Ponto de revalidação não encontrado no worker')
w=w.replace(needle,"""  const userId=s.user_id;
  if(path==='/api/auth/reverify'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'Origem inválida'},403);
    if(!await rateLimit(env,request,'reverify',25,600))return json({error:'Muitas tentativas. Aguarde alguns minutos.'},429);
    const b=await body(request),password=String(b.password||'');const u=await env.DB.prepare(`SELECT password_hash,password_salt FROM users WHERE id=?`).bind(userId).first();
    if(!u||!await verifyPassword(password,u.password_salt,u.password_hash))return json({error:'Senha incorreta.'},401);
    return json({ok:true});
  }
  if(path==='/api/bootstrap'&&request.method==='GET')return json(await bootstrap(env,userId));""",1)
worker.write_text(w)

# Login com conta salva neste aparelho: só guarda identificação, nunca senha.
replace_func('renderAuth',r'''function renderAuth(error=''){
  state.data=null;clearInterval(versionPoll);clearInterval(quoteTimer);const signup=state.authMode==='signup',saved=signup?null:ritmoSavedAccount(),savedUser=saved?.username||'';root.innerHTML=`<section class="auth"><div class="auth-hero"><div class="hero-orb"></div>${brand()}<div class="hero-center"><span class="eyebrow">SEU DINHEIRO, NO SEU RITMO</span><h1>Clareza para cuidar do que é <em>seu.</em></h1><p>Entradas, saídas, dívidas, haveres e metas reunidos em uma experiência leve que acompanha você no celular e no desktop.</p></div><div class="hero-pill">Sincronizado • Privado • Feito para sua rotina</div></div><div class="auth-side"><form class="auth-card" id="authForm">${brand()}<div class="auth-title"><span class="eyebrow">${signup?'PRIMEIRO ACESSO':'BEM-VINDO'}</span><h2>${signup?'Crie sua conta':'Acesse sua conta'}</h2><p>${signup?'Comece a organizar sua vida financeira.':saved?`Conta salva neste aparelho: @${esc(savedUser)}`:'Continue exatamente de onde parou.'}</p></div>${error?`<div class="auth-error">${esc(error)}</div>`:''}${signup?`<label class="field">Nome<input name="name" autocomplete="name" required placeholder="Como podemos chamar você?"></label>`:''}<label class="field">Usuário<input name="username" autocomplete="username" required minlength="3" value="${esc(savedUser)}" placeholder="Digite seu usuário"></label><label class="field">Senha<input name="password" type="password" autocomplete="${signup?'new-password':'current-password'}" required minlength="8" placeholder="Mínimo de 8 caracteres"></label>${signup?`<label class="field">Confirmar senha<input name="confirm" type="password" autocomplete="new-password" required minlength="8" placeholder="Repita sua senha"></label>`:''}${!signup?`<label class="remember-account"><input type="checkbox" name="remember_account" ${saved?'checked':''}><span><strong>Manter conta salva neste aparelho</strong><small>O Ritmo guarda apenas o usuário para facilitar o próximo acesso. Sua senha não é salva.</small></span></label>`:''}<div id="turnstileSlot" class="turnstile-slot"></div><button class="btn btn-primary" type="submit">${signup?'Criar conta':'Entrar'} ${ic('chev',17)}</button><button class="auth-switch" type="button" id="authSwitch">${signup?'Já tenho uma conta':'Criar uma conta'}</button>${saved&&!signup?`<button class="auth-switch forget-saved" type="button" id="forgetSavedAccount">Remover conta salva</button>`:''}<div class="auth-note">Seus dados financeiros ficam vinculados somente à sua conta.</div></form></div></section>`;
  $('#authSwitch').onclick=()=>{state.authMode=signup?'login':'signup';renderAuth()};$('#forgetSavedAccount')?.addEventListener('click',()=>{localStorage.removeItem('ritmo:saved-account');renderAuth()});$('#authForm').onsubmit=authSubmit;prepareTurnstile();
}
''')

replace_func('authSubmit',r'''async function authSubmit(e){e.preventDefault();const f=new FormData(e.currentTarget),username=f.get('username'),password=f.get('password'),cfg=await getSecurityConfig();if(state.authMode==='signup'&&password!==f.get('confirm'))return renderAuth('As senhas não coincidem.');if(cfg.turnstile_sitekey&&!state.turnstileToken)return toast('Conclua a verificação de segurança.');try{state.loading=true;const result=await api(`/api/auth/${state.authMode==='signup'?'register':'login'}`,{method:'POST',body:JSON.stringify({name:f.get('name'),username,password,turnstileToken:state.turnstileToken})});if(state.authMode==='login'){if(f.get('remember_account')==='on')ritmoSaveAccount(result?.profile?.username||username,result?.profile?.name||'');else localStorage.removeItem('ritmo:saved-account')}await loadApp(true)}catch(err){renderAuth(err.message)}finally{state.loading=false}}
''')

# Núcleo de bloqueio. Segundo plano não bloqueia imediatamente; o relógio de
# inatividade continua e é verificado quando o app volta a ficar visível.
replace_func('maybeLock',r'''function ritmoSavedAccount(){try{return JSON.parse(localStorage.getItem('ritmo:saved-account')||'null')}catch{return null}}
function ritmoSaveAccount(username,name=''){try{localStorage.setItem('ritmo:saved-account',JSON.stringify({username:String(username||''),name:String(name||'')}))}catch{}}
function ritmoUnlockKey(){return state.data?.profile?.id?`ritmo:unlock-session:${state.data.profile.id}`:''}
function ritmoActivityKey(){const k=ritmoUnlockKey();return k?`${k}:activity`:''}
let ritmoLockTimer=null;
function ritmoSessionUnlocked(){const k=ritmoUnlockKey();if(!k)return false;try{return sessionStorage.getItem(k)==='1'}catch{return false}}
function ritmoMarkUnlocked(){const k=ritmoUnlockKey(),ak=ritmoActivityKey();if(!k)return;const now=Date.now();try{sessionStorage.setItem(k,'1');sessionStorage.setItem(ak,String(now))}catch{}ritmoScheduleLock()}
function ritmoTouchActivity(){if(!state.data||document.hidden||$('#secureLock'))return;const ak=ritmoActivityKey();try{if(ak)sessionStorage.setItem(ak,String(Date.now()))}catch{}ritmoScheduleLock()}
function ritmoLastActivity(){const ak=ritmoActivityKey();try{return Number(sessionStorage.getItem(ak)||0)}catch{return 0}}
function ritmoScheduleLock(){clearTimeout(ritmoLockTimer);if(!state.data||document.hidden||$('#secureLock'))return;const mins=Number(state.data.settings?.auto_lock_minutes||0);if(mins<=0)return;const last=ritmoLastActivity()||Date.now(),remaining=Math.max(250,mins*60000-(Date.now()-last));ritmoLockTimer=setTimeout(()=>{if(document.hidden)return;if(Date.now()-ritmoLastActivity()>=mins*60000)showLock('timeout');else ritmoScheduleLock()},remaining)}
async function maybeLock(freshLaunch=false){if(!state.data)return false;if(freshLaunch&&!ritmoSessionUnlocked()){showLock('launch');return true}if(!ritmoSessionUnlocked()){showLock('launch');return true}const mins=Number(state.data.settings?.auto_lock_minutes||0);if(mins<=0){ritmoScheduleLock();return false}const last=ritmoLastActivity()||Date.now();if(Date.now()-last>=mins*60000){showLock('timeout');return true}ritmoScheduleLock();return false}
''')

replace_func('showLock',r'''async function showLock(reason='timeout'){if(!state.data||$('#secureLock'))return;clearTimeout(ritmoLockTimer);state.modal=null;state.profilePop=false;const enabled=Number(state.data.security?.webauthn_count||0)>0,p=state.data.profile;root.innerHTML=`<section class="secure-lock" id="secureLock"><div class="secure-lock-card">${brand()}<div class="secure-lock-avatar">${avatarMarkup('secure-lock-avatar-img')}</div><span class="eyebrow">RITMO PROTEGIDO</span><h2>${reason==='launch'?'Bem-vindo de volta':'Ritmo bloqueado'}</h2><p>${reason==='launch'?'Confirme sua identidade para abrir o aplicativo.':'O tempo de inatividade foi atingido. Desbloqueie para continuar.'}</p><div class="secure-account"><strong>${esc(p.name)}</strong><small>@${esc(p.username)}</small></div>${enabled?`<button class="btn btn-primary secure-bio-btn" id="unlockBtn">${ic('shield',18)} Desbloquear com ${deviceBioLabel()}</button><div class="lock-divider"><span>ou use sua senha</span></div>`:''}<form id="lockPasswordForm" class="lock-password-form"><label class="field">Senha<input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="Digite sua senha"></label><button class="btn ${enabled?'btn-secondary':'btn-primary'}" type="submit">Desbloquear com senha</button></form><button class="auth-switch" id="lockLogout">Usar outra conta</button><small class="secure-lock-note">Fechar o app exige novo desbloqueio na próxima abertura. Em segundo plano, ele só bloqueia quando o tempo configurado for atingido.</small></div></section>`;$('#unlockBtn')?.addEventListener('click',unlockBio);$('#lockPasswordForm')?.addEventListener('submit',unlockPassword);$('#lockLogout')?.addEventListener('click',logout)}
''')

replace_func('unlockBio',r'''async function unlockBio(){try{const options=await api('/api/webauthn/auth/options',{method:'POST',body:'{}'});const cred=await navigator.credentials.get({publicKey:requestOptions(options)});await api('/api/webauthn/auth/verify',{method:'POST',body:JSON.stringify({credential:credentialToJSON(cred)})});ritmoMarkUnlocked();renderApp(false);toast('Desbloqueado com segurança.')}catch(e){toast(e.message||'Não foi possível confirmar o desbloqueio.')}}
async function unlockPassword(e){e.preventDefault();const password=new FormData(e.currentTarget).get('password');try{await api('/api/auth/reverify',{method:'POST',body:JSON.stringify({password})});ritmoMarkUnlocked();renderApp(false);toast('Desbloqueado com segurança.')}catch(err){const input=e.currentTarget.querySelector('input[name="password"]');if(input){input.value='';input.focus()}toast(err.message||'Não foi possível desbloquear.')}}
''')

replace_func('loadApp',r'''async function loadApp(afterLogin=false){try{const data=await api('/api/bootstrap');state.data=data;state.page='home';state.settingsSub=null;applyTheme(data.settings?.theme||localStorage.getItem('ritmo:theme')||'system');startSync();if(afterLogin){ritmoMarkUnlocked();renderApp();toast('Tudo certo. Bem-vindo ao Ritmo.');return}if(await maybeLock(true))return;renderApp()}catch(err){if(err.status===401)renderAuth();else{renderAuth('Não foi possível carregar sua conta agora.')}}}
''')

replace_func('logout',r'''async function logout(){clearTimeout(ritmoLockTimer);try{await api('/api/auth/logout',{method:'POST',body:'{}'})}catch{}state.data=null;state.authMode='login';renderAuth()}
''')

# Ao ativar biometria, a sessão atual já foi confirmada.
old="localStorage.setItem(`${bioKey()}:verified`,String(Date.now()));state.data=await api('/api/bootstrap');renderApp(false);toast('Proteção do aparelho ativada com segurança.')"
if old in a:
    a=a.replace(old,"ritmoMarkUnlocked();state.data=await api('/api/bootstrap');renderApp(false);toast('Proteção do aparelho ativada com segurança.')",1)

# Texto da configuração deixa a regra explícita.
a=a.replace('<strong>Bloqueio automático</strong><small>Solicitar desbloqueio após inatividade</small>','<strong>Bloqueio automático</strong><small>Em segundo plano, só bloqueia quando o tempo escolhido for atingido</small>',1)
a=a.replace('<strong>Sessão protegida</strong><small>Vinculada ao ID interno da conta, sem depender do nome de usuário.</small>','<strong>Abertura protegida</strong><small>Ao fechar e abrir novamente o Ritmo, um novo desbloqueio é solicitado.</small>',1)

# Listener de visibilidade: não bloqueia ao simplesmente ir para segundo plano.
old="document.addEventListener('visibilitychange',()=>{if(!document.hidden){maybeLock();syncIfNeeded(false)}});window.addEventListener('online',()=>syncIfNeeded(false));"
if old not in a: raise SystemExit('Listener de visibilidade não encontrado')
a=a.replace(old,"document.addEventListener('visibilitychange',()=>{if(!document.hidden){maybeLock(false);syncIfNeeded(false)}else{clearTimeout(ritmoLockTimer)}});window.addEventListener('online',()=>syncIfNeeded(false));['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,ritmoTouchActivity,{passive:true}));",1)

# Boot: antes havia renderização dos menus e só depois o bloqueio. Agora a
# verificação ocorre antes de renderizar qualquer tela privada.
old="(async()=>{if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});applyTheme(localStorage.getItem('ritmo:theme')||'system');try{const d=await api('/api/bootstrap');state.data=d;applyTheme(d.settings?.theme||'system');renderApp();startSync();await maybeLock()}catch(e){renderAuth()}})();"
if old not in a: raise SystemExit('Boot principal não encontrado')
a=a.replace(old,"(async()=>{if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});applyTheme(localStorage.getItem('ritmo:theme')||'system');try{const d=await api('/api/bootstrap');state.data=d;applyTheme(d.settings?.theme||'system');startSync();if(await maybeLock(true))return;renderApp();ritmoScheduleLock()}catch(e){renderAuth()}})();",1)

app.write_text(a)

css=cssp.read_text()+r'''
/* Ritmo V1 — bloqueio com aparência de tela de acesso, sem app visível atrás */
.secure-lock{position:fixed;inset:0;z-index:99999;min-height:100dvh;display:grid;place-items:center;padding:calc(24px + env(safe-area-inset-top)) 18px calc(24px + env(safe-area-inset-bottom));background:var(--bg,#F7F5EF);overflow:auto}
.secure-lock-card{width:min(100%,390px);display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:24px;border-radius:28px;background:var(--panel,#fff);border:1px solid var(--line,rgba(15,76,92,.09));box-shadow:0 18px 55px rgba(25,40,45,.09)}
.secure-lock-card>.brand{align-self:center;margin-bottom:3px}.secure-lock-card>.eyebrow,.secure-lock-card>h2,.secure-lock-card>p{text-align:center}.secure-lock-card>h2{margin:0;font-size:24px}.secure-lock-card>p{margin:0 auto 2px;max-width:310px;color:var(--muted);font-size:12px;line-height:1.55}
.secure-lock-avatar{display:flex;justify-content:center;margin:2px 0}.secure-lock-avatar-img{width:70px!important;height:70px!important;min-width:70px!important;max-width:70px!important;border-radius:50%!important;object-fit:cover;display:grid;place-items:center;background:color-mix(in srgb,var(--teal,#0F4C5C) 10%,var(--panel,#fff));font-size:24px;font-weight:700;color:var(--teal,#0F4C5C)}
.secure-account{text-align:center;display:flex;flex-direction:column;gap:2px;margin-bottom:4px}.secure-account strong{font-size:14px}.secure-account small{font-size:11px;color:var(--muted)}
.secure-bio-btn{width:100%;min-height:46px}.lock-divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:10px}.lock-divider:before,.lock-divider:after{content:'';height:1px;background:var(--line);flex:1}.lock-password-form{display:grid;gap:10px}.lock-password-form .field{margin:0}.lock-password-form .btn{width:100%;min-height:44px}.secure-lock-note{font-size:9.5px;line-height:1.5;color:var(--muted);text-align:center;margin-top:3px}
.remember-account{display:flex;align-items:flex-start;gap:10px;padding:10px 11px;border-radius:14px;background:color-mix(in srgb,var(--teal,#0F4C5C) 5%,transparent);cursor:pointer}.remember-account input{width:17px;height:17px;margin:2px 0 0;accent-color:var(--teal,#0F4C5C)}.remember-account span{display:flex;flex-direction:column;gap:2px}.remember-account strong{font-size:11px}.remember-account small{font-size:9.5px;color:var(--muted);line-height:1.45}.forget-saved{font-size:10px!important}
.dark .secure-lock-card{box-shadow:0 18px 55px rgba(0,0,0,.22)}
@media(max-width:520px){.secure-lock{place-items:center;padding-left:14px;padding-right:14px}.secure-lock-card{padding:21px 18px;border-radius:25px;box-shadow:none}.secure-lock-card>h2{font-size:22px}}
'''
cssp.write_text(css)
print('Ritmo V1: bloqueio nativo corrigido — fechamento exige desbloqueio, segundo plano respeita tempo e senha é fallback seguro.')
