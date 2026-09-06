from pathlib import Path
import sys,re,json,hashlib
from ritmo_v1_patch_utils import js_function_bounds

root=Path(sys.argv[1])
app=root/'public'/'app.js'; indexp=root/'public'/'index.html'; cssp=root/'public'/'styles.css'
manifestp=root/'public'/'manifest.webmanifest'; swp=root/'public'/'sw.js'; pkgp=root/'package.json'
a=app.read_text(); idx=indexp.read_text(); css=cssp.read_text(); sw=swp.read_text()
man=json.loads(manifestp.read_text()); pkg=json.loads(pkgp.read_text())

def replace_func(name,code):
    global a
    p,q=js_function_bounds(a,name); a=a[:p]+code+a[q:]

# -----------------------------------------------------------------------------
# 1. Barras do sistema: um único controlador. Em PWA instalado, o claro usa a
#    cor institucional como fallback, pois Android/Samsung pode manter ícones
#    claros mesmo quando a página muda para tema claro. No escuro, usa o fundo
#    real do aplicativo. Recriar a meta força nova leitura em navegadores que
#    ignoram apenas a alteração do atributo content.
# -----------------------------------------------------------------------------
bar_helpers=r'''
function ritmoStandaloneMode(){return !!(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true)}
function ritmoSystemBarColor(dark){return dark?'#111315':(ritmoStandaloneMode()?'#0F4C5C':'#F7F5EF')}
function ritmoApplySystemBars(dark){
  const color=ritmoSystemBarColor(dark),root=document.documentElement;
  root.style.colorScheme=dark?'dark':'light';root.style.backgroundColor=dark?'#111315':'#F7F5EF';root.dataset.ritmoTheme=dark?'dark':'light';
  if(document.body)document.body.style.backgroundColor=dark?'#111315':'#F7F5EF';
  document.querySelectorAll('meta[name="theme-color"]').forEach(x=>x.remove());
  const meta=document.createElement('meta');meta.name='theme-color';meta.content=color;document.head.appendChild(meta);
  let scheme=document.querySelector('meta[name="color-scheme"]');if(!scheme){scheme=document.createElement('meta');scheme.name='color-scheme';document.head.appendChild(scheme)}scheme.content=dark?'dark':'light';
  let apple=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');if(!apple){apple=document.createElement('meta');apple.name='apple-mobile-web-app-status-bar-style';document.head.appendChild(apple)}apple.content=dark?'black-translucent':'default';
  root.style.setProperty('--ritmo-statusbar-color',color);
}
'''
p,_=js_function_bounds(a,'applyTheme');a=a[:p]+bar_helpers+a[p:]
replace_func('applyTheme',r'''function applyTheme(t){const dark=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',dark);localStorage.setItem('ritmo:theme',t);ritmoApplySystemBars(dark)}''')
replace_func('ritmoStatusBarSync',r'''function ritmoStatusBarSync(){ritmoApplySystemBars(document.documentElement.classList.contains('dark'))}''')

# Remove pré-pinturas antigas e instala uma única versão equivalente ao runtime.
idx=re.sub(r'\s*<script id="ritmo-theme-prepaint">.*?</script>\s*','\n',idx,flags=re.S)
idx=re.sub(r'\s*<meta[^>]+name=["\']theme-color["\'][^>]*>\s*','\n',idx,flags=re.I)
pre=r'''<meta name="theme-color" content="#0F4C5C"><script id="ritmo-theme-prepaint">(function(){try{var t=localStorage.getItem('ritmo:theme')||'system',dark=t==='dark'||(t==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches),standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true,color=dark?'#111315':(standalone?'#0F4C5C':'#F7F5EF'),root=document.documentElement;root.classList.toggle('dark',dark);root.dataset.ritmoTheme=dark?'dark':'light';root.style.colorScheme=dark?'dark':'light';root.style.backgroundColor=dark?'#111315':'#F7F5EF';var old=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<old.length;i++)old[i].remove();var m=document.createElement('meta');m.name='theme-color';m.content=color;document.head.appendChild(m)}catch(e){}})();</script>'''
link='<link rel="stylesheet" href="/styles.css" />'
if link not in idx: raise SystemExit('Folha de estilo principal não encontrada')
idx=idx.replace(link,pre+'\n'+link,1)
man['theme_color']='#0F4C5C';man['background_color']='#0F4C5C'

css += r'''
/* Ritmo V1 — acabamento das barras do sistema */
html,body,#root{min-height:100%;background:#F7F5EF}
html.dark,html.dark body,html.dark #root{background:#111315}
@media(display-mode:standalone){html:not(.dark){--ritmo-statusbar-color:#0F4C5C}html.dark{--ritmo-statusbar-color:#111315}}
'''

# -----------------------------------------------------------------------------
# 2. Atualização: versionamento real, timeout, sem unregister e sem apagar o
#    shell em uso. Se a versão local já é a publicada, o botão termina na hora.
# -----------------------------------------------------------------------------
build_id=hashlib.sha256((a+idx+css+sw+'commercial-readiness-v1').encode()).hexdigest()[:18]
version={'build':build_id,'version':'1.0','channel':'production'}
(root/'public'/'version.json').write_text(json.dumps(version,ensure_ascii=False,separators=(',',':'))+'\n')

update_helpers=f'''\nconst RITMO_BUILD_ID='{build_id}';\nlet ritmoUpdateBusy=false;\nfunction ritmoDelay(ms){{return new Promise(r=>setTimeout(r,ms))}}\nasync function ritmoFetchVersion(){{const c=new AbortController(),timer=setTimeout(()=>c.abort(),4500);try{{const r=await fetch('/version.json?_='+Date.now(),{{cache:'no-store',signal:c.signal}});if(!r.ok)throw new Error('offline');return await r.json()}}finally{{clearTimeout(timer)}}}}\nasync function ritmoTimed(p,ms){{return await Promise.race([Promise.resolve(p),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))])}}\n'''
p,_=js_function_bounds(a,'updateSystemNow');a=a[:p]+update_helpers+a[p:]
replace_func('updateSystemNow',r'''async function updateSystemNow(){
  const btn=document.querySelector('[data-system-update]');if(ritmoUpdateBusy)return;ritmoUpdateBusy=true;
  const finish=()=>{ritmoUpdateBusy=false;if(btn){btn.disabled=false;btn.classList.remove('updating');btn.removeAttribute('aria-busy')}};
  if(btn){btn.disabled=true;btn.classList.add('updating');btn.setAttribute('aria-busy','true')}
  try{
    const remote=await ritmoFetchVersion();
    if(!remote?.build||remote.build===RITMO_BUILD_ID){finish();toast('Ritmo já está atualizado.');return}
    toast('Atualizando Ritmo...');
    if('serviceWorker'in navigator){try{const reg=await ritmoTimed(navigator.serviceWorker.getRegistration(),1800);if(reg){await ritmoTimed(reg.update(),2600).catch(()=>{});if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'})}}catch{}}
    try{sessionStorage.setItem('ritmo:last-update',String(remote.build))}catch{}
    await ritmoDelay(180);location.reload();setTimeout(finish,2600)
  }catch(e){finish();toast(navigator.onLine?'Não foi possível atualizar agora.':'Sem conexão no momento.')}
}''')

# Termos técnicos não precisam aparecer para o usuário.
a=a.replace('Biometria, chave de acesso e bloqueio do aplicativo','Desbloqueio e proteção do aplicativo')
a=a.replace('Sessão protegida','Abertura protegida').replace('ID interno da conta','sua conta')

# -----------------------------------------------------------------------------
# 3. Auditoria automatizada de release comercial. O servidor de teste injeta
#    somente no CI um roteiro que percorre as telas, sub-telas, modais, temas e
#    o botão de atualização em mobile e desktop. Nada desse roteiro vai ao app.
# -----------------------------------------------------------------------------
audit=root/'ci-commercial-audit.mjs'
audit.write_text(r'''import http from 'node:http';
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
if(!process.env.CI){console.log('Auditoria comercial reservada ao CI.');process.exit(0)}
const dist=path.join(process.cwd(),'dist'),build=JSON.parse(fs.readFileSync(path.join(dist,'version.json'),'utf8')).build;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const bootstrap={profile:{id:1,name:'Flavio Neto',username:'flavio.neto',data_version:1},settings:{theme:'dark',auto_lock_minutes:5,mobile_shortcuts:['expenses','debts','goals'],notifications_enabled:1,notify_due:1,notify_overdue:1,notify_goals:1,reminder_days:3,monthly_summary:1,seen_notifications:[]},security:{webauthn_count:1},incomes:[],expenses:[],debts:[],goals:[],shared_incomes:[],shared_expenses:[],shared_debts:[],shared_goals:[],sharing:{active:false,partner:null,invitations:[],pending:[]}};
const harness=`<script>(async()=>{const out=[];const errors=[];addEventListener('error',e=>errors.push(String(e.message||e.error||'erro')));addEventListener('unhandledrejection',e=>errors.push(String(e.reason||'rejeicao')));const wait=m=>new Promise(r=>setTimeout(r,m));const ok=(v,m)=>{if(!v)throw new Error(m);out.push(m)};try{for(let i=0;i<80&&!state?.data;i++)await wait(50);ok(!!state?.data,'conta carregada');ritmoMarkUnlocked();state.modal=null;state.profilePop=false;const routes=['home','expenses','income','debts','goals','calendar','insights','notifications','more','profile','sharing','shortcuts','settings'];for(const p of routes){state.page=p;state.settingsSub=null;renderApp(false);await wait(25);ok(root.textContent.trim().length>5,'rota '+p);ok(document.documentElement.scrollWidth<=innerWidth+4,'sem overflow '+p)}for(const sub of ['personalization','notifications','security','about']){state.page='settings';state.settingsSub=sub;renderApp(false);await wait(20);ok(root.textContent.trim().length>5,'config '+sub)}state.settingsSub=null;for(const type of ['income','expense','debt','goal']){state.page='home';state.modal={type};renderApp(false);await wait(20);ok(!!document.querySelector('#modalWrap,.modal-wrap'),'modal '+type);state.modal=null}applyTheme('dark');ok(document.documentElement.classList.contains('dark'),'tema escuro');ok(document.querySelectorAll('meta[name="theme-color"]').length===1,'meta tema unico');ok(document.querySelector('meta[name="theme-color"]').content!=='#F7F5EF','barra escura');applyTheme('light');ok(!document.documentElement.classList.contains('dark'),'tema claro');state.data.settings.theme='dark';applyTheme('dark');state.page='more';renderApp(false);await wait(30);const b=document.querySelector('[data-system-update]');ok(!!b,'botao atualizar');b.click();await wait(900);ok(!b.disabled&&!b.classList.contains('updating'),'atualizacao encerra');ok(!/Cloudflare|WebAuthn|Service Worker|\bD1\b|\bKV\b|\bR2\b|ID interno/i.test(root.innerText),'sem termos tecnicos');ok(errors.length===0,'sem erros globais');document.body.dataset.ciCommercial='pass';document.body.dataset.ciChecks=String(out.length)}catch(e){document.body.dataset.ciCommercial='fail';document.body.dataset.ciError=String(e.message||e).slice(0,240)}})()</script>`;
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/seed'){res.writeHead(200,{'content-type':'text/html'});res.end(`<script>localStorage.setItem('ritmo:theme','dark');localStorage.setItem('ritmo:saved-account',JSON.stringify({username:'flavio.neto',name:'Flavio Neto',id:'1',bio:true}));localStorage.setItem('ritmo:bio:1:verified','1');document.cookie='ci=1; path=/';location.replace('/?ci-commercial=1')</script>`);return}if(u.pathname.startsWith('/api/')){if(u.pathname==='/api/bootstrap'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(bootstrap));return}if(u.pathname==='/api/version'){res.writeHead(200,{'content-type':'application/json'});res.end('{"version":1}');return}res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return}let rel=u.pathname==='/'?'index.html':u.pathname.replace(/^\/+/,''),file=path.join(dist,rel);if(!file.startsWith(dist)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');let body=fs.readFileSync(file);if(path.basename(file)==='index.html'&&u.searchParams.has('ci-commercial'))body=Buffer.from(body.toString().replace('</body>',harness+'</body>'));res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch(e){res.writeHead(500);res.end(String(e))}});
await new Promise((r,j)=>server.listen(4174,'127.0.0.1',e=>e?j(e):r()));const browser=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);if(!browser){server.close();throw new Error('Chrome/Chromium ausente')}
async function run(size){const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--window-size='+size,'--virtual-time-budget=6500','--user-data-dir=/tmp/ritmo-commercial-'+Date.now()+'-'+Math.random(),'--dump-dom','http://127.0.0.1:4174/seed'];const c=spawn(browser,args,{stdio:['ignore','pipe','pipe']});let o='',e='';c.stdout.on('data',d=>o+=d);c.stderr.on('data',d=>e+=d);const t=setTimeout(()=>c.kill('SIGKILL'),22000),code=await new Promise(r=>c.on('close',r));clearTimeout(t);if(code!==0)throw new Error(e.slice(-1400));if(!/data-ci-commercial="pass"/.test(o)){const m=o.match(/data-ci-error="([^"]*)"/);throw new Error('Auditoria '+size+' falhou: '+(m?.[1]||o.slice(-1800)))}return o}
await run('390,844');await run('1440,900');await new Promise(r=>server.close(r));console.log('Auditoria comercial aprovada: rotas, configurações, modais, temas, atualização, mobile e desktop funcionais. Build '+build);''')

pkg.setdefault('scripts',{})['build']='node build.mjs && node ci-browser-smoke.mjs && node ci-commercial-audit.mjs'

# Verificações finais da própria transformação.
for need in ['RITMO_BUILD_ID','ritmoFetchVersion','ritmoApplySystemBars','ritmoSystemBarColor','Desbloqueio e proteção do aplicativo']:
    if need not in a: raise SystemExit('Auditoria: marcador ausente '+need)
for bad in ['await reg.unregister()','caches.delete(k))}if(\'serviceWorker\'']:
    if bad in a: raise SystemExit('Auditoria: atualização antiga ainda presente')
if man.get('theme_color')!='#0F4C5C' or man.get('background_color')!='#0F4C5C': raise SystemExit('Fallback de barras inválido')

app.write_text(a);indexp.write_text(idx);cssp.write_text(css);manifestp.write_text(json.dumps(man,ensure_ascii=False,indent=2)+'\n');pkgp.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')
print('Ritmo V1: acabamento de barras, atualização sem loop e auditoria comercial automatizada aplicados.')
