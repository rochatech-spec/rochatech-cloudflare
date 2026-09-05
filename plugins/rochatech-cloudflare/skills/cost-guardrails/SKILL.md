---
name: cost-guardrails
description: Proteger projetos Cloudflare contra gastos inesperados e uso excessivo de recursos, priorizando o plano gratuito.
---

# Proteção de custos

- Identificar o plano e os limites atuais antes de habilitar recursos pagos.
- Preferir Pages, Workers, D1, R2 e KV dentro das franquias gratuitas quando adequados.
- Não habilitar add-ons, planos pagos, Argo, imagens pagas ou armazenamento adicional sem confirmação explícita.
- Aplicar cache, paginação, limites de upload, retenção e lifecycle de objetos quando suportados.
- Evitar polling agressivo, consultas D1 sem índice, listagens integrais de R2 e logs sem retenção definida.
- Sugerir alertas e limites quando a API oferecer suporte; nunca afirmar que um teto absoluto existe sem verificar.
- Antes de uma mudança com possível cobrança, informar serviço, motivo e risco de custo.

