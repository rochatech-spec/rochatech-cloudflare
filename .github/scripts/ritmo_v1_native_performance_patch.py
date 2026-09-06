from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'
a=app.read_text()


def bounds(name):
    starts=[a.find(f'function {name}('),a.find(f'async function {name}(')]
    starts=[x for x in starts if x>=0]
    if not starts:
        raise SystemExit('Função não encontrada: '+name)
    p=min(starts)
    ends=[]
    for token in ['\nfunction ','\nasync function ']:
        q=a.find(token,p+1)
        if q>p: ends.append(q)
    return p,(min(ends) if ends else len(a))


def fn(name,code):
    global a
    p,q=bounds(name)
    a=a[:p]+code+a[q:]

# -----------------------------------------------------------------------------
# Atividade / bloqueio: memória em RAM a cada interação e persistência limitada.
# Evita setItem + clearTimeout/setTimeout em todo toque/tecla do usuário.
# -----------------------------------------------------------------------------
fn('ritmoMarkUnlocked',r'''let ritmoActivityMemoryAt=0;
let ritmoActivityPersistAt=0;
function ritmoMarkUnlocked(){const k=ritmoUnlockKey(),ak=ritmoActivityKey();if(!k)return;const t=Date.now();ritmoActivityMemoryAt=t;ritmoActivityPersistAt=t;try{sessionStorage.setItem(k,'1');sessionStorage.setItem(ak,String(t))}catch{}ritmoScheduleLock()}''')

fn('ritmoTouchActivity',r'''function ritmoTouchActivity(){if(!state.data||document.hidden||$('#secureLock'))return;const t=Date.now();ritmoActivityMemoryAt=t;if(t-ritmoActivityPersistAt<15000)return;ritmoActivityPersistAt=t;const ak=ritmoActivityKey();try{if(ak)sessionStorage.setItem(ak,String(t))}catch{}}''')

fn('ritmoLastActivity',r'''function ritmoLastActivity(){const ak=ritmoActivityKey();let stored=0;try{stored=Number(sessionStorage.getItem(ak)||0)}catch{}return Math.max(ritmoActivityMemoryAt||0,stored)}''')

# -----------------------------------------------------------------------------
# Sincronização: a base mantém syncIfNeeded + startSync na mesma linha.
# Substituímos o bloco inteiro para preservar ambas e reduzir chamadas de rede.
# -----------------------------------------------------------------------------
fn('syncIfNeeded',r'''let ritmoSyncBusy=false;
let ritmoLastVersionCheck=0;
function ritmoSyncDelay(){const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;return c?.saveData||/2g/.test(String(c?.effectiveType||''))?600000:300000}
async function syncIfNeeded(showToast=false,force=false){if(!state.data||document.hidden||!navigator.onLine||$('#secureLock')||ritmoSyncBusy)return false;const t=Date.now();if(!force&&t-ritmoLastVersionCheck<60000)return false;ritmoSyncBusy=true;ritmoLastVersionCheck=t;try{const v=await api('/api/version');if(Number(v.version)!==Number(state.data.profile.data_version)){const fresh=await api('/api/bootstrap');state.data=fresh;applyTheme(fresh.settings?.theme||'system');renderApp(false);if(showToast)toast('Ritmo sincronizado.');return true}return false}catch{return false}finally{ritmoSyncBusy=false}}
function startSync(){clearTimeout(versionPoll);if(!state.data||document.hidden||!navigator.onLine)return;versionPoll=setTimeout(async()=>{await syncIfNeeded(false);startSync()},ritmoSyncDelay())}''')

# -----------------------------------------------------------------------------
# Retorno ao app: uma única fila ociosa, sem rajada de fetch em focus/pageshow.
# -----------------------------------------------------------------------------
fn('ritmoNativeCloudRestore',r'''async function ritmoNativeCloudRestore(force=false){if(!navigator.onLine||ritmoNativeRestoreBusy||document.visibilityState==='hidden'||$('#secureLock'))return false;const t=Date.now();if(!force&&t-ritmoNativeRestoreAt<120000)return false;ritmoNativeRestoreBusy=true;try{if(typeof state==='undefined'||typeof api!=='function')return false;if(state.data?.profile?.id&&typeof syncIfNeeded==='function'){await syncIfNeeded(false,force);ritmoNativeRestoreAt=Date.now();return true}const fresh=await api('/api/bootstrap');if(!fresh?.profile?.id)return false;state.data=fresh;if(state.page!=='shortcuts')state.shortcutDraft=null;if(typeof applyTheme==='function')applyTheme(fresh.settings?.theme||'system');if(typeof renderApp==='function')renderApp(false);ritmoNativeRestoreAt=Date.now();return true}catch{return false}finally{ritmoNativeRestoreBusy=false}}''')

fn('ritmoNativeResume',r'''let ritmoNativeResumeQueued=false;
function ritmoIdle(task,timeout=900){if('requestIdleCallback'in window)return requestIdleCallback(task,{timeout});return setTimeout(task,Math.min(timeout,180))}
function ritmoNativeResume(){if(ritmoNativeResumeQueued||document.hidden||$('#secureLock'))return;ritmoNativeResumeQueued=true;ritmoIdle(async()=>{try{await ritmoNativeCloudRestore(false)}finally{ritmoNativeResumeQueued=false}},700)}''')

# -----------------------------------------------------------------------------
# Desbloqueio: prepara o desafio WebAuthn em paralelo com a pintura da lockscreen.
# Remove atraso artificial e evita duas solicitações concorrentes de biometria.
# -----------------------------------------------------------------------------
fn('showLock',r'''let ritmoAutoBioRun=false;
let ritmoBioOptionsPromise=null;
let ritmoBioPromptBusy=false;
function ritmoPrepareBioChallenge(){if(!ritmoBioOptionsPromise)ritmoBioOptionsPromise=api('/api/webauthn/auth/options',{method:'POST',body:'{}'}).then(requestOptions).catch(e=>{ritmoBioOptionsPromise=null;throw e});return ritmoBioOptionsPromise}
function ritmoFinishUnlock(){ritmoMarkUnlocked();document.documentElement.classList.add('ritmo-fast-unlock');renderApp(false);requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.classList.remove('ritmo-fast-unlock')));startSync();ritmoIdle(()=>syncIfNeeded(false,true),900)}
async function showLock(reason='timeout'){
  if(!state.data)return;
  clearTimeout(ritmoLockTimer);state.modal=null;state.profilePop=false;ritmoAutoBioRun=false;ritmoBioPromptBusy=false;ritmoBioOptionsPromise=null;
  const enabled=Number(state.data.security?.webauthn_count||0)>0,p=state.data.profile;
  if(enabled)ritmoPrepareBioChallenge().catch(()=>{});
  root.innerHTML=`<section class="secure-lock premium-lock" id="secureLock"><div class="premium-lock-inner"><div class="premium-lock-brand">${brand()}</div><div class="premium-lock-avatar">${avatarMarkup('premium-lock-avatar-img')}</div><div class="premium-lock-copy"><h2>${reason==='launch'?'Bem-vindo de volta':'Ritmo bloqueado'}</h2><p>${enabled?`Use ${deviceBioLabel()} para continuar.`:'Digite sua senha para continuar.'}</p><span>@${esc(p.username)}</span></div>${enabled?`<button class="btn btn-primary premium-unlock-btn" id="unlockBtn">${ic('shield',18)} ${deviceBioLabel()}</button><button class="premium-password-toggle" id="showPasswordUnlock" type="button">Usar senha</button>`:''}<form id="lockPasswordForm" class="premium-password-form ${enabled?'is-collapsed':''}"><label class="premium-password-field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="Digite sua senha"></label><button class="btn ${enabled?'btn-secondary':'btn-primary'}" type="submit">Desbloquear</button></form><button class="premium-other-account" id="lockLogout" type="button">Usar outra conta</button></div></section>`;
  $('#unlockBtn')?.addEventListener('click',()=>unlockBio(false));$('#showPasswordUnlock')?.addEventListener('click',()=>{const f=$('#lockPasswordForm');if(!f)return;f.classList.remove('is-collapsed');$('#showPasswordUnlock')?.remove();setTimeout(()=>f.querySelector('input')?.focus(),40)});$('#lockPasswordForm')?.addEventListener('submit',unlockPassword);$('#lockLogout')?.addEventListener('click',logout);
  if(enabled&&document.visibilityState==='visible')setTimeout(()=>{if($('#secureLock')&&!ritmoAutoBioRun){ritmoAutoBioRun=true;unlockBio(true)}},45)
}''')

fn('unlockBio',r'''async function unlockBio(auto=false){if(ritmoBioPromptBusy)return;ritmoBioPromptBusy=true;try{const pk=await ritmoPrepareBioChallenge();const cred=await navigator.credentials.get({publicKey:pk});if(!cred)throw new Error('Desbloqueio cancelado.');await api('/api/webauthn/auth/verify',{method:'POST',body:JSON.stringify({credential:credentialToJSON(cred)})});ritmoBioOptionsPromise=null;ritmoFinishUnlock()}catch(e){if(auto&&(e?.name==='NotAllowedError'||e?.name==='AbortError'))return;if(!auto)toast(e.message||'Não foi possível confirmar o desbloqueio deste aparelho.')}finally{ritmoBioPromptBusy=false}}''')

fn('unlockPassword',r'''async function unlockPassword(e){e.preventDefault();const password=new FormData(e.currentTarget).get('password');try{await api('/api/auth/reverify',{method:'POST',body:JSON.stringify({password})});ritmoBioOptionsPromise=null;ritmoFinishUnlock()}catch(err){const input=e.currentTarget.querySelector('input[name="password"]');if(input){input.value='';input.focus()}toast(err.message||'Não foi possível desbloquear.')}}''')

# Perfil de desempenho local: reduz efeitos caros em aparelhos modestos/economia de dados.
a += r'''
function ritmoApplyPerformanceMode(){const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection,mem=Number(navigator.deviceMemory||8),cores=Number(navigator.hardwareConcurrency||8),reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,lite=!!c?.saveData||mem<=4||cores<=4||reduced;document.documentElement.dataset.ritmoPerf=lite?'lite':'full'}
ritmoApplyPerformanceMode();try{(navigator.connection||navigator.mozConnection||navigator.webkitConnection)?.addEventListener?.('change',ritmoApplyPerformanceMode)}catch{}
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(versionPoll)}else{startSync();ritmoIdle(()=>syncIfNeeded(false,false),800)}});
'''

app.write_text(a)

css=cssp.read_text()+r'''

/* Ritmo V1 — desempenho, fluidez e economia de bateria */
html,body{overscroll-behavior-y:none}
button,a,[role="button"]{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.item-card,.debt-card,.goal-card,.panel,.more-section{content-visibility:auto;contain-intrinsic-size:auto 180px}
.bottom,.fab{will-change:auto!important}
html.ritmo-sheet-open .bottom,html.ritmo-sheet-open .fab{will-change:transform,opacity!important}
html.ritmo-fast-unlock *,html.ritmo-fast-unlock *::before,html.ritmo-fast-unlock *::after{animation-duration:.01ms!important;transition-duration:.01ms!important;animation-delay:0s!important;transition-delay:0s!important}
@media(max-width:760px){
  .ritmo-native-sheet-wrap{-webkit-backdrop-filter:blur(3px)!important;backdrop-filter:blur(3px)!important;animation-duration:.16s!important}
  .ritmo-native-sheet{animation-duration:.27s!important;box-shadow:0 -8px 28px rgba(0,0,0,.14)!important}
  .ritmo-native-sheet-wrap.ritmo-sheet-closing,.ritmo-native-sheet-wrap.ritmo-sheet-closing .ritmo-native-sheet{animation-duration:.15s!important}
  html.ritmo-sheet-open .bottom{filter:none!important}
}
html[data-ritmo-perf="lite"] .ritmo-native-sheet-wrap{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
html[data-ritmo-perf="lite"] .welcome-hero{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
html[data-ritmo-perf="lite"] .premium-lock{background:var(--bg,#F7F5EF)!important}
html[data-ritmo-perf="lite"] .ritmo-native-sheet,html[data-ritmo-perf="lite"] .welcome-hero{box-shadow:none!important}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important}}
'''
cssp.write_text(css)
print('Ritmo V1: desempenho nativo otimizado, desbloqueio antecipado e sincronização econômica aplicados.')
