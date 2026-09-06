from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
indexp=root/'public'/'index.html'
cssp=root/'public'/'styles.css'

a=app.read_text()
html=indexp.read_text()
css=cssp.read_text()

# Captura o beforeinstallprompt o mais cedo possível, antes do bundle principal.
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

# Estado visual sempre consulta a captura antecipada.
old="function ritmoWelcomeSetInstallReady(){const btn=document.getElementById('ritmoWelcomeInstall');if(!btn)return;const p=ritmoWelcomePlatform();if(ritmoDeferredInstallPrompt&&p!=='ios'){btn.classList.add('ready');btn.innerHTML=`${ritmoWelcomeIcon(p==='desktop'?'desktop':'phone')} Instalar Ritmo`}}"
new=r'''function ritmoWelcomeSetInstallReady(){const btn=document.getElementById('ritmoWelcomeInstall');if(!btn)return;const p=ritmoWelcomePlatform(),prompt=window.__ritmoInstallPrompt||ritmoDeferredInstallPrompt;if(prompt)ritmoDeferredInstallPrompt=prompt;if(ritmoIsStandalone()){btn.classList.add('ready');btn.disabled=true;btn.innerHTML=`${ritmoWelcomeIcon('check')} Ritmo já instalado`;return}if(prompt&&p!=='ios'){btn.classList.add('ready');btn.disabled=false;btn.innerHTML=`${ritmoWelcomeIcon(p==='desktop'?'desktop':'phone')} Instalar Ritmo`;return}btn.classList.remove('ready');btn.disabled=false;btn.innerHTML=`${ritmoWelcomeIcon(p==='desktop'?'desktop':'phone')} ${p==='ios'?'Ver como instalar':'Instalar Ritmo'}`}'''
if old not in a:
    raise SystemExit('ritmoWelcomeSetInstallReady não encontrado')
a=a.replace(old,new,1)

# Substitui a ação de instalação por uma versão resiliente: prompt real quando disponível,
# preparação do service worker quando necessário e fallback claro por navegador.
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
      else show('A instalação foi cancelada. Toque em <strong>Instalar Ritmo</strong> para tentar novamente quando o navegador liberar um novo convite.');
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

# O appinstalled pode ser disparado pelo capturador antecipado ou pelo listener original.
old_event="window.addEventListener('appinstalled',()=>{ritmoDeferredInstallPrompt=null;ritmoWelcomeInstalledState()});"
new_event="window.addEventListener('appinstalled',()=>{window.__ritmoInstallPrompt=null;ritmoDeferredInstallPrompt=null;ritmoWelcomeInstalledState()});window.addEventListener('ritmo-install-complete',()=>{window.__ritmoInstallPrompt=null;ritmoDeferredInstallPrompt=null;ritmoWelcomeInstalledState()});"
if old_event not in a:
    raise SystemExit('appinstalled não encontrado')
a=a.replace(old_event,new_event,1)

app.write_text(a)
indexp.write_text(html)

css += r'''

/* Ritmo V1 — botão de instalação responsivo e sem clique morto */
.welcome-install-primary.installing{opacity:.72;cursor:progress;transform:none!important}
.welcome-install-primary:disabled{cursor:default}
.welcome-install-hint strong{font-weight:850}
'''
cssp.write_text(css)
print('Ritmo V1: botão Instalar corrigido com captura antecipada, prompt real e fallback por navegador.')
