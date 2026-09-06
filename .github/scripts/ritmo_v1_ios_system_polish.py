from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'

a=app.read_text()

# Corrige o cabeçalho do perfil no Menu: avatar circular real, texto separado e câmera integrada.
old='''<div class="ios-menu-profile">\n    <button class="ios-profile-main" data-page="profile">${avatarMarkup('ios-profile-avatar')}<div><strong>${esc(p.name)}</strong><small>@${esc(p.username)}</small><span>${sh.active?'Nosso Ritmo conectado':'Conta individual'} • ${bio?'proteção do aparelho ativa':'senha protegida'}</span></div>${ic('chev',17)}</button>\n    <button class="ios-photo-quick" type="button" data-profile-photo aria-label="Alterar foto" title="Alterar foto">${ic('camera',18)}</button>\n  </div>'''
new='''<div class="ios-menu-profile">\n    <div class="ios-menu-avatar-wrap">\n      <button class="ios-menu-avatar-button" type="button" data-profile-photo aria-label="Alterar foto de perfil" title="Alterar foto">${avatarMarkup('ios-profile-avatar')}<span class="ios-menu-camera">${ic('camera',12)}</span></button>\n    </div>\n    <button class="ios-profile-main" data-page="profile"><div class="ios-profile-summary"><strong>${esc(p.name)}</strong><small>@${esc(p.username)}</small><span>${sh.active?'Nosso Ritmo conectado':'Conta individual'} • ${bio?'proteção do aparelho ativa':'senha protegida'}</span></div>${ic('chev',17)}</button>\n  </div>'''
if old not in a:
    raise SystemExit('Bloco do perfil no Menu não encontrado.')
a=a.replace(old,new,1)

# Faz Compartilhamento participar do estado ativo do Menu na barra inferior.
a=a.replace("['calendar','insights','settings','profile','shortcuts'].includes(state.page)","['calendar','insights','settings','profile','shortcuts','sharing'].includes(state.page)")

app.write_text(a)

css=cssp.read_text()
css += r'''

/* Ritmo V1 — polimento iOS global e correção de proporções */
:root{
  --ios-bg:#f5f5f7;
  --ios-surface:rgba(255,255,255,.94);
  --ios-surface-2:#f2f2f7;
  --ios-separator:rgba(60,60,67,.16);
  --ios-radius:18px;
  --ios-radius-lg:22px;
  --ios-shadow:0 8px 28px rgba(15,76,92,.055);
}
html.dark{
  --ios-bg:#111315;
  --ios-surface:rgba(30,32,34,.96);
  --ios-surface-2:#202326;
  --ios-separator:rgba(235,235,245,.14);
  --ios-shadow:0 8px 28px rgba(0,0,0,.18);
}
body{background:var(--ios-bg);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
button,input,select,textarea{font:inherit}
button,a{-webkit-tap-highlight-color:transparent}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid rgba(15,76,92,.35);outline-offset:2px}

/* Cabeçalhos */
.page-head{align-items:flex-start;margin-bottom:18px;gap:14px}
.page-head>div:first-child{min-width:0}
.page-head .eyebrow{font-size:10px;letter-spacing:.13em;font-weight:800;color:var(--primary)}
.page-head h1{font-size:clamp(29px,4.8vw,42px);line-height:1.03;letter-spacing:-.035em;font-weight:780;margin:7px 0 7px}
.page-head p{font-size:12px;line-height:1.45;color:var(--muted);max-width:620px;margin:0}
.head-actions{display:flex;align-items:center;gap:8px}
.icon-btn,.collapse,.close{min-width:44px;min-height:44px;border-radius:14px}

/* Superfícies e cartões */
.panel,.stat,.balance,.settings-list,.profile-edit-card,.ios-list-card,.profile-field-group,.profile-ios-hero,.ios-menu-profile{
  border-color:var(--ios-separator)!important;
  box-shadow:var(--ios-shadow)!important;
}
.panel,.stat,.ios-list-card,.profile-field-group{border-radius:var(--ios-radius)!important}
.balance,.profile-ios-hero,.ios-menu-profile{border-radius:var(--ios-radius-lg)!important}
.panel{padding:16px}
.stats{gap:10px}
.stat{padding:15px}
.stat-value{letter-spacing:-.02em}
.panel-title h3{letter-spacing:-.01em}

/* Menu: proporção corrigida */
.ios-menu-profile{display:flex!important;align-items:center!important;gap:12px!important;padding:12px 13px!important;margin-bottom:22px!important;background:var(--ios-surface)!important;min-height:78px}
.ios-menu-avatar-wrap{flex:0 0 auto!important;width:54px;height:54px;display:grid;place-items:center}
.ios-menu-avatar-button{position:relative;width:54px;height:54px;min-width:54px;min-height:54px;padding:0;border:0;background:transparent;border-radius:50%;display:grid;place-items:center}
.ios-profile-avatar{width:54px!important;height:54px!important;min-width:54px!important;max-width:54px!important;min-height:54px!important;max-height:54px!important;flex:0 0 54px!important;aspect-ratio:1/1!important;border-radius:50%!important;object-fit:cover!important;overflow:hidden!important;display:grid!important;place-items:center!important;background:linear-gradient(145deg,var(--primary),var(--sage))!important;color:#fff!important;font-size:17px!important;font-weight:800!important;line-height:1!important}
.ios-menu-camera{position:absolute;right:-2px;bottom:-1px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--gold);color:#5d421f;border:2px solid var(--surface);box-shadow:0 3px 9px rgba(0,0,0,.12)}
.ios-profile-main{min-width:0!important;flex:1!important;display:flex!important;align-items:center!important;gap:10px!important;padding:2px 0!important}
.ios-profile-main>div{flex:initial!important}
.ios-profile-main>.ios-profile-summary{min-width:0!important;flex:1!important;display:flex!important;flex-direction:column!important}
.ios-profile-summary strong{font-size:14px!important;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ios-profile-summary small{font-size:11px!important;margin-top:2px!important;color:var(--muted)!important}
.ios-profile-summary span{font-size:9.5px!important;line-height:1.25;margin-top:4px!important;color:var(--muted)!important}
.ios-photo-quick{display:none!important}

/* Atualização: menor, elegante e dourada */
.menu-update-btn{width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;padding:0!important;border-radius:14px!important;background:rgba(212,163,115,.15)!important;border:1px solid rgba(212,163,115,.42)!important;color:#9a662a!important;box-shadow:0 5px 16px rgba(212,163,115,.12)!important}
.menu-update-btn:hover{background:rgba(212,163,115,.22)!important}

/* Listas tipo Settings do iOS */
.ios-menu-groups,.ios-settings-groups{gap:20px!important}
.ios-menu-section>h3{font-size:10px!important;letter-spacing:.11em!important;font-weight:750!important;margin:0 0 7px 12px!important}
.ios-list-card{background:var(--ios-surface)!important;overflow:hidden}
.ios-list-row{min-height:62px!important;padding:10px 14px!important;gap:12px!important;border-bottom-color:var(--ios-separator)!important}
.ios-list-row strong{font-size:12.5px!important;line-height:1.25}
.ios-list-row small{font-size:10px!important;line-height:1.35!important;margin-top:3px!important}
.more-icon,.setting-icon{width:38px!important;height:38px!important;min-width:38px!important;border-radius:11px!important;display:grid!important;place-items:center!important}

/* Campos e formulários */
.field input,.field select,.field textarea,.profile-ios-field input,.ios-select,input,select,textarea{border-radius:12px}
.field input,.field select,.profile-ios-field input{min-height:44px}
.field textarea{min-height:96px}
.profile-ios-field{min-height:58px!important;border-bottom-color:var(--ios-separator)!important}
.profile-field-group{background:var(--ios-surface)!important}
.profile-ios-save,.btn{min-height:44px;border-radius:12px}
.btn-primary{box-shadow:0 5px 14px rgba(15,76,92,.12)}

/* Modais com comportamento de sheet no mobile */
.modal{border-radius:22px!important;border-color:var(--ios-separator)!important;box-shadow:0 24px 70px rgba(0,0,0,.18)!important}
.modal-head{padding-bottom:10px;border-bottom:1px solid var(--ios-separator)}
.modal-head h3{letter-spacing:-.015em}

/* Navegação */
.top-mobile{background:rgba(247,245,239,.88)!important;backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom-color:var(--ios-separator)!important}
html.dark .top-mobile{background:rgba(17,19,21,.86)!important}
.bottom{background:rgba(255,255,255,.92)!important;backdrop-filter:saturate(180%) blur(24px);-webkit-backdrop-filter:saturate(180%) blur(24px);border-color:var(--ios-separator)!important;box-shadow:0 -7px 28px rgba(0,0,0,.055)!important}
html.dark .bottom{background:rgba(26,28,30,.92)!important}
.bottom button{min-height:48px;border-radius:12px}
.bottom button span{font-size:9px;font-weight:650}
.fab{width:52px!important;height:52px!important;border-radius:50%!important;box-shadow:0 8px 24px rgba(15,76,92,.22)!important}

/* Perfil */
.profile-ios-hero{background:var(--ios-surface)!important;padding:20px 18px!important}
.profile-avatar-xl{width:88px!important;height:88px!important;min-width:88px!important;max-width:88px!important;aspect-ratio:1/1!important;border-radius:50%!important;object-fit:cover!important;overflow:hidden!important}
.profile-camera-btn{width:30px!important;height:30px!important}
.profile-real-badges span{background:var(--ios-surface-2)!important}

/* Densidade e responsividade */
@media(max-width:760px){
  .main{padding-top:22px!important;padding-left:16px!important;padding-right:16px!important}
  .page-head{margin-bottom:16px}
  .page-head h1{font-size:34px}
  .page-head p{font-size:11px;max-width:92%}
  .ios-menu-profile{min-height:76px;padding:11px 12px!important}
  .ios-menu-avatar-wrap,.ios-menu-avatar-button{width:50px;height:50px}
  .ios-profile-avatar{width:50px!important;height:50px!important;min-width:50px!important;max-width:50px!important;min-height:50px!important;max-height:50px!important;flex-basis:50px!important}
  .ios-list-row{min-height:61px!important}
  .panel{padding:14px}
  .stats{grid-template-columns:1fr 1fr!important}
  .modal-wrap{align-items:flex-end!important;padding:0!important}
  .modal{width:100%!important;max-width:none!important;border-radius:24px 24px 0 0!important;margin:0!important;padding-bottom:calc(18px + env(safe-area-inset-bottom))!important;max-height:88dvh;overflow:auto}
}
@media(min-width:761px){
  .main{max-width:1180px}
  .page-head{margin-bottom:22px}
}

/* Acessibilidade de movimento */
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
'''
cssp.write_text(css)
print('Ritmo V1: polimento iOS global aplicado e avatar do Menu corrigido.')
