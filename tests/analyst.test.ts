import test from 'node:test';
import assert from 'node:assert/strict';
import { periods, variation } from '../lib/ai/investigation';

test('últimos dois meses completos não incluem outubro em 30/10', () => {
  const p = periods(2, 'anterior', '2026-10-30');
  assert.deepEqual(p.current, { start:'2026-08-01', end:'2026-09-30',days:61 });
  assert.deepEqual(p.previous, { start:'2026-06-01', end:'2026-07-31',days:61 });
});
test('ano anterior mantém mesmos meses', () => {
  const p = periods(2, 'ano_anterior', '2026-10-30');
  assert.equal(p.previous.start,'2025-08-01');
  assert.equal(p.previous.end,'2025-09-30');
});
test('variação respeita denominador zero ou ausente', () => {
  assert.ok(Math.abs((variation(80,100) ?? 0) + 20) < 1e-8);
  assert.equal(variation(200,100),100);
  assert.equal(variation(10,0),null);
  assert.equal(variation(null,10),null);
});
