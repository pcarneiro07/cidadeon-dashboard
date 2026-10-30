import type { Evidence, Investigation, Ranked } from './investigation';

/**
 * Etapa determinística antes da OpenAI. Números e relações são calculados aqui.
 * A IA só interpreta estes sinais, sem autorização para inventar quantitativos.
 */
export type DiagnosticSignal = {
  id: string;
  titulo: string;
  fato: string;
  leitura: string;
  hipotese: string;
  verificacao: string;
  evidencias: string[];
  certeza: 'observação' | 'indício' | 'inconclusivo';
  prioridade: number;
};
export type Diagnosis = {
  tese: string;
  sinais: DiagnosticSignal[];
  lacunas: string[];
};
type Context = Pick<Investigation, 'evidence' | 'channels' | 'editorials' | 'current' | 'previous' | 'warnings' | 'agents'>;
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const pct = (n: number) => `${one.format(Math.abs(n))}%`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${integer.format(Math.abs(n))}`;
const change = (n: number | null) => n === null ? 'variação não calculável' : `${n < 0 ? 'queda' : n > 0 ? 'alta' : 'estabilidade'} de ${pct(n)}`;
const exact = (e: Evidence | undefined): e is Evidence => !!e && e.atual !== null && e.anterior !== null;
const factor = (id: string, titulo: string, fato: string, leitura: string, hipotese: string, verificacao: string, evidencias: string[], prioridade: number, certeza: DiagnosticSignal['certeza'] = 'observação'): DiagnosticSignal => ({
  id, titulo, fato, leitura, hipotese, verificacao, evidencias, prioridade, certeza,
});
const byId = (data: Context, id: string) => data.evidence.find(e => e.id === id);

/** Decomposição simétrica exata: Δcliques/dia = efeito de impressões/dia + efeito de CTR. */
export function decomposeClicks(impressionsA: number, clicksA: number, impressionsB: number, clicksB: number, daysA = 1, daysB = 1) {
  const ia = impressionsA / daysA, ib = impressionsB / daysB;
  const ca = clicksA / daysA, cb = clicksB / daysB;
  const ra = impressionsA > 0 ? clicksA / impressionsA : 0;
  const rb = impressionsB > 0 ? clicksB / impressionsB : 0;
  const volume = (ia - ib) * (ra + rb) / 2;
  const ctr = (ra - rb) * (ia + ib) / 2;
  return { volume, ctr, delta: ca - cb, atualPorDia: ca, anteriorPorDia: cb };
}
function firstDecline(data: Context, rows: Ranked[], unit: string, id: string, title: string, measure: 'GA3' | 'GA1', note: string): DiagnosticSignal | null {
  const normalized = rows.map(row => ({ ...row,
    perDayNow: row.actual / data.current.days,
    perDayBefore: row.before / data.previous.days,
    dailyDelta: row.actual / data.current.days - row.before / data.previous.days,
  }));
  const negative = normalized.filter(r => r.dailyDelta < 0);
  const largest = [...negative].sort((a, b) => a.dailyDelta - b.dailyDelta)[0];
  if (!largest) return null;
  const gross = negative.reduce((sum, r) => sum + Math.abs(r.dailyDelta), 0);
  const share = gross > 0 ? Math.abs(largest.dailyDelta) / gross * 100 : 0;
  const metric = byId(data, measure);
  const relation = metric && exact(metric) && metric.anterior! > metric.atual!
    ? `Este recorte concentra a maior redução de ${unit} POR DIA entre os recortes comparáveis. Há também perda total da métrica, mas o ranking não é uma decomposição integral.`
    : `Este recorte perdeu ${unit} POR DIA apesar de a métrica geral não necessariamente ter recuado.`;
  return factor(id, title,
    `${largest.label}: ${one.format(largest.perDayBefore)} → ${one.format(largest.perDayNow)} ${unit}/dia (${signed(largest.dailyDelta)} por dia); ${pct(share)} das perdas brutas ENTRE os recortes comparáveis consultados.`,
    relation,
    `Verificar se houve mudança de distribuição, calendário de publicação, pauta ou frequência em ${largest.label}.`,
    `Comparar evolução semanal, publicações e jornada de entrada de ${largest.label}. ${note}`,
    [measure], Math.min(98, 25 + share / 2), 'indício');
}

export function buildDiagnosis(data: Context, question = ''): Diagnosis {
  const result: DiagnosticSignal[] = [];
  const views = byId(data, 'GA2'), sessions = byId(data, 'GA7'), engagement = byId(data, 'GA5');
  if (exact(views) && exact(sessions)) {
    const v = views.variacaoPercentual, s = sessions.variacaoPercentual;
    const sameDirection = v !== null && s !== null && Math.sign(v) === Math.sign(s);
    result.push(factor('D1', 'A direção da audiência',
      `Média diária de visualizações: ${integer.format(views.anterior!)} → ${integer.format(views.atual!)} (${change(v)}). Sessões/dia: ${integer.format(sessions.anterior!)} → ${integer.format(sessions.atual!)} (${change(s)}).`,
      sameDirection
        ? (v !== null && v < 0 ? 'As duas métricas recuam juntas: o problema não se resume a menos páginas por sessão; há perda de volume de consumo e de visitas.' : 'As duas métricas avançam juntas: a premissa de queda generalizada não é confirmada para este recorte.')
        : 'Visualizações e sessões caminham de forma diferente; investigar profundidade de navegação e composição do tráfego antes de concluir que há menos audiência.',
      'Mudanças na distribuição e na disponibilidade de conteúdos são hipóteses, não causas demonstradas.',
      'Comparar canais de entrada e editorias; depois verificar calendário, frequência, tipos de matéria e tráfego por URL.',
      ['GA2', 'GA7'], 85));
  } else if (exact(views)) {
    result.push(factor('D1', 'Mudança nas visualizações',
      `Média diária de visualizações: ${integer.format(views.anterior!)} → ${integer.format(views.atual!)} (${change(views.variacaoPercentual)}).`,
      'Esta é a mudança mensurada no GA4. Sessões não estão disponíveis para uma comparação cruzada.',
      'Investigar distribuição e consumo por conteúdo.', 'Recuperar as sessões e o detalhamento de canais.', ['GA2'], 65));
  }
  if (data.channels.length) {
    const channel = firstDecline(data, data.channels, 'sessões', 'D2', 'Onde as sessões foram perdidas', 'GA3', 'A comparação cobre apenas canais presentes nos dois relatórios.');
    if (channel) {
      // Rastrear também a linha específica no relatório de evidências.
      const label = [...data.channels].filter(x => x.delta < 0).sort((a, b) => a.delta - b.delta)[0]?.label;
      const e = data.evidence.find(x => x.fonte === 'GA4 · canal (sessões)' && x.indicador === label);
      if (e) channel.evidencias.push(e.id);
      result.push(channel);
    }
  }
  if (data.editorials.length) {
    const section = firstDecline(data, data.editorials, 'visualizações', 'D3', 'Onde a produção perdeu consumo', 'GA1', 'As editorias/frentes consultadas não representam necessariamente o total da propriedade.');
    if (section) {
      const label = [...data.editorials].filter(x => x.delta < 0).sort((a, b) => a.delta - b.delta)[0]?.label;
      const e = data.evidence.find(x => x.fonte === 'GA4 · recorte editorial' && x.indicador.endsWith(`· ${label}`));
      if (e) section.evidencias.push(e.id);
      result.push(section);
    }
  }
  const available: Array<{label: string; id: number; metric: Evidence; imp: Evidence; ctr: Evidence}> = [];
  for (const [index, label] of ['Pesquisa Google', 'Discover', 'Google Notícias'].entries()) {
    const clicks = byId(data, `SC${index * 3 + 1}`), imp = byId(data, `SC${index * 3 + 2}`), ctr = byId(data, `SC${index * 3 + 3}`);
    if (exact(clicks) && exact(imp) && exact(ctr)) available.push({ label, id: index, metric: clicks, imp, ctr });
  }
  const scoped = /discover/i.test(question) ? available.filter(x => x.id === 1) : /not[ií]cias|google news/i.test(question) ? available.filter(x => x.id === 2) : /pesquisa|search|seo/i.test(question) ? available.filter(x => x.id === 0) : available;
  const worsening = [...scoped].sort((a, b) => {
    const changeA = a.metric.atual! / data.current.days - a.metric.anterior! / data.previous.days;
    const changeB = b.metric.atual! / data.current.days - b.metric.anterior! / data.previous.days;
    return changeA - changeB;
  });
  const selected = worsening[0] ?? available[0];
  if (selected) {
    const { label, id, metric, imp, ctr } = selected;
    const d = decomposeClicks(imp.atual!, metric.atual!, imp.anterior!, metric.anterior!, data.current.days, data.previous.days);
    const dominant = Math.abs(d.volume) >= Math.abs(d.ctr) ? 'volume de impressões' : 'CTR';
    const isLoss = d.delta < 0;
    const explanation = !isLoss ? 'O volume diário de cliques não caiu nesta superfície; verificar outras superfícies e fontes.'
      : d.volume < 0 && d.ctr >= 0 ? 'Menos distribuição explica a perda matemática; a taxa de clique compensou parcialmente. Priorizar recuperação de alcance, não apenas otimização de títulos.'
      : d.ctr < 0 && d.volume >= 0 ? 'A perda se concentra na taxa de clique, apesar de impressões estáveis ou maiores. Investigar apresentação dos conteúdos, intenção e seleção de pautas.'
      : `A perda diária combina alterações de impressões e CTR, com maior contribuição absoluta do ${dominant}.`;
    result.push(factor('D4', `${label}: alcance ou atratividade?`,
      `${label}: cliques/dia ${one.format(d.anteriorPorDia)} → ${one.format(d.atualPorDia)} (${signed(d.delta)} por dia). Decomposição matemática: impressões ${signed(d.volume)} cliques/dia; CTR ${signed(d.ctr)} cliques/dia.`,
      explanation,
      isLoss ? `Investigar mudanças na exposição e no mix de conteúdos no ${label}; a decomposição explica COMO a queda ocorreu, não POR QUE o Google distribuiu menos.` : `Investigar outras superfícies e condições de distribuição.`,
      `Confrontar impressões, CTR, principais temas e dias de publicação do ${label}; verificar Search Console por página e consulta.`,
      [`SC${id * 3 + 1}`, `SC${id * 3 + 2}`, `SC${id * 3 + 3}`, `SD${id + 1}`],
      Math.min(91, isLoss ? 60 + Math.min(30, Math.abs(d.delta) / 20) : 35)));
  }
  if (exact(engagement) && engagement.variacaoPercentual !== null) {
    const deltaPP = (engagement.atual! - engagement.anterior!) * 100;
    const worsened = deltaPP < -0.5;
    const improved = deltaPP > 0.5;
    result.push(factor('D5', 'Qualidade do consumo',
      `Taxa de engajamento: ${one.format(engagement.anterior! * 100)}% → ${one.format(engagement.atual! * 100)}% (${deltaPP >= 0 ? '+' : ''}${one.format(deltaPP)} p.p.).`,
      worsened ? 'Além do volume, a proporção de sessões engajadas caiu; é um segundo sinal a investigar.'
        : improved ? 'O engajamento melhorou apesar das mudanças de volume: não afirmar que a qualidade do consumo piorou.'
        : 'A taxa permaneceu relativamente estável; não há evidência forte de deterioração do engajamento.',
      'Investigar tempo de leitura e páginas de entrada antes de atribuir esse movimento à qualidade editorial.',
      'Comparar landing pages, tempo de engajamento, taxa de rejeição e comportamento por dispositivo.',
      ['GA5', 'GA3', 'GA4'], worsened ? 57 : 20));
  }
  const focused = /rede|social|facebook|instagram/i.test(question) ? ['D2', 'D1', 'D3', 'D4', 'D5']
    : /engaj|fidel|qualidade|reten/i.test(question) ? ['D5', 'D1', 'D2', 'D3', 'D4']
    : /editoria|mat[eé]ria|conte[uú]do/i.test(question) ? ['D3', 'D1', 'D2', 'D4', 'D5'] : [];
  const sorted = result.sort((a, b) => {
    if (focused.length) return (focused.indexOf(a.id) < 0 ? 99 : focused.indexOf(a.id)) - (focused.indexOf(b.id) < 0 ? 99 : focused.indexOf(b.id));
    return b.prioridade - a.prioridade;
  });
  const net = views && exact(views) ? views.variacaoPercentual : null;
  const headline = net === null ? 'Os dados disponíveis ainda não permitem confirmar a direção geral da audiência.'
    : net < -2 ? 'Há uma redução mensurável na média diária de visualizações. A análise separa onde a perda apareceu do que ainda pode explicá-la.'
    : net > 2 ? 'A média diária de visualizações aumentou; a hipótese de queda geral não se confirma neste recorte.'
    : 'A média diária de visualizações permaneceu relativamente estável; eventuais quedas podem estar concentradas em segmentos.';
  return {
    tese: headline,
    sinais: sorted.slice(0, 5),
    lacunas: [
      'Variações de tráfego e decomposição de cliques identificam mecanismos observados, não demonstram efeitos de algoritmo ou decisões editoriais.',
      'Sem dados completos de volume e temas publicados, comparações com concorrentes e série anual, não é possível provar causalidade ou sazonalidade.',
      ...data.warnings.filter(x => /incomplet|indispon[ií]v|top|amostra|n[aã]o representam/i.test(x)).slice(0, 3),
    ],
  };
}
