from pathlib import Path
import sys,re
from ritmo_v1_patch_utils import js_function_bounds

root=Path(sys.argv[1])
app=root/'public'/'app.js';worker=root/'_worker.js';indexp=root/'public'/'index.html';cssp=root/'public'/'styles.css'
a=app.read_text();w=worker.read_text();idx=indexp.read_text();css=cssp.read_text()

def replace_func(source,name,code):
    p,q=js_function_bounds(source,name);return source[:p]+code+source[q:]
def remove_func_if_present(source,name):
    if f'function {name}(' not in source and f'async function {name}(' not in source:return source
    p,q=js_function_bounds(source,name);return source[:p]+source[q:]

# Nome único para a proteção do aparelho, abrangendo Face ID, Touch ID, digital,
# passkeys e Windows Hello sem confundir o usuário com detalhes técnicos.
a=a.replace('<strong>Biometria e chave de acesso</strong>','<strong>Desbloqueio do aparelho</strong>')

# Turnstile/CAPTCHA sai por completo do cliente. O login continua protegido por
# Same-Origin, rate limit, hash de senha, cookie HttpOnly/Secure e sessão no servidor.
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
css=re.sub(r'\.turnstile-slot(?:\s+iframe)?\s*\{[^{}]*\}','',css,flags=re.I)

# Backend: não chama mais Siteverify e não expõe configuração do CAPTCHA.
w=remove_func_if_present(w,'verifyTurnstile')
old="const b=await body(request);const tv=await verifyTurnstile(env,request,b.turnstileToken);if(!tv.ok)return json({error:'Não foi possível validar a verificação de segurança. Tente novamente.'},403);const username=cleanUsername(b.username);"
if old not in w:raise SystemExit('Validação Turnstile de autenticação não encontrada')
w=w.replace(old,"const b=await body(request);const username=cleanUsername(b.username);")
w=w.replace(",turnstile:!!env.TURNSTILE_SITEKEY&&!!env.TURNSTILE_SECRET",'')
w=w.replace("  if(path==='/api/security/config'&&request.method==='GET')return json({turnstile_sitekey:env.TURNSTILE_SITEKEY||null,webauthn:true,kv:!!env.CACHE});\n",'')

for text,name in [(a,'app.js'),(idx,'index.html'),(w,'_worker.js')]:
    if 'turnstile' in text.lower():raise SystemExit(f'Turnstile ainda presente em {name}')
if 'sameOrigin(request)' not in w or 'rateLimit(env,request' not in w:raise SystemExit('Proteções essenciais de autenticação ausentes')
if '<strong>Desbloqueio do aparelho</strong>' not in a:raise SystemExit('Rótulo de desbloqueio do aparelho ausente')

app.write_text(a);worker.write_text(w);indexp.write_text(idx);cssp.write_text(css)
print('Ritmo V1: Turnstile removido e desbloqueio do aparelho consolidado; proteções essenciais preservadas.')

# Lançamento sem flash e tema correto no primeiro frame.
launch=Path(__file__).with_name('ritmo_v1_native_launch_theme_patch.py')
if not launch.exists():raise SystemExit('Patch de lançamento nativo não encontrado')
ns={'__name__':'__main__','__file__':str(launch)}
exec(compile(launch.read_text(),str(launch),'exec'),ns,ns)

# Fluidez global: troca Meu/Nosso pré-carregada e transições leves em todas as plataformas.
smooth=Path(__file__).with_name('ritmo_v1_global_smoothness_patch.py')
if not smooth.exists():raise SystemExit('Patch de fluidez global não encontrado')
ns1={'__name__':'__main__','__file__':str(smooth)}
exec(compile(smooth.read_text(),str(smooth),'exec'),ns1,ns1)

# Prontidão comercial: correções finais e auditoria.
commercial=Path(__file__).with_name('ritmo_v1_commercial_readiness_patch.py')
if not commercial.exists():raise SystemExit('Patch de prontidão comercial não encontrado')
ns2={'__name__':'__main__','__file__':str(commercial)}
exec(compile(commercial.read_text(),str(commercial),'exec'),ns2,ns2)

# Auditoria final: percorre a interface real e exige Meu/Nosso sem esperar a latência simulada.
dom_audit=Path(__file__).with_name('ritmo_v1_commercial_dom_audit_patch.py')
if not dom_audit.exists():raise SystemExit('Auditoria comercial de interface não encontrada')
ns3={'__name__':'__main__','__file__':str(dom_audit)}
exec(compile(dom_audit.read_text(),str(dom_audit),'exec'),ns3,ns3)
