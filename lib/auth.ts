import fs from 'node:fs';
import path from 'node:path';
import { OAuth2Client } from 'google-auth-library';

type GoogleKind = 'ga4' | 'gsc';
type Credentials = { clientId: string; clientSecret: string; refreshToken: string };
type CachedToken = { token: string; until: number };

/** Cache por instância, sem persistir refresh tokens em disco. */
const tokenCache: Partial<Record<GoogleKind, CachedToken>> = {};

function readJson(file: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('objeto inválido');
    return value as Record<string, unknown>;
  } catch {
    throw new Error('Arquivo OAuth local não encontrado ou inválido. Confira os caminhos do .env.local.');
  }
}

function normalizeCredentials(raw: Record<string, unknown>, label: string): Credentials {
  const envelope = (raw.installed ?? raw.web ?? raw) as Record<string, unknown>;
  const clientId = typeof envelope?.client_id === 'string' ? envelope.client_id : '';
  const clientSecret = typeof envelope?.client_secret === 'string' ? envelope.client_secret : '';
  const refreshToken = typeof raw.refresh_token === 'string' ? raw.refresh_token : '';

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`${label}: informe client_id, client_secret e refresh_token. Não inclua credenciais no repositório.`);
  }
  return { clientId, clientSecret, refreshToken };
}

function credentials(kind: GoogleKind): Credentials {
  // Na Vercel: duas variáveis do tipo Secret (server-only), uma por API.
  const envName = kind === 'ga4' ? 'GA4_OAUTH_JSON' : 'GSC_OAUTH_JSON';
  const secret = process.env[envName];
  if (secret) {
    try {
      const raw: unknown = JSON.parse(secret);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('formato inválido');
      return normalizeCredentials(raw as Record<string, unknown>, envName);
    } catch (error) {
      if (error instanceof Error && error.message.includes(envName)) throw error;
      throw new Error(`${envName} inválido. Cadastre um JSON com client_id, client_secret e refresh_token.`);
    }
  }

  // Mantém compatibilidade com os arquivos OAuth que já funcionam no notebook.
  const tokenFile = kind === 'ga4' ? process.env.GA4_TOKEN_FILE : process.env.GSC_TOKEN_FILE;
  const clientFile = process.env.GA4_CLIENT_SECRET_FILE;
  if (!tokenFile) throw new Error(`${envName} não configurado e arquivo OAuth local indisponível.`);
  const token = readJson(tokenFile);
  const client = clientFile ? readJson(clientFile) : {};
  const clientDetails = (client.installed ?? client.web ?? client) as Record<string, unknown>;
  return normalizeCredentials({
    client_id: clientDetails.client_id ?? token.client_id,
    client_secret: clientDetails.client_secret ?? token.client_secret,
    refresh_token: token.refresh_token,
  }, kind.toUpperCase());
}

export async function googleToken(kind: GoogleKind, forceRefresh = false): Promise<string> {
  const cached = tokenCache[kind];
  if (!forceRefresh && cached && cached.until > Date.now() + 60_000) return cached.token;

  const { clientId, clientSecret, refreshToken } = credentials(kind);
  const oauth = new OAuth2Client(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  try {
    const result = await oauth.getAccessToken();
    if (!result.token) throw new Error('token ausente');
    tokenCache[kind] = { token: result.token, until: Date.now() + 40 * 60_000 };
    return result.token;
  } catch {
    throw new Error(`${kind.toUpperCase()}: não foi possível renovar o acesso Google. Confira refresh token, escopos e status do cliente OAuth.`);
  }
}

/** POST apenas do lado do servidor, com uma repetição em 401 e retry controlado em 429/5xx. */
export async function googlePost(kind: GoogleKind, url: string, body: unknown): Promise<any> {
  // Impede encaminhar tokens para endpoints inesperados.
  const permittedHosts = kind === 'ga4'
    ? new Set(['analyticsdata.googleapis.com'])
    : new Set(['www.googleapis.com']);
  const target = new URL(url);
  if (target.protocol !== 'https:' || !permittedHosts.has(target.hostname)) {
    throw new Error(`Destino Google inesperado para ${kind.toUpperCase()}.`);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await googleToken(kind, attempt > 0);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(70_000),
        cache: 'no-store',
      });
    } catch {
      if (attempt < 2) continue;
      throw new Error(`${kind.toUpperCase()}: falha de rede ao consultar o Google.`);
    }

    if (response.ok) return response.json();
    if (response.status === 401 && attempt < 2) {
      delete tokenCache[kind];
      continue;
    }
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 800 * (2 ** attempt)));
      continue;
    }
    if (response.status === 401) throw new Error(`${kind.toUpperCase()}: OAuth2 inválido ou expirado (401).`);
    if (response.status === 403) throw new Error(`${kind.toUpperCase()}: acesso negado (403). Confira permissões e escopos.`);
    // Não repassar texto de erro bruto contendo possível informação sensível.
    throw new Error(`${kind.toUpperCase()}: API Google retornou HTTP ${response.status}.`);
  }
  throw new Error(`${kind.toUpperCase()}: a API Google não respondeu após as tentativas.`);
}
