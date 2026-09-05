# CONTROL — RochaTech

Aplicativo financeiro pessoal em React + TypeScript + Vite + PWA, hospedado no Cloudflare Pages com Pages Functions e D1.

## Produção
https://controll-br.pages.dev

## Arquitetura
- Frontend: React + TypeScript + Vite
- PWA: manifest + service worker com cache seletivo
- API: Cloudflare Pages Functions
- Dados: Cloudflare D1 (`control-db`)
- Isolamento: `tenant_id` em todas as entidades financeiras
- Produção: projeto Pages `controll-br`

## Política de consumo
- Sem polling contínuo
- API somente quando necessária
- Listas paginadas no backend
- Índices D1 preservados
- Assets estáticos com cache longo
- Dados privados nunca entram no cache do service worker
