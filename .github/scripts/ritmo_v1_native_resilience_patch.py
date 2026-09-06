from pathlib import Path
import sys, re, json

root=Path(sys.argv[1])
app=root/'public'/'app.js'
indexp=root/'public'/'index.html'
manifestp=root/'public'/'manifest.webmanifest'

a=app.read_text()

marker='Ritmo V1 — resiliência de app instalado e restauração cloud'
if marker not in a:
    a += r'''

// Ritmo V1 — resiliência de app instalado e restauração cloud.
let ritmoNativeRestoreBusy=false;
let ritmoNativeRestoreAt=0;
function ritmoNativeInstalled(){return window.matchMedia?.('(display-mode: standalone)').matches===true||window.navigator.standalone===true}
async function ritmoNativeCloudRestore(force=false){
  if(!navigator.onLine||ritmoNativeRestoreBusy||document.visibilityState==='hidden')return false;
  const now=Date.now();if(!force&&now-ritmoNativeRestoreAt<45000)return false;
  ritmoNativeRestoreBusy=true;
  try{
    if(typeof state==='undefined'||typeof api!=='function')return false;
    if(state.data?.profile?.id&&typeof syncIfNeeded==='function'){
      await syncIfNeeded(false);ritmoNativeRestoreAt=Date.now();return true;
    }
    const fresh=await api('/api/bootstrap');
    if(!fresh?.profile?.id)return false;
    state.data=fresh;if(state.page!=='shortcuts')state.shortcutDraft=null;
    if(typeof applyTheme==='function')applyTheme(fresh.settings?.theme||'system');
    if(typeof renderApp==='function')renderApp(false);
    ritmoNativeRestoreAt=Date.now();return true;
  }catch{return false}finally{ritmoNativeRestoreBusy=false}
}
async function ritmoNativePersistStorage(){
  if(!ritmoNativeInstalled()||!navigator.storage?.persist)return false;
  try{if(await navigator.storage.persisted?.())return true;return await navigator.storage.persist()}catch{return false}
}
function ritmoNativeResume(){setTimeout(()=>ritmoNativeCloudRestore(false),80)}
window.addEventListener('online',()=>setTimeout(()=>ritmoNativeCloudRestore(true),120));
window.addEventListener('pageshow',e=>{if(e.persisted)ritmoNativeResume()});
window.addEventListener('focus',ritmoNativeResume);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)ritmoNativeResume()});
window.addEventListener('load',()=>{document.documentElement.dataset.ritmoAppMode=ritmoNativeInstalled()?'installed':'browser';ritmoNativePersistStorage();ritmoNativeResume()},{once:true});
window.addEventListener('appinstalled',()=>{setTimeout(ritmoNativePersistStorage,500)});
'''

# Auditoria: só a CHAVE do localStorage é inspecionada. UI temporária (sidebar,
# cache de tema, desbloqueio recente) é permitida; dados de conta não.
danger=[]
pattern=re.compile(r'localStorage\.(?:getItem|setItem|removeItem)\(\s*([\'"`])(.+?)\1',re.I)
for m in pattern.finditer(a):
    key=m.group(2).lower()
    if any(k in key for k in ['mobile_shortcuts','seen_notifications','income','expense','debt','goal','partnership','shared_']):
        danger.append(key)
if danger:
    raise SystemExit('Persistência crítica encontrada no localStorage: '+ ' | '.join(danger[:8]))

app.write_text(a)

idx=indexp.read_text()
def add_meta(name,content):
    global idx
    if re.search(r'<meta[^>]+name=["\']'+re.escape(name)+r'["\'][^>]*>',idx,re.I):
        idx=re.sub(r'<meta[^>]+name=["\']'+re.escape(name)+r'["\'][^>]*>',f'<meta name="{name}" content="{content}">',idx,count=1,flags=re.I)
    else:
        idx=idx.replace('</head>',f'  <meta name="{name}" content="{content}">\n</head>',1)
add_meta('apple-mobile-web-app-capable','yes')
add_meta('mobile-web-app-capable','yes')
add_meta('apple-mobile-web-app-title','Ritmo')
add_meta('format-detection','telephone=no')
add_meta('color-scheme','light dark')
# Safe-area real para iPhone/Android com barras do sistema.
m=re.search(r'<meta[^>]+name=["\']viewport["\'][^>]*content=["\']([^"\']*)["\'][^>]*>',idx,re.I)
if m and 'viewport-fit=cover' not in m.group(1):
    old=m.group(0);content=m.group(1).rstrip(', ')+', viewport-fit=cover';idx=idx.replace(old,re.sub(r'content=["\'][^"\']*["\']',f'content="{content}"',old,count=1),1)
indexp.write_text(idx)

try: man=json.loads(manifestp.read_text())
except Exception: man={}
man['id']='/'
man['scope']='/'
man['start_url']='/?source=pwa'
man['display']='standalone'
man['display_override']=['standalone']
man['orientation']='any'
man['prefer_related_applications']=False
man['categories']=['finance','productivity']
man['theme_color']='#F7F5EF'
man['background_color']='#F7F5EF'
man['launch_handler']={'client_mode':'navigate-existing'}
manifestp.write_text(json.dumps(man,ensure_ascii=False,indent=2)+'\n')
print('Ritmo V1: resiliência cloud-first, armazenamento persistente e comportamento de app instalado aplicados.')
