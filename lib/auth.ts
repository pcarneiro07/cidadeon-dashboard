import fs from 'node:fs';
import path from 'node:path';
import { OAuth2Client } from 'google-auth-library';

type GoogleKind = 'ga4' | 'gsc';
const localTokenCache: Partial<Record<GoogleKind, { token: string; until: number }>> = {};

function loadJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('Credencial OAuth local ausente ou ilegível. Confira o arquivo .env.local.');
  }
}

/**
 * No Snowpark Container Services, o Snowflake gerencia OAuth2 e atualiza
 * os arquivos access_token montados no contêiner. Lemos a cada solicitação
 * para evitar manter um token expirado em memória.
 * Localmente, mantemos a renovação OAuth anterior usando refresh_token.
 */
export async function googleToken(kind: GoogleKind): Promise<string> {
  const mountedFile = kind === 'ga4'
    ? process.env.SNOWFLAKE_GA4_ACCESS_TOKEN_FILE
    : process.env.SNOWFLAKE_GSC_ACCESS_TOKEN_FILE;
  if (mountedFile) {
    try {
      const token = fs.readFileSync(mountedFile, 'utf8').trim();
      if (!token) throw new Error('token vazio');
      return token;
    } catch {
      throw new Error(`Secret OAuth2 ${kind.toUpperCase()} indisponível no contêiner Snowflake. Confira o mount e a autorização.`);
    }
  }

  if (localTokenCache[kind]?.until && localTokenCache[kind]!.until > Date.now() + 60_000) {
    return localTokenCache[kind]!.token;
  }
  const tokenPath = kind === 'ga4' ? process.env.GA4_TOKEN_FILE : process.env.GSC_TOKEN_FILE;
  const clientPath = process.env.GA4_CLIENT_SECRET_FILE;
  if (!tokenPath) throw new Error(`${kind.toUpperCase()}_TOKEN_FILE não definido.`);
  const client = clientPath ? loadJson(clientPath) : {};
  const clientConfig = (client.installed || client.web || client) as Record<string, unknown>;
  const savedToken = loadJson(tokenPath);
  const clientId = String(clientConfig.client_id || savedToken.client_id || '');
  const clientSecret = String(clientConfig.client_secret || savedToken.client_secret || '');
  const refreshToken = String(savedToken.refresh_token || '');
  if (!clientId || !clientSecret || !refreshToken) throw new Error(`Credenciais locais ${kind.toUpperCase()} incompletas.`);
  const oauth = new OAuth2Client(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  const result = await oauth.getAccessToken();
  if (!result.token) throw new Error(`Google não retornou token ${kind.toUpperCase()}.`);
  localTokenCache[kind] = { token: result.token, until: Date.now() + 45 * 60_000 };
  return result.token;
}

export async function googlePost(kind: GoogleKind, url: string, body: unknown): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    // Lê novamente em cada tentativa: o Snowflake pode ter rotacionado o token.
    const token = await googleToken(kind);
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(70_000),
      cache: 'no-store',
    });
    if (response.ok) return response.json();
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 800 * 2 ** attempt));
      continue;
    }
    if (response.status === 401 && attempt < 2 && (
      process.env.SNOWFLAKE_GA4_ACCESS_TOKEN_FILE || process.env.SNOWFLAKE_GSC_ACCESS_TOKEN_FILE
    )) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      continue;
    }
    if (response.status === 403) throw new Error(`${kind.toUpperCase()}: acesso negado (403). Confira permissões da propriedade e escopos OAuth2.`);
    if (response.status === 401) throw new Error(`${kind.toUpperCase()}: acesso OAuth2 expirado ou inválido (401). Confira o Secret no Snowflake.`);
    let message = '';
    try { message = String((await response.json())?.error?.message || '').slice(0, 180); } catch {}
    throw new Error(`${kind.toUpperCase()}: HTTP ${response.status}${message ? ` — ${message}` : ''}`);
  }
  throw new Error(`${kind.toUpperCase()}: erro temporário nas consultas Google.`);
}
