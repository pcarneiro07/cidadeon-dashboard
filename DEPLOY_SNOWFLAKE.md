# Cidade ON — Publicar com Snowflake App Runtime

## Identidade conhecida da publicação anterior

- Organização `ALLZKFS`, conta `CNA35065`, conexão Snowflake CLI `acidadeon`.
- Role `RL_YOUTUBE_DEV`, database `YOUTUBE_EPTV`, schema `DEV`, warehouse `YOUTUBE_EPTV_WH`.
- Aplicativo antigo **intocado**: `YOUTUBE_EPTV.DEV.ACIDADEON_INTELLIGENCE`.
- Serviço **novo**: `YOUTUBE_EPTV.DEV.CIDADEON_DASHBOARD`.

## Por que este pacote não usa Docker

A publicação anterior utilizou **Snowflake App Runtime**, que gerencia o build e a execução do Next.js por meio do SPCS. O manifesto atual é `app.yml` v2. O arquivo declara `auto_suspend_secs: 600`, mantendo auto-resume; a suspensão não elimina cobrança dos períodos efetivamente ativos.

## ETAPA 1 — preparar OAuth2 e acesso externo

Esta é a **única etapa que depende de configuração administrativa**. Seus tokens locais do Google não são transferidos automaticamente para o Snowflake. Precisamos de:

1. Integração de segurança `CIDADEON_GOOGLE_AUTH` com o cliente OAuth da EPTV.
2. Secrets `YOUTUBE_EPTV.DEV.CIDADEON_GA4_OAUTH` e `...CIDADEON_GSC_OAUTH` com seus refresh tokens distintos.
3. Network Rule `CIDADEON_GOOGLE_EGRESS` e External Access Integration `CIDADEON_GOOGLE_EAI` (com `USAGE` para `RL_YOUTUBE_DEV`).

Os modelos estão em `deploy/02-oauth2-secrets.template.sql` e `deploy/01-preparar-rede.sql`. Execute o arquivo **02 primeiro**, depois **01**. As credenciais devem ser tratadas em ambiente administrativo seguro, nunca incluídas em código ou enviadas por chat. Verifique se a política da empresa permite reutilizar o OAuth client desktop. É possível que seja necessário criar um OAuth client específico para serviço e reautorizar o Google.

**Permissões:** criar integrações de segurança e EAI costuma exigir papel administrativo; a capacidade anterior de publicar apps não garante esses privilégios. Não sobrescreva nenhum segredo/integração existente.

**Escopos:** GA4 `https://www.googleapis.com/auth/analytics.readonly`; GSC `https://www.googleapis.com/auth/webmasters.readonly`. O token GSC deve ter acesso às propriedades de `acidadeon.com`.

**Segredos:** App Runtime monta `/secrets/CIDADEON_GA4_OAUTH/access_token` e `/secrets/CIDADEON_GSC_OAUTH/access_token`; Snowflake renova e gira os access tokens. `lib/auth.ts` os lê em runtime a cada consulta. Em execução local, continuam válidos os caminhos `.env.local` da versão antiga.

## ETAPA 2 — publicar do Windows

Na pasta com `app.yml`:

```powershell
# Exemplo: se descompactou na pasta Downloads
cd "$env:USERPROFILE\Downloads\CidadeON_App_Runtime_Publicacao\cidadeon-dashboard"

# Usar a mesma instalação Snowflake CLI e conexão da publicação anterior.
snow helpers check-version
snow app validate --connection acidadeon
snow app deploy --connection acidadeon
snow app open --connection acidadeon --print-only
```

Ou execute `./deploy/publicar.ps1` para validar e pedir confirmação explícita antes de publicar.

**Importante:** o `snow app deploy` roda três fases (upload, remote build e deploy), criando um serviço separado. Se o build já terminar e apenas o deploy falhar, use `snow app deploy --promote-only --connection acidadeon` após resolver a causa. Não execute `snow app teardown` no app antigo.

## ETAPA 3 — validar no Snowflake

- Abra a URL impressa pelo CLI (login Snowflake necessário).
- Abra `/api/health` para confirmar que o serviço está online.
- Confira GA4 Web, GA4 AMP, Search Console Pesquisa, Discover e Notícias.
- Compare um intervalo fixo com os dados do dashboard local, incluindo uma editoria específica como Campinas/Cotidiano.
- Se Google retornar 403, conferir escopos/permissões; se falhar por DNS/rede, conferir EAI; se os assets CSS não carregarem, confira o build `standalone` e a pasta `.next/static`.

### Suporte

```powershell
snow app events --connection acidadeon
snow app open --connection acidadeon --print-only
```

## Conteúdo do pacote

- App Next.js original, com suas abas GA4 e Search Console preservadas.
- Correção das matérias/editorias de Campinas e Piracicaba, já incorporada à fonte deste pacote.
- `app.yml` v2 com secrets, network, install/build/run e suspensão automática.
- `deploy/02-oauth2-secrets.template.sql` e `deploy/01-preparar-rede.sql`.
- `deploy/publicar.ps1` e `deploy/03-verificar.sql`.

## O que ainda não foi validado remotamente

Sem acesso à conta Snowflake e às credenciais Google do seu computador, ainda não é possível confirmar o build remoto, os segredos instalados e o funcionamento do endpoint. O ZIP não contém tokens nem senhas. 
