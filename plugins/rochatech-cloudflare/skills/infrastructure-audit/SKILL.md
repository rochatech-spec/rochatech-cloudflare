---
name: infrastructure-audit
description: Auditar conta e projetos Cloudflare, localizar falhas, duplicações, recursos órfãos, configurações inseguras e problemas de deploy.
---

# Auditoria de infraestrutura

Faça auditorias somente leitura por padrão.

## Verificações

- Identificar a conta OAuth ativa e não assumir IDs antigos.
- Inventariar Pages, Workers, D1, R2, KV, Queues, Durable Objects, domínios, rotas e bindings.
- Detectar projetos duplicados, deploys falhos, recursos sem uso, bindings quebrados e variáveis ausentes.
- Verificar isolamento por tenant, exposição de segredos, CORS, cabeçalhos de segurança e permissões excessivas.
- Consultar logs de auditoria para mudanças relevantes e observabilidade para erros de execução.
- Comparar GitHub e Cloudflare para detectar repositórios, branches ou builds desconectados.

Entregue primeiro um relatório com impacto, evidência e correção recomendada. Não excluir nem substituir recursos durante uma auditoria.

