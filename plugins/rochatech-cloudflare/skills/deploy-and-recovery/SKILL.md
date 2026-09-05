---
name: deploy-and-recovery
description: Publicar, diagnosticar e recuperar aplicações RochaTech na Cloudflare com GitHub, builds, logs e rollback seguro.
---

# Deploy e recuperação

## Publicação

1. Verificar se já existe projeto com o mesmo nome e reutilizá-lo quando for o alvo correto.
2. Confirmar framework, comando de build, diretório de saída e variáveis necessárias.
3. Conectar o repositório e a branch de produção sem criar GitHub Actions.
4. Configurar previews para branches não produtivas.
5. Validar manifest, service worker, ícones e escopo para projetos PWA.
6. Acompanhar o build até um estado terminal e testar a URL publicada.

## Diagnóstico

- Consultar Workers Builds, logs, analytics e bindings antes de alterar código.
- Diferenciar falha de build, runtime, rota, DNS, autenticação, cache e service worker.
- Não mascarar erros com recriações ou projetos duplicados.

## Recuperação

- Preservar a última versão saudável.
- Preferir rollback ou nova versão corrigida a mudanças destrutivas.
- Confirmar antes de trocar produção, domínio ou excluir recursos.
- Depois da recuperação, verificar frontend, API, banco, mídia, autenticação e PWA.

