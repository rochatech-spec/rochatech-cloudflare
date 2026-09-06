from pathlib import Path
import sys, hashlib, re, json

root=Path(sys.argv[1])
app=root/'public'/'app.js'
indexp=root/'public'/'index.html'
cssp=root/'public'/'styles.css'
swp=root/'public'/'sw.js'
manifestp=root/'public'/'manifest.webmanifest'

a=app.read_text(); idx=indexp.read_text(); css=cssp.read_text()

# Android/desktop: instalação é a ação principal. O fallback de continuar pelo
# navegador existe somente no fluxo específico de iPhone/iPad.
needle='<button type="button" class="welcome-continue" id="ritmoWelcomeContinue">Continuar no navegador</button>'
replacement="${platform==='ios'?`<button type=\"button\" class=\"welcome-continue\" id=\"ritmoWelcomeContinue\">Continuar no navegador</button>`:''}"
if needle not in a:
    raise SystemExit('Botão Continuar no navegador não encontrado')
a=a.replace(needle,replacement,1)

# Nenhum splash intermediário. Se versões anteriores deste patch forem
# reexecutadas, removemos explicitamente seus artefatos em vez de escondê-los.
idx=re.sub(r'<script id="ritmo-boot-guard">.*?</script>\s*','',idx,count=1,flags=re.S)
css=re.sub(r'\n/\* Ritmo V1 — boot resiliente sem tela branca \*/.*?@media\(prefers-reduced-motion:reduce\)\{\.ritmo-boot-splash i:after\{animation:none;width:100%\}\}\n?','\n',css,count=1,flags=re.S)

app.write_text(a); indexp.write_text(idx); cssp.write_text(css)

# Cache versionado por release. A instalação do SW é atômica: se algum arquivo
# crítico falhar, a versão anterior continua ativa e funcional.
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

# Smoke real: o navegador precisa renderizar a tela de login. A tela de boas-
# vindas do navegador não conta como boot do app e não pode mascarar falha.
smoke=root/'ci-browser-smoke.mjs'
smoke.write_text(r'''import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
if(!process.env.CI){console.log('Smoke de navegador reservado ao CI.');process.exit(0)}
const dist=path.join(process.cwd(),'dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname.startsWith('/api/')){res.writeHead(401,{'content-type':'application/json'});res.end('{"error":"Não autenticado"}');return}let rel=u.pathname==='/'?'index.html':u.pathname.replace(/^\/+/, '');let file=path.join(dist,rel);if(!file.startsWith(dist)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res)}catch(e){res.writeHead(500);res.end(String(e))}});
await new Promise((resolve,reject)=>server.listen(4173,'127.0.0.1',e=>e?reject(e):resolve()));
const candidates=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
const browser=candidates.find(fs.existsSync);if(!browser){server.close();throw new Error('Chrome/Chromium não encontrado no runner')}
const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--virtual-time-budget=1800','--user-data-dir=/tmp/ritmo-ci-browser-'+Date.now(),'--dump-dom','http://127.0.0.1:4173/?ci-smoke=1'];
const child=spawn(browser,args,{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);const timer=setTimeout(()=>child.kill('SIGKILL'),18000);const code=await new Promise(resolve=>child.on('close',resolve));clearTimeout(timer);await new Promise(resolve=>server.close(resolve));
if(code!==0)throw new Error('Chrome headless falhou: '+err.slice(-1200));
const body=out.slice(Math.max(0,out.search(/<body[\s>]/i)));
if(!/class="auth(?:\s|")/.test(body)||!/id="authForm"/.test(body))throw new Error('Boot não chegou ao login. DOM: '+body.slice(0,1600));
if(/ritmo-boot-(?:splash|recovery)|Abrindo com segurança/.test(body))throw new Error('Boot exibiu tela intermediária indevida');
console.log('Smoke de navegador aprovado: login renderizado diretamente.');
''')
pkgp=root/'package.json'; pkg=json.loads(pkgp.read_text()); pkg.setdefault('scripts',{})['build']='node build.mjs && node ci-browser-smoke.mjs'; pkgp.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')

final_app=app.read_text(); final_idx=indexp.read_text(); final_sw=swp.read_text(); final_css=cssp.read_text()
if 'ritmoWelcomeInstall' not in final_app: raise SystemExit('Instalador ausente')
if "platform==='ios'?`<button type=\"button\" class=\"welcome-continue\"" not in final_app: raise SystemExit('Fluxo iOS/browser não isolado')
if "const CACHE='ritmo-shell-v1-current'" in final_sw: raise SystemExit('Cache fixo antigo ainda presente')
if 'ritmo-boot-guard' in final_idx or 'ritmo-boot-splash' in final_idx or '.ritmo-boot-splash' in final_css: raise SystemExit('Splash de boot ainda presente')
print('Ritmo V1: cache atômico mantido, splash removido e smoke de login direto aplicado.')
