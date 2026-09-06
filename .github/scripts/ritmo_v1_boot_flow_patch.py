from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
a=app.read_text()

# O boot original é substituído por um único fluxo nomeado. Primeiro o login é
# renderizado de forma síncrona; depois a sessão é verificada em segundo plano.
start=a.find("(async()=>{if('serviceWorker'in navigator)")
if start<0:
    raise SystemExit('Boot original não encontrado; patch anterior pode ter removido o startup')
end=a.find('})();',start)
if end<0:
    raise SystemExit('Fim do boot original não encontrado')
end+=5
old=a[start:end]
for marker in ["api('/api/bootstrap')",'renderApp()','startSync()']:
    if marker not in old:
        raise SystemExit('Boot original inesperado; marcador ausente: '+marker)

new=r'''async function ritmoBoot(){
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  applyTheme(localStorage.getItem('ritmo:theme')||'system');
  try{
    const d=await api('/api/bootstrap');
    if(!d?.profile?.id)return;
    state.data=d;state.page='home';state.settingsSub=null;
    applyTheme(d.settings?.theme||'system');
    startSync();
    if(await maybeLock(true))return;
    renderApp();
  }catch(e){
    if(e?.status!==401)toast('Não foi possível verificar sua sessão agora. Você ainda pode entrar normalmente.');
  }
}
renderAuth();
void ritmoBoot();'''

a=a[:start]+new+a[end:]

# Não pode existir um segundo boot concorrente nem splash intermediário.
if a.count('async function ritmoBoot()')!=1:
    raise SystemExit('Boot duplicado detectado')
if a.count("api('/api/bootstrap')")<1:
    raise SystemExit('Bootstrap ausente após reestruturação')
if 'ritmo-instant-login-boot' in a:
    raise SystemExit('Remendo de login imediato ainda presente')

app.write_text(a)
print('Ritmo V1: boot único aplicado — login imediato, sessão em segundo plano e sem fluxo concorrente.')
