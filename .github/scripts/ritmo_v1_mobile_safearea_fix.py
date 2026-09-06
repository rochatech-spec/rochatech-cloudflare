from pathlib import Path
import sys

root=Path(sys.argv[1])
cssp=root/'public'/'styles.css'
css=cssp.read_text()
css += r'''

/* Ritmo V1 — correção definitiva de safe-area e conteúdo sob barras fixas */
@media(max-width:760px){
  :root{
    --ritmo-mobile-header:72px;
    --ritmo-mobile-bottom:92px;
  }

  /* Cabeçalho mobile: altura previsível e sem cobrir o conteúdo */
  .top-mobile{
    position:fixed!important;
    top:0!important;
    left:0!important;
    right:0!important;
    z-index:1200!important;
    height:calc(var(--ritmo-mobile-header) + env(safe-area-inset-top))!important;
    min-height:calc(var(--ritmo-mobile-header) + env(safe-area-inset-top))!important;
    padding:env(safe-area-inset-top) 16px 0!important;
    box-sizing:border-box!important;
    display:flex!important;
    align-items:center!important;
    justify-content:space-between!important;
  }

  .top-mobile .brand-mobile,
  .top-mobile .top-actions{
    height:52px!important;
    display:flex!important;
    align-items:center!important;
  }

  .brand-icon-mobile{
    width:48px!important;
    height:48px!important;
    max-width:48px!important;
    max-height:48px!important;
    object-fit:contain!important;
    border-radius:13px!important;
  }

  .top-mobile .icon-btn,
  .mobile-profile-btn{
    width:46px!important;
    height:46px!important;
    min-width:46px!important;
    min-height:46px!important;
  }

  /* O conteúdo começa DEPOIS do cabeçalho, nunca por trás dele */
  .main{
    margin-top:calc(var(--ritmo-mobile-header) + env(safe-area-inset-top))!important;
    padding-top:22px!important;
    padding-left:16px!important;
    padding-right:16px!important;
    padding-bottom:calc(var(--ritmo-mobile-bottom) + 34px + env(safe-area-inset-bottom))!important;
    min-height:calc(100dvh - var(--ritmo-mobile-header))!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }

  .page,
  .page.active{
    overflow:visible!important;
    padding-bottom:8px!important;
  }

  .page-head{
    position:relative!important;
    z-index:1!important;
    margin-top:0!important;
    padding-top:0!important;
    min-height:auto!important;
  }

  .page-head .eyebrow,
  .page-head h1,
  .page-head p{
    position:relative!important;
    clip:auto!important;
    overflow:visible!important;
  }

  .page-head h1{
    margin-top:7px!important;
    line-height:1.04!important;
  }

  /* Barra inferior: fixa, mas o conteúdo recebe espaço equivalente */
  .bottom{
    position:fixed!important;
    left:16px!important;
    right:16px!important;
    bottom:calc(8px + env(safe-area-inset-bottom))!important;
    z-index:1200!important;
    min-height:82px!important;
    height:82px!important;
    padding:8px 8px!important;
    box-sizing:border-box!important;
  }

  .bottom button{
    height:64px!important;
    min-height:64px!important;
    padding:6px 3px!important;
  }

  /* FAB sempre acima da tab bar */
  .fab{
    bottom:calc(104px + env(safe-area-inset-bottom))!important;
    z-index:1190!important;
  }

  /* Menus flutuantes também não ficam escondidos pelo header */
  .mobile-profile-pop{
    top:calc(var(--ritmo-mobile-header) - 4px + env(safe-area-inset-top))!important;
    z-index:1300!important;
  }

  /* Primeira e última áreas sempre totalmente visíveis */
  .page>*:first-child{scroll-margin-top:calc(var(--ritmo-mobile-header) + 16px + env(safe-area-inset-top))!important}
  .page>*:last-child{margin-bottom:12px!important}
}

/* Em telas muito baixas, reduz um pouco a tab bar sem sobrepor conteúdo */
@media(max-width:760px) and (max-height:700px){
  :root{--ritmo-mobile-bottom:84px}
  .bottom{height:74px!important;min-height:74px!important}
  .bottom button{height:56px!important;min-height:56px!important}
  .fab{bottom:calc(94px + env(safe-area-inset-bottom))!important}
}
'''
cssp.write_text(css)
print('Ritmo V1: safe-area mobile corrigida; cabeçalho e tab bar não sobrepõem mais o conteúdo.')
