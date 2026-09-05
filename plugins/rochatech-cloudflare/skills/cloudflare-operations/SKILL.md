---
name: cloudflare-operations
description: Gerenciar projetos RochaTech na Cloudflare, incluindo Pages, Workers, D1, R2, KV, domínios, builds e integração com GitHub.
---

# RochaTech Cloudflare

Use o servidor MCP oficial `cloudflare-api`, autenticado por OAuth, para todas as leituras e alterações na conta Cloudflare selecionada pelo usuário.

## Padrão de arquitetura

- GitHub é a fonte oficial do código e do versionamento.
- Cloudflare executa builds e deploys; não criar GitHub Actions.
- Usar React, TypeScript, Vite e PWA para aplicações web quando aplicável.
- Usar Pages ou Workers para frontend, Workers para APIs, D1 para dados estruturados e R2 para mídia e uploads.
- Separar dados por tenant e usuário. Nunca misturar dados entre contas, escolas ou clientes.
- Manter `main` como produção e branches separadas como previews quando o projeto estiver conectado ao GitHub.
- Priorizar os planos gratuitos e configurar limites para evitar consumo inesperado.

## Operação segura

1. Antes de alterar recursos, identificar a conta ativa e listar os alvos exatos.
2. Consultar a especificação pelo recurso de busca antes de executar endpoints da API.
3. Para exclusões, substituições de produção, mudanças de domínio, permissões ou cobrança, mostrar o alvo exato e solicitar confirmação.
4. Não armazenar tokens, senhas ou códigos no repositório, em conversas ou em arquivos do projeto.
5. Usar OAuth da Cloudflare e permissões mínimas necessárias.
6. Após mudanças, verificar status de build, URL publicada, bindings e saúde do serviço.
7. Se a autenticação expirar, solicitar reconexão; nunca pedir que o usuário envie segredos no chat.

## Fluxo GitHub para Cloudflare

- Confirmar repositório e branch.
- Detectar o framework e definir os comandos de build e diretório de saída.
- Criar ou atualizar o projeto Cloudflare sem duplicar projetos existentes.
- Configurar variáveis e bindings sem expor valores secretos.
- Executar o deploy na Cloudflare e validar a versão publicada.
- Entregar o endereço final e registrar as decisões relevantes no repositório.

