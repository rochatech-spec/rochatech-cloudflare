from pathlib import Path
import sys
from ritmo_v1_patch_utils import js_function_bounds

root=Path(sys.argv[1])
app=root/'public'/'app.js'
worker=root/'_worker.js'
cssp=root/'public'/'styles.css'
a=app.read_text(); w=worker.read_text(); css=cssp.read_text()

def replace_func(source,name,code):
    p,q=js_function_bounds(source,name)
    return source[:p]+code+source[q:]

# -----------------------------------------------------------------------------
# Backend: o bootstrap pode ler um espaço específico sem alterar a preferência
# persistida. Isso permite pré-carregar Meu/Nosso Ritmo e elimina a sequência
# POST -> GET que fazia a troca esperar duas viagens de rede.
# -----------------------------------------------------------------------------
p,q=js_function_bounds(w,'bootstrap')
boot=w[p:q]
old_sig='async function bootstrap(env,userId){'
if old_sig not in boot:
    raise SystemExit('Assinatura bootstrap não encontrada para fluidez')
boot=boot.replace(old_sig,'async function bootstrap(env,userId,scopeOverride=null){',1)
old_requested="const requested=workspace?.view_scope==='shared'?'shared':'personal';"
if old_requested not in boot:
    raise SystemExit('Seleção de espaço no bootstrap não encontrada')
boot=boot.replace(old_requested,"const requested=scopeOverride==='shared'||scopeOverride==='personal'?scopeOverride:(workspace?.view_scope==='shared'?'shared':'personal');",1)
w=w[:p]+boot+w[q:]
old_route="if(path==='/api/bootstrap'&&request.method==='GET')return json(await bootstrap(env,userId));"
new_route="if(path==='/api/bootstrap'&&request.method==='GET'){const qscope=url.searchParams.get('scope'),forced=qscope==='shared'||qscope==='personal'?qscope:null;return json(await bootstrap(env,userId,forced));}"
if old_route not in w:
    raise SystemExit('Rota bootstrap não encontrada para scope prefetch')
w=w.replace(old_route,new_route,1)

# -----------------------------------------------------------------------------
# Cliente: transição global leve + cache efêmero do espaço oposto. O cache é
# consumido no clique e sempre revalidado em segundo plano; não vira fonte de
# verdade e não substitui D1.
# -----------------------------------------------------------------------------
helpers=r'''const ritmoScopeCache=new Map();
let ritmoScopePrefetchTimer=0,ritmoScopeSwitchBusy=false,ritmoTransitionTimer=0;
function ritmoMotionAllowed(){return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches&&document.documentElement.dataset.ritmoPerf!=='lite'}
function ritmoTransitionRender(kind,fn){
  const html=document.documentElement;if(!ritmoMotionAllowed()){fn();return}
  clearTimeout(ritmoTransitionTimer);html.dataset.ritmoTransition=kind;
  const done=()=>{if(html.dataset.ritmoTransition===kind)delete html.dataset.ritmoTransition;html.classList.remove('ritmo-transition-fallback')};
  try{if(typeof document.startViewTransition==='function'){const vt=document.startViewTransition(()=>fn());Promise.resolve(vt.finished).finally(done);ritmoTransitionTimer=setTimeout(done,520);return}}catch{}
  html.classList.add('ritmo-transition-fallback');fn();requestAnimationFrame(()=>requestAnimationFrame(()=>html.classList.add('ritmo-transition-ready')));ritmoTransitionTimer=setTimeout(()=>{html.classList.remove('ritmo-transition-ready');done()},210)
}
function ritmoScopeCacheKey(scope){return `${state.data?.profile?.id||''}:${state.data?.sharing?.partnership_id||''}:${scope}`}
function ritmoScopeCacheGet(scope,consume=false){const k=ritmoScopeCacheKey(scope),hit=ritmoScopeCache.get(k),version=Number(state.data?.profile?.data_version||0);if(!hit||Date.now()-hit.at>15000||Number(hit.version)!==version){ritmoScopeCache.delete(k);return null}if(consume)ritmoScopeCache.delete(k);return hit.data}
async function ritmoFetchScopeSnapshot(scope,force=false){if(!sharedActive()||!navigator.onLine||!['personal','shared'].includes(scope))return null;if(!force){const hit=ritmoScopeCacheGet(scope,false);if(hit)return hit}const data=await api(`/api/bootstrap?scope=${scope}`,{headers:{'cache-control':'no-cache'}});if(data?.scope!==scope)return null;ritmoScopeCache.set(ritmoScopeCacheKey(scope),{data,at:Date.now(),version:Number(data.profile?.data_version||0)});return data}
function ritmoScheduleScopePrefetch(){clearTimeout(ritmoScopePrefetchTimer);if(!state.data||!sharedActive()||ritmoScopeSwitchBusy||document.hidden||!navigator.onLine)return;const target=state.data.scope==='shared'?'personal':'shared',run=()=>{if(!ritmoScopeSwitchBusy&&!document.hidden)ritmoFetchScopeSnapshot(target,false).catch(()=>{})};ritmoScopePrefetchTimer=setTimeout(()=>{if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:700});else setTimeout(run,80)},90)}
function ritmoInvalidateScopeCache(){ritmoScopeCache.clear();ritmoScheduleScopePrefetch()}
'''

p,q=js_function_bounds(a,'switchScope')
old_switch=a[p:q]
new_switch=r'''async function switchScope(scope){
  if(!['personal','shared'].includes(scope)||scope===state.data?.scope||ritmoScopeSwitchBusy)return;
  if(scope==='shared'&&!sharedActive())return toast('Conecte seu parceiro antes de abrir o Nosso Ritmo.');
  const previous=state.data;ritmoScopeSwitchBusy=true;document.documentElement.classList.add('ritmo-scope-busy');
  $$('[data-scope]').forEach(b=>{b.disabled=true;b.setAttribute('aria-busy',b.dataset.scope===scope?'true':'false')});
  try{
    const cached=ritmoScopeCacheGet(scope,true);
    const persist=api('/api/sharing/scope',{method:'POST',body:JSON.stringify({scope})});
    if(cached){
      ritmoTransitionRender('scope',()=>{state.data=cached;renderApp(false)});
      const freshPromise=ritmoFetchScopeSnapshot(scope,true).catch(()=>null);
      await persist;
      const fresh=await freshPromise;
      if(fresh){const changed=Number(fresh.profile?.data_version||0)!==Number(cached.profile?.data_version||0);state.data=fresh;if(changed)ritmoTransitionRender('scope',()=>renderApp(false))}
    }else{
      const results=await Promise.all([persist,ritmoFetchScopeSnapshot(scope,true)]),fresh=results[1];
      if(!fresh)throw new Error('Não foi possível abrir este espaço agora.');
      ritmoTransitionRender('scope',()=>{state.data=fresh;renderApp(false)})
    }
    ritmoScopeCache.delete(ritmoScopeCacheKey(scope));
    toast(scope==='shared'?'Nosso Ritmo aberto.':'Seu Ritmo pessoal aberto.');
  }catch(e){ritmoScopeCache.clear();if(previous&&state.data!==previous)ritmoTransitionRender('scope',()=>{state.data=previous;renderApp(false)});toast(e.message||'Não foi possível trocar de espaço agora.')}
  finally{ritmoScopeSwitchBusy=false;document.documentElement.classList.remove('ritmo-scope-busy');$$('[data-scope]').forEach(b=>{b.disabled=false;b.removeAttribute('aria-busy')});ritmoScheduleScopePrefetch()}
}'''
a=a[:p]+helpers+new_switch+a[q:]

# Pré-carrega o espaço oposto depois de cada render, sempre em idle/debounce.
render_tail='bindApp();if(resetScroll)window.scrollTo(0,0);startQuotes();'
if render_tail not in a:
    raise SystemExit('Final de renderApp não encontrado')
a=a.replace(render_tail,'bindApp();if(resetScroll)window.scrollTo(0,0);startQuotes();ritmoScheduleScopePrefetch();',1)

# Navegação principal e subpáginas usam a mesma transição curta. O conteúdo
# continua sendo renderizado pela lógica original; apenas o swap fica suave.
old_nav="state.page=next;state.settingsSub=null;state.profilePop=false;renderApp()"
if old_nav not in a:
    raise SystemExit('Navegação principal não encontrada')
a=a.replace(old_nav,"state.page=next;state.settingsSub=null;state.profilePop=false;ritmoTransitionRender('page',()=>renderApp())",1)

repls=[
("state.page='settings';state.settingsSub=b.dataset.settingsOpen;renderApp()","state.page='settings';state.settingsSub=b.dataset.settingsOpen;ritmoTransitionRender('page',()=>renderApp())"),
("state.settingsSub=b.dataset.settings;renderApp()","state.settingsSub=b.dataset.settings;ritmoTransitionRender('page',()=>renderApp())"),
("state.settingsSub=null;renderApp()","state.settingsSub=null;ritmoTransitionRender('page',()=>renderApp())"),
("state.movementTab=b.dataset.tab;renderApp(false)","state.movementTab=b.dataset.tab;ritmoTransitionRender('segment',()=>renderApp(false))")
]
for old,new in repls:
    if old in a:a=a.replace(old,new,1)

# Quando dados mudam, snapshots antigos deixam de ser candidatos à próxima troca.
# A própria sincronização em background volta a aquecer o espaço oposto.
for marker in [
    "state.data=await api('/api/bootstrap');applyTheme(state.data.settings.theme);state.modal=null;renderApp(false);toast(msg||'Salvo com sucesso.')",
    "state.data=await api('/api/bootstrap');renderApp(false);toast('Foto atualizada.')"
]:
    if marker in a:
        a=a.replace(marker,marker.replace('renderApp(false);','ritmoInvalidateScopeCache();renderApp(false);'),1)

# -----------------------------------------------------------------------------
# CSS: microinterações consistentes, sem blur pesado e sem animação em aparelhos
# que pedem redução de movimento ou entram no modo leve de desempenho.
# -----------------------------------------------------------------------------
css += r'''

/* Ritmo V1 — fluidez global e troca Meu/Nosso Ritmo */
.main{view-transition-name:ritmo-main}
.scope-bar{view-transition-name:ritmo-scope-bar}
::view-transition-group(ritmo-main),::view-transition-group(ritmo-scope-bar){animation-duration:.18s;animation-timing-function:cubic-bezier(.2,.75,.25,1)}
html[data-ritmo-transition="page"]::view-transition-old(ritmo-main){animation:ritmo-vt-out .14s ease both}
html[data-ritmo-transition="page"]::view-transition-new(ritmo-main){animation:ritmo-vt-in .18s cubic-bezier(.2,.75,.25,1) both}
html[data-ritmo-transition="scope"]::view-transition-old(ritmo-main){animation:ritmo-vt-scope-out .14s ease both}
html[data-ritmo-transition="scope"]::view-transition-new(ritmo-main){animation:ritmo-vt-scope-in .18s cubic-bezier(.2,.75,.25,1) both}
@keyframes ritmo-vt-out{to{opacity:.72;transform:translateY(-2px)}}
@keyframes ritmo-vt-in{from{opacity:.72;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes ritmo-vt-scope-out{to{opacity:.76;transform:scale(.997)}}
@keyframes ritmo-vt-scope-in{from{opacity:.76;transform:scale(.997)}to{opacity:1;transform:none}}
html.ritmo-transition-fallback[data-ritmo-transition] .page.active{animation:ritmo-page-fallback .18s cubic-bezier(.2,.75,.25,1) both}
@keyframes ritmo-page-fallback{from{opacity:.76;transform:translateY(4px)}to{opacity:1;transform:none}}
.scope-seg button,.bottom button,.nav button,.more-card,.setting-row,.mini-btn,.btn,.icon-btn,.fab{transition:transform .13s ease,opacity .13s ease,background-color .16s ease,border-color .16s ease}
.scope-seg button:active,.bottom button:active,.nav button:active,.more-card:active,.setting-row:active,.mini-btn:active,.btn:active,.icon-btn:active,.fab:active{transform:scale(.985)}
.scope-seg button[aria-busy="true"]{opacity:.78}
html.ritmo-scope-busy .scope-seg{pointer-events:none}
@media(prefers-reduced-motion:reduce){
  .scope-seg button,.bottom button,.nav button,.more-card,.setting-row,.mini-btn,.btn,.icon-btn,.fab{transition:none!important}
  html.ritmo-transition-fallback[data-ritmo-transition] .page.active{animation:none!important}
}
html[data-ritmo-perf="lite"] .scope-seg button,html[data-ritmo-perf="lite"] .bottom button,html[data-ritmo-perf="lite"] .nav button,html[data-ritmo-perf="lite"] .more-card,html[data-ritmo-perf="lite"] .setting-row{transition-duration:.01ms!important}
'''

# Garantias da transformação.
for need in ['scopeOverride','url.searchParams.get(\'scope\')']:
    if need not in w:raise SystemExit('Fluidez backend ausente: '+need)
for need in ['ritmoFetchScopeSnapshot','ritmoScheduleScopePrefetch','ritmoTransitionRender','Promise.all([persist,ritmoFetchScopeSnapshot']:
    if need not in a:raise SystemExit('Fluidez cliente ausente: '+need)

app.write_text(a);worker.write_text(w);cssp.write_text(css)
print('Ritmo V1: troca Meu/Nosso pré-carregada e transições globais suavizadas em mobile e desktop.')
