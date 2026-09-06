from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'

a=app.read_text()


def replace_between(start_marker,end_marker,new_text,label):
    global a
    p=a.find(start_marker)
    q=a.find(end_marker,p+len(start_marker))
    if p<0 or q<0:
        raise SystemExit(f'Trecho não encontrado: {label}')
    a=a[:p]+new_text+'\n'+a[q:]

# Ícone de câmera simples e consistente com o conjunto atual.
needle="photo:'<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"3\"/><circle cx=\"9\" cy=\"10\" r=\"2\"/><path d=\"m4 17 5-5 4 4 3-3 4 4\"/>',"
if needle in a and "camera:'" not in a:
    a=a.replace(needle,needle+"camera:'<path d=\"M8 6.5 9.5 4h5L16 6.5h2.5A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5V9a2.5 2.5 0 0 1 2.5-2.5H8Z\"/><circle cx=\"12\" cy=\"13\" r=\"3.2\"/>',",1)

# Menu reorganizado com hierarquia inspirada no iOS e sem atalhos soltos.
more=r'''function morePage(){
  const update=`<button type="button" class="system-update-btn menu-update-btn" data-system-update aria-label="Atualizar Sistema" title="Atualizar Sistema"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.4 9A7 7 0 0 0 6.2 6.2L4 8"/><path d="M5.6 15A7 7 0 0 0 17.8 17.8L20 16"/></svg></button>`;
  const p=state.data.profile,sh=state.data.sharing||{},bio=Number(state.data.security?.webauthn_count||0)>0;
  return `${head('Menu','Sua conta, recursos e preferências em um só lugar.',update)}
  <div class="ios-menu-profile">
    <button class="ios-profile-main" data-page="profile">${avatarMarkup('ios-profile-avatar')}<div><strong>${esc(p.name)}</strong><small>@${esc(p.username)}</small><span>${sh.active?'Nosso Ritmo conectado':'Conta individual'} • ${bio?'proteção do aparelho ativa':'senha protegida'}</span></div>${ic('chev',17)}</button>
    <button class="ios-photo-quick" type="button" data-profile-photo aria-label="Alterar foto" title="Alterar foto">${ic('camera',18)}</button>
  </div>
  <div class="ios-menu-groups">
    <section class="ios-menu-section"><h3>Recursos</h3><div class="ios-list-card">
      <button class="ios-list-row sharing-menu-card" data-page="sharing"><span class="more-icon sharing-tone">${ic('users',21)}</span><div><strong>Compartilhamento</strong><small>${sh.active?`Conectado com ${esc(sh.partner?.name||'seu parceiro')}`:'Crie um espaço financeiro a dois.'}</small></div>${ic('chev',16)}</button>
      <button class="ios-list-row" data-page="calendar"><span class="more-icon calendar-tone">${ic('calendar',21)}</span><div><strong>Calendário</strong><small>Movimentações e vencimentos por dia.</small></div>${ic('chev',16)}</button>
      <button class="ios-list-row" data-page="insights"><span class="more-icon insight-tone">${ic('spark',21)}</span><div><strong>Insights</strong><small>Leituras reais a partir dos seus dados.</small></div>${ic('chev',16)}</button>
    </div></section>
    <section class="ios-menu-section"><h3>Aplicativo</h3><div class="ios-list-card">
      <button class="ios-list-row" data-page="settings"><span class="more-icon settings-tone">${ic('gear',21)}</span><div><strong>Configurações</strong><small>Personalização, notificações e segurança.</small></div>${ic('chev',16)}</button>
      <button class="ios-list-row" data-settings-open="about"><span class="more-icon info-tone">${ic('info',21)}</span><div><strong>Sobre o Ritmo</strong><small>Versão 1.0 e informações do aplicativo.</small></div>${ic('chev',16)}</button>
      <a class="ios-list-row" href="https://wa.me/5574998029574?text=Ol%C3%A1%20Fl%C3%A1vio%2C%20eu%20gostaria%20de%20suporte%20no%20Ritmo." target="_blank" rel="noopener"><span class="more-icon support-tone">${ic('message',21)}</span><div><strong>Suporte Rocha Tech</strong><small>Fale diretamente pelo WhatsApp.</small></div>${ic('chev',16)}</a>
    </div></section>
  </div>`
}'''
replace_between('function morePage(){','function sharingPage(){',more,'Menu iOS')

# Configurações: Aparência vira Personalização e atalhos passam para dentro dela.
settings=r'''function settingsPage(){
  if(state.settingsSub)return settingsSubPage(state.settingsSub);
  const rows=[['personalization','Personalização','Tema, aparência e atalhos da barra inferior','palette'],['notifications','Notificações','Escolha os avisos que fazem sentido para você','bell'],['security','Segurança','Biometria, chave de acesso e bloqueio do aplicativo','shield']];
  return `${head('Configurações','Ajustes organizados do seu Ritmo.')}<div class="ios-settings-groups"><section class="ios-menu-section"><h3>Preferências</h3><div class="ios-list-card">${rows.map(r=>`<button class="ios-list-row" data-settings="${r[0]}"><span class="more-icon">${ic(r[3],20)}</span><div><strong>${r[1]}</strong><small>${r[2]}</small></div>${ic('chev',16)}</button>`).join('')}</div></section></div>`
}
function settingsSubPage(k){
  const s=state.data.settings,back=`<button class="subpage-back" id="settingsBack">${ic('back',15)} Configurações</button>`;
  if(k==='personalization')return `${back}${head('Personalização','Deixe o Ritmo com a sua cara sem perder a organização.')}<div class="ios-settings-groups">
    <section class="ios-menu-section"><h3>Aparência</h3><div class="ios-list-card">${[['light','Claro','Interface clara e suave'],['dark','Noturno','Escuro com contraste equilibrado'],['system','Automático','Acompanha o tema do aparelho']].map(x=>`<button class="ios-list-row" data-theme="${x[0]}"><span class="more-icon">${ic('palette',19)}</span><div><strong>${x[1]}</strong><small>${x[2]}</small></div><span class="ios-check">${s.theme===x[0]?ic('check',18):''}</span></button>`).join('')}</div></section>
    <section class="ios-menu-section"><h3>Tela inicial</h3><div class="ios-list-card"><button class="ios-list-row" data-page="shortcuts"><span class="more-icon shortcut-tone">${ic('menu',20)}</span><div><strong>Atalhos da barra inferior</strong><small>Escolha três atalhos, marque, desmarque e organize a posição.</small></div>${ic('chev',16)}</button></div><p class="ios-section-note">A seleção e a ordem são salvas na sua conta e acompanham você em outros aparelhos.</p></section>
  </div>`;
  if(k==='notifications')return `${back}${head('Notificações','O sino mostra os avisos; aqui você escolhe o que pode avisar.')}<div class="ios-list-card settings-ios-card">${switchRow('notifications_enabled','Ativar notificações','Permitir avisos do Ritmo',s.notifications_enabled,'bell')}${switchRow('notify_due','Contas a vencer','Avisar antes do vencimento',s.notify_due,'calendar')}${switchRow('notify_overdue','Contas vencidas','Destacar contas em atraso',s.notify_overdue,'bell')}${switchRow('notify_goals','Metas','Avisos próximos ao prazo',s.notify_goals,'target')}<div class="setting-row"><span class="setting-icon">${ic('calendar',18)}</span><div><strong>Antecedência</strong><small>Quantos dias antes avisar</small></div><select id="reminderDays" class="ios-select">${[1,2,3,5,7,10].map(x=>`<option value="${x}" ${Number(s.reminder_days)===x?'selected':''}>${x} dias</option>`).join('')}</select></div>${switchRow('monthly_summary','Resumo mensal','Lembrete de fechamento do mês',s.monthly_summary,'spark')}</div>`;
  if(k==='security'){const enabled=Number(state.data.security?.webauthn_count||0)>0;return `${back}${head('Segurança','Proteção real disponível neste aparelho.')}<div class="ios-list-card settings-ios-card"><div class="setting-row"><span class="setting-icon">${ic('shield',18)}</span><div><strong>Biometria e chave de acesso</strong><small id="bioHint">${deviceSecurityHint()}</small></div><button class="switch ${enabled?'on':''}" id="bioToggle"><i></i></button></div><div class="setting-row"><span class="setting-icon">${ic('lock',18)}</span><div><strong>Bloqueio automático</strong><small>Solicitar desbloqueio após inatividade</small></div><select id="lockMinutes" class="ios-select"><option value="0" ${Number(s.auto_lock_minutes)===0?'selected':''}>Nunca</option>${[1,5,10,15].map(x=>`<option value="${x}" ${Number(s.auto_lock_minutes)===x?'selected':''}>${x} min</option>`).join('')}</select></div><div class="setting-row"><span class="setting-icon">${ic('shield',18)}</span><div><strong>Sessão protegida</strong><small>Vinculada ao ID interno da conta, sem depender do nome de usuário.</small></div>${ic('check',17)}</div></div>`}
  return `${back}${head('Sobre','Conheça o Ritmo e fale com a Rocha Tech.')}<div class="panel" style="max-width:720px"><div class="about-logo">${brand()}</div><p style="font-size:11px;line-height:1.7;color:var(--muted);margin:18px 0">O Ritmo é um produto Rocha Tech criado para tornar a gestão financeira pessoal mais clara, intuitiva e agradável no dia a dia.</p><div class="meta-row"><span>Versão</span><strong>1.0</strong></div><div class="meta-row"><span>Produto</span><strong>Rocha Tech</strong></div><a class="whatsapp" target="_blank" rel="noopener" href="https://wa.me/5574998029574?text=Ol%C3%A1%20Fl%C3%A1vio%2C%20eu%20gostaria%20de%20suporte%20no%20Ritmo.">${ic('message',18)} Suporte pelo WhatsApp</a></div>`
}'''
replace_between('function settingsPage(){','function switchRow(',settings,'Configurações/Personalização')

# Perfil com foto real, grupos limpos e estados vindos da conta.
profile=r'''function profilePage(){
  const p=state.data.profile,sh=state.data.sharing||{},bio=Number(state.data.security?.webauthn_count||0)>0;
  return `${head('Editar perfil','Sua identidade no Ritmo, organizada em um só lugar.')}
  <div class="profile-ios-wrap">
    <section class="profile-ios-hero">
      <div class="profile-photo-shell">${avatarMarkup('profile-avatar-xl')}<label class="profile-camera-btn" title="Alterar foto">${ic('camera',18)}<input id="avatarInput" type="file" accept="image/jpeg,image/png,image/webp"></label></div>
      <div class="profile-ios-copy"><h2>${esc(p.name)}</h2><p>@${esc(p.username)}</p><div class="profile-real-badges"><span>${ic('check',12)} Conta sincronizada</span>${sh.active?`<span>${ic('users',12)} Nosso Ritmo ativo</span>`:''}${bio?`<span>${ic('shield',12)} Proteção do aparelho</span>`:''}</div></div>
      <button type="button" class="btn btn-secondary profile-change-photo" data-profile-photo>${ic('camera',16)} Alterar foto</button>
      <small class="profile-photo-note">JPG, PNG ou WebP. A imagem é otimizada antes do envio para economizar dados.</small>
    </section>
    <form id="profileForm" class="profile-ios-form">
      <section class="ios-menu-section"><h3>Dados pessoais</h3><div class="profile-field-group"><label class="profile-ios-field"><span>Nome</span><input name="name" value="${esc(p.name)}" autocomplete="name" required></label><label class="profile-ios-field"><span>Usuário</span><input name="username" value="${esc(p.username)}" autocomplete="username" minlength="3" required></label></div></section>
      <section class="ios-menu-section"><h3>Segurança da conta</h3><div class="profile-field-group"><label class="profile-ios-field"><span>Nova senha</span><input name="password" type="password" autocomplete="new-password" minlength="8" placeholder="Manter senha atual"></label></div><p class="ios-section-note">Deixe a senha vazia para manter a atual. Alterar nome, usuário ou senha não muda seu histórico.</p></section>
      <button class="btn btn-primary profile-ios-save" type="submit">Salvar alterações</button>
    </form>
  </div>`
}'''
replace_between('function profilePage(){','function modalHtml(){',profile,'Perfil iOS')

# Menu do perfil ganha Alterar foto em desktop e mobile.
a=a.replace('<div class="profile-pop"><button data-page="profile">Editar perfil</button><button data-logout> Sair</button></div>','<div class="profile-pop"><button data-page="profile">Editar perfil</button><button data-profile-photo>Alterar foto</button><button data-logout> Sair</button></div>')
a=a.replace('<div class="mobile-profile-pop"><button data-page="profile">${ic(\'edit\',15)} Editar perfil</button><button data-logout>${ic(\'back\',15)} Sair</button></div>','<div class="mobile-profile-pop"><button data-page="profile">${ic(\'edit\',15)} Editar perfil</button><button data-profile-photo>${ic(\'camera\',15)} Alterar foto</button><button data-logout>${ic(\'back\',15)} Sair</button></div>')

# Foto: seletor rápido + otimização real antes do upload.
old="async function uploadAvatar(e){const file=e.target.files?.[0];if(!file)return;try{await api('/api/avatar',{method:'PUT',body:file,headers:{'content-type':file.type}});state.data=await api('/api/bootstrap');renderApp(false);toast('Foto atualizada.')}catch(err){toast(err.message)}}"
new=r'''async function optimizeAvatar(file){if(!file||!String(file.type||'').startsWith('image/'))throw new Error('Escolha uma imagem válida.');if(file.size<=900000)return file;const url=URL.createObjectURL(file);try{const img=await new Promise((ok,no)=>{const x=new Image();x.onload=()=>ok(x);x.onerror=no;x.src=url});const max=768,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height)),w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale)),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.86));if(!blob)throw new Error('Não foi possível otimizar a foto.');return blob}finally{URL.revokeObjectURL(url)}}
function chooseProfilePhoto(){const i=document.createElement('input');i.type='file';i.accept='image/jpeg,image/png,image/webp';i.onchange=uploadAvatar;i.click()}
async function uploadAvatar(e){const file=e.target.files?.[0];if(!file)return;try{toast('Preparando sua foto...');const blob=await optimizeAvatar(file);await api('/api/avatar',{method:'PUT',body:blob,headers:{'content-type':blob.type||'image/jpeg'}});state.data=await api('/api/bootstrap');renderApp(false);toast('Foto de perfil atualizada.')}catch(err){toast(err.message||'Não foi possível atualizar a foto.')}}'''
if old not in a:
    raise SystemExit('Função uploadAvatar não encontrada.')
a=a.replace(old,new,1)

# Ligações dos novos controles.
needle="$('#bioToggle')?.addEventListener('click',toggleBiometric);$('#profileForm')?.addEventListener('submit',saveProfile);"
repl="$('#bioToggle')?.addEventListener('click',toggleBiometric);$('#profileForm')?.addEventListener('submit',saveProfile);$('#avatarInput')?.addEventListener('change',uploadAvatar);$$('[data-profile-photo]').forEach(b=>b.addEventListener('click',chooseProfilePhoto));"
if needle not in a:
    raise SystemExit('Bindings de perfil não encontrados.')
a=a.replace(needle,repl,1)

app.write_text(a)

css=cssp.read_text()
css += r'''

/* Ritmo V1 — organização iOS, perfil e personalização */
.ios-menu-profile{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:10px 10px 10px 12px;box-shadow:0 8px 26px rgba(15,76,92,.06);margin-bottom:18px}.ios-profile-main{min-width:0;flex:1;display:flex;align-items:center;gap:12px;border:0;background:none;text-align:left;color:var(--text);padding:4px}.ios-profile-main>div{min-width:0;flex:1;display:flex;flex-direction:column}.ios-profile-main strong{font-size:14px}.ios-profile-main small{font-size:11px;color:var(--muted);margin-top:2px}.ios-profile-main span{font-size:9.5px;color:var(--muted);margin-top:5px}.ios-profile-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:linear-gradient(145deg,var(--primary),var(--sage));color:white;font-weight:800;font-size:17px}.ios-photo-quick{width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:50%;background:rgba(212,163,115,.16);color:#9a662a}.ios-menu-groups,.ios-settings-groups{display:grid;gap:18px}.ios-menu-section>h3{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:0 0 7px 12px}.ios-list-card{overflow:hidden;background:var(--surface);border:1px solid var(--line);border-radius:18px}.ios-list-row{width:100%;min-height:60px;display:flex;align-items:center;gap:12px;padding:10px 13px;border:0;border-bottom:1px solid var(--line);background:none;color:var(--text);text-align:left;text-decoration:none}.ios-list-row:last-child{border-bottom:0}.ios-list-row>div{min-width:0;flex:1;display:flex;flex-direction:column}.ios-list-row strong{font-size:12px}.ios-list-row small{font-size:10px;color:var(--muted);line-height:1.35;margin-top:2px}.ios-check{min-width:22px;color:var(--primary)}.ios-section-note{font-size:9.5px;color:var(--muted);line-height:1.45;margin:7px 12px 0}.settings-ios-card{max-width:820px}.ios-select{border:0;background:var(--surface2);color:var(--text);border-radius:10px;padding:7px 9px;max-width:110px}.profile-ios-wrap{max-width:780px;display:grid;gap:20px}.profile-ios-hero{display:flex;flex-direction:column;align-items:center;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:22px 18px}.profile-photo-shell{position:relative}.profile-avatar-xl{width:92px;height:92px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:linear-gradient(145deg,var(--primary),var(--sage));color:white;font-size:30px;font-weight:800;box-shadow:0 8px 24px rgba(15,76,92,.14)}.profile-camera-btn{position:absolute;right:-2px;bottom:2px;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--primary);color:white;border:3px solid var(--surface);cursor:pointer}.profile-camera-btn input{display:none}.profile-ios-copy h2{font-size:19px;margin:12px 0 2px}.profile-ios-copy p{font-size:11px;color:var(--muted);margin:0}.profile-real-badges{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin-top:10px}.profile-real-badges span{display:inline-flex;align-items:center;gap:4px;font-size:9px;padding:5px 8px;border-radius:999px;background:var(--surface2);color:var(--muted)}.profile-change-photo{margin-top:13px}.profile-photo-note{font-size:9px;color:var(--muted);margin-top:7px}.profile-ios-form{display:grid;gap:18px}.profile-field-group{background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden}.profile-ios-field{min-height:58px;padding:7px 13px;display:grid;grid-template-columns:minmax(90px,130px) 1fr;align-items:center;border-bottom:1px solid var(--line);gap:12px}.profile-ios-field:last-child{border-bottom:0}.profile-ios-field>span{font-size:11px;font-weight:700}.profile-ios-field input{width:100%;border:0!important;background:transparent!important;box-shadow:none!important;text-align:right;color:var(--text);font-size:11px;outline:none}.profile-ios-save{width:100%;min-height:46px;border-radius:14px}@media(min-width:761px){.ios-menu-profile{max-width:820px}.ios-menu-groups,.ios-settings-groups{max-width:820px}.profile-ios-hero{flex-direction:row;text-align:left;gap:16px}.profile-ios-copy{flex:1}.profile-real-badges{justify-content:flex-start}.profile-change-photo{margin-top:0}.profile-photo-note{display:none}}@media(max-width:760px){.ios-menu-profile{border-radius:20px}.ios-list-card{border-radius:17px}.ios-list-row{min-height:62px}.profile-ios-wrap{gap:16px}.profile-ios-hero{border-radius:21px}.profile-ios-field{grid-template-columns:92px 1fr}}
'''
cssp.write_text(css)
print('Ritmo V1: Menu e Configurações reorganizados no padrão iOS, Personalização consolidada e foto de perfil funcional.')
