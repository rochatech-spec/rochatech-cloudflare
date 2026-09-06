from pathlib import Path
import sys, json

root=Path(sys.argv[1])
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'
manifestp=root/'public'/'manifest.webmanifest'

a=app.read_text()

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
app.write_text(a)

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
'''
cssp.write_text(css)
print('Ritmo V1: instalação concluída direciona o uso para o PWA instalado, sem entrar no Menu pelo navegador.')
