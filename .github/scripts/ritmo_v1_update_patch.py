from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'
swp=root/'public'/'sw.js'
headersp=root/'public'/'_headers'

s=app.read_text()

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'Trecho não encontrado: {label}')
    s=s.replace(old,new,1)

# Atualização manual: limpa apenas CacheStorage/service worker e recarrega da rede.
update_fn=r'''async function updateSystemNow(){const btn=document.querySelector('[data-system-update]');if(btn){btn.disabled=true;btn.classList.add('updating')}toast('Atualizando Ritmo...');try{if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.toLowerCase().includes('ritmo')).map(k=>caches.delete(k)))}if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();for(const reg of regs){try{await reg.update();if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'})}catch{}}for(const reg of regs){try{await reg.unregister()}catch{}}}try{await fetch('/sw.js?refresh='+Date.now(),{cache:'no-store'})}catch{}const u=new URL(location.href);u.searchParams.set('_ritmo_refresh',Date.now().toString());location.replace(u.toString())}catch(e){if(btn){btn.disabled=false;btn.classList.remove('updating')}toast('Não foi possível atualizar agora.')}}
'''
rep("function morePage(){",update_fn+"function morePage(){",'função morePage')

# Ícone discreto no cabeçalho da seção Aplicativo do menu Mais.
icon='''<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.4 9A7 7 0 0 0 6.2 6.2L4 8"/><path d="M5.6 15A7 7 0 0 0 17.8 17.8L20 16"/></svg>'''
old='<section class="more-section"><h3>Aplicativo</h3><div class="more-grid">'
new=f'<section class="more-section"><div class="more-section-title"><h3>Aplicativo</h3><button type="button" class="system-update-btn" data-system-update aria-label="Atualizar Sistema" title="Atualizar Sistema">{icon}</button></div><div class="more-grid">'
rep(old,new,'botão Atualizar Sistema')

# Liga o botão e pede checagem do SW ao abrir uma sessão do app.
anchor="$$('[data-page]').forEach(b=>b.onclick=()=>{const next=b.dataset.page;"
if anchor not in s:
    raise SystemExit('Trecho não encontrado: bind navegação')
bind="document.querySelector('[data-system-update]')?.addEventListener('click',updateSystemNow);"
insert_point="  $$('[data-new]').forEach(b=>b.onclick=()=>{state.modal={type:b.dataset.new};renderApp(false)});"
if insert_point not in s:
    raise SystemExit('Trecho não encontrado: bind data-new')
s=s.replace(insert_point,"  "+bind+"\n"+insert_point,1)

# Atualização silenciosa do registration, sem usar HTTP cache para sw.js.
startup="""
if('serviceWorker'in navigator){window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update()}catch{}})}
"""
if startup.strip() not in s:
    s += startup

app.write_text(s)

# Service worker substituído por uma estratégia network-first simples e previsível.
sw=r'''const CACHE='ritmo-shell-v1-current';
const CORE=['/','/index.html','/styles.css','/app.js','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const c=await caches.open(CACHE);for(const url of CORE){try{const r=await fetch(new Request(url,{cache:'reload'}));if(r.ok)await c.put(url,r.clone())}catch{}}await self.skipWaiting()})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE&&k.toLowerCase().includes('ritmo')).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='CLEAR_RITMO_CACHE')event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.toLowerCase().includes('ritmo')).map(k=>caches.delete(k)))})())});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const u=new URL(req.url);if(u.origin!==location.origin)return;if(u.pathname.startsWith('/api/'))return;event.respondWith((async()=>{const c=await caches.open(CACHE);try{const fresh=await fetch(new Request(req,{cache:'no-store'}));if(fresh&&fresh.ok)await c.put(req,fresh.clone());return fresh}catch{const cached=await c.match(req)||await c.match(u.pathname);if(cached)return cached;if(req.mode==='navigate')return await c.match('/index.html')||await c.match('/');throw new Error('offline')}})())});
'''
swp.write_text(sw)

# Evita que Cloudflare/browser mantenham shell crítico antigo entre deploys.
headersp.write_text('''/\n  Cache-Control: no-cache, no-store, must-revalidate\n/index.html\n  Cache-Control: no-cache, no-store, must-revalidate\n/app.js\n  Cache-Control: no-cache, no-store, must-revalidate\n/styles.css\n  Cache-Control: no-cache, no-store, must-revalidate\n/sw.js\n  Cache-Control: no-cache, no-store, must-revalidate\n/manifest.webmanifest\n  Cache-Control: no-cache, must-revalidate\n''')

css=cssp.read_text()
css += r'''

/* Atualização do sistema - discreta e segura */
.more-section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 2px 9px}.more-section-title h3{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:0}.system-update-btn{width:34px;height:34px;border:1px solid var(--line);border-radius:11px;background:var(--surface2);color:var(--muted);display:grid;place-items:center;cursor:pointer;transition:transform .18s ease,background .18s ease,color .18s ease}.system-update-btn:active{transform:scale(.94)}.system-update-btn:hover{color:var(--primary);background:var(--surface-solid)}.system-update-btn.updating svg{animation:ritmo-spin .8s linear infinite}.system-update-btn:disabled{opacity:.65;cursor:wait}@keyframes ritmo-spin{to{transform:rotate(360deg)}}
'''
cssp.write_text(css)
print('Atualização do sistema adicionada: limpa cache, renova service worker e força shell mais recente.')
