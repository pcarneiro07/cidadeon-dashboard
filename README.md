# Cidade ON — Snowflake App Runtime

Este projeto publica um novo Application Service `YOUTUBE_EPTV.DEV.CIDADEON_DASHBOARD`.
Ele **não** modifica `ACIDADEON_INTELLIGENCE`.

Leia `DEPLOY_SNOWFLAKE.md` antes de publicar.

Local (usa `.env.local` já configurado):

```powershell
npm install
npm run typecheck
npm run test
npm run dev
```

Publicação (somente após criar os Secrets OAuth2 e a External Access Integration):

```powershell
snow app validate --connection acidadeon
snow app deploy --connection acidadeon
snow app open --connection acidadeon --print-only
```

Atualização via GA4 e GSC. As credenciais locais não entram no ZIP nem no build.
