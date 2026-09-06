from pathlib import Path
import sys,re,json
from ritmo_v1_patch_utils import js_function_bounds

root=Path(sys.argv[1])
app=root/'public'/'app.js';indexp=root/'public'/'index.html';cssp=root/'public'/'styles.css';manifestp=root/'public'/'manifest.webmanifest'
a=app.read_text();idx=indexp.read_text();css=cssp.read_text();man=json.loads(manifestp.read_text())

def replace_func(name,code):
    global a
    p,q=js_function_bounds(a,name);a=a[:p]+code+a[q:]

# O tema precisa estar correto antes mesmo do primeiro frame. O JavaScript normal
# continua sincronizando depois, mas a barra do sistema não depende mais de um
# render tardio da interface.
replace_func('applyTheme',r'''function applyTheme(t){const dark=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches),color=dark?'#111315':'#F7F5EF';document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';document.documentElement.style.backgroundColor=color;localStorage.setItem('ritmo:theme',t);let meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',color);let scheme=document.querySelector('meta[name="color-scheme"]');if(scheme)scheme.setAttribute('content',dark?'dark':'light')}''')
replace_func('ritmoStatusBarSync',r'''function ritmoStatusBarSync(){const dark=document.documentElement.classList.contains('dark'),color=dark?'#111315':'#F7F5EF';document.documentElement.style.colorScheme=dark?'dark':'light';document.documentElement.style.backgroundColor=color;let meta=document.querySelector('meta[name="theme-color"]');if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}meta.content=color;let scheme=document.querySelector('meta[name="color-scheme"]');if(!scheme){scheme=document.createElement('meta');scheme.name='color-scheme';document.head.appendChild(scheme)}scheme.content=dark?'dark':'light';let apple=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');if(apple)apple.content=dark?'black-translucent':'default';document.documentElement.style.setProperty('--ritmo-statusbar-color',color)}''')

# A conta lembrada também funciona como um snapshot privado de lançamento. Isso
# permite desenhar diretamente o bloqueio, sem usar o login como tela temporária.
replace_func('ritmoSavedAccount',r'''function ritmoSavedAccount(){try{return JSON.parse(localStorage.getItem('ritmo:saved-account')||'null')}catch{return null}}''')
replace_func('ritmoSaveAccount',r'''function ritmoSaveAccount(username,name='',id='',bio=null){try{const prev=ritmoSavedAccount()||{},next={username:String(username||prev.username||''),name:String(name||prev.name||''),id:String(id||prev.id||'')};if(typeof bio==='boolean')next.bio=bio;else if(typeof prev.bio==='boolean')next.bio=prev.bio;localStorage.setItem('ritmo:saved-account',JSON.stringify(next))}catch{}}''')
replace_func('ritmoMarkDeviceBio',r'''function ritmoMarkDeviceBio(cred){try{localStorage.setItem(`${bioKey()}:verified`,JSON.stringify({at:Date.now(),credentialId:cred?.id||''}))}catch{}ritmoPersistLaunchAccount()}''')
replace_func('ritmoClearDeviceBio',r'''function ritmoClearDeviceBio(){try{localStorage.removeItem(`${bioKey()}:verified`)}catch{}ritmoPersistLaunchAccount()}''')

helpers=r'''
let ritmoLaunchIntent=null;
function ritmoSavedBioHint(saved){if(typeof saved?.bio==='boolean')return saved.bio;try{if(saved?.id&&localStorage.getItem(`ritmo:bio:${saved.id}:verified`))return true;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)||'';if(/^ritmo:bio:.+:verified$/.test(k)&&localStorage.getItem(k))return true}}catch{}return false}
function ritmoPersistLaunchAccount(){const saved=ritmoSavedAccount(),p=state.data?.profile;if(!saved||!p)return;ritmoSaveAccount(p.username,p.name,p.id,ritmoDeviceBioEnabled())}
function ritmoLockAvatar(p){const initial=esc(String(p?.name||p?.username||'R').trim().charAt(0).toUpperCase()||'R');return `<div class="premium-lock-avatar-img">${initial}</div>`}
function ritmoLockMarkup(p,enabled,reason='launch'){return `<section class="secure-lock premium-lock" id="secureLock"><div class="premium-lock-inner"><div class="premium-lock-brand">${brand()}</div><div class="premium-lock-avatar">${ritmoLockAvatar(p)}</div><div class="premium-lock-copy"><h2>${reason==='launch'?'Bem-vindo de volta':'Ritmo bloqueado'}</h2><p>${enabled?`Use ${deviceBioLabel()} para continuar.`:'Digite sua senha para continuar.'}</p>${p?.username?`<span>@${esc(p.username)}</span>`:''}</div>${enabled?`<button class="btn btn-primary premium-unlock-btn" id="unlockBtn">${ic('shield',18)} ${deviceBioLabel()}</button><button class="premium-password-toggle" id="showPasswordUnlock" type="button">Usar senha</button>`:''}<form id="lockPasswordForm" class="premium-password-form ${enabled?'is-collapsed':''}"><label class="premium-password-field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="Digite sua senha"></label><button class="btn ${enabled?'btn-secondary':'btn-primary'}" type="submit">Desbloquear</button></form><button class="premium-other-account" id="lockLogout" type="button">Usar outra conta</button></div></section>`}
function ritmoBindLockControls(){
  $('#unlockBtn')?.addEventListener('click',()=>{if(state.data)return unlockBio();ritmoLaunchIntent={type:'bio'}});
  $('#showPasswordUnlock')?.addEventListener('click',()=>{const f=$('#lockPasswordForm');if(!f)return;f.classList.remove('is-collapsed');$('#showPasswordUnlock')?.remove();setTimeout(()=>f.querySelector('input')?.focus(),40)});
  $('#lockPasswordForm')?.addEventListener('submit',e=>{if(state.data)return unlockPassword(e);e.preventDefault();ritmoLaunchIntent={type:'password',password:String(new FormData(e.currentTarget).get('password')||'')}});
  $('#lockLogout')?.addEventListener('click',()=>{if(state.data)return logout();ritmoLaunchIntent={type:'other'};renderAuth()});
}
function ritmoRenderInitialRoute(){const saved=ritmoSavedAccount();if(!saved?.username){renderAuth();return}root.innerHTML=ritmoLockMarkup({name:saved.name||saved.username,username:saved.username},ritmoSavedBioHint(saved),'launch');ritmoBindLockControls()}
function ritmoReplayLaunchIntent(){const intent=ritmoLaunchIntent;ritmoLaunchIntent=null;if(!intent)return;if(intent.type==='bio')setTimeout(()=>$('#unlockBtn')?.click(),0);else if(intent.type==='password'){const f=$('#lockPasswordForm');const input=f?.querySelector('input[name="password"]');if(input)input.value=intent.password||'';setTimeout(()=>f?.requestSubmit(),0)}else if(intent.type==='other')setTimeout(()=>$('#lockLogout')?.click(),0)}
'''
p,_=js_function_bounds(a,'showLock');a=a[:p]+helpers+a[p:]
replace_func('showLock',r'''function showLock(reason='timeout'){
  if(!state.data)return;
  clearTimeout(ritmoLockTimer);state.modal=null;state.profilePop=false;ritmoBioPromptBusy=false;ritmoPersistLaunchAccount();
  const enabled=ritmoAccountHasBio(),p=state.data.profile;
  root.innerHTML=ritmoLockMarkup(p,enabled,reason);ritmoBindLockControls();ritmoReplayLaunchIntent();
}''')

# Um único roteamento inicial: login apenas se não houver conta lembrada. Com
# conta lembrada, a primeira pintura já é a tela de bloqueio; a confirmação da
# sessão acontece por trás sem aparecer para o usuário.
replace_func('ritmoBoot',r'''async function ritmoBoot(){
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  applyTheme(localStorage.getItem('ritmo:theme')||'system');
  try{
    const d=await api('/api/bootstrap');
    if(!d?.profile?.id){renderAuth();return}
    state.data=d;state.page='home';state.settingsSub=null;
    applyTheme(d.settings?.theme||'system');
    if(ritmoSavedAccount())ritmoSaveAccount(d.profile.username,d.profile.name,d.profile.id,ritmoDeviceBioEnabled());
    startSync();
    if(await maybeLock(true))return;
    renderApp();
  }catch(e){
    if(e?.status===401)renderAuth();else toast('Não foi possível abrir sua conta agora. Tente novamente.');
  }
}''')
if 'renderAuth();\nvoid ritmoBoot();' not in a:raise SystemExit('Inicialização antiga não encontrada')
a=a.replace('renderAuth();\nvoid ritmoBoot();','ritmoRenderInitialRoute();\nvoid ritmoBoot();',1)
a=a.replace("ritmoSaveAccount(result?.profile?.username||username,result?.profile?.name||'')","ritmoSaveAccount(result?.profile?.username||username,result?.profile?.name||'',result?.profile?.id||'',null)",1)

# Linguagem de produto: detalhes internos não aparecem na interface.
a=a.replace('Ao reabrir o Ritmo após encerrar a sessão do app, confirme sua identidade.','Ao abrir o Ritmo novamente, confirme sua identidade.')
a=a.replace('Nenhuma credencial deste aparelho foi encontrada. Vá em Menu → Segurança e configure a biometria neste aparelho.','A biometria deste aparelho precisa ser configurada novamente. Vá em Menu → Segurança.')
a=a.replace('Não foi possível verificar sua sessão agora. Você ainda pode entrar normalmente.','Não foi possível abrir sua conta agora. Tente novamente.')

# Pré-pintura no HEAD: Android recebe a cor e o esquema do tema antes de carregar
# CSS/app.js, evitando a faixa clara no tema escuro.
idx=re.sub(r'\s*<script id="ritmo-theme-prepaint">.*?</script>\s*','\n',idx,flags=re.S)
pre=r'''<script id="ritmo-theme-prepaint">(function(){try{var t=localStorage.getItem('ritmo:theme')||'system',dark=t==='dark'||(t==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches),color=dark?'#111315':'#F7F5EF',root=document.documentElement;root.classList.toggle('dark',dark);root.style.colorScheme=dark?'dark':'light';root.style.backgroundColor=color;var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',color);var scheme=document.querySelector('meta[name="color-scheme"]');if(scheme)scheme.setAttribute('content',dark?'dark':'light')}catch(e){}})();</script>'''
link='<link rel="stylesheet" href="/styles.css" />'
if link not in idx:raise SystemExit('Folha de estilo principal não encontrada')
idx=idx.replace(link,pre+'\n'+link,1)
css += r'''\n/* Ritmo V1 — primeiro frame e barras do sistema seguem o tema */\nhtml,body{background:var(--bg,#F7F5EF)}\nhtml.dark,html.dark body{background:#111315}\n'''
man['theme_color']='#0F4C5C';man['background_color']='#F7F5EF'

# Smoke de navegador com três cenários reais do primeiro frame.
smoke=root/'ci-browser-smoke.mjs'
smoke.write_text(r'''import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
if(!process.env.CI){console.log('Smoke de navegador reservado ao CI.');process.exit(0)}
const dist=path.join(process.cwd(),'dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const mock=JSON.stringify({profile:{id:1,name:'Flavio',username:'flavio',data_version:1},settings:{theme:'dark',auto_lock_minutes:5},security:{webauthn_count:1}});
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/seed-launch'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(`<script>localStorage.setItem('ritmo:theme','dark');localStorage.setItem('ritmo:saved-account',JSON.stringify({username:'flavio',name:'Flavio',id:'1',bio:true}));localStorage.setItem('ritmo:bio:1:verified','1');document.cookie='ci_launch=1; path=/';location.replace('/?ci-launch=1')</script>`);return}if(u.pathname==='/seed-dark'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(`<script>localStorage.setItem('ritmo:theme','dark');location.replace('/?ci-dark=1')</script>`);return}if(u.pathname.startsWith('/api/')){if(u.pathname==='/api/bootstrap'&&String(req.headers.cookie||'').includes('ci_launch=1')){res.writeHead(200,{'content-type':'application/json'});res.end(mock);return}res.writeHead(401,{'content-type':'application/json'});res.end('{"error":"Não autenticado"}');return}let rel=u.pathname==='/'?'index.html':u.pathname.replace(/^\/+/, '');let file=path.join(dist,rel);if(!file.startsWith(dist)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res)}catch(e){res.writeHead(500);res.end(String(e))}});
await new Promise((resolve,reject)=>server.listen(4173,'127.0.0.1',e=>e?reject(e):resolve()));
const candidates=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];const browser=candidates.find(fs.existsSync);if(!browser){server.close();throw new Error('Chrome/Chromium não encontrado no runner')}
async function run(url){const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--virtual-time-budget=1800','--user-data-dir=/tmp/ritmo-ci-browser-'+Date.now()+'-'+Math.random(),'--dump-dom',url];const child=spawn(browser,args,{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);const timer=setTimeout(()=>child.kill('SIGKILL'),18000);const code=await new Promise(resolve=>child.on('close',resolve));clearTimeout(timer);if(code!==0)throw new Error('Chrome headless falhou: '+err.slice(-1200));return out}
const fresh=await run('http://127.0.0.1:4173/?ci-smoke=1');if(!/class="auth(?:\s|")/.test(fresh)||!/id="authForm"/.test(fresh))throw new Error('Conta nova não chegou ao login');if(/ritmo-boot-(?:splash|recovery)|Abrindo com segurança/.test(fresh))throw new Error('Tela intermediária indevida no login');
const dark=await run('http://127.0.0.1:4173/seed-dark');if(!/<html[^>]*class="[^"]*dark/.test(dark)||!/meta name="theme-color" content="#111315"/i.test(dark))throw new Error('Tema escuro não foi aplicado antes do primeiro frame');
const launch=await run('http://127.0.0.1:4173/seed-launch');await new Promise(resolve=>server.close(resolve));if(!/id="secureLock"/.test(launch)||!/premium-lock/.test(launch))throw new Error('Conta lembrada não abriu direto no bloqueio');if(/id="authForm"/.test(launch))throw new Error('Login apareceu antes do bloqueio');if(!/<html[^>]*class="[^"]*dark/.test(launch)||!/meta name="theme-color" content="#111315"/i.test(launch))throw new Error('Barra e tema escuro divergiram no lançamento');
console.log('Smoke de navegador aprovado: login limpo, bloqueio direto e tema do sistema harmonizado.');
''')

app.write_text(a);indexp.write_text(idx);cssp.write_text(css);manifestp.write_text(json.dumps(man,ensure_ascii=False,indent=2)+'\n')
for need,hay in [('function ritmoRenderInitialRoute',a),('function ritmoLockMarkup',a),('ritmo-theme-prepaint',idx),('ritmoPersistLaunchAccount',a)]:
    if need not in hay:raise SystemExit('Marcador ausente: '+need)
if 'renderAuth();\nvoid ritmoBoot();' in a:raise SystemExit('Login ainda é renderizado antes do boot')
if idx.find('ritmo-theme-prepaint')>idx.find('/styles.css'):raise SystemExit('Tema inicial aplicado tarde demais')
print('Ritmo V1: lançamento direto no bloqueio e barras do sistema alinhadas ao tema aplicados.')
