import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosis, decomposeClicks } from '../lib/ai/diagnosis';
import { fallback, validateGenerated } from '../lib/ai/analyst';
import { periods } from '../lib/ai/investigation';
import type { Investigation, Evidence } from '../lib/ai/investigation';

const ev = (id: string, fonte: string, indicador: string, atual: number, anterior: number, unidade: 'quantidade' | 'taxa' = 'quantidade'): Evidence => ({
  id, fonte, indicador, atual, anterior, unidade,
  variacaoPercentual: anterior === 0 ? null : (atual / anterior - 1) * 100,
});
function fixture(): Investigation {
  const evidence = [
    ev('GA1', 'GA4', 'Visualizações', 61000, 100000),
    ev('GA2', 'GA4', 'Visualizações por dia', 1000, 1639.34),
    ev('GA3', 'GA4', 'Sessões', 30500, 61000),
    ev('GA4', 'GA4', 'Sessões engajadas', 18300, 36600),
    ev('GA5', 'GA4', 'Taxa de engajamento', .6, .6, 'taxa'),
    ev('GA7', 'GA4', 'Sessões por dia', 500, 1000),
    ev('CH1', 'GA4 · canal (sessões)', 'Organic Search', 12000, 42000),
    ev('CH2', 'GA4 · canal (sessões)', 'Organic Social', 9000, 11000),
    ev('ED1', 'GA4 · recorte editorial', 'Visualizações · Cotidiano', 10000, 38000),
    ev('SC4', 'Discover', 'Cliques', 3660, 6100),
    ev('SC5', 'Discover', 'Impressões', 36600, 61000),
    ev('SC6', 'Discover', 'CTR', .1, .1, 'taxa'),
    ev('SD2', 'Discover', 'Cliques por dia', 60, 100),
  ];
  const base = {
    title: 'teste', filterLabel: 'Campinas',
    current: { start: '2026-08-01', end: '2026-09-30', days: 61 },
    previous: { start: '2026-06-01', end: '2026-07-31', days: 61 },
    comparison: 'anterior' as const, collectedAt: '2026-10-30T00:00:00Z',
    evidence,
    channels: [{ label: 'Organic Search', actual: 12000, before: 42000, delta: -30000 }, { label: 'Organic Social', actual: 9000, before: 11000, delta: -2000 }],
    editorials: [{ label: 'Cotidiano', actual: 10000, before: 38000, delta: -28000 }],
    articles: [], warnings: [], agents: [],
  };
  return { ...base, diagnosis: buildDiagnosis(base, 'Por que caímos?') };
}

test('decomposição exata separa impressões e CTR com mesmo denominador de dias', () => {
  const d = decomposeClicks(600, 66, 1000, 100, 1, 1);
  assert.ok(Math.abs(d.delta - (d.volume + d.ctr)) < 1e-10);
  assert.ok(d.volume < 0);
  assert.ok(d.ctr > 0);
});
test('diagnóstico interpreta perda de distribuição, não apenas lista métricas', () => {
  const diagnosis = fixture().diagnosis;
  assert.match(diagnosis.tese, /redução mensurável/);
  assert.ok(diagnosis.sinais.some(s => s.id === 'D2' && /Organic Search/.test(s.fato)));
  assert.ok(diagnosis.sinais.some(s => s.id === 'D4' && /Menos distribuição/.test(s.leitura)));
  assert.ok(diagnosis.sinais.some(s => s.id === 'D3' && /Cotidiano/.test(s.fato)));
});
test('fallback não despeja lista: explica mecanismo e sugere validação', () => {
  const answer = fallback(fixture());
  assert.ok(answer.achados.length > 1);
  assert.ok(answer.achados.some(a => /O que significa:/.test(a.analise)));
  assert.ok(answer.acoes.length > 0);
});
test('LLM só pode adicionar hipóteses sem números livres e com IDs existentes', () => {
  const data = fixture();
  const generated = validateGenerated({
    leituraExecutiva: 'O alcance do conteúdo precisa de atenção.',
    achados: [{ sinalId: 'D4', implicacao: 'A distribuição pode ser o gargalo principal.' },
      { sinalId: 'D99', implicacao: 'Algo que não foi medido.' },
      { sinalId: 'D2', implicacao: 'Inventamos 99% de queda.' }],
    acoes: [{ sinalId: 'D4', acao: 'Testar formatos de conteúdo para Discover', justificativa: 'Avaliar a presença de pautas com potencial de distribuição.', metrica: 'Impressões e cliques por dia', prioridade: 'Alta' }],
    proximaPergunta: 'Quais formatos recebem mais exposição?',
  }, data);
  assert.ok(generated);
  assert.deepEqual(generated!.achados.map(a => a.sinalId), ['D4']);
  assert.equal(generated!.acoes.length, 1);
});

test('início do mês evita mês ainda potencialmente incompleto no Search Console', () => {
  const result = periods(2, 'anterior', '2026-11-02');
  assert.equal(result.current.start, '2026-08-01');
  assert.equal(result.current.end, '2026-09-30');
});
