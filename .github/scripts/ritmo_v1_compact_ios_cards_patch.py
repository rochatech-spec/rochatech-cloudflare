from pathlib import Path
import sys

root=Path(sys.argv[1])
cssp=root/'public'/'styles.css'
css=cssp.read_text()
css += r'''

/* Ritmo V1 — cartões de menus mais compactos e harmônicos */
.ios-menu-groups,.ios-settings-groups{gap:16px!important}
.ios-menu-section>h3{margin:0 0 6px 10px!important;font-size:9.5px!important;letter-spacing:.105em!important}
.ios-list-card{border-radius:16px!important;box-shadow:0 5px 18px rgba(15,76,92,.045)!important}
.ios-list-row{min-height:54px!important;padding:8px 12px!important;gap:10px!important}
.ios-list-row strong{font-size:12px!important;line-height:1.2!important}
.ios-list-row small{font-size:9.5px!important;line-height:1.28!important;margin-top:2px!important}
.ios-list-row>svg:last-child{width:15px!important;height:15px!important;opacity:.78}
.more-icon,.setting-icon{width:34px!important;height:34px!important;min-width:34px!important;border-radius:10px!important}
.more-icon svg,.setting-icon svg{width:19px!important;height:19px!important}
.settings-ios-card .setting-row,.settings-list .setting-row{min-height:54px!important;padding:8px 12px!important}
.more-card{min-height:66px!important;padding:10px 11px!important;border-radius:16px!important;grid-template-columns:34px 1fr 15px!important;gap:9px!important;box-shadow:0 5px 18px rgba(15,76,92,.045)!important}
.more-card .more-icon{width:34px!important;height:34px!important}
.more-card strong{font-size:11.5px!important}.more-card small{font-size:8.8px!important;line-height:1.3!important;margin-top:2px!important}
.ios-menu-profile{min-height:70px!important;padding:9px 11px!important;margin-bottom:18px!important;border-radius:18px!important;box-shadow:0 5px 18px rgba(15,76,92,.045)!important}
.ios-menu-avatar-wrap,.ios-menu-avatar-button{width:46px!important;height:46px!important}
.ios-profile-avatar{width:46px!important;height:46px!important;min-width:46px!important;max-width:46px!important;min-height:46px!important;max-height:46px!important;flex-basis:46px!important;font-size:15px!important}
.ios-menu-camera{width:20px!important;height:20px!important;right:-2px!important;bottom:-1px!important}
.ios-profile-summary strong{font-size:13px!important}.ios-profile-summary small{font-size:10px!important}.ios-profile-summary span{font-size:9px!important;margin-top:3px!important}
@media(max-width:760px){
  .ios-menu-groups,.ios-settings-groups{gap:15px!important}
  .ios-list-row{min-height:52px!important;padding:7px 11px!important}
  .more-card{min-height:62px!important}
  .ios-menu-profile{min-height:68px!important}
}
'''
cssp.write_text(css)
print('Ritmo V1: cartões dos menus compactados mantendo touch targets e padrão iOS.')
