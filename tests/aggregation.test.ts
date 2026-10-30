import test from 'node:test';
import assert from 'node:assert/strict';
import {combine,summaryGsc,isoWeek} from '../lib/aggregation';
import {pathRegex,dateSP} from '../lib/config';

test('Semanas ISO cruzam corretamente o ano',()=>{
 assert.equal(isoWeek('2025-12-31'),'2026-S01');
 assert.equal(isoWeek('2026-01-01'),'2026-S01');
});
test('CTR e posição ponderadas no agrupamento sem somar taxa',()=>{
 const m=combine([{period:'2026-09-01',clicks:10,impressions:100,position:3},{period:'2026-09-02',clicks:30,impressions:300,position:5}],'month');
 assert.equal(m[0].clicks,40);assert.equal(m[0].ctr,0.1);assert.equal(m[0].position,4.5);
});
test('GSC KPI não calcula média simples de CTR',()=>{
 const x=summaryGsc([{period:'a',clicks:1,impressions:10},{period:'b',clicks:2,impressions:100}]);
 assert.equal(x.ctr,3/110);
});
test('Campinas inclui Piracicaba',()=>{
 const r=new RegExp(pathRegex('campinas','todas')!,'i');assert.ok(r.test('/piracicaba/'));assert.ok(r.test('/campinas/cotidiano/'));assert.ok(!r.test('/ribeiraopreto/'));
});
