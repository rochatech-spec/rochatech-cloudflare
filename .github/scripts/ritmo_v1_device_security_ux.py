from pathlib import Path
import sys

root = Path(sys.argv[1])
app = root / 'public' / 'app.js'
s = app.read_text()


def rep(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'Trecho não encontrado: {label}')
    s = s.replace(old, new, 1)

# Linguagem da área de segurança: descreve corretamente o fluxo do sistema,
# sem prometer acesso direto do Ritmo ao sensor biométrico.
rep(
    "['security','Segurança','Biometria, passkey e bloqueio do aplicativo','shield']",
    "['security','Segurança','Biometria, chave de acesso e bloqueio do aplicativo','shield']",
    'resumo segurança'
)

rep(
    '<strong>${label}</strong><small id="bioHint">WebAuthn verificado no servidor usando o autenticador do próprio dispositivo.</small>',
    '<strong>Biometria e chave de acesso</strong><small id="bioHint">${deviceSecurityHint()}</small>',
    'descrição biometria'
)

rep(
    'Passkey vinculada ao ID interno da conta. Nome, usuário ou senha podem mudar sem quebrar o vínculo.',
    'Proteção vinculada ao ID interno da conta. Nome, usuário ou senha podem mudar sem quebrar o vínculo.',
    'texto sessão protegida'
)

old_fn = "function deviceBioLabel(){const ua=navigator.userAgent;if(/iPhone|iPad|iPod/i.test(ua))return 'Face ID / Touch ID';if(/Android/i.test(ua))return 'Desbloqueio biométrico';if(/Windows/i.test(ua))return 'Windows Hello';if(/Mac/i.test(ua))return 'Touch ID / desbloqueio do Mac';return 'Desbloqueio do dispositivo'}"
new_fn = "function deviceBioLabel(){const ua=navigator.userAgent;if(/iPhone|iPad|iPod/i.test(ua))return 'Face ID / Touch ID';if(/Android/i.test(ua))return 'biometria ou chave de acesso do aparelho';if(/Windows/i.test(ua))return 'Windows Hello';if(/Mac/i.test(ua))return 'Touch ID / desbloqueio do Mac';return 'desbloqueio seguro do aparelho'}function deviceSecurityHint(){const ua=navigator.userAgent;if(/iPhone|iPad|iPod/i.test(ua))return 'Usa o fluxo nativo da Apple com Face ID/Touch ID e o provedor de chaves de acesso configurado no aparelho.';if(/SamsungBrowser|SM-[A-Z0-9]+/i.test(ua))return 'Usa o provedor de credenciais configurado no seu Samsung, como Samsung Pass quando ele estiver definido no aparelho.';if(/Android/i.test(ua))return 'Usa a biometria e o provedor de credenciais configurado no Android. O Ritmo não acessa diretamente sua digital.';if(/Windows/i.test(ua))return 'Usa o Windows Hello e o autenticador configurado neste computador.';if(/Mac/i.test(ua))return 'Usa Touch ID ou o desbloqueio seguro configurado no Mac.';return 'Usa o autenticador seguro disponibilizado pelo próprio aparelho.'}"
rep(old_fn, new_fn, 'rótulo por dispositivo')

rep("toast('Desbloqueio biométrico desativado.')", "toast('Proteção do aparelho desativada.')", 'toast desativação')
rep("toast(`${deviceBioLabel()} ativado com WebAuthn.`)", "toast('Proteção do aparelho ativada com segurança.')", 'toast ativação')
rep("toast('Este navegador não disponibilizou um autenticador de plataforma.')", "toast('Este aparelho ou navegador não disponibilizou o autenticador seguro do sistema.')", 'sem autenticador')
rep("toast(e.message||'Não foi possível ativar o desbloqueio neste aparelho.')", "toast(e.message||'Não foi possível ativar a proteção neste aparelho.')", 'erro ativação')

app.write_text(s)
print('Ritmo V1: linguagem de biometria/chave de acesso alinhada ao provedor nativo do aparelho.')
