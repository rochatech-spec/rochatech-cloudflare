from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'
a=app.read_text()

marker='Ritmo V1 — orquestração de sheets estilo app nativo'
if marker not in a:
    a += r'''

// Ritmo V1 — orquestração de sheets estilo app nativo.
// A barra inferior deixa de competir com modais/sheets e volta suavemente ao fechar.
let ritmoSheetRaf=0;
function ritmoSheetWrap(){return document.querySelector('.modal-wrap')}
function ritmoSheetIsMobile(){return window.matchMedia?.('(max-width: 760px)').matches!==false}
function ritmoDismissSheet(){
  const wrap=ritmoSheetWrap();
  if(!wrap||wrap.dataset.ritmoClosing==='1')return;
  wrap.dataset.ritmoClosing='1';
  wrap.classList.add('ritmo-sheet-closing');
  setTimeout(()=>{if(typeof state!=='undefined')state.modal=null;if(typeof renderApp==='function')renderApp(false)},180);
}
function ritmoPrepareSheet(){
  cancelAnimationFrame(ritmoSheetRaf);
  ritmoSheetRaf=requestAnimationFrame(()=>{
    const wrap=ritmoSheetWrap(),open=!!wrap&&ritmoSheetIsMobile();
    document.documentElement.classList.toggle('ritmo-sheet-open',open);
    if(!open)return;
    wrap.classList.add('ritmo-native-sheet-wrap');
    const modal=wrap.querySelector('.modal');
    if(!modal)return;
    modal.classList.add('ritmo-native-sheet');
    if(!modal.querySelector('.modal-grabber,.ritmo-sheet-grabber')){
      const g=document.createElement('div');g.className='ritmo-sheet-grabber';g.setAttribute('aria-hidden','true');modal.prepend(g);
    }
  });
}
const ritmoSheetObserver=new MutationObserver(ritmoPrepareSheet);
ritmoSheetObserver.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('resize',ritmoPrepareSheet,{passive:true});
window.addEventListener('orientationchange',ritmoPrepareSheet,{passive:true});

// Fechamento animado pelo X. A captura evita que o render antigo remova a sheet antes da animação.
document.addEventListener('click',e=>{
  if(!ritmoSheetIsMobile())return;
  const close=e.target.closest?.('#modalClose,.close[data-close-modal]');
  if(!close||!close.closest('.modal-wrap'))return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();ritmoDismissSheet();
},true);

// Arrastar a pequena alça para baixo fecha a sheet, como em apps nativos.
let ritmoSheetDrag=null;
document.addEventListener('pointerdown',e=>{
  if(!ritmoSheetIsMobile())return;
  const handle=e.target.closest?.('.modal-grabber,.ritmo-sheet-grabber');
  const modal=handle?.closest('.modal');
  if(!handle||!modal)return;
  ritmoSheetDrag={id:e.pointerId,startY:e.clientY,lastY:e.clientY,modal};
  try{handle.setPointerCapture(e.pointerId)}catch{}
},{passive:true});
document.addEventListener('pointermove',e=>{
  const d=ritmoSheetDrag;if(!d||d.id!==e.pointerId)return;
  d.lastY=e.clientY;const dy=Math.max(0,e.clientY-d.startY);
  d.modal.style.transform=`translate3d(0,${Math.min(dy,180)}px,0)`;
  d.modal.style.transition='none';
},{passive:true});
document.addEventListener('pointerup',e=>{
  const d=ritmoSheetDrag;if(!d||d.id!==e.pointerId)return;
  const dy=Math.max(0,d.lastY-d.startY);ritmoSheetDrag=null;
  if(dy>82){ritmoDismissSheet();return}
  d.modal.style.transition='transform .28s cubic-bezier(.22,1,.36,1)';d.modal.style.transform='translate3d(0,0,0)';
  setTimeout(()=>{d.modal.style.transition='';d.modal.style.transform=''},300);
},{passive:true});
document.addEventListener('pointercancel',()=>{if(ritmoSheetDrag){const d=ritmoSheetDrag;ritmoSheetDrag=null;d.modal.style.transition='';d.modal.style.transform=''}});

ritmoPrepareSheet();
'''

app.write_text(a)

css=cssp.read_text()
css += r'''

/* Ritmo V1 — motion e hierarquia de sheets inspiradas em apps nativos iOS */
@media(max-width:760px){
  .bottom{
    transition:transform .34s cubic-bezier(.22,1,.36,1),opacity .18s ease,filter .24s ease!important;
    transform-origin:center bottom!important;
    will-change:transform,opacity!important;
  }
  .fab{
    transition:transform .28s cubic-bezier(.22,1,.36,1),opacity .16s ease!important;
    will-change:transform,opacity!important;
  }
  html.ritmo-sheet-open .bottom{
    transform:translate3d(0,calc(115% + env(safe-area-inset-bottom)),0) scale(.97)!important;
    opacity:0!important;
    pointer-events:none!important;
    filter:blur(2px)!important;
  }
  html.ritmo-sheet-open .fab{
    transform:translate3d(0,28px,0) scale(.88)!important;
    opacity:0!important;
    pointer-events:none!important;
  }
  html.ritmo-sheet-open,html.ritmo-sheet-open body{overflow:hidden!important;overscroll-behavior:none!important}

  .ritmo-native-sheet-wrap{
    position:fixed!important;
    inset:0!important;
    z-index:5000!important;
    display:flex!important;
    align-items:flex-end!important;
    justify-content:center!important;
    padding:calc(env(safe-area-inset-top) + 18px) 0 0!important;
    overflow:hidden!important;
    background:rgba(24,24,27,.30)!important;
    -webkit-backdrop-filter:blur(6px)!important;
    backdrop-filter:blur(6px)!important;
    animation:ritmoBackdropIn .20s ease-out both!important;
  }
  .ritmo-native-sheet-wrap.ritmo-sheet-closing{
    animation:ritmoBackdropOut .18s ease-in both!important;
    pointer-events:none!important;
  }
  .ritmo-native-sheet{
    position:relative!important;
    z-index:1!important;
    width:100%!important;
    max-width:none!important;
    max-height:calc(100dvh - env(safe-area-inset-top) - 28px)!important;
    margin:0!important;
    border-radius:28px 28px 0 0!important;
    box-sizing:border-box!important;
    transform-origin:center bottom!important;
    animation:ritmoSheetIn .36s cubic-bezier(.22,1,.36,1) both!important;
    box-shadow:0 -12px 42px rgba(0,0,0,.18)!important;
  }
  .ritmo-native-sheet:not(.action-sheet){
    overflow-y:auto!important;
    overflow-x:hidden!important;
    -webkit-overflow-scrolling:touch!important;
    overscroll-behavior:contain!important;
    padding-bottom:calc(18px + env(safe-area-inset-bottom))!important;
  }
  .ritmo-native-sheet-wrap.ritmo-sheet-closing .ritmo-native-sheet{
    animation:ritmoSheetOut .18s cubic-bezier(.4,0,1,1) both!important;
  }
  .ritmo-sheet-grabber,.ritmo-native-sheet>.modal-grabber{
    width:36px!important;height:5px!important;border-radius:999px!important;
    background:rgba(60,60,67,.24)!important;
    margin:8px auto 3px!important;flex:0 0 auto!important;
    touch-action:none!important;cursor:grab!important;
  }
  html.dark .ritmo-sheet-grabber,html.dark .ritmo-native-sheet>.modal-grabber{background:rgba(235,235,245,.28)!important}

  /* O sheet sempre vence a hierarquia de header, tab bar, FAB e popovers. */
  .ritmo-native-sheet-wrap .bottom,.ritmo-native-sheet-wrap .fab{display:none!important}
  .ritmo-native-sheet .modal-head{position:sticky!important;top:0!important;z-index:4!important}
  .ritmo-native-sheet .modal-head+.list,
  .ritmo-native-sheet .modal-head+.money-list{padding-bottom:calc(10px + env(safe-area-inset-bottom))!important}

  @keyframes ritmoBackdropIn{from{opacity:0}to{opacity:1}}
  @keyframes ritmoBackdropOut{from{opacity:1}to{opacity:0}}
  @keyframes ritmoSheetIn{from{transform:translate3d(0,105%,0) scale(.985);opacity:.86}to{transform:translate3d(0,0,0) scale(1);opacity:1}}
  @keyframes ritmoSheetOut{from{transform:translate3d(0,0,0);opacity:1}to{transform:translate3d(0,105%,0);opacity:.88}}
}

@media(max-width:760px) and (prefers-reduced-motion:reduce){
  .bottom,.fab,.ritmo-native-sheet-wrap,.ritmo-native-sheet{animation:none!important;transition:none!important}
}
'''
cssp.write_text(css)
print('Ritmo V1: sheets e modais receberam hierarquia, safe-area e motion de app nativo; tab bar recolhe enquanto o painel está aberto.')
