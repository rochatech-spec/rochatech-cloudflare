from pathlib import Path
import sys
from ritmo_v1_patch_utils import js_function_bounds

root=Path(sys.argv[1]);app=root/'public'/'app.js';worker=root/'_worker.js';a=app.read_text();w=worker.read_text()

def bounds(name):
    return js_function_bounds(a,name)
def fn(name,code):
    global a
    p,q=bounds(name);a=a[:p]+code+a[q:]
def repw(old,new,label):
    global w
    if old not in w: raise SystemExit('WORKER trecho não encontrado: '+label)
    w=w.replace(old,new,1)

# WebAuthn: preserva os transports reais, prefere passkeys descobríveis e exige
# verificação do usuário pelo autenticador seguro do próprio aparelho.
fn('creationOptions',r'''function creationOptions(o){return {...o,challenge:b64uToBuf(o.challenge),user:{...o.user,id:b64uToBuf(o.user.id)},excludeCredentials:(o.excludeCredentials||[]).map(c=>({...c,id:b64uToBuf(c.id)})),authenticatorSelection:{...(o.authenticatorSelection||{}),authenticatorAttachment:'platform',residentKey:'preferred',requireResidentKey:false,userVerification:'required'},attestation:'none',timeout:Math.min(Number(o.timeout||60000),60000)}}''')
fn('requestOptions',r'''function requestOptions(o){return {...o,challenge:b64uToBuf(o.challenge),allowCredentials:(o.allowCredentials||[]).map(c=>({...c,id:b64uToBuf(c.id)})),userVerification:'required',timeout:Math.min(Number(o.timeout||60000),60000)}}''')
fn('deviceBioLabel',r'''function deviceBioLabel(){const ua=navigator.userAgent;if(/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))return 'Face ID / Touch ID';if(/Android/i.test(ua))return 'biometria do aparelho';if(/Windows/i.test(ua))return 'Windows Hello';if(/Mac/i.test(ua))return 'Touch ID';return 'desbloqueio do aparelho'}''')
fn('deviceSecurityHint',r'''function deviceSecurityHint(){const ua=navigator.userAgent;if(/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))return 'Use Face ID ou Touch ID configurado neste iPhone/iPad.';if(/Android/i.test(ua))return 'Use a digital, rosto ou chave de acesso configurada neste aparelho.';if(/Windows/i.test(ua))return 'Use o Windows Hello deste computador.';if(/Mac/i.test(ua))return 'Use o Touch ID ou a chave de acesso deste Mac.';return 'Use o desbloqueio seguro disponibilizado pelo aparelho.'}''')
fn('platformBioAvailable',r'''async function platformBioAvailable(){if(!window.PublicKeyCredential||!navigator.credentials?.create||!navigator.credentials?.get)return false;const check=PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;if(typeof check!=='function')return true;try{return await check.call(PublicKeyCredential)}catch{return true}}''')

# A conta pode ter credenciais em vários aparelhos. A chave da interface precisa
# refletir ESTE aparelho, e não apenas o total global de credenciais da conta.
a=a.replace("bio=Number(state.data.security?.webauthn_count||0)>0","bio=ritmoDeviceBioEnabled()")
a=a.replace("if(k==='security'){const enabled=Number(state.data.security?.webauthn_count||0)>0;","if(k==='security'){const enabled=ritmoDeviceBioEnabled();",1)
a=a.replace('let ritmoAutoBioRun=false;\n','',1)

helpers=r'''function ritmoAccountHasBio(){return Number(state.data?.security?.webauthn_count||0)>0}
function ritmoDeviceBioEnabled(){if(!ritmoAccountHasBio())return false;try{return !!localStorage.getItem(`${bioKey()}:verified`)}catch{return false}}
function ritmoMarkDeviceBio(cred){try{localStorage.setItem(`${bioKey()}:verified`,JSON.stringify({at:Date.now(),credentialId:cred?.id||''}))}catch{}}
function ritmoClearDeviceBio(){try{localStorage.removeItem(`${bioKey()}:verified`)}catch{}}
let ritmoBioPromptBusy=false;
function ritmoBioErrorMessage(e){if(e?.status===404||e?.name==='NotFoundError')return 'Nenhuma credencial deste aparelho foi encontrada. Vá em Menu → Segurança e configure a biometria neste aparelho.';if(e?.name==='NotAllowedError'||e?.name==='AbortError')return 'A confirmação biométrica foi cancelada.';if(e?.name==='SecurityError')return 'O navegador bloqueou o desbloqueio seguro. Use o aplicativo instalado ou o endereço oficial do Ritmo.';return e?.message||'Não foi possível confirmar o desbloqueio deste aparelho.'}
async function ritmoAuthenticateDevice(){if(ritmoBioPromptBusy)throw new Error('A confirmação biométrica já está aberta.');ritmoBioPromptBusy=true;try{const options=await api('/api/webauthn/auth/options',{method:'POST',body:'{}'}),pk=requestOptions(options);const cred=await navigator.credentials.get({publicKey:pk});if(!cred)throw new Error('Desbloqueio cancelado.');await api('/api/webauthn/auth/verify',{method:'POST',body:JSON.stringify({credential:credentialToJSON(cred)})});ritmoMarkDeviceBio(cred);return cred}catch(e){if(e?.status===404)ritmoClearDeviceBio();throw e}finally{ritmoBioPromptBusy=false}}
function ritmoFinishUnlock(){ritmoMarkUnlocked();document.documentElement.classList.add('ritmo-fast-unlock');renderApp(false);requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.classList.remove('ritmo-fast-unlock')));startSync();if(typeof ritmoIdle==='function')ritmoIdle(()=>syncIfNeeded(false,true),900)}
'''
p,_=bounds('showLock')
a=a[:p]+helpers+a[p:]

# Ativar/desativar é por aparelho. Desativar não apaga Face ID/Touch ID/Hello de
# outros aparelhos da mesma conta.
fn('toggleBiometric',r'''async function toggleBiometric(){const enabled=ritmoDeviceBioEnabled();if(enabled){if(!confirm(`Desativar ${deviceBioLabel()} somente neste aparelho?`))return;ritmoClearDeviceBio();renderApp(false);toast('Desbloqueio biométrico desativado somente neste aparelho.');return}if(!await platformBioAvailable()){toast('Este aparelho não disponibilizou biometria ou desbloqueio seguro para o Ritmo.');return}try{const options=await api('/api/webauthn/register/options',{method:'POST',body:'{}'}),pk=creationOptions(options);const cred=await navigator.credentials.create({publicKey:pk});if(!cred)throw new Error('Configuração cancelada.');await api('/api/webauthn/register/verify',{method:'POST',body:JSON.stringify({credential:credentialToJSON(cred)})});ritmoMarkDeviceBio(cred);state.data=await api('/api/bootstrap');renderApp(false);toast(`${deviceBioLabel()} ativado neste aparelho.`)}catch(e){if(e?.name==='InvalidStateError'){try{await ritmoAuthenticateDevice();state.data=await api('/api/bootstrap');renderApp(false);toast(`${deviceBioLabel()} já estava configurado e foi confirmado neste aparelho.`);return}catch(testErr){toast(ritmoBioErrorMessage(testErr));return}}toast(e?.name==='NotAllowedError'||e?.name==='AbortError'?'Configuração biométrica cancelada.':(e?.message||'Não foi possível ativar o desbloqueio deste aparelho.'))}}''')

# Nada de prompt automático. O pedido biométrico só começa no toque explícito do
# usuário, com desafio novo a cada tentativa.
fn('showLock',r'''async function showLock(reason='timeout'){
  if(!state.data)return;
  clearTimeout(ritmoLockTimer);state.modal=null;state.profilePop=false;ritmoBioPromptBusy=false;
  const enabled=ritmoAccountHasBio(),p=state.data.profile;
  root.innerHTML=`<section class="secure-lock premium-lock" id="secureLock"><div class="premium-lock-inner"><div class="premium-lock-brand">${brand()}</div><div class="premium-lock-avatar">${avatarMarkup('premium-lock-avatar-img')}</div><div class="premium-lock-copy"><h2>${reason==='launch'?'Bem-vindo de volta':'Ritmo bloqueado'}</h2><p>${enabled?`Use ${deviceBioLabel()} para continuar.`:'Digite sua senha para continuar.'}</p><span>@${esc(p.username)}</span></div>${enabled?`<button class="btn btn-primary premium-unlock-btn" id="unlockBtn">${ic('shield',18)} ${deviceBioLabel()}</button><button class="premium-password-toggle" id="showPasswordUnlock" type="button">Usar senha</button>`:''}<form id="lockPasswordForm" class="premium-password-form ${enabled?'is-collapsed':''}"><label class="premium-password-field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="Digite sua senha"></label><button class="btn ${enabled?'btn-secondary':'btn-primary'}" type="submit">Desbloquear</button></form><button class="premium-other-account" id="lockLogout" type="button">Usar outra conta</button></div></section>`;
  $('#unlockBtn')?.addEventListener('click',unlockBio);$('#showPasswordUnlock')?.addEventListener('click',()=>{const f=$('#lockPasswordForm');if(!f)return;f.classList.remove('is-collapsed');$('#showPasswordUnlock')?.remove();setTimeout(()=>f.querySelector('input')?.focus(),40)});$('#lockPasswordForm')?.addEventListener('submit',unlockPassword);$('#lockLogout')?.addEventListener('click',logout);
}''')
fn('unlockBio',r'''async function unlockBio(){try{await ritmoAuthenticateDevice();ritmoFinishUnlock()}catch(e){toast(ritmoBioErrorMessage(e))}}''')
fn('unlockPassword',r'''async function unlockPassword(e){e.preventDefault();const password=new FormData(e.currentTarget).get('password');try{await api('/api/auth/reverify',{method:'POST',body:JSON.stringify({password})});ritmoFinishUnlock()}catch(err){const input=e.currentTarget.querySelector('input[name="password"]');if(input){input.value='';input.focus()}toast(err.message||'Não foi possível desbloquear.')}}''')

# Servidor: prefere passkeys e devolve os transports realmente armazenados.
if "residentKey:'discouraged',requireResidentKey:false,userVerification:'required'" in w:
    w=w.replace("residentKey:'discouraged',requireResidentKey:false,userVerification:'required'","residentKey:'preferred',requireResidentKey:false,userVerification:'required'",1)
elif "residentKey:'preferred',userVerification:'required'" in w:
    w=w.replace("residentKey:'preferred',userVerification:'required'","residentKey:'preferred',requireResidentKey:false,userVerification:'required'",1)
if "transports:['internal']" in w:
    w=w.replace("transports:['internal']","transports:JSON.parse(x.transports||'[]')",1)

app.write_text(a);worker.write_text(w)
print('Ritmo V1: WebAuthn unificado por aparelho, sem prompt automático e compatível com Face ID/Touch ID, Android e Windows Hello.')

# Desempenho fica independente de WebAuthn.
perf=Path(__file__).with_name('ritmo_v1_native_performance_patch.py')
if not perf.exists(): raise SystemExit('Patch de desempenho nativo não encontrado')
ns={'__name__':'__main__','__file__':str(perf)}
exec(compile(perf.read_text(),str(perf),'exec'),ns,ns)

a=app.read_text();w=worker.read_text()
visibility_marker='document.hidden)clearTimeout(ritmoLockTimer)'
if visibility_marker not in a:
    a += "\ndocument.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(ritmoLockTimer);else maybeLock(false)});\n"
    app.write_text(a)
required_app=["sessionStorage.getItem(k)==='1'",'function ritmoRenderAppCore',visibility_marker,'Manter conta salva neste aparelho','class="secure-lock premium-lock"','ritmoAuthenticateDevice','ritmoDeviceBioEnabled']
for marker in required_app:
    if marker not in app.read_text(): raise SystemExit('Preservação de segurança ausente: '+marker)
if '/api/auth/reverify' not in w: raise SystemExit('Preservação de bloqueio ausente: /api/auth/reverify')

stability=Path(__file__).with_name('ritmo_v1_boot_install_stability_patch.py')
if not stability.exists(): raise SystemExit('Patch de estabilidade de boot não encontrado')
ns2={'__name__':'__main__','__file__':str(stability)}
exec(compile(stability.read_text(),str(stability),'exec'),ns2,ns2)

boot=Path(__file__).with_name('ritmo_v1_boot_flow_patch.py')
if not boot.exists(): raise SystemExit('Patch de fluxo único de boot não encontrado')
ns3={'__name__':'__main__','__file__':str(boot)}
exec(compile(boot.read_text(),str(boot),'exec'),ns3,ns3)

final=app.read_text();finalw=worker.read_text()
if final.count('async function ritmoBoot()')!=1: raise SystemExit('Quantidade inválida de boots finais')
for bad in ["transports:['internal']","hints=['client-device']","unlockBio(true)","residentKey:'discouraged'","ritmoPrepareBioChallenge"]:
    if bad in final or bad in finalw: raise SystemExit('WebAuthn incompatível ainda presente: '+bad)
for need in ["residentKey:'preferred'","JSON.parse(x.transports||'[]')","ritmoAuthenticateDevice","ritmoDeviceBioEnabled","navigator.credentials.get({publicKey:pk})"]:
    if need not in final and need not in finalw: raise SystemExit('WebAuthn final ausente: '+need)
if 'ritmo-instant-login-boot' in final or 'Abrindo com segurança' in final: raise SystemExit('Boot antigo ainda presente')
print('Ritmo V1: biometria e boot validados sem fluxo concorrente.')
