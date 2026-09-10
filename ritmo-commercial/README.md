# Ritmo • Gestão Financeira

Aplicação comercial construída a partir do protótipo HTML original, preservando sua estrutura visual e comportamento de desktop/mobile, com React + TypeScript + Vite, PWA instalável, Cloudflare Pages Functions, D1, KV, R2 e Capacitor Android.

## Arquitetura

- **Frontend:** React 19 + TypeScript + Vite 8.
- **PWA:** `vite-plugin-pwa`, Service Worker, Web App Manifest, cache e sincronização posterior apenas das mutações financeiras autenticadas.
- **API:** Cloudflare Pages Functions em `/api`, executando a lógica de `src/worker.ts` no mesmo domínio do PWA.
- **Dados:** Cloudflare D1.
- **Sessões e desafios efêmeros:** Cloudflare KV.
- **Arquivos privados:** Cloudflare R2.
- **Biometria Web:** WebAuthn/Passkeys, com chave pública no servidor e biometria mantida no autenticador do dispositivo.
- **Android:** Capacitor 8, biometria nativa, Android Keystore para tokens, câmera, geolocalização, compartilhamento e notificações locais.
- **Push Web:** Web Push/VAPID para o PWA.

## Regra de acesso e recuperação

No primeiro acesso o servidor gera um código aleatório no formato `RITMO-...`. O código é exibido em texto puro uma única vez e a conta só é ativada após o usuário confirmar que o guardou. O banco armazena somente o HMAC do código, protegido por `RECOVERY_PEPPER`.

O mesmo código possui duas funções deliberadas:

1. redefinir a senha quando o usuário a esquece;
2. autorizar um aparelho novo após a senha ser validada.

Um aparelho já autorizado recebe um token aleatório próprio. Sessões são vinculadas ao token do aparelho. Trocar o código de recuperação invalida o código anterior sem revogar os aparelhos já autorizados. Trocar ou recuperar a senha incrementa a versão da sessão e invalida sessões antigas.

## Desenvolvimento local

```bash
npm install
npm run check
npm run build
npx wrangler d1 execute ritmo-commercial-db --local --file=./schema.sql --config wrangler.jsonc
npx wrangler pages dev dist --config wrangler.jsonc
```

Para simular os segredos localmente, crie `.dev.vars` sem adicioná-lo ao Git:

```text
RECOVERY_PEPPER=<segredo-longo-aleatorio>
VAPID_PUBLIC_KEY=<chave-publica-vapid>
VAPID_PRIVATE_KEY=<chave-privada-vapid>
```

As chaves VAPID podem ser geradas com `npm run vapid`.

## PWA

Em produção o PWA usa `/api` no próprio domínio Pages. No Android, o build define:

```text
VITE_API_URL=https://ritmo-commercial.pages.dev/api
```

Isso permite que o bundle nativo use a mesma API Cloudflare sem duplicar backend.

## Android / Capacitor

```bash
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

O APK de teste é criado em `android/app/build/outputs/apk/debug/app-debug.apk`. O GitHub Actions renomeia e publica esse arquivo como artifact `Ritmo-Android-APK`.

Um APK de **release para distribuição pública** deve ser assinado sempre com a mesma chave persistente. O workflow não gera uma chave efêmera de produção, pois isso impediria atualizações futuras do aplicativo com a mesma identidade.

## Publicação Cloudflare

O workflow `.github/workflows/ritmo-commercial.yml` cria/reutiliza automaticamente:

- Pages: `ritmo-commercial`;
- D1: `ritmo-commercial-db`;
- KV: `ritmo-commercial-session`;
- R2: `ritmo-commercial-files`.

Ele também aplica `schema.sql`, mantém `RECOVERY_PEPPER` e o par VAPID já existente, publica o Pages e valida `/`, `/api/health`, manifest, service worker e ícones.

Para publicação não interativa, o repositório precisa possuir o secret de Actions `CLOUDFLARE_API_TOKEN` com permissões suficientes para Pages, D1, KV e R2. O token nunca deve ser colocado no código ou em arquivos do projeto.

## Instalação do PWA

Após a publicação, abra `https://ritmo-commercial.pages.dev` no Chrome/Edge. No Android, use **Instalar app** / **Adicionar à tela inicial**. No desktop, use o ícone de instalação da barra de endereço quando oferecido pelo navegador.
