---
name: data-platform
description: Projetar e administrar D1, R2, KV, Queues e Durable Objects para aplicações RochaTech seguras e multi-tenant.
---

# Plataforma de dados

- D1: guardar dados estruturados, usar migrations versionadas, índices e consultas parametrizadas.
- R2: guardar arquivos e mídia; organizar chaves por tenant e usuário; manter metadados no D1.
- KV: usar para configuração e cache eventual, não como banco transacional.
- Queues: usar para tarefas assíncronas, retries controlados e processamento pesado.
- Durable Objects: usar quando coordenação, estado consistente ou sessões em tempo real exigirem afinidade.
- Validar autenticação e autorização no Worker; nunca confiar apenas no frontend.
- Aplicar RBAC, trilha de auditoria, limites de tamanho e tipo de arquivo e isolamento de dados.
- Planejar backup, exportação e restauração antes de mudanças de esquema relevantes.

