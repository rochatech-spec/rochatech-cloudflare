from pathlib import Path
import sys, hashlib, re

root=Path(sys.argv[1])
app=root/'public'/'app.js'
indexp=root/'public'/'index.html'
cssp=root/'public'/'styles.css'
swp=root/'public'/'sw.js'
manifestp=root/'public'/'manifest.webmanifest'

a=app.read_text()
idx=indexp.read_text()
css=cssp.read_text()

# Android/desktop: instalação é a ação principal. A opção de continuar pelo
# navegador permanece apenas no fluxo específico de iPhone/iPad.
needle='<button type="button" class="welcome-continue" id="ritmoWelcomeContinue">Continuar no navegador</button>'
replacement="${platform==='ios'?`<button type=\"button\" class=\"welcome-continue\" id=\"ritmoWelcomeContinue\">Continuar no navegador</button>`:''}"
if needle not in a:
    raise SystemExit('Botão Continuar no navegador não encontrado')
a=a.replace(needle,replacement,1)

# Boot guard: nunca deixa o usuário preso em tela branca. Ele mostra um splash
# leve imediatamente no modo instalado e faz UMA recuperação de shell/cache se
# o app realmente não renderizar. Não apaga dados da conta nem dados financeiros.
guard=r'''<script id="ritmo-boot-guard">
(function(){
  'use strict';
  const RECOVERY='ritmo:boot-recovery-v2';
  let recovering=false;
  function root(){return document.getElementById('root')}
  function hasRealUI(){
    const r=root();
    return !!(document.getElementById('ritmoWelcome')||document.getElementById('secureLock')||document.querySelector('.auth,.app-shell,.shell,.layout')||(r&&[...r.children].some(x=>!x.classList.contains('ritmo-boot-splash'))));
  }
  function ensureSplash(){
    const r=root();if(!r||hasRealUI()||r.querySelector('.ritmo-boot-splash'))return;
    r.innerHTML='<div class="ritmo-boot-splash" role="status" aria-live="polite"><img src="/ritmo-icon-192.png" alt=""><strong>Ritmo</strong><span>Abrindo com segurança…</span><i></i></div>';
  }
  async function clearShell(){
    try{if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister().catch(()=>false)))}}catch{}
    try{if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.toLowerCase().includes('ritmo')).map(k=>caches.delete(k)))}}catch{}
  }
  function showRecovery(){
    const r=root();if(!r)return;
    r.innerHTML='<div class="ritmo-boot-recovery"><img src="/ritmo-icon-192.png" alt=""><strong>Vamos reabrir o Ritmo</strong><span>O aplicativo protegeu seus dados, mas o carregamento não terminou corretamente.</span><button type="button" id="ritmoBootRetry">Atualizar Ritmo</button></div>';
    document.getElementById('ritmoBootRetry')?.addEventListener('click',async()=>{try{sessionStorage.removeItem(RECOVERY)}catch{}await clearShell();location.replace('/?_ritmo_recover='+Date.now())});
  }
  async function recover(){
    if(recovering||hasRealUI())return;recovering=true;
    let used=false;try{used=sessionStorage.getItem(RECOVERY)==='1'}catch{}
    if(used){showRecovery();return}
    try{sessionStorage.setItem(RECOVERY,'1')}catch{}
    await clearShell();
    const u=new URL(location.href);u.searchParams.set('_ritmo_recover',Date.now().toString());location.replace(u.toString());
  }
  function healthy(){if(!hasRealUI())return false;try{sessionStorage.removeItem(RECOVERY)}catch{}return true}
  window.addEventListener('error',()=>setTimeout(()=>{if(!healthy())recover()},350));
  window.addEventListener('unhandledrejection',()=>setTimeout(()=>{if(!healthy())recover()},350));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureSplash();setTimeout(()=>{if(!healthy())recover()},6500)},{once:true});
  else{ensureSplash();setTimeout(()=>{if(!healthy())recover()},6500)}
  window.addEventListener('load',()=>setTimeout(healthy,1200),{once:true});
})();
</script>'''
if 'id="ritmo-boot-guard"' not in idx:
    if '</head>' not in idx: raise SystemExit('index sem </head>')
    idx=idx.replace('</head>',guard+'\n</head>',1)

# Splash/fallback somente durante boot real; some assim que o app renderiza.
css += r'''

/* Ritmo V1 — boot resiliente sem tela branca */
.ritmo-boot-splash,.ritmo-boot-recovery{position:fixed;inset:0;z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;background:var(--bg,#F7F5EF);color:var(--text,#2E2E2E);text-align:center}
.ritmo-boot-splash img,.ritmo-boot-recovery img{width:72px;height:72px;border-radius:22px;object-fit:cover;box-shadow:0 12px 28px rgba(15,76,92,.12)}
.ritmo-boot-splash strong,.ritmo-boot-recovery strong{font-size:21px;color:var(--primary,#0F4C5C)}
.ritmo-boot-splash span,.ritmo-boot-recovery span{max-width:340px;font-size:11px;line-height:1.55;color:var(--muted,#6f7775)}
.ritmo-boot-splash i{width:34px;height:3px;margin-top:5px;border-radius:999px;background:rgba(15,76,92,.12);overflow:hidden;position:relative}
.ritmo-boot-splash i:after{content:'';position:absolute;inset:0;width:45%;border-radius:inherit;background:var(--primary,#0F4C5C);animation:ritmoBootSlide .8s ease-in-out infinite alternate}
.ritmo-boot-recovery button{margin-top:8px;min-height:44px;border:0;border-radius:14px;padding:0 18px;background:var(--primary,#0F4C5C);color:#fff;font:inherit;font-size:11px;font-weight:800;cursor:pointer}
@keyframes ritmoBootSlide{from{transform:translateX(-5%)}to{transform:translateX(125%)}}
@media(prefers-reduced-motion:reduce){.ritmo-boot-splash i:after{animation:none;width:100%}}
'''

app.write_text(a)
indexp.write_text(idx)
cssp.write_text(css)

# Cache por versão do shell. O cache anterior tinha nome fixo e podia manter
# arquivos de releases diferentes. Agora a instalação do SW é atômica: se um
# arquivo crítico falhar, a versão antiga continua ativa e funcional.
fingerprint=hashlib.sha256((a+idx+css+manifestp.read_text()).encode()).hexdigest()[:14]
sw=f'''const CACHE='ritmo-shell-v1-{fingerprint}';
const CORE=['/','/index.html','/styles.css','/app.js','/manifest.webmanifest','/icon.svg'];
async function fresh(req){{const r=await fetch(new Request(req,{{cache:'no-store'}}));if(!r||!r.ok)throw new Error('network');return r}}
self.addEventListener('install',event=>{{event.waitUntil((async()=>{{const c=await caches.open(CACHE);try{{const rows=await Promise.all(CORE.map(async url=>[url,await fresh(url)]));for(const [url,r] of rows)await c.put(url,r.clone());await self.skipWaiting()}}catch(e){{await caches.delete(CACHE);throw e}}}})())}});
self.addEventListener('activate',event=>{{event.waitUntil((async()=>{{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE&&k.toLowerCase().includes('ritmo')).map(k=>caches.delete(k)));await self.clients.claim()}})())}});
self.addEventListener('message',event=>{{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='CLEAR_RITMO_CACHE')event.waitUntil((async()=>{{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.toLowerCase().includes('ritmo')).map(k=>caches.delete(k)))}})())}});
self.addEventListener('fetch',event=>{{const req=event.request;if(req.method!=='GET')return;const u=new URL(req.url);if(u.origin!==location.origin||u.pathname.startsWith('/api/'))return;event.respondWith((async()=>{{const c=await caches.open(CACHE);const key=req.mode==='navigate'?'/index.html':u.pathname;try{{const r=await fresh(req);if(req.mode==='navigate'){{await c.put('/index.html',r.clone());await c.put('/',r.clone())}}else await c.put(key,r.clone());return r}}catch{{const cached=await c.match(key)||await c.match(u.pathname)||await c.match('/index.html')||await c.match('/');if(cached)return cached;throw new Error('offline')}}}})())}});
'''
swp.write_text(sw)

# Sanidade do patch final.
final_app=app.read_text(); final_idx=indexp.read_text(); final_sw=swp.read_text()
if 'ritmoWelcomeInstall' not in final_app: raise SystemExit('Instalador ausente')
if "platform==='ios'?`<button type=\"button\" class=\"welcome-continue\"" not in final_app: raise SystemExit('Fluxo iOS/browser não isolado')
if "const CACHE='ritmo-shell-v1-current'" in final_sw: raise SystemExit('Cache fixo antigo ainda presente')
if 'ritmo-boot-guard' not in final_idx: raise SystemExit('Boot guard ausente')
print('Ritmo V1: boot resiliente, cache atômico e instalação simplificada para Android/desktop aplicados.')
