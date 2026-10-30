-- MODELO: NÃO EXECUTAR SEM SUBSTITUIR PLACEHOLDERS NO AMBIENTE SEGURO.
-- A integração da conta e os tokens devem ser configurados por pessoa autorizada.
-- Não inclua credenciais no repositório, no ZIP, em chats ou em logs.
-- Os tokens do seu notebook precisam ter os escopos OAuth correspondentes.
-- GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET vêm do ga4_oauth_client.json existente.
-- Os valores REFRESH_TOKEN vêm de cada token local, sob autorização apropriada.

-- ETAPA 1: admin/integrador (somente uma vez):
CREATE SECURITY INTEGRATION CIDADEON_GOOGLE_AUTH
  TYPE = API_AUTHENTICATION
  AUTH_TYPE = OAUTH2
  ENABLED = TRUE
  OAUTH_CLIENT_AUTH_METHOD = CLIENT_SECRET_POST
  OAUTH_GRANT = 'AUTHORIZATION_CODE'
  OAUTH_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
  OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
  OAUTH_CLIENT_ID = '<GOOGLE_CLIENT_ID>'
  OAUTH_CLIENT_SECRET = '<GOOGLE_CLIENT_SECRET>';

-- ETAPA 2: no schema DEV (privilégio CREATE SECRET):
CREATE SECRET YOUTUBE_EPTV.DEV.CIDADEON_GA4_OAUTH
  TYPE = OAUTH2
  API_AUTHENTICATION = CIDADEON_GOOGLE_AUTH
  OAUTH_REFRESH_TOKEN = '<GA4_REFRESH_TOKEN>';

CREATE SECRET YOUTUBE_EPTV.DEV.CIDADEON_GSC_OAUTH
  TYPE = OAUTH2
  API_AUTHENTICATION = CIDADEON_GOOGLE_AUTH
  OAUTH_REFRESH_TOKEN = '<GSC_REFRESH_TOKEN>';

-- ETAPA 3: permissão de leitura dos secrets pela role de deploy:
GRANT USAGE ON SECRET YOUTUBE_EPTV.DEV.CIDADEON_GA4_OAUTH TO ROLE RL_YOUTUBE_DEV;
GRANT USAGE ON SECRET YOUTUBE_EPTV.DEV.CIDADEON_GSC_OAUTH TO ROLE RL_YOUTUBE_DEV;

-- ETAPA 4: executar 01-preparar-rede.sql (após a criação dos secrets).
-- OBS: é possível que a política corporativa exija um app OAuth de servidor,
-- em vez do cliente desktop, ou emissão de novos refresh tokens com consentimento.
