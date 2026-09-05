# RochaTech Starter

Base para novos projetos: React + TypeScript + Vite + PWA + Cloudflare Workers.

- GitHub é somente a fonte/versionamento; não há GitHub Actions.
- Build e deploy são feitos pela Cloudflare.
- D1 guarda dados estruturados e referências de arquivos.
- R2 guarda mídia por `workspace/user`, quando estiver habilitado.
- KV é usado apenas para cache/configurações efêmeras.
- Nunca reutilize banco ou bucket entre clientes sem isolamento por tenant e RBAC.

Ao criar um projeto, substitua `PROJECT_SLUG`, nome, cores e ícones; crie recursos Cloudflare exclusivos somente quando necessários.
