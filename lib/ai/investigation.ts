import { googlePost } from '@/lib/auth';
import { dateSP, pageRegex, pathRegex, shiftDate, SCOPE_LABELS, SITES, type Editor } from '@/lib/config';
import type { Scope, Platform } from '@/lib/types';
import { buildDiagnosis, type Diagnosis } from './diagnosis';

export type CompareMode = 'anterior' | 'ano_anterior';
export type InvestigationInput = {
  question: string; scope: Scope; editor: Editor; platform: Platform;
  months: 1 | 2 | 3; compare: CompareMode;
};
export type Interval = { start: string; end: string; days: number };
export type Evidence = {
  id: string; fonte: string; indicador: string;
  atual: number | null; anterior: number | null;
  variacaoPercentual: number | null;
  unidade: 'quantidade' | 'taxa'; observacao?: string;
};
export type Ranked = {
  label: string; actual: number; before: number; delta: number;
  url?: string;
  // Com cobertura limitada (TOP-N), a ausência de uma URL num dos períodos NÃO é zero.
  cobertura?: 'comparavel' | 'amostra';
};
export type AgentResult = {
  status: 'ok' | 'parcial' | 'erro'; agent: 'GA4' | 'Search Console';
  metrics: Evidence[]; channels?: Ranked[]; articles?: Ranked[];
  editorials?: Ranked[]; warnings: string[];
};
export type Investigation = {
  title: string; filterLabel: string; current: Interval; previous: Interval;
  comparison: CompareMode; collectedAt: string;
  evidence: Evidence[]; channels: Ranked[]; articles: Ranked[];
  editorials: Ranked[]; diagnosis: Diagnosis;
  warnings: string[]; agents: AgentResult[];
};

type Period = { start: string; end: string };
type GAPlatform = 'web' | 'amp';
type GAKey = 'screenPageViews' | 'sessions' | 'engagedSessions' | 'activeUsers';
const GA_IDS = {
  web: process.env.GA4_WEB_PROPERTY_ID || '326427533',
  amp: process.env.GA4_AMP_PROPERTY_ID || '410193156',
};
const value = (input: unknown): number => {
  const n = Number(input ?? 0); return Number.isFinite(n) ? n : 0;
};
const monthStart = (year: number, monthIndex: number): string => new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
const dayCount = (p: Period) => Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86400000) + 1;

export function periods(months: 1 | 2 | 3, compare: CompareMode, today = dateSP()): { current: Interval; previous: Interval } {
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  // Durante os primeiros quatro dias do mês, não usar o mês recém-fechado:
  // é uma janela conservadora para evitar comparar dados GSC ainda em consolidação.
  const anchor = monthStart(todayYear, todayMonth - 1 - (todayDay <= 4 ? 1 : 0));
  const [year, month] = anchor.split('-').map(Number);
  const currentStart = monthStart(year, month - 1 - months);
  const currentEnd = shiftDate(anchor, -1);
  const previousStart = compare === 'anterior' ? monthStart(year, month - 1 - months * 2) : monthStart(year - 1, month - 1 - months);
  const previousEnd = compare === 'anterior' ? shiftDate(currentStart, -1) : shiftDate(monthStart(year - 1, month - 1), -1);
  return {
    current: { start: currentStart, end: currentEnd, days: dayCount({ start: currentStart, end: currentEnd }) },
    previous: { start: previousStart, end: previousEnd, days: dayCount({ start: previousStart, end: previousEnd }) },
  };
}

export function variation(actual: number | null, before: number | null): number | null {
  if (actual === null || before === null || before === 0) return null;
  return (actual / before - 1) * 100;
}
export function makeEvidence(id: string, fonte: string, indicador: string, atual: number | null, anterior: number | null, unidade: Evidence['unidade'] = 'quantidade', observacao?: string): Evidence {
  return { id, fonte, indicador, atual, anterior, variacaoPercentual: variation(atual, anterior), unidade, observacao };
}
// Rankings de URLs são amostras das maiores páginas, NUNCA decomposição do total.
// A ausência num TOP-N não representa valor zero. Retornar apenas interseção.
export function joinRanks(actual: Ranked[], previous: Ranked[], limit = 12): Ranked[] {
  const old = new Map(previous.map(x => [x.label, x]));
  return actual.flatMap(item => {
    const prior = old.get(item.label);
    return prior ? [{ ...item, before: prior.actual, delta: item.actual - prior.actual, url: item.url ?? prior.url, cobertura: 'amostra' as const }] : [];
  }).sort((a, b) => a.delta - b.delta).slice(0, limit);
}
function mergeRanks(lists: Ranked[][]): Ranked[] {
  const out = new Map<string, Ranked>();
  for (const item of lists.flat()) {
    const previous = out.get(item.label);
    out.set(item.label, { label: item.label, actual: (previous?.actual ?? 0) + item.actual, before: 0, delta: 0, url: item.url });
  }
  return [...out.values()];
}
function gaFilter(input: InvestigationInput): unknown {
  const pattern = pathRegex(input.scope, input.editor);
  if (!pattern) return undefined;
  const regex = input.editor === 'home' ? pattern : `${pattern}.*`;
  return { filter: { fieldName: 'unifiedPagePathScreen', stringFilter: { matchType: 'FULL_REGEXP', value: regex, caseSensitive: false } } };
}
async function gaReport(platform: GAPlatform, period: Period, input: InvestigationInput, dimensions: string[], metrics: string[], limit: number): Promise<any> {
  return googlePost('ga4', `https://analyticsdata.googleapis.com/v1beta/properties/${GA_IDS[platform]}:runReport`, {
    dateRanges: [{ startDate: period.start, endDate: period.end }],
    ...(dimensions.length ? { dimensions: dimensions.map(name => ({ name })) } : {}),
    metrics: metrics.map(name => ({ name })),
    ...(gaFilter(input) ? { dimensionFilter: gaFilter(input) } : {}),
    ...(dimensions.length ? { orderBys: [{ metric: { metricName: metrics[0] }, desc: true }] } : {}),
    limit: String(limit), keepEmptyRows: false,
  });
}
function gaMetric(body: any, names: GAKey[]): Record<GAKey, number> {
  const row = body.rows?.[0];
  return Object.fromEntries(names.map((name, i) => [name, value(row?.metricValues?.[i]?.value)])) as Record<GAKey, number>;
}
function gaRows(body: any): Ranked[] {
  return (body.rows ?? []).map((r: any) => ({
    label: String(r.dimensionValues?.[0]?.value ?? ''),
    actual: value(r.metricValues?.[0]?.value), before: 0, delta: 0,
  })).filter((r: Ranked) => r.label && r.label !== '(not set)');
}
function contentPage(p: string): boolean {
  return p.split('?')[0].split('/').filter(Boolean).filter(x => x !== 'amp').length >= 3;
}

type EditorialTarget = { label: string; scope: Scope; editor: Editor };
function editorialTargets(input: InvestigationInput): EditorialTarget[] {
  if (input.editor !== 'todas') return [];
  if (input.scope === 'geral') return [
    { label: 'Campinas + Piracicaba', scope: 'campinas', editor: 'todas' },
    { label: 'Ribeirão Preto', scope: 'ribeiraopreto', editor: 'todas' },
    { label: 'Tudo EP', scope: 'tudoep', editor: 'todas' },
  ];
  const editors: Editor[] = input.scope === 'tudoep'
    ? ['noticias', 'agro', 'cultura', 'esportes', 'saude', 'games']
    : ['cotidiano', 'politica', 'esportes', 'economia', 'lazer-cultura', 'home'];
  const labels: Record<Editor, string> = {
    todas: 'Todas', home: 'Home', cotidiano: 'Cotidiano', politica: 'Política', esportes: 'Esportes',
    economia: 'Economia', 'lazer-cultura': 'Lazer e cultura', agro: 'Agro', games: 'Games',
    cultura: 'Cultura', noticias: 'Tudo Notícias', receitas: 'Receitas', saude: 'Saúde',
    inovacao: 'Inovação', especiais: 'Especiais', 'viu-essa': 'Viu essa?',
  };
  return editors.map(editor => ({ label: labels[editor], scope: input.scope, editor }));
}
async function gaEditorialReport(platform: GAPlatform, period: Period, input: InvestigationInput, targets: EditorialTarget[]): Promise<Map<string, number>> {
  const results = await Promise.allSettled(targets.map(async target => {
    const { screenPageViews } = gaMetric(await gaReport(platform, period, { ...input, scope: target.scope, editor: target.editor }, [], ['screenPageViews'], 1), ['screenPageViews']);
    return { label: target.label, views: screenPageViews };
  }));
  return new Map(results.flatMap(result => result.status === 'fulfilled' ? [[result.value.label, result.value.views] as const] : []));
}
export async function ga4Agent(input: InvestigationInput, current: Period, previous: Period): Promise<AgentResult> {
  const platforms: GAPlatform[] = input.platform === 'both' ? ['web', 'amp'] : [input.platform];
  const metrics: GAKey[] = ['screenPageViews', 'sessions', 'engagedSessions', 'activeUsers'];
  const warnings: string[] = [];
  const run = async (period: Period) => {
    const settled = await Promise.allSettled(platforms.map(async platform => {
      const total = await gaReport(platform, period, input, [], metrics, 1);
      const [channels, pages] = await Promise.allSettled([
        gaReport(platform, period, input, ['sessionDefaultChannelGroup'], ['sessions'], 40),
        gaReport(platform, period, input, ['unifiedPagePathScreen'], ['screenPageViews'], 250),
      ]);
      if (channels.status !== 'fulfilled') warnings.push(`GA4 ${platform}: canais indisponíveis em ${period.start}–${period.end}.`);
      if (pages.status !== 'fulfilled') warnings.push(`GA4 ${platform}: amostra de páginas indisponível em ${period.start}–${period.end}.`);
      return {
        platform, totals: gaMetric(total, metrics),
        channels: channels.status === 'fulfilled' ? gaRows(channels.value) : null,
        pages: pages.status === 'fulfilled' ? gaRows(pages.value).filter(r => contentPage(r.label)) : null,
      };
    }));
    return settled.flatMap((result, i) => {
      if (result.status === 'fulfilled') return [result.value];
      warnings.push(`GA4 ${platforms[i]}: totais não disponíveis em ${period.start}–${period.end}.`);
      return [];
    });
  };
  const [now, prior] = await Promise.all([run(current), run(previous)]);
  if (now.length !== platforms.length || prior.length !== platforms.length ||
    !platforms.every(platform => now.some(x => x.platform === platform) && prior.some(x => x.platform === platform))) {
    return { agent: 'GA4', status: 'erro', metrics: [], warnings: [...warnings, 'GA4: falta uma propriedade em um dos períodos.'] };
  }
  const sum = (rows: typeof now, key: GAKey): number => rows.reduce((total, row) => total + row.totals[key], 0);
  const viewsA = sum(now, 'screenPageViews'), viewsB = sum(prior, 'screenPageViews');
  const sessionsA = sum(now, 'sessions'), sessionsB = sum(prior, 'sessions');
  const engagedA = sum(now, 'engagedSessions'), engagedB = sum(prior, 'engagedSessions');
  const metricEvidence: Evidence[] = [
    makeEvidence('GA1', 'GA4', 'Visualizações', viewsA, viewsB),
    makeEvidence('GA2', 'GA4', 'Visualizações por dia', viewsA / dayCount(current), viewsB / dayCount(previous), 'quantidade', 'Média diária; períodos de tamanhos diferentes.'),
    makeEvidence('GA3', 'GA4', 'Sessões', sessionsA, sessionsB),
    makeEvidence('GA4', 'GA4', 'Sessões engajadas', engagedA, engagedB),
    makeEvidence('GA5', 'GA4', 'Taxa de engajamento', sessionsA ? engagedA / sessionsA : null, sessionsB ? engagedB / sessionsB : null, 'taxa'),
    makeEvidence('GA6', 'GA4', 'Usuários ativos', platforms.length === 1 ? now[0].totals.activeUsers : null, platforms.length === 1 ? prior[0].totals.activeUsers : null, 'quantidade', 'Usuários distintos não são somados entre Web e AMP.'),
    makeEvidence('GA7', 'GA4', 'Sessões por dia', sessionsA / dayCount(current), sessionsB / dayCount(previous), 'quantidade'),
  ];
  const channelsAreComplete = [...now, ...prior].every(x => x.channels !== null);
  const pagesAreComplete = [...now, ...prior].every(x => x.pages !== null);
  const channels = channelsAreComplete ? joinRanks(mergeRanks(now.map(x => x.channels!)), mergeRanks(prior.map(x => x.channels!)), 35) : [];
  // Os canais vêm de relatório agrupado por canal. Se houver truncamento em algum período,
  // não contabilizar ausências como zeros e não alegar cobertura de toda a perda.
  if (channelsAreComplete) {
    for (let i = 0; i < channels.length; i++) {
      metricEvidence.push(makeEvidence(`CH${i + 1}`, 'GA4 · canal (sessões)', channels[i].label, channels[i].actual, channels[i].before));
    }
  }
  const articles = pagesAreComplete ? joinRanks(mergeRanks(now.map(x => x.pages!)), mergeRanks(prior.map(x => x.pages!)), 12) : [];
  const targets = editorialTargets(input);
  let editorials: Ranked[] = [];
  if (targets.length) {
    const periodResults = await Promise.allSettled([
      Promise.all(platforms.map(platform => gaEditorialReport(platform, current, input, targets))),
      Promise.all(platforms.map(platform => gaEditorialReport(platform, previous, input, targets))),
    ]);
    if (periodResults.every(x => x.status === 'fulfilled')) {
      const currentMaps = (periodResults[0] as PromiseFulfilledResult<Map<string, number>[]>).value;
      const previousMaps = (periodResults[1] as PromiseFulfilledResult<Map<string, number>[]>).value;
      editorials = targets.flatMap(target => {
        if (!currentMaps.every(m => m.has(target.label)) || !previousMaps.every(m => m.has(target.label))) return [];
        const a = currentMaps.reduce((s, m) => s + m.get(target.label)!, 0);
        const b = previousMaps.reduce((s, m) => s + m.get(target.label)!, 0);
        return [{ label: target.label, actual: a, before: b, delta: a - b, cobertura: 'comparavel' as const }];
      }).sort((x, y) => x.delta - y.delta);
      editorials.forEach((x, i) => metricEvidence.push(makeEvidence(`ED${i + 1}`, 'GA4 · recorte editorial', `Visualizações · ${x.label}`, x.actual, x.before)));
      if (editorials.length !== targets.length) warnings.push('Alguns recortes editoriais não foram consultados; não extrapole o resultado para as editorias ausentes.');
    } else warnings.push('Recortes editoriais adicionais indisponíveis.');
  }
  if (!channelsAreComplete) warnings.push('Canais incompletos: não foi possível decompor a variação de sessões por origem.');
  if (!pagesAreComplete) warnings.push('Amostras de matérias incompletas: não usar ranking para explicar a queda geral.');
  return {
    agent: 'GA4', status: warnings.length ? 'parcial' : 'ok', metrics: metricEvidence,
    channels, articles, editorials,
    warnings: [...warnings, 'Rankings de URLs: TOP 250 por propriedade/período, apenas interseção comparável; NÃO são decomposição integral.'],
  };
}
function gscFilters(input: InvestigationInput): unknown[] {
  const filters: unknown[] = [];
  const expression = pageRegex(input.scope, input.editor);
  if (expression) filters.push({ dimension: 'page', operator: 'includingRegex', expression });
  if (input.platform === 'amp') filters.push({ dimension: 'page', operator: 'includingRegex', expression: '(?i)/amp/?(?:\\?.*)?$' });
  if (input.platform === 'web') filters.push({ dimension: 'page', operator: 'excludingRegex', expression: '(?i)/amp/?(?:\\?.*)?$' });
  return filters;
}
async function gscReport(input: InvestigationInput, period: Period, surface: 'web' | 'discover' | 'googleNews', pages = false): Promise<any> {
  const filters = gscFilters(input);
  return googlePost('gsc', `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITES[input.scope])}/searchAnalytics/query`, {
    startDate: period.start, endDate: period.end, type: surface,
    dimensions: pages ? ['page'] : [], rowLimit: pages ? 250 : 1, dataState: 'final',
    ...(filters.length ? { dimensionFilterGroups: [{ groupType: 'and', filters }] } : {}),
  });
}
export async function gscAgent(input: InvestigationInput, current: Period, previous: Period): Promise<AgentResult> {
  const warnings: string[] = [];
  const surfaces: Array<['web' | 'discover' | 'googleNews', string]> = [['web', 'Pesquisa Google'], ['discover', 'Discover'], ['googleNews', 'Google Notícias']];
  const result = await Promise.all(surfaces.map(async ([surface, label], index) => {
    try {
      const [a, b] = await Promise.all([gscReport(input, current, surface), gscReport(input, previous, surface)]);
      const [pagesA, pagesB] = await Promise.allSettled([gscReport(input, current, surface, true), gscReport(input, previous, surface, true)]);
      if (pagesA.status !== 'fulfilled' || pagesB.status !== 'fulfilled') warnings.push(`${label}: amostras de URLs indisponíveis; totais ainda válidos.`);
      const now = a.rows?.[0] ?? {}, prior = b.rows?.[0] ?? {};
      const clicksA = value(now.clicks), clicksB = value(prior.clicks);
      const impA = value(now.impressions), impB = value(prior.impressions);
      const rows = (body: any): Ranked[] => (body.rows ?? []).map((x: any) => ({
        label: String(x.keys?.[0] ?? ''), url: String(x.keys?.[0] ?? ''),
        actual: value(x.clicks), before: 0, delta: 0,
      }));
      const metricBase = index * 3 + 1;
      return {
        metrics: [
          makeEvidence(`SC${metricBase}`, label, 'Cliques', clicksA, clicksB),
          makeEvidence(`SC${metricBase + 1}`, label, 'Impressões', impA, impB),
          makeEvidence(`SC${metricBase + 2}`, label, 'CTR', impA ? clicksA / impA : null, impB ? clicksB / impB : null, 'taxa'),
          makeEvidence(`SD${index + 1}`, label, 'Cliques por dia', clicksA / dayCount(current), clicksB / dayCount(previous)),
        ],
        pages: pagesA.status === 'fulfilled' && pagesB.status === 'fulfilled'
          ? joinRanks(rows(pagesA.value), rows(pagesB.value), 6).map(item => ({ ...item, label: `${label}: ${item.label}` })) : [],
      };
    } catch {
      warnings.push(`${label}: não foi possível consultar dados consolidados.`); return null;
    }
  }));
  const valid = result.filter((x): x is NonNullable<typeof x> => x !== null);
  if (!valid.length) return { agent: 'Search Console', status: 'erro', metrics: [], warnings };
  return {
    agent: 'Search Console', status: warnings.length ? 'parcial' : 'ok',
    metrics: valid.flatMap(x => x.metrics),
    articles: valid.flatMap(x => x.pages).sort((a, b) => a.delta - b.delta).slice(0, 12),
    warnings: [...warnings,
      'Search Console consultado com dataState=final; períodos fechados evitam dados mais recentes não consolidados.',
      'Rankings: TOP 250 por superfície/período. Somente URLs presentes nos dois TOPs são comparáveis; não são uma decomposição total.',
      'Cliques e impressões GSC não equivalem a sessões e visualizações GA4.',
    ],
  };
}
export async function investigate(input: InvestigationInput): Promise<Investigation> {
  const range = periods(input.months, input.compare);
  const [ga, gsc] = await Promise.all([
    ga4Agent(input, range.current, range.previous).catch((): AgentResult => ({ agent: 'GA4', status: 'erro', metrics: [], warnings: ['Não foi possível consultar GA4.'] })),
    gscAgent(input, range.current, range.previous).catch((): AgentResult => ({ agent: 'Search Console', status: 'erro', metrics: [], warnings: ['Não foi possível consultar Search Console.'] })),
  ]);
  if (ga.status === 'erro' && gsc.status === 'erro') throw new Error('Não foi possível consultar GA4 ou Search Console. Confira OAuth e permissões.');
  const summary = {
    title: 'Diagnóstico investigativo do desempenho digital',
    filterLabel: `${SCOPE_LABELS[input.scope]} · ${input.editor} · ${input.platform.toUpperCase()}`,
    current: range.current, previous: range.previous, comparison: input.compare,
    collectedAt: new Date().toISOString(), evidence: [...ga.metrics, ...gsc.metrics],
    channels: ga.channels ?? [], articles: [...(ga.articles ?? []).slice(0, 10), ...(gsc.articles ?? []).slice(0, 10)],
    editorials: ga.editorials ?? [], warnings: [...ga.warnings, ...gsc.warnings], agents: [ga, gsc],
  };
  return { ...summary, diagnosis: buildDiagnosis(summary, input.question) };
}
