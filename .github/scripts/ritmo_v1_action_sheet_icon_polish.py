from pathlib import Path
import sys

root=Path(sys.argv[1])
public=root/'public'
app=public/'app.js'
cssp=public/'styles.css'

# Reprocessa os ícones já gerados pela identidade oficial, removendo sobras transparentes
# e redimensionando com alta qualidade dentro de uma área segura.
try:
    from PIL import Image
except Exception as e:
    raise SystemExit(f'Pillow indisponível: {e}')

for size in (192,512):
    path=public/f'ritmo-icon-{size}.png'
    im=Image.open(path).convert('RGBA')
    alpha=im.getchannel('A')
    bbox=alpha.getbbox()
    if not bbox:
        raise SystemExit(f'Ícone {size}px sem conteúdo visível')
    crop=im.crop(bbox)
    max_w=round(size*0.96)
    max_h=round(size*0.92)
    scale=min(max_w/crop.width,max_h/crop.height)
    nw=max(1,round(crop.width*scale)); nh=max(1,round(crop.height*scale))
    crop=crop.resize((nw,nh),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(size,size),(0,0,0,0))
    x=(size-nw)//2; y=(size-nh)//2
    canvas.alpha_composite(crop,(x,y))
    canvas.save(path,optimize=True)

# Converte as janelas de criação do botão + em bottom sheets realmente utilizáveis no mobile.
a=app.read_text()
open_old='<div class="modal-wrap" id="modalWrap"><form class="modal" id="dataForm"><div class="modal-head">'
open_new='<div class="modal-wrap action-sheet-wrap" id="modalWrap"><form class="modal action-sheet" id="dataForm"><div class="modal-grabber" aria-hidden="true"></div><div class="modal-head">'
if open_old not in a:
    raise SystemExit('Abertura do modal de ação não encontrada')
a=a.replace(open_old,open_new,1)

save_old='<div class="form-grid">${fields}<div class="full"><button class="btn btn-primary" style="width:100%;margin-top:8px" type="submit">Salvar</button></div></div></form></div>`}'
save_new='<div class="form-grid action-sheet-body">${fields}</div><div class="modal-save-bar"><button class="btn btn-primary" type="submit">Salvar</button></div></form></div>`}'
if save_old not in a:
    raise SystemExit('Rodapé do modal de ação não encontrado')
a=a.replace(save_old,save_new,1)
app.write_text(a)

css=cssp.read_text()
css += r'''

/* Ritmo V1 — sheets de ação e acabamento do ícone */
.brand-icon-mobile,.brand-icon-only,.welcome-icon-wrap img{
  object-fit:contain!important;
  object-position:center!important;
  image-rendering:auto!important;
  transform:translateZ(0);
  backface-visibility:hidden;
}
.brand-icon-mobile,.brand-icon-only{border-radius:13px!important;overflow:hidden!important}

@media(max-width:760px){
  .action-sheet-wrap{
    position:fixed!important;
    inset:0!important;
    z-index:1200!important;
    display:flex!important;
    align-items:flex-end!important;
    justify-content:center!important;
    padding:calc(env(safe-area-inset-top) + 56px) 0 0!important;
    overflow:hidden!important;
    background:rgba(0,0,0,.30)!important;
    backdrop-filter:blur(2px);
    -webkit-backdrop-filter:blur(2px);
  }
  .action-sheet{
    width:100%!important;
    max-width:none!important;
    max-height:calc(100dvh - env(safe-area-inset-top) - 64px)!important;
    margin:0!important;
    padding:0!important;
    border-radius:26px 26px 0 0!important;
    display:flex!important;
    flex-direction:column!important;
    overflow:hidden!important;
    background:var(--surface)!important;
    box-shadow:0 -18px 60px rgba(0,0,0,.22)!important;
  }
  .modal-grabber{
    width:38px;height:5px;border-radius:999px;
    background:rgba(60,60,67,.24);
    margin:8px auto 2px;flex:0 0 auto;
  }
  html.dark .modal-grabber{background:rgba(235,235,245,.24)}
  .action-sheet .modal-head{
    flex:0 0 auto!important;
    padding:10px 18px 12px!important;
    margin:0!important;
    background:var(--surface)!important;
    border-bottom:1px solid var(--ios-separator)!important;
    z-index:3!important;
  }
  .action-sheet .modal-head h3{
    font-size:17px!important;line-height:1.2!important;
    margin:0!important;letter-spacing:-.015em!important;
  }
  .action-sheet .close{
    width:36px!important;height:36px!important;
    min-width:36px!important;min-height:36px!important;
    border-radius:50%!important;background:var(--ios-surface-2)!important;
  }
  .action-sheet-body{
    flex:1 1 auto!important;min-height:0!important;
    overflow-y:auto!important;overflow-x:hidden!important;
    overscroll-behavior:contain!important;
    -webkit-overflow-scrolling:touch!important;
    padding:14px 18px 18px!important;
    display:grid!important;gap:12px!important;
  }
  .action-sheet-body .field{margin:0!important}
  .action-sheet-body .field input,
  .action-sheet-body .field select,
  .action-sheet-body .field textarea{
    min-height:46px!important;font-size:16px!important;
  }
  .modal-save-bar{
    flex:0 0 auto!important;
    padding:10px 18px calc(10px + env(safe-area-inset-bottom))!important;
    border-top:1px solid var(--ios-separator)!important;
    background:color-mix(in srgb,var(--surface) 94%,transparent)!important;
    backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  }
  .modal-save-bar .btn{width:100%!important;min-height:48px!important;margin:0!important}
}
'''
cssp.write_text(css)
print('Ritmo V1: ações do + ajustadas em bottom sheet e ícones reprocessados sem rebarbas.')
