from pathlib import Path
import sys, re, json

root=Path(sys.argv[1])
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'
indexp=root/'public'/'index.html'
manifestp=root/'public'/'manifest.webmanifest'

a=app.read_text()

# -----------------------------------------------------------------------------
# Atalhos: remove controles por setas e usa arrastar/soltar de verdade.
# A ordem continua sendo apenas draft durante a edição e é persistida pelo
# fluxo existente de saveSettings (D1/cloud) ao tocar em Salvar atalhos.
# -----------------------------------------------------------------------------
p=a.find('function shortcutsPage(){')
q=a.find('\nfunction calendarPage(){',p)
if p<0 or q<0:
    raise SystemExit('shortcutsPage não encontrada')
shortcuts=r'''function shortcutsPage(){const selected=shortcutDraftKeys();return `${head('Personalização de atalhos','Escolha três atalhos e arraste para organizar a ordem.')}<div class="panel shortcuts-panel"><div class="shortcut-edit-head"><div><strong>Seus atalhos</strong><small>${selected.length}/3 selecionados • segure e arraste para mover</small></div><span class="shortcut-counter ${selected.length===3?'ready':''}">${selected.length}/3</span></div><div class="shortcut-order" id="shortcutOrder">${selected.length?selected.map((k,i)=>{const n=shortcutCatalog[k];return `<div class="shortcut-order-item" draggable="true" data-shortcut-drag="${k}"><button type="button" class="drag-handle" data-shortcut-drag-handle="${k}" aria-label="Arrastar ${n[1]}" title="Segure e arraste"><span></span><span></span><span></span><span></span><span></span><span></span></button><span class="setting-icon tone-${n[0]}">${ic(n[2],18)}</span><div><strong>${n[1]}</strong><small class="shortcut-position">Posição ${i+1}</small></div></div>`}).join(''):'<div class="shortcut-empty">Nenhum atalho selecionado. Marque três opções abaixo.</div>'}</div><div class="shortcut-divider"></div><div class="shortcut-options-title"><strong>Escolher atalhos</strong><small>Toque para marcar ou desmarcar.</small></div><div class="shortcut-options">${Object.values(shortcutCatalog).map(n=>{const checked=selected.includes(n[0]);return `<button type="button" class="shortcut-option ${checked?'selected':''}" data-shortcut-option="${n[0]}" aria-pressed="${checked}"><span class="shortcut-checkbox">${checked?ic('check',16):''}</span><span class="setting-icon tone-${n[0]}">${ic(n[2],18)}</span><div><strong>${n[1]}</strong><small>${checked?'Selecionado':'Disponível'}</small></div></button>`}).join('')}</div><p class="shortcut-help">Início e Menu ficam fixos. A ordem que você montar aqui é salva na sua conta e acompanha você nos outros aparelhos.</p><button class="btn btn-primary shortcut-save" id="saveShortcuts" type="button" ${selected.length!==3?'disabled':''}>Salvar atalhos</button></div>`}'''
a=a[:p]+shortcuts+a[q:]

helpers=r'''
function ritmoShortcutOrderFromDom(){return [...document.querySelectorAll('#shortcutOrder [data-shortcut-drag]')].map(x=>x.dataset.shortcutDrag).filter(Boolean)}
function ritmoRefreshShortcutPositions(){document.querySelectorAll('#shortcutOrder [data-shortcut-drag]').forEach((x,i)=>{const p=x.querySelector('.shortcut-position');if(p)p.textContent=`Posição ${i+1}`})}
function bindShortcutDrag(){
  const order=document.getElementById('shortcutOrder');if(!order)return;
  let active=null,pointerId=null;
  const commit=()=>{const keys=ritmoShortcutOrderFromDom();if(keys.length)state.shortcutDraft=keys;ritmoRefreshShortcutPositions()};
  const place=y=>{if(!active)return;const items=[...order.querySelectorAll('[data-shortcut-drag]')].filter(x=>x!==active);let before=null;for(const item of items){const r=item.getBoundingClientRect();if(y<r.top+r.height/2){before=item;break}}if(before)order.insertBefore(active,before);else order.appendChild(active);ritmoRefreshShortcutPositions()};
  const finishPointer=e=>{if(!active||pointerId!==e.pointerId)return;active.classList.remove('dragging');document.body.classList.remove('shortcut-dragging');try{e.currentTarget.releasePointerCapture(pointerId)}catch{}pointerId=null;commit();active=null};
  order.querySelectorAll('[data-shortcut-drag]').forEach(item=>{
    item.addEventListener('dragstart',e=>{active=item;item.classList.add('dragging');document.body.classList.add('shortcut-dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.dataset.shortcutDrag||'')}});
    item.addEventListener('dragend',()=>{item.classList.remove('dragging');document.body.classList.remove('shortcut-dragging');commit();active=null});
  });
  order.addEventListener('dragover',e=>{if(!active)return;e.preventDefault();place(e.clientY)});
  order.querySelectorAll('[data-shortcut-drag-handle]').forEach(handle=>{
    handle.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;const item=handle.closest('[data-shortcut-drag]');if(!item)return;active=item;pointerId=e.pointerId;item.classList.add('dragging');document.body.classList.add('shortcut-dragging');try{handle.setPointerCapture(pointerId)}catch{}e.preventDefault()});
    handle.addEventListener('pointermove',e=>{if(!active||pointerId!==e.pointerId)return;e.preventDefault();place(e.clientY)});
    handle.addEventListener('pointerup',finishPointer);handle.addEventListener('pointercancel',finishPointer);
    handle.addEventListener('keydown',e=>{if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;const item=handle.closest('[data-shortcut-drag]');if(!item)return;e.preventDefault();const sibling=e.key==='ArrowUp'?item.previousElementSibling:item.nextElementSibling;if(!sibling||!sibling.matches('[data-shortcut-drag]'))return;if(e.key==='ArrowUp')order.insertBefore(item,sibling);else order.insertBefore(sibling,item);commit();handle.focus()});
  });
}
function ritmoDecorateSemanticIcons(){
  const cards=[...document.querySelectorAll('.stats .stat')];
  const rules=[['entrada','semantic-income'],['saída','semantic-expense'],['saida','semantic-expense'],['pendente','semantic-pending'],['dívida','semantic-debt'],['divida','semantic-debt']];
  cards.forEach(card=>{card.classList.remove('semantic-income','semantic-expense','semantic-pending','semantic-debt');const text=(card.textContent||'').toLowerCase();const hit=rules.find(([word])=>text.includes(word));if(hit)card.classList.add(hit[1])});
}
function ritmoStatusBarSync(){
  const root=document.documentElement;
  const dark=root.classList.contains('dark');
  const color=dark?'#111315':'#F7F5EF';
  let meta=document.querySelector('meta[name="theme-color"]');if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}meta.content=color;
  let apple=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');if(!apple){apple=document.createElement('meta');apple.name='apple-mobile-web-app-status-bar-style';document.head.appendChild(apple)}apple.content=dark?'black':'default';
  root.style.setProperty('--ritmo-statusbar-color',color);
}
'''
marker='function bindApp(){'
if marker not in a:
    raise SystemExit('bindApp não encontrada')
a=a.replace(marker,helpers+'\n'+marker,1)

# Remove os eventos antigos das setas e liga o arraste real.
pattern=r"\$\$\('\[data-shortcut-move\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{moveShortcutDraft\(b\.dataset\.shortcutMove,Number\(b\.dataset\.dir\)\);renderApp\(false\)\}\);"
a,n=re.subn(pattern,'bindShortcutDrag();',a,count=1)
if n!=1:
    raise SystemExit('binding antigo de setas não encontrado')

# Decora os cards e sincroniza a barra de status a cada render/bind.
needle="document.querySelector('[data-system-update]')?.addEventListener('click',updateSystemNow);"
if needle not in a:
    raise SystemExit('marcador de bind global não encontrado')
a=a.replace(needle,"ritmoDecorateSemanticIcons();ritmoStatusBarSync();"+needle,1)

# Observa mudança do tema e mudança do tema do sistema no modo automático.
a += r'''

// Ritmo V1 — status bar acompanha o tema realmente aplicado.
(()=>{const sync=()=>setTimeout(ritmoStatusBarSync,0);new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme']});const mq=window.matchMedia?.('(prefers-color-scheme: dark)');try{mq?.addEventListener('change',sync)}catch{try{mq?.addListener(sync)}catch{}}sync()})();
'''
app.write_text(a)

# -----------------------------------------------------------------------------
# Status bar inicial: clara por padrão; JavaScript acompanha tema escuro depois.
# -----------------------------------------------------------------------------
idx=indexp.read_text()
if re.search(r'<meta[^>]+name=["\']theme-color["\'][^>]*>',idx,re.I):
    idx=re.sub(r'<meta[^>]+name=["\']theme-color["\'][^>]*>','<meta name="theme-color" content="#F7F5EF">',idx,count=1,flags=re.I)
else:
    idx=idx.replace('</head>','  <meta name="theme-color" content="#F7F5EF">\n</head>',1)
if 'apple-mobile-web-app-status-bar-style' not in idx:
    idx=idx.replace('</head>','  <meta name="apple-mobile-web-app-status-bar-style" content="default">\n</head>',1)
indexp.write_text(idx)

try:
    man=json.loads(manifestp.read_text())
except Exception:
    man={}
man['theme_color']='#F7F5EF';man['background_color']='#F7F5EF'
manifestp.write_text(json.dumps(man,ensure_ascii=False,indent=2)+'\n')

css=cssp.read_text()
css += r'''

/* Ritmo V1 — tema, ícones e atalhos arrastáveis */
:root{
  --icon-income:#679E72;
  --icon-expense:#D8786C;
  --icon-pending:#C89455;
  --icon-debt:#B6774F;
  --icon-goal:#6F9E7A;
  --icon-calendar:#2F7282;
  --icon-insight:#8871BD;
  --icon-sharing:#74A481;
  --icon-settings:#777D82;
  --icon-info:#C79051;
  --icon-support:#39A96B;
  --icon-security:#397A89;
}
html.dark{
  --icon-income:#86BC90;
  --icon-expense:#EA9388;
  --icon-pending:#DDB074;
  --icon-debt:#D39169;
  --icon-goal:#8DBA96;
  --icon-calendar:#73ABBA;
  --icon-insight:#A995DA;
  --icon-sharing:#91BB9A;
  --icon-settings:#A5AAAE;
  --icon-info:#D9AA72;
  --icon-support:#61C488;
  --icon-security:#75ADBB;
}
/* Resumo da tela inicial */
.stats .stat.semantic-income svg{color:var(--icon-income)!important}.stats .stat.semantic-expense svg{color:var(--icon-expense)!important}.stats .stat.semantic-pending svg{color:var(--icon-pending)!important}.stats .stat.semantic-debt svg{color:var(--icon-debt)!important}
.stats .stat.semantic-income [class*="icon"]{background:color-mix(in srgb,var(--icon-income) 11%,var(--ios-surface-2))!important}.stats .stat.semantic-expense [class*="icon"]{background:color-mix(in srgb,var(--icon-expense) 11%,var(--ios-surface-2))!important}.stats .stat.semantic-pending [class*="icon"]{background:color-mix(in srgb,var(--icon-pending) 12%,var(--ios-surface-2))!important}.stats .stat.semantic-debt [class*="icon"]{background:color-mix(in srgb,var(--icon-debt) 11%,var(--ios-surface-2))!important}
/* Paleta semântica global */
.income-tone,.tone-income,.tone-income svg{color:var(--icon-income)!important}.expense-tone,.tone-expenses,.tone-expenses svg{color:var(--icon-expense)!important}.tone-debts,.tone-debts svg{color:var(--icon-debt)!important}.tone-goals,.tone-goals svg{color:var(--icon-goal)!important}.calendar-tone,.tone-calendar,.tone-calendar svg{color:var(--icon-calendar)!important}.insight-tone,.tone-insights,.tone-insights svg{color:var(--icon-insight)!important}.sharing-tone,.tone-sharing,.tone-sharing svg{color:var(--icon-sharing)!important}.settings-tone,.tone-settings,.tone-settings svg{color:var(--icon-settings)!important}.info-tone{color:var(--icon-info)!important}.support-tone{color:var(--icon-support)!important}.security-tone{color:var(--icon-security)!important}.shortcut-tone{color:var(--icon-calendar)!important}
.more-icon.calendar-tone,.setting-icon.tone-calendar{background:color-mix(in srgb,var(--icon-calendar) 11%,var(--ios-surface-2))!important}.more-icon.insight-tone,.setting-icon.tone-insights{background:color-mix(in srgb,var(--icon-insight) 11%,var(--ios-surface-2))!important}.more-icon.sharing-tone,.setting-icon.tone-sharing{background:color-mix(in srgb,var(--icon-sharing) 12%,var(--ios-surface-2))!important}.more-icon.settings-tone,.setting-icon.tone-settings{background:color-mix(in srgb,var(--icon-settings) 9%,var(--ios-surface-2))!important}.more-icon.info-tone{background:color-mix(in srgb,var(--icon-info) 12%,var(--ios-surface-2))!important}.more-icon.support-tone{background:color-mix(in srgb,var(--icon-support) 10%,var(--ios-surface-2))!important}.more-icon.security-tone{background:color-mix(in srgb,var(--icon-security) 10%,var(--ios-surface-2))!important}
/* Barra inferior: cores sutis e consistentes */
.bottom .tone-home svg{color:var(--icon-calendar)!important}.bottom .tone-expenses svg{color:var(--icon-expense)!important}.bottom .tone-debts svg{color:var(--icon-debt)!important}.bottom .tone-goals svg{color:var(--icon-goal)!important}.bottom .tone-sharing svg{color:var(--icon-sharing)!important}.bottom .tone-calendar svg{color:var(--icon-calendar)!important}.bottom .tone-insights svg{color:var(--icon-insight)!important}.bottom .tone-settings svg{color:var(--icon-settings)!important}.bottom .tone-more svg{color:var(--primary)!important}
/* Arrastar atalhos */
.shortcut-order-item{grid-template-columns:30px 38px 1fr!important;position:relative;transition:transform .16s ease,opacity .16s ease,box-shadow .16s ease}.shortcut-order-item.dragging{opacity:.72;transform:scale(.985);box-shadow:0 12px 30px rgba(15,76,92,.15);z-index:3}.shortcut-move{display:none!important}.drag-handle{width:30px;height:38px;padding:0;border:0;background:transparent;display:grid!important;grid-template-columns:repeat(2,4px);grid-template-rows:repeat(3,4px);gap:3px;align-content:center;justify-content:center;border-radius:9px;color:var(--muted);cursor:grab;touch-action:none}.drag-handle:active{cursor:grabbing}.drag-handle span{width:4px;height:4px;border-radius:50%;background:currentColor;display:block}.shortcut-dragging{user-select:none;-webkit-user-select:none;overscroll-behavior:none}.shortcut-dragging .shortcut-order{touch-action:none}
@media(max-width:760px){.drag-handle{width:32px;height:42px}.shortcut-order-item{min-height:62px}}
'''
cssp.write_text(css)
print('Ritmo V1: status bar adaptativa, paleta harmônica de ícones e atalhos por arrastar/soltar aplicados.')
