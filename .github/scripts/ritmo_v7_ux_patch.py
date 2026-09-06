from pathlib import Path
import sys

root=Path(sys.argv[1]); app=root/'public'/'app.js'; cssp=root/'public'/'styles.css'
s=app.read_text()

def must(old,label):
    if old not in s:
        raise SystemExit(f'Trecho não encontrado: {label}')

def rep(old,new,label):
    global s
    must(old,label)
    s=s.replace(old,new,1)

def replace_func(name,next_name,new_code):
    global s
    a=s.find('function '+name+'(')
    b=s.find('\nfunction '+next_name+'(',a)
    if a<0 or b<0:
        raise SystemExit(f'Função não encontrada: {name} -> {next_name}')
    s=s[:a]+new_code+s[b:]

# Estado temporário do editor de atalhos. A fonte oficial continua sendo D1.
rep("turnstileWidget:null,filters:{}};","turnstileWidget:null,filters:{},shortcutDraft:null};",'estado shortcutDraft')

# Atalhos salvos continuam sempre normalizados; edição usa um draft separado, permitindo 0/1/2/3 marcados.
old="function mobileShortcutKeys(){let raw=state.data?.settings?.mobile_shortcuts;try{if(typeof raw==='string')raw=JSON.parse(raw)}catch{};const src=Array.isArray(raw)?raw:defaultShortcuts,a=[];for(const k of src)if(shortcutCatalog[k]&&!a.includes(k))a.push(k);for(const k of defaultShortcuts)if(a.length<3&&!a.includes(k))a.push(k);return a.slice(0,3)}"
new="function mobileShortcutKeys(){let raw=state.data?.settings?.mobile_shortcuts;try{if(typeof raw==='string')raw=JSON.parse(raw)}catch{};const src=Array.isArray(raw)?raw:defaultShortcuts,a=[];for(const k of src)if(shortcutCatalog[k]&&!a.includes(k))a.push(k);for(const k of defaultShortcuts)if(a.length<3&&!a.includes(k))a.push(k);return a.slice(0,3)}\nfunction shortcutDraftKeys(){if(!Array.isArray(state.shortcutDraft))state.shortcutDraft=[...mobileShortcutKeys()];return state.shortcutDraft}\nfunction moveShortcutDraft(key,dir){const a=[...shortcutDraftKeys()],i=a.indexOf(key),j=i+dir;if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];state.shortcutDraft=a}"
rep(old,new,'funções atalhos')

# FAB inteligente: só existe nas telas funcionais e sua ação acompanha a tela/aba atual.
anchor="function mobileBottom(){return [['home','Início','home'],...mobileShortcutKeys().map(k=>shortcutCatalog[k]),['more','Mais','menu']]}"
rep(anchor,anchor+"\nfunction fabHtml(){let type='',label='';if(state.page==='income'){type='income';label='Nova entrada'}else if(state.page==='expenses'){type=(innerWidth<=760&&state.movementTab==='income')?'income':'expense';label=type==='income'?'Nova entrada':'Nova saída'}else if(state.page==='debts'){type='debt';label='Nova dívida'}else if(state.page==='goals'){type='goal';label='Nova meta'}if(!type)return '';return `<button class=\"fab\" id=\"fab\" data-fab-type=\"${type}\" aria-label=\"${label}\" title=\"${label}\">${ic('plus',26)}</button>`}",'fab helper')
rep('<button class="fab" id="fab" aria-label="Ação rápida">${ic(\'plus\',26)}</button>','${fabHtml()}','render fab contextual')
rep("$('#fab')?.addEventListener('click',()=>{state.modal={type:'quick'};renderApp(false)});","$('#fab')?.addEventListener('click',e=>{const type=e.currentTarget.dataset.fabType;if(!type)return;state.modal={type};renderApp(false)});",'bind fab contextual')

# Ao entrar no editor, cria um draft. Ao sair, descarta alterações não salvas.
oldnav="$$('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;state.settingsSub=null;state.profilePop=false;renderApp()});"
newnav="$$('[data-page]').forEach(b=>b.onclick=()=>{const next=b.dataset.page;if(next==='shortcuts')state.shortcutDraft=[...mobileShortcutKeys()];else if(state.page==='shortcuts')state.shortcutDraft=null;state.page=next;state.settingsSub=null;state.profilePop=false;renderApp()});"
rep(oldnav,newnav,'navegação shortcuts draft')

# Menu Mais reorganizado: ferramentas, conta e aplicativo. Configurações deixa de ser uma gaveta de tudo.
more_code=r'''function morePage(){return `${head('Mais','Acesse ferramentas, conta e informações do Ritmo.')}<div class="more-sections"><section class="more-section"><h3>Ferramentas</h3><div class="more-grid"><button class="more-card" data-page="calendar"><span class="more-icon calendar-tone">${ic('calendar',22)}</span><div><strong>Calendário</strong><small>Movimentações e vencimentos por dia.</small></div>${ic('chev',16)}</button><button class="more-card" data-page="insights"><span class="more-icon insight-tone">${ic('spark',22)}</span><div><strong>Insights</strong><small>Entenda melhor seus dados financeiros.</small></div>${ic('chev',16)}</button><button class="more-card" data-page="shortcuts"><span class="more-icon shortcut-tone">${ic('menu',22)}</span><div><strong>Personalizar atalhos</strong><small>Escolha e ordene os atalhos da barra inferior.</small></div>${ic('chev',16)}</button></div></section><section class="more-section"><h3>Sua conta</h3><div class="more-grid"><button class="more-card" data-page="profile"><span class="more-icon">${ic('user',22)}</span><div><strong>Editar perfil</strong><small>Nome, usuário e senha.</small></div>${ic('chev',16)}</button></div></section><section class="more-section"><h3>Aplicativo</h3><div class="more-grid"><button class="more-card" data-page="settings"><span class="more-icon settings-tone">${ic('gear',22)}</span><div><strong>Configurações</strong><small>Aparência, notificações e segurança.</small></div>${ic('chev',16)}</button><button class="more-card" data-settings-open="about"><span class="more-icon info-tone">${ic('info',22)}</span><div><strong>Sobre o Ritmo</strong><small>Versão e informações do aplicativo.</small></div>${ic('chev',16)}</button><a class="more-card" href="https://wa.me/5574998029574?text=Ol%C3%A1%20Fl%C3%A1vio%2C%20eu%20gostaria%20de%20suporte%20no%20Ritmo." target="_blank" rel="noopener"><span class="more-icon support-tone">${ic('message',22)}</span><div><strong>Suporte Rocha Tech</strong><small>Fale diretamente pelo WhatsApp.</small></div>${ic('chev',16)}</a></div></section></div>`}'''
replace_func('morePage','shortcutsPage',more_code)

# Editor claro: marcar/desmarcar + ordem independente. Setas funcionam bem inclusive no touch.
shortcuts_code=r'''function shortcutsPage(){const selected=shortcutDraftKeys();return `${head('Personalizar atalhos','Marque três atalhos e escolha a ordem em que eles aparecem.')}<div class="panel shortcuts-panel"><div class="shortcut-edit-head"><div><strong>Seus atalhos</strong><small>${selected.length}/3 selecionados</small></div><span class="shortcut-counter ${selected.length===3?'ready':''}">${selected.length}/3</span></div><div class="shortcut-order">${selected.length?selected.map((k,i)=>{const n=shortcutCatalog[k];return `<div class="shortcut-order-item"><span class="drag-handle" aria-hidden="true">⋮⋮</span><span class="setting-icon tone-${n[0]}">${ic(n[2],18)}</span><div><strong>${n[1]}</strong><small>Posição ${i+1}</small></div><div class="shortcut-move"><button type="button" data-shortcut-move="${k}" data-dir="-1" ${i===0?'disabled':''} aria-label="Mover para a esquerda">‹</button><button type="button" data-shortcut-move="${k}" data-dir="1" ${i===selected.length-1?'disabled':''} aria-label="Mover para a direita">›</button></div></div>`}).join(''):'<div class="shortcut-empty">Nenhum atalho selecionado. Marque três opções abaixo.</div>'}</div><div class="shortcut-divider"></div><div class="shortcut-options-title"><strong>Escolher atalhos</strong><small>Toque para marcar ou desmarcar.</small></div><div class="shortcut-options">${Object.values(shortcutCatalog).map(n=>{const checked=selected.includes(n[0]);return `<button type="button" class="shortcut-option ${checked?'selected':''}" data-shortcut-option="${n[0]}" aria-pressed="${checked}"><span class="shortcut-checkbox">${checked?ic('check',16):''}</span><span class="setting-icon tone-${n[0]}">${ic(n[2],18)}</span><div><strong>${n[1]}</strong><small>${checked?'Selecionado':'Disponível'}</small></div></button>`}).join('')}</div><p class="shortcut-help">Início e Mais ficam fixos. Os três atalhos escolhidos são sincronizados com sua conta e aparecem nessa mesma ordem em outros aparelhos.</p><button class="btn btn-primary shortcut-save" id="saveShortcuts" type="button" ${selected.length!==3?'disabled':''}>Salvar atalhos</button></div>`}'''
replace_func('shortcutsPage','calendarPage',shortcuts_code)

# Configurações contém apenas configurações reais. "Sobre" permanece no menu Mais.
settings_code=r'''function settingsPage(){if(state.settingsSub)return settingsSubPage(state.settingsSub);const rows=[['appearance','Aparência','Tema claro, escuro ou automático','palette'],['notifications','Notificações','Escolha quais avisos o Ritmo pode mostrar','bell'],['security','Segurança','Biometria, passkey e bloqueio do aplicativo','shield']];return `${head('Configurações','Preferências e segurança do seu Ritmo.')}<div class="settings-list">${rows.map(r=>`<button class="setting-row" data-settings="${r[0]}" style="width:100%;border-top:0;border-left:0;border-right:0;background:none;text-align:left"><span class="setting-icon">${ic(r[3],18)}</span><div><strong>${r[1]}</strong><small>${r[2]}</small></div><span class="chevron">${ic('chev',16)}</span></button>`).join('')}</div>`}'''
replace_func('settingsPage','settingsSubPage',settings_code)

# Eventos do editor: draft não é normalizado pelos padrões enquanto o usuário edita.
old_segment="$$('[data-shortcut-option]').forEach(b=>b.onclick=()=>{const k=b.dataset.shortcutOption;let a=mobileShortcutKeys();if(a.includes(k))a=a.filter(x=>x!==k);else if(a.length<3)a.push(k);else return toast('Escolha no máximo três atalhos.');state.data.settings.mobile_shortcuts=a;renderApp(false)});$('#saveShortcuts')?.addEventListener('click',()=>{const a=mobileShortcutKeys();if(a.length!==3)return toast('Escolha três atalhos.');saveSettings({mobile_shortcuts:a},'Atalhos salvos na sua conta.');});"
new_segment="$$('[data-shortcut-option]').forEach(b=>b.onclick=()=>{const k=b.dataset.shortcutOption,a=[...shortcutDraftKeys()],i=a.indexOf(k);if(i>=0)a.splice(i,1);else{if(a.length>=3)return toast('Desmarque um atalho antes de escolher outro.');a.push(k)}state.shortcutDraft=a;renderApp(false)});$$('[data-shortcut-move]').forEach(b=>b.onclick=()=>{moveShortcutDraft(b.dataset.shortcutMove,Number(b.dataset.dir));renderApp(false)});$('#saveShortcuts')?.addEventListener('click',async()=>{const a=[...shortcutDraftKeys()];if(a.length!==3)return toast('Escolha exatamente três atalhos.');await saveSettings({mobile_shortcuts:a},'Atalhos salvos na sua conta.');state.shortcutDraft=null;state.page='more';renderApp(false)});"
rep(old_segment,new_segment,'eventos editor atalhos')

app.write_text(s)

css=cssp.read_text()
css += r'''

/* Ritmo UX contextual */
.shortcut-edit-head,.shortcut-options-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.shortcut-edit-head small,.shortcut-options-title small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.shortcut-counter{min-width:44px;text-align:center;border-radius:999px;padding:7px 10px;background:var(--surface2);color:var(--muted);font-size:10px;font-weight:800}.shortcut-counter.ready{color:var(--green);background:color-mix(in srgb,var(--green) 12%,var(--surface2))}.shortcut-order{display:grid;gap:8px;margin-top:14px}.shortcut-order-item{display:grid;grid-template-columns:20px 38px 1fr auto;gap:9px;align-items:center;border:1px solid var(--line);background:var(--surface2);border-radius:15px;padding:10px}.shortcut-order-item strong{font-size:11px}.shortcut-order-item small{display:block;color:var(--muted);font-size:9px;margin-top:2px}.drag-handle{color:var(--muted);font-size:16px;letter-spacing:-3px}.shortcut-move{display:flex;gap:5px}.shortcut-move button{width:32px;height:32px;border-radius:10px;border:1px solid var(--line);background:var(--surface-solid);font-size:20px;line-height:1}.shortcut-move button:disabled{opacity:.28;cursor:default}.shortcut-divider{height:1px;background:var(--line);margin:18px 0}.shortcut-options-title{margin-bottom:10px}.shortcut-checkbox{width:24px;height:24px;border-radius:8px;border:1.5px solid var(--line);display:grid;place-items:center;color:white;background:var(--surface-solid);flex:0 0 auto}.shortcut-option.selected .shortcut-checkbox{background:var(--primary);border-color:var(--primary)}.shortcut-option{grid-template-columns:24px 38px 1fr!important}.shortcut-empty{padding:18px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:14px;font-size:10px}.shortcut-save:disabled{opacity:.45;cursor:not-allowed}.more-section>h3{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:18px 2px 9px}.fab[data-fab-type="income"]{background:var(--green)}.fab[data-fab-type="expense"]{background:var(--coral)}.fab[data-fab-type="debt"]{background:var(--gold);color:#4b3218}.fab[data-fab-type="goal"]{background:var(--primary)}
'''
cssp.write_text(css)
print('Ritmo UX corrigida: atalhos editáveis/ordenáveis, Mais organizado e FAB contextual.')
