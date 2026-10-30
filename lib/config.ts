import type { Scope, Surface } from './types';
export const SCOPE_LABELS: Record<Scope,string> = {
  geral: 'Cidade ON · Geral', campinas: 'Campinas + Piracicaba',
  ribeiraopreto: 'Ribeirão Preto', tudoep: 'Tudo EP'
};
export const SURFACE_LABELS: Record<Surface,string> = {
  web: 'Pesquisa Google', discover: 'Google Discover', googleNews: 'Google Notícias'
};
export const SITES: Record<Scope,string> = {
  geral: 'https://www.acidadeon.com/',
  // Campinas usa propriedade geral para incluir Piracicaba
  campinas: 'https://www.acidadeon.com/',
  ribeiraopreto: 'https://www.acidadeon.com/ribeiraopreto/',
  tudoep: 'https://www.acidadeon.com/tudoep/'
};
export const EDITORIAS = {
  todas: 'Todas as editorias', home: 'Home', cotidiano: 'Cotidiano', politica: 'Política',
  esportes: 'Esportes', economia: 'Economia', 'lazer-cultura': 'Lazer e cultura',
  agro: 'Agro', games: 'Games', cultura: 'Cultura / Tudo Cult',
  noticias: 'Tudo Notícias', receitas: 'Receitas', saude: 'Saúde',
  inovacao: 'Inovação', especiais: 'Especiais', 'viu-essa': 'Viu essa?'
} as const;
export type Editor = keyof typeof EDITORIAS;
const ROOTS: Record<Exclude<Scope,'geral'>, string[]> = {
  campinas: ['campinas','piracicaba'], ribeiraopreto: ['ribeiraopreto'], tudoep: ['tudoep']
};
const SLUGS: Record<Exclude<Editor, 'todas' | 'home'>, string[]> = {
  cotidiano:['cotidiano'], politica:['politica'], esportes:['esportes','tudo-esporte'],
  economia:['economia'], 'lazer-cultura':['lazer-e-cultura','lazer-cultura'],
  agro:['agro','tudo-agro'], games:['epgames','games'],
  cultura:['tudo-cult','cultura'], noticias:['tudo-noticias'],
  receitas:['receitas'], saude:['tudo-saude','saude'],
  inovacao:['inovacao'], especiais:['especiais'], 'viu-essa':['viu-essa']
};
export function pathRegex(scope: Scope, editor: Editor): string | null {
  if (scope === 'geral' && editor === 'todas') return null;
  const roots = scope === 'geral' ? ['campinas','piracicaba','ribeiraopreto','tudoep'] : ROOTS[scope];
  const root = `(?:${roots.join('|')})`;
  if (editor === 'todas') return `^/${root}(?:/|$)`;
  if (editor === 'home') return `^/${root}/?$`;
  if (editor === 'viu-essa') return `^/${root}/(?:tudo-cult/)?viu-essa(?:/|$)`;
  const slug = `(?:${SLUGS[editor].join('|')})`;
  return `^/${root}/${slug}(?:/|$)`;
}
export function pageRegex(scope: Scope, editor: Editor, platform: 'web'|'amp'|'both' = 'both'): string | null {
  const p = pathRegex(scope,editor);
  if (!p && platform === 'both') return null;
  const hostname = 'https?://(?:www\\.)?acidadeon\\.com';
  const raw = p ? p.replace(/^\^/,'') : '/.*';
  const prefix = `${hostname}${raw}`.replace(/\$$/,'');
  // GSC: substring regex is case-insensitive by convention for page filters using RE2.
  if (platform === 'amp') return `(?i)${prefix}.*(?:/amp/?(?:\\?.*)?$|\\?.*(?:^|&)amp=)`;
  if (platform === 'web') return `(?i)${prefix}`;
  return `(?i)${prefix}`;
}
export function dateSP(now = new Date(), daysBack = 0): string {
  const fmt = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
  const parts = Object.fromEntries(fmt.formatToParts(now).filter(x=>x.type !=='literal').map(x=>[x.type,x.value]));
  const d = new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)-daysBack));
  return d.toISOString().slice(0,10);
}
export function shiftDate(d: string, diff: number): string {
  const dt = new Date(`${d}T12:00:00Z`); dt.setUTCDate(dt.getUTCDate()+diff); return dt.toISOString().slice(0,10);
}
export function validateDate(s:string):boolean {return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+'T00:00:00Z'));}
