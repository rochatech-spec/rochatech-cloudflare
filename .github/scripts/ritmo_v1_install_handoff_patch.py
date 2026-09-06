from pathlib import Path
import sys, json

root=Path(sys.argv[1])
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'
manifestp=root/'public'/'manifest.webmanifest'
indexp=root/'public'/'index.html'

a=app.read_text()
html=indexp.read_text()

# Deixa explícito que usar no navegador é apenas fallback.
a=a.replace('id="ritmoWelcomeContinue">Continuar para o Ritmo</button>','id="ritmoWelcomeContinue">Continuar no navegador</button>',1)

# iOS: a conclusão correta é abrir o ícone da tela inicial, pois Safari não pode lançar o PWA programaticamente.
a=a.replace('<div><b>4</b><span>Confirme em <strong>Adicionar</strong>.</span></div></div></div>`;',
'''<div><b>4</b><span>Confirme em <strong>Adicionar</strong>.</span></div><div><b>5</b><span>Depois, <strong>feche o Safari</strong> e abra o ícone do <strong>Ritmo</strong> na Tela de Início.</span></div></div></div>`;''',1)

# Não fecha a tela de boas-vindas após o usuário aceitar a instalação.
old="if(choice?.outcome==='accepted'){if(hint){hint.hidden=false;hint.textContent='Instalação iniciada. O Ritmo ficará disponível como aplicativo.'}setTimeout(ritmoWelcomeClose,700)}else if(hint){hint.hidden=false;hint.textContent='Tudo bem. Você pode instalar quando quiser.'}"
new="if(choice?.outcome==='accepted'){if(hint){hint.hidden=false;hint.textContent='Finalizando a instalação… assim que concluir, abra o Ritmo pelo ícone do aplicativo.'}}else if(hint){hint.hidden=false;hint.textContent='Tudo bem. Você pode instalar quando quiser.'}"
if old not in a:
    raise SystemExit('Fluxo de aceite de instalação não encontrado')
a=a.replace(old,new,1)

marker="window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();ritmoDeferredInstallPrompt=e;ritmoWelcomeSetInstallReady()});"
if marker not in a:
    raise SystemExit('Marcador beforeinstallprompt não encontrado')
helper=r'''
function ritmoWelcomeInstalledState(){
  const root=document.getElementById('ritmoWelcome');if(!root)return;
  const p=ritmoWelcomePlatform();root.classList.add('welcome-installed-state');
  const hero=root.querySelector('.welcome-hero');
  if(hero)hero.innerHTML=`<div class="welcome-installed-icon">${ritmoWelcomeIcon('check')}</div><span class="welcome-eyebrow">INSTALAÇÃO CONCLUÍDA</span><h1>Ritmo instalado.</h1><p>${p==='android'?'Abra o Ritmo pelo ícone criado na sua tela inicial ou na lista de aplicativos.':p==='desktop'?'Abra o Ritmo pelo ícone do aplicativo, pelo Menu Iniciar ou pela área de aplicativos do sistema.':'Abra o Ritmo pelo ícone da Tela de Início.'}</p>`;
  const card=root.querySelector('.welcome-install-card');if(card)card.remove();
  const actions=root.querySelector('.welcome-actions');
  if(actions)actions.innerHTML=`<div class="welcome-installed-cta"><strong>Agora use o aplicativo instalado</strong><span>Esta página do navegador pode ser fechada com segurança.</span></div>`;
  const hint=document.getElementById('ritmoWelcomeHint');if(hint)hint.hidden=true;
  try{localStorage.setItem('ritmo:installed-hint','1')}catch{}
}
'''
a=a.replace(marker,helper+'\n'+marker,1)

old_event="window.addEventListener('appinstalled',()=>{ritmoDeferredInstallPrompt=null;const h=document.getElementById('ritmoWelcomeHint');if(h){h.hidden=false;h.textContent='Ritmo instalado com sucesso.'}setTimeout(ritmoWelcomeClose,650)});"
new_event="window.addEventListener('appinstalled',()=>{ritmoDeferredInstallPrompt=null;ritmoWelcomeInstalledState()});"
if old_event not in a:
    raise SystemExit('Evento appinstalled antigo não encontrado')
a=a.replace(old_event,new_event,1)

# -----------------------------------------------------------------------------
# Correção robusta do botão Instalar.
# O beforeinstallprompt pode surgir cedo; por isso o capturamos já no <head>.
# -----------------------------------------------------------------------------
early=r'''<script id="ritmo-install-capture">
(function(){
  window.__ritmoInstallPrompt=window.__ritmoInstallPrompt||null;
  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    window.__ritmoInstallPrompt=e;
    window.dispatchEvent(new CustomEvent('ritmo-install-ready'));
  });
  window.addEventListener('appinstalled',function(){
    window.__ritmoInstallPrompt=null;
    window.dispatchEvent(new CustomEvent('ritmo-install-complete'));
  });
})();
</script>'''
if 'id="ritmo-install-capture"' not in html:
    if '</head>' not in html:
        raise SystemExit('index sem </head>')
    html=html.replace('</head>',early+'\n</head>',1)

old='let ritmoDeferredInstallPrompt=null;'
new='let ritmoDeferredInstallPrompt=window.__ritmoInstallPrompt||null;'
if old not in a:
    raise SystemExit('estado de instalação não encontrado')
a=a.replace(old,new,1)

old="function ritmoWelcomeSetInstallReady(){const btn=document.getElementById('ritmoWelcomeInstall');if(!btn)return;const p=ritmoWelcomePlatform();if(ritmoDeferredInstallPrompt&&p!=='ios'){btn.classList.add('ready');btn.innerHTML=`${ritmoWelcomeIcon(p==='desktop'?'desktop':'phone')} Instalar Ritmo`}}"
new=r'''function ritmoWelcomeSetInstallReady(){const btn=document.getElementById('ritmoWelcomeInstall');if(!btn)return;const p=ritmoWelcomePlatform(),prompt=window.__ritmoInstallPrompt||ritmoDeferredInstallPrompt;if(prompt)ritmoDeferredInstallPrompt=prompt;if(ritmoIsStandalone()){btn.classList.add('ready');btn.disabled=true;btn.innerHTML=`${ritmoWelcomeIcon('check')} Ritmo já instalado`;return}if(prompt&&p!=='ios'){btn.classList.add('ready');btn.disabled=false;btn.innerHTML=`${ritmoWelcomeIcon(p==='desktop'?'desktop':'phone')} Instalar Ritmo`;return}btn.classList.remove('ready');btn.disabled=false;btn.innerHTML=`${ritmoWelcomeIcon(p==='desktop'?'desktop':'phone')} ${p==='ios'?'Ver como instalar':'Instalar Ritmo'}`}'''
if old not in a:
    raise SystemExit('ritmoWelcomeSetInstallReady não encontrado')
a=a.replace(old,new,1)

start=a.find('async function ritmoWelcomeInstall(){')
end=a.find('\nfunction ritmoWelcomeMount(){',start)
if start<0 or end<0:
    raise SystemExit('ritmoWelcomeInstall não encontrado')
install=r'''async function ritmoWelcomeInstall(){
  const p=ritmoWelcomePlatform(),hint=document.getElementById('ritmoWelcomeHint'),btn=document.getElementById('ritmoWelcomeInstall');
  if(ritmoIsStandalone()){ritmoWelcomeInstalledState();return}
  const show=t=>{if(hint){hint.hidden=false;hint.innerHTML=t}};
  if(p==='ios'){
    show('No iPhone/iPad: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.');
    document.querySelector('.welcome-install-card')?.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  let prompt=window.__ritmoInstallPrompt||ritmoDeferredInstallPrompt;
  if(prompt){
    try{
      if(btn){btn.disabled=true;btn.classList.add('installing')}
      const choice=await prompt.prompt();
      window.__ritmoInstallPrompt=null;ritmoDeferredInstallPrompt=null;
      if(choice?.outcome==='accepted')show('<strong>Instalação iniciada.</strong> Confirme no navegador e depois abra o Ritmo pelo ícone do aplicativo.');
      else show('A instalação foi cancelada. Toque em <strong>Instalar Ritmo</strong> novamente quando o navegador liberar um novo convite.');
    }catch(err){
      window.__ritmoInstallPrompt=null;ritmoDeferredInstallPrompt=null;
      show('O navegador não conseguiu abrir a instalação agora. Use o menu <strong>⋮</strong> e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.');
    }finally{
      if(btn){btn.disabled=false;btn.classList.remove('installing')}
      ritmoWelcomeSetInstallReady();
    }
    return;
  }

  show('<strong>Preparando a instalação…</strong>');
  if(btn){btn.disabled=true;btn.classList.add('installing')}
  try{
    if('serviceWorker' in navigator){
      let reg=await navigator.serviceWorker.getRegistration('/');
      if(!reg)reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      try{await reg.update()}catch{}
      try{await navigator.serviceWorker.ready}catch{}
    }
    await new Promise(resolve=>{
      if(window.__ritmoInstallPrompt)return resolve();
      let done=false;
      const finish=()=>{if(done)return;done=true;window.removeEventListener('ritmo-install-ready',finish);resolve()};
      window.addEventListener('ritmo-install-ready',finish,{once:true});
      setTimeout(finish,1200);
    });
  }catch{}
  if(btn){btn.disabled=false;btn.classList.remove('installing')}
  prompt=window.__ritmoInstallPrompt||ritmoDeferredInstallPrompt;
  if(prompt){
    ritmoDeferredInstallPrompt=prompt;
    ritmoWelcomeSetInstallReady();
    show('<strong>Pronto.</strong> Toque novamente em <strong>Instalar Ritmo</strong> para abrir a confirmação do navegador.');
    return;
  }

  const ua=navigator.userAgent||'';
  if(/SamsungBrowser/i.test(ua))show('No Samsung Internet, toque no menu <strong>☰</strong> e escolha <strong>Adicionar página a → Tela inicial</strong>.');
  else if(/EdgA|EdgiOS|Edg\//i.test(ua))show('No Edge, abra o menu <strong>⋯</strong> e escolha <strong>Adicionar ao telefone / Instalar aplicativo</strong>.');
  else if(/Android/i.test(ua))show('O navegador ainda não liberou o convite automático. Abra o menu <strong>⋮</strong> e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.');
  else show('O navegador ainda não liberou o convite automático. Use o ícone de instalação na barra de endereço ou o menu do navegador para <strong>Instalar o Ritmo</strong>.');
}
'''
a=a[:start]+install+a[end:]

old_listener="window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();ritmoDeferredInstallPrompt=e;ritmoWelcomeSetInstallReady()});"
new_listener="window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__ritmoInstallPrompt=e;ritmoDeferredInstallPrompt=e;ritmoWelcomeSetInstallReady()});window.addEventListener('ritmo-install-ready',()=>{ritmoDeferredInstallPrompt=window.__ritmoInstallPrompt||ritmoDeferredInstallPrompt;ritmoWelcomeSetInstallReady()});"
if old_listener not in a:
    raise SystemExit('listener de instalação não encontrado')
a=a.replace(old_listener,new_listener,1)

old_event2="window.addEventListener('appinstalled',()=>{ritmoDeferredInstallPrompt=null;ritmoWelcomeInstalledState()});"
new_event2="window.addEventListener('appinstalled',()=>{window.__ritmoInstallPrompt=null;ritmoDeferredInstallPrompt=null;ritmoWelcomeInstalledState()});window.addEventListener('ritmo-install-complete',()=>{window.__ritmoInstallPrompt=null;ritmoDeferredInstallPrompt=null;ritmoWelcomeInstalledState()});"
if old_event2 not in a:
    raise SystemExit('appinstalled consolidado não encontrado')
a=a.replace(old_event2,new_event2,1)

app.write_text(a)
indexp.write_text(html)

# Manifest com identidade estável e comportamento de lançamento preferencial em uma janela existente.
try:
    manifest=json.loads(manifestp.read_text())
except Exception:
    manifest={}
manifest['id']='/'
manifest['start_url']='/'
manifest['display']='standalone'
manifest['launch_handler']={'client_mode':'navigate-existing'}
manifestp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

css=cssp.read_text()
css += r'''

/* Ritmo V1 — conclusão de instalação sem cair no app dentro do navegador */
.welcome-installed-state .welcome-hero{padding-top:36px!important;padding-bottom:34px!important}
.welcome-installed-icon{width:74px;height:74px;margin:0 auto 16px;border-radius:24px;display:grid;place-items:center;background:rgba(124,169,130,.16);color:#527e5a;border:1px solid rgba(124,169,130,.26)}
.welcome-installed-icon svg{width:34px;height:34px;stroke-width:2.2}
.welcome-installed-cta{grid-column:1/-1;min-height:82px;border-radius:18px;background:rgba(255,255,255,.88);border:1px solid rgba(15,76,92,.10);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:14px 18px;color:#0F4C5C}
.welcome-installed-cta strong{font-size:13px}.welcome-installed-cta span{margin-top:5px;font-size:10px;line-height:1.4;color:#6d7673}.welcome-installed-state .welcome-continue{display:none!important}

/* Ritmo V1 — botão de instalação responsivo e sem clique morto */
.welcome-install-primary.installing{opacity:.72;cursor:progress;transform:none!important}
.welcome-install-primary:disabled{cursor:default}
.welcome-install-hint strong{font-weight:850}
'''
cssp.write_text(css)
print('Ritmo V1: instalação PWA corrigida com captura antecipada, prompt real e fallback por navegador.')

# Reexecução solicitada para gerar nova autorização Cloudflare.
