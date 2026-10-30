# Cidade ON — Dashboard GA4 + Search Console (Vercel)

Projeto Next.js com Google Analytics 4 (Web/AMP), Search Console (Pesquisa, Discover, Google Notícias), gráficos e filtros editoriais. Esta versão foi preparada para deployment **nativo na Vercel**.

## Publicar a partir do GitHub

1. Use o conteúdo desta pasta no repositório privado `pcarneiro07/cidadeon-dashboard` (branch `main`). Nunca publique `.env.local`, clientes OAuth ou arquivos de tokens.
2. Na Vercel, selecione **Add New → Project → Import Git Repository** e conecte `pcarneiro07/cidadeon-dashboard`.
3. Framework preset: **Next.js**. Root Directory: a pasta que contém `package.json` (normalmente `/`). Build Command: `npm run build`.
4. Em **Settings → Environment Variables**, cadastre como **Secret** e para **Production** (e Preview apenas se desejar):

   - `GA4_OAUTH_JSON` = `{"client_id":"...","client_secret":"...","refresh_token":"..."}` (conta autorizada no GA4).
   - `GSC_OAUTH_JSON` = `{"client_id":"...","client_secret":"...","refresh_token":"..."}` (conta autorizada no Search Console).

   Não utilize o prefixo `NEXT_PUBLIC_` nesses nomes. O projeto já possui os IDs GA4 padrão. Só crie `GA4_WEB_PROPERTY_ID` e `GA4_AMP_PROPERTY_ID` se precisar alterá-los.
5. Clique **Deploy** (ou **Redeploy** após adicionar as variáveis).
6. Teste `/api/health` e, na interface, as abas GA4 e Search Console. Consulte os logs da Function `/api/analytics` se houver erro.

## Gerar os dois valores com os arquivos locais

Se você já tem `.env.local` com `GA4_CLIENT_SECRET_FILE`, `GA4_TOKEN_FILE` e `GSC_TOKEN_FILE`, na raiz do projeto, execute:

```powershell
.\deploy\copiar-secret-vercel.ps1 -Tipo GA4
# Cole no valor de GA4_OAUTH_JSON na Vercel.
.\deploy\copiar-secret-vercel.ps1 -Tipo GSC
# Cole no valor de GSC_OAUTH_JSON na Vercel.
```

Caso o arquivo do Search Console não seja indicado no `.env.local`, use `-TokenFile 'C:\caminho\token-gsc.json'`. O script **não imprime as credenciais** nem as grava em novos arquivos; apenas copia temporariamente o JSON resultante para a área de transferência. Evite capturas de tela que exponham segredos. Limpe o clipboard ao terminar (`'ok' | Set-Clipboard`).

Se estiver usando a pasta do **projeto original local**, e não o ZIP Vercel, copie os caminhos desse `.env.local` (não os valores das credenciais) para seu arquivo local para executar o script.

## Ambiente local

O `lib/auth.ts` também aceita o modelo antigo com arquivos JSON em `.env.local`. Nesse modo, não é preciso configurar `GA4_OAUTH_JSON` nem `GSC_OAUTH_JSON`.

```powershell
npm install
npm run typecheck
npm run test
npm run dev
```

## Limites importantes

- Se o OAuth app Google estiver em modo **Testing**, o refresh token pode expirar rapidamente; considere publicar o OAuth Consent Screen em modo Production conforme as políticas do Google, ou utilizar um cliente corporativo autorizado.
- As contas associadas aos refresh tokens devem ter acesso às propriedades Google correspondentes e aos escopos `analytics.readonly` / `webmasters.readonly`.
- A Vercel não preserva automaticamente um cache em memória entre instâncias; consultas extensas podem levar tempo, consumir cota do Google e atingir limites da Function. Revise a estratégia de cache quando aumentar o tráfego.
- O portal analítico pode conter dados corporativos sensíveis. **Habilite Deployment Protection / Vercel Authentication ou controle de acesso apropriado antes de divulgar o endereço.** Salvar os Google secrets protege o acesso Google no backend, mas NÃO impede que terceiros visitem o dashboard publicado.
- D-1 continua conforme as regras do dashboard. Os dados do Search Console podem estar preliminares ou atrasados.

## Arquivos e decisões

- `lib/auth.ts`: usa prioritariamente os 2 secrets de ambiente, renova o token OAuth2 no servidor e mantém compatibilidade local.
- `app/api/analytics/route.ts`: executa as consultas do servidor.
- `components/`: mantém o dashboard original, incluindo a última correção das matérias/editorias.
- `next.config.ts`: volta ao build Next.js normal compatível com Vercel.
- O pacote não inclui `app.yml`, SQL, containers ou credenciais do Snowflake.
