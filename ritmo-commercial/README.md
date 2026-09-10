# Ritmo • Gestão Financeira

PWA de gestão financeira construído com React, TypeScript, Vite e Cloudflare.

## Arquitetura

- **Frontend:** React 19 + TypeScript + Vite.
- **PWA:** instalável, Service Worker, Web App Manifest e Background Sync.
- **API:** Cloudflare Pages Functions em `/api`.
- **Dados:** Cloudflare D1.
- **Sessões e desafios efêmeros:** Workers KV.
- **Arquivos privados:** Workers KV.
- **Autenticação rápida:** WebAuthn/Passkeys com biometria do aparelho quando disponível.
- **Notificações:** Web Push/VAPID.
- **Mutações:** Optimistic UI com rollback automático em falhas.

O projeto é **PWA-only**. Não há build de APK, Capacitor ou Tauri.

## Login lembrado

A opção **Lembrar usuário neste aparelho** guarda somente o nome de usuário no armazenamento local. A senha não é persistida pelo Ritmo. Quando uma passkey é cadastrada, o usuário lembrado permite iniciar a autenticação biométrica sem redigitar o login.

## Acesso e recuperação

No primeiro acesso o servidor gera um usuário único e um código de recuperação. O código serve para redefinir a senha e autorizar um aparelho novo. O servidor armazena somente o HMAC do código, protegido por `RECOVERY_PEPPER`.

## Desenvolvimento local

```bash
npm install
npm run check
npm run build
npx wrangler d1 execute ritmo-commercial-db --local --file=./schema.sql --config wrangler.jsonc
npx wrangler pages dev dist --config wrangler.jsonc
```

## Produção

O PWA é publicado em `https://ritmo-commercial.pages.dev`. O pipeline valida TypeScript, Worker, PWA, manifest e service worker antes da publicação.

Para publicação não interativa, o repositório pode usar `CLOUDFLARE_API_TOKEN`. O fluxo de autorização por dispositivo continua disponível quando necessário.
