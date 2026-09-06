from pathlib import Path
import sys, re

root=Path(sys.argv[1])
app=root/'public'/'app.js'
indexp=root/'public'/'index.html'
cssp=root/'public'/'styles.css'

a=app.read_text()
idx=indexp.read_text()
css=cssp.read_text()

# A primeira tela precisa ser imediata. O bootstrap principal é assíncrono; por
# isso renderizamos o login ao fim da avaliação do JS, ainda no mesmo turno, antes
# que qualquer resposta de rede consiga concluir. Se existir sessão válida, o
# bootstrap troca naturalmente para lock/app em seguida.
if 'ritmo-instant-login-boot' not in a:
    a += "\n/* ritmo-instant-login-boot */\ntry{renderAuth()}catch{}\n"

# Remove completamente o splash visual criado pela camada anterior. Mantemos
# apenas um watchdog invisível: ele não interfere na UI; só recupera cache/SW se
# absolutamente nenhuma interface tiver sido renderizada após uma falha real.
guard_pattern=re.compile(r'<script id="ritmo-boot-guard">.*?</script>',re.S)
if not guard_pattern.search(idx):
    raise SystemExit('Boot guard anterior não encontrado')
quiet_guard=r'''<script id="ritmo-boot-guard">
(function(){
  'use strict';
  const RECOVERY='ritmo:boot-recovery-v3';
  let recovering=false;
  function hasUI(){const r=document.getElementById('root');return !!(document.getElementById('ritmoWelcome')||document.getElementById('secureLock')||document.querySelector('.auth,.app-shell,.shell,.layout')||(r&&r.children.length>0))}
  async function clearShell(){
    try{if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister().catch(()=>false)))}}catch{}
    try{if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.toLowerCase().includes('ritmo')).map(k=>caches.delete(k)))}}catch{}
  }
  async function recover(){
    if(recovering||hasUI())return;recovering=true;
    let used=false;try{used=sessionStorage.getItem(RECOVERY)==='1'}catch{}
    if(used)return;
    try{sessionStorage.setItem(RECOVERY,'1')}catch{}
    await clearShell();
    const u=new URL(location.href);u.searchParams.set('_ritmo_recover',Date.now().toString());location.replace(u.toString());
  }
  function healthy(){if(!hasUI())return false;try{sessionStorage.removeItem(RECOVERY)}catch{}return true}
  window.addEventListener('error',()=>setTimeout(()=>{if(!healthy())recover()},250));
  window.addEventListener('unhandledrejection',()=>setTimeout(()=>{if(!healthy())recover()},250));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{if(!healthy())recover()},3500),{once:true});
  else setTimeout(()=>{if(!healthy())recover()},3500);
})();
</script>'''
idx=guard_pattern.sub(quiet_guard,idx,count=1)

# Remove o CSS do splash antigo. Não pode existir qualquer tela intermediária de
# abertura entre o toque no ícone e o login.
css=re.sub(r'\n/\* Ritmo V1 — boot resiliente sem tela branca \*/.*?@media\(prefers-reduced-motion:reduce\)\{\.ritmo-boot-splash i:after\{animation:none;width:100%\}\}\n?', '\n', css, count=1, flags=re.S)

app.write_text(a)
indexp.write_text(idx)
cssp.write_text(css)

# O smoke de Chrome exige renderização rápida do login e rejeita qualquer splash
# ou recovery no primeiro quadro útil.
smoke=root/'ci-browser-smoke.mjs'
if smoke.exists():
    s=smoke.read_text()
    s=s.replace("'--virtual-time-budget=5000'","'--virtual-time-budget=1200'")
    s=s.replace("if(/<div class=\"ritmo-boot-recovery\"/.test(body))throw new Error('Boot caiu na recuperação durante smoke test');","if(/ritmo-boot-(?:splash|recovery)/.test(body))throw new Error('Boot exibiu tela intermediária durante smoke test');")
    smoke.write_text(s)

# Sanidade: a release deve ter boot direto e não conter mais o splash antigo.
final_app=app.read_text();final_idx=indexp.read_text();final_css=cssp.read_text()
if 'ritmo-instant-login-boot' not in final_app: raise SystemExit('Login imediato não aplicado')
if 'Abrindo com segurança' in final_idx or 'ritmo-boot-splash' in final_idx: raise SystemExit('Splash antigo ainda presente no HTML')
if '.ritmo-boot-splash' in final_css: raise SystemExit('CSS do splash antigo ainda presente')
print('Ritmo V1: abertura imediata no login aplicada; splash de carregamento removido.')
