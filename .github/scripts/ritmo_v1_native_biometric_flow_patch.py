from pathlib import Path
import sys
root=Path(sys.argv[1]);app=root/'public'/'app.js';worker=root/'_worker.js';a=app.read_text();w=worker.read_text()
def bounds(name):
 s=[a.find(f'function {name}('),a.find(f'async function {name}(')];s=[x for x in s if x>=0]
 if not s: raise SystemExit('Função não encontrada: '+name)
 p=min(s);q=min([x for x in [a.find('\nfunction ',p+1),a.find('\nasync function ',p+1)] if x>=0] or [len(a)]);return p,q
def fn(name,code):
 global a;p,q=bounds(name);a=a[:p]+code+a[q:]
def repa(old,new,label):
 global a
 if old not in a: raise SystemExit('APP trecho não encontrado: '+label)
 a=a.replace(old,new,1)
def repw(old,new,label):
 global w
 if old not in w: raise SystemExit('WORKER trecho não encontrado: '+label)
 w=w.replace(old,new,1)
fn('creationOptions',r'''function creationOptions(o){const x={...o,challenge:b64uToBuf(o.challenge),user:{...o.user,id:b64uToBuf(o.user.id)},excludeCredentials:(o.excludeCredentials||[]).map(c=>({...c,id:b64uToBuf(c.id),transports:['internal']})),authenticatorSelection:{...(o.authenticatorSelection||{}),authenticatorAttachment:'platform',residentKey:'discouraged',requireResidentKey:false,userVerification:'required'}};try{x.hints=['client-device']}catch{}return x}''')
fn('requestOptions',r'''function requestOptions(o){const x={...o,challenge:b64uToBuf(o.challenge),allowCredentials:(o.allowCredentials||[]).map(c=>({...c,id:b64uToBuf(c.id),transports:['internal']})),userVerification:'required'};try{x.hints=['client-device']}catch{}return x}''')
# As duas funções ficam na mesma linha na base atual; substituir o bloco inteiro evita perder a segunda.
fn('deviceBioLabel',r'''function deviceBioLabel(){const ua=navigator.userAgent;if(/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))return 'Face ID / Touch ID';if(/Android/i.test(ua))return 'biometria do aparelho';if(/Windows/i.test(ua))return 'Windows Hello';if(/Mac/i.test(ua))return 'Touch ID';return 'desbloqueio do aparelho'}
function deviceSecurityHint(){const ua=navigator.userAgent;if(/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))return 'Desbloqueie naturalmente com Face ID ou Touch ID deste aparelho.';if(/Android/i.test(ua))return 'Use a digital, rosto ou bloqueio seguro configurado neste aparelho.';if(/Windows/i.test(ua))return 'Use o Windows Hello deste computador.';if(/Mac/i.test(ua))return 'Use o Touch ID ou desbloqueio seguro deste Mac.';return 'Use o desbloqueio seguro deste aparelho.'}''')
fn('toggleBiometric',r'''async function toggleBiometric(){const enabled=Number(state.data.security?.webauthn_count||0)>0;if(enabled){if(!confirm(`Desativar o desbloqueio deste aparelho para esta conta?`))return;try{await api('/api/webauthn/credentials',{method:'DELETE',body:'{}'});localStorage.removeItem(`${bioKey()}:verified`);state.data=await api('/api/bootstrap');renderApp(false);toast('Desbloqueio do aparelho desativado.')}catch(e){toast(e.message)}return}if(!await platformBioAvailable()){toast('Este aparelho não disponibilizou biometria ou desbloqueio seguro para o Ritmo.');return}try{const options=await api('/api/webauthn/register/options',{method:'POST',body:'{}'}),pk=creationOptions(options);const cred=await navigator.credentials.create({publicKey:pk});await api('/api/webauthn/register/verify',{method:'POST',body:JSON.stringify({credential:credentialToJSON(cred)})});localStorage.setItem(`${bioKey()}:verified`,String(Date.now()));state.data=await api('/api/bootstrap');renderApp(false);toast(`${deviceBioLabel()} ativado neste aparelho.`)}catch(e){toast(e.message||'Não foi possível ativar o desbloqueio deste aparelho.')}}''')
repa('<strong>Biometria e chave de acesso</strong><small id="bioHint">${deviceSecurityHint()}</small>','<strong>Desbloqueio do aparelho</strong><small id="bioHint">${deviceSecurityHint()}</small>','security label')
fn('showLock',r'''let ritmoAutoBioRun=false;
async function showLock(reason='timeout'){
  if(!state.data)return;
  clearTimeout(ritmoLockTimer);state.modal=null;state.profilePop=false;ritmoAutoBioRun=false;
  const enabled=Number(state.data.security?.webauthn_count||0)>0,p=state.data.profile;
  root.innerHTML=`<section class="secure-lock premium-lock" id="secureLock"><div class="premium-lock-inner"><div class="premium-lock-brand">${brand()}</div><div class="premium-lock-avatar">${avatarMarkup('premium-lock-avatar-img')}</div><div class="premium-lock-copy"><h2>${reason==='launch'?'Bem-vindo de volta':'Ritmo bloqueado'}</h2><p>${enabled?`Use ${deviceBioLabel()} para continuar.`:'Digite sua senha para continuar.'}</p><span>@${esc(p.username)}</span></div>${enabled?`<button class="btn btn-primary premium-unlock-btn" id="unlockBtn">${ic('shield',18)} ${deviceBioLabel()}</button><button class="premium-password-toggle" id="showPasswordUnlock" type="button">Usar senha</button>`:''}<form id="lockPasswordForm" class="premium-password-form ${enabled?'is-collapsed':''}"><label class="premium-password-field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="Digite sua senha"></label><button class="btn ${enabled?'btn-secondary':'btn-primary'}" type="submit">Desbloquear</button></form><button class="premium-other-account" id="lockLogout" type="button">Usar outra conta</button></div></section>`;
  $('#unlockBtn')?.addEventListener('click',()=>unlockBio(false));$('#showPasswordUnlock')?.addEventListener('click',()=>{const f=$('#lockPasswordForm');if(!f)return;f.classList.remove('is-collapsed');$('#showPasswordUnlock')?.remove();setTimeout(()=>f.querySelector('input')?.focus(),80)});$('#lockPasswordForm')?.addEventListener('submit',unlockPassword);$('#lockLogout')?.addEventListener('click',logout);
  if(enabled&&document.visibilityState==='visible')setTimeout(()=>{if($('#secureLock')&&!ritmoAutoBioRun){ritmoAutoBioRun=true;unlockBio(true)}},260)
}''')
fn('unlockBio',r'''async function unlockBio(auto=false){try{const options=await api('/api/webauthn/auth/options',{method:'POST',body:'{}'}),pk=requestOptions(options);const cred=await navigator.credentials.get({publicKey:pk});if(!cred)throw new Error('Desbloqueio cancelado.');await api('/api/webauthn/auth/verify',{method:'POST',body:JSON.stringify({credential:credentialToJSON(cred)})});ritmoMarkUnlocked();renderApp(false)}catch(e){if(auto&&(e?.name==='NotAllowedError'||e?.name==='AbortError'))return;if(!auto)toast(e.message||'Não foi possível confirmar o desbloqueio deste aparelho.')}}''')
repw("authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'}","authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'discouraged',requireResidentKey:false,userVerification:'required'}",'registration platform local')
repw("allowCredentials:(creds.results||[]).map(x=>({id:x.credential_id,transports:JSON.parse(x.transports||'[]')})),userVerification:'required'","allowCredentials:(creds.results||[]).map(x=>({id:x.credential_id,transports:['internal']})),userVerification:'required'",'authentication internal')
app.write_text(a);worker.write_text(w)
print('Biometria natural aplicada: autenticador interno, prompt automático e fallback por senha.')

# Mantém a otimização de desempenho como módulo separado, mas sempre aplicada junto
# do último patch nativo para não depender de uma etapa extra no pipeline.
perf=Path(__file__).with_name('ritmo_v1_native_performance_patch.py')
if not perf.exists():
 raise SystemExit('Patch de desempenho nativo não encontrado')
ns={'__name__':'__main__','__file__':str(perf)}
exec(compile(perf.read_text(),str(perf),'exec'),ns,ns)

# O otimizador não pode remover garantias do bloqueio. A rotina abaixo restaura
# somente o listener de visibilidade se algum recorte de função o tiver consumido.
a=app.read_text();w=worker.read_text()
visibility_marker='document.hidden)clearTimeout(ritmoLockTimer)'
if visibility_marker not in a:
 a += "\ndocument.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(ritmoLockTimer);else maybeLock(false)});\n"
 app.write_text(a)
required_app=[
 "sessionStorage.getItem(k)==='1'",
 'function ritmoRenderAppCore',
 visibility_marker,
 'Manter conta salva neste aparelho',
 'class="secure-lock premium-lock"'
]
for marker in required_app:
 if marker not in app.read_text(): raise SystemExit('Preservação de bloqueio ausente: '+marker)
if '/api/auth/reverify' not in w: raise SystemExit('Preservação de bloqueio ausente: /api/auth/reverify')
print('Ritmo V1: garantias de bloqueio preservadas após otimização.')

# Último estágio: estabiliza boot/PWA, elimina mistura de cache entre releases,
# remove a ação de continuar pelo navegador no Android/desktop e instala o smoke
# real de Chrome no build.
stability=Path(__file__).with_name('ritmo_v1_boot_install_stability_patch.py')
if not stability.exists():
 raise SystemExit('Patch de estabilidade de boot não encontrado')
ns2={'__name__':'__main__','__file__':str(stability)}
exec(compile(stability.read_text(),str(stability),'exec'),ns2,ns2)
