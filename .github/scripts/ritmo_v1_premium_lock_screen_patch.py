from pathlib import Path
import sys

root=Path(sys.argv[1])
app=root/'public'/'app.js'
cssp=root/'public'/'styles.css'
a=app.read_text()


def bounds(name):
    starts=[a.find(f'function {name}('),a.find(f'async function {name}(')]
    starts=[x for x in starts if x>=0]
    if not starts: raise SystemExit(f'Função não encontrada: {name}')
    p=min(starts); ends=[]
    for token in ['\nfunction ','\nasync function ']:
        q=a.find(token,p+1)
        if q>p: ends.append(q)
    return p,(min(ends) if ends else len(a))

def replace_func(name,code):
    global a
    p,q=bounds(name); a=a[:p]+code+a[q:]

replace_func('showLock',r'''async function showLock(reason='timeout'){
  if(!state.data)return;
  clearTimeout(ritmoLockTimer);state.modal=null;state.profilePop=false;
  const enabled=Number(state.data.security?.webauthn_count||0)>0,p=state.data.profile;
  root.innerHTML=`<section class="secure-lock premium-lock" id="secureLock">
    <div class="premium-lock-inner">
      <div class="premium-lock-brand">${brand()}</div>
      <div class="premium-lock-avatar">${avatarMarkup('premium-lock-avatar-img')}</div>
      <div class="premium-lock-copy">
        <h2>${reason==='launch'?'Bem-vindo de volta':'Ritmo bloqueado'}</h2>
        <p>${reason==='launch'?'Desbloqueie para continuar.':'Confirme sua identidade para continuar.'}</p>
        <span>@${esc(p.username)}</span>
      </div>
      ${enabled?`<button class="btn btn-primary premium-unlock-btn" id="unlockBtn">${ic('shield',18)} Desbloquear com ${deviceBioLabel()}</button><button class="premium-password-toggle" id="showPasswordUnlock" type="button">Usar senha</button>`:''}
      <form id="lockPasswordForm" class="premium-password-form ${enabled?'is-collapsed':''}">
        <label class="premium-password-field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="Digite sua senha"></label>
        <button class="btn ${enabled?'btn-secondary':'btn-primary'}" type="submit">Desbloquear</button>
      </form>
      <button class="premium-other-account" id="lockLogout" type="button">Usar outra conta</button>
    </div>
  </section>`;
  $('#unlockBtn')?.addEventListener('click',unlockBio);
  $('#showPasswordUnlock')?.addEventListener('click',()=>{const f=$('#lockPasswordForm');if(!f)return;f.classList.remove('is-collapsed');$('#showPasswordUnlock')?.remove();setTimeout(()=>f.querySelector('input')?.focus(),80)});
  $('#lockPasswordForm')?.addEventListener('submit',unlockPassword);
  $('#lockLogout')?.addEventListener('click',logout)
}
''')

app.write_text(a)

css=cssp.read_text()+r'''

/* Ritmo V1 — tela de desbloqueio premium e minimalista */
.premium-lock{
  background:
    radial-gradient(circle at 50% 18%,color-mix(in srgb,var(--teal,#0F4C5C) 7%,transparent),transparent 34%),
    var(--bg,#F7F5EF)!important;
}
.premium-lock-inner{
  width:min(100%,360px);
  min-height:100%;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:14px;
  padding:24px 20px;
  text-align:center;
}
.premium-lock-brand{margin-bottom:6px;transform:scale(.92);transform-origin:center}
.premium-lock-avatar{display:flex;justify-content:center;margin-top:2px}
.premium-lock-avatar-img{
  width:72px!important;height:72px!important;min-width:72px!important;max-width:72px!important;
  border-radius:50%!important;object-fit:cover!important;display:grid;place-items:center;
  background:color-mix(in srgb,var(--teal,#0F4C5C) 9%,var(--panel,#fff))!important;
  color:var(--teal,#0F4C5C)!important;font-size:24px!important;font-weight:700!important;
  box-shadow:0 8px 26px rgba(15,76,92,.09);
}
.premium-lock-copy{display:flex;flex-direction:column;align-items:center;gap:5px;margin:2px 0 8px}
.premium-lock-copy h2{margin:0;font-size:24px;line-height:1.08;letter-spacing:-.03em}
.premium-lock-copy p{margin:0;color:var(--muted);font-size:12px;line-height:1.45}
.premium-lock-copy span{font-size:10px;color:color-mix(in srgb,var(--muted) 82%,transparent);margin-top:2px}
.premium-unlock-btn{width:100%;min-height:50px;border-radius:16px!important;font-size:13px!important;margin-top:4px}
.premium-password-toggle,.premium-other-account{
  border:0;background:none;color:var(--primary);font-weight:700;font-size:11px;padding:8px 10px;cursor:pointer
}
.premium-other-account{color:var(--muted);font-weight:600;margin-top:2px}
.premium-password-form{width:100%;display:grid;gap:10px;overflow:hidden;max-height:150px;opacity:1;transform:translateY(0);transition:max-height .26s cubic-bezier(.22,1,.36,1),opacity .18s ease,transform .24s ease}
.premium-password-form.is-collapsed{max-height:0;opacity:0;transform:translateY(-6px);pointer-events:none;margin:0}
.premium-password-field{display:flex;flex-direction:column;gap:6px;text-align:left}
.premium-password-field span{font-size:10px;color:var(--muted);font-weight:700;padding-left:2px}
.premium-password-field input{width:100%;min-height:48px;border-radius:15px;border:1px solid var(--line);background:var(--surface-solid);padding:0 14px;font-size:16px;box-sizing:border-box;color:var(--text)}
.premium-password-form .btn{width:100%;min-height:48px;border-radius:15px!important}

@media(max-width:760px){
  .premium-lock{padding:calc(18px + env(safe-area-inset-top)) 18px calc(18px + env(safe-area-inset-bottom))!important}
  .premium-lock-inner{padding:18px 4px;justify-content:center}
  .premium-lock-brand{margin-bottom:2px}
  .premium-lock-copy h2{font-size:23px}
}

html.dark .premium-lock{background:radial-gradient(circle at 50% 18%,rgba(124,169,130,.09),transparent 34%),var(--bg)!important}
html.dark .premium-lock-avatar-img{box-shadow:0 8px 26px rgba(0,0,0,.18)}
'''
cssp.write_text(css)
print('Ritmo V1: tela de desbloqueio simplificada, premium e focada em biometria/senha.')
