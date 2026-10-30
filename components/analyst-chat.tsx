'use client';

import {useMemo,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {Activity,ArrowLeft,ArrowRight,BarChart3,BookOpen,BrainCircuit,CheckCircle2,ChevronDown,Clock3,ExternalLink,FileText,LoaderCircle,MessageCircle,SendHorizontal,ShieldCheck,Sparkles,TrendingDown,TrendingUp} from 'lucide-react';
import {Bar,BarChart,CartesianGrid,Legend,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {EDITORIAS,SCOPE_LABELS} from '@/lib/config';
import type {Scope,Platform} from '@/lib/types';
import type {Investigation,InvestigationInput,Evidence,Ranked} from '@/lib/ai/investigation';
import type {AnalystReply} from '@/lib/ai/analyst';
import './analyst-chat.css';

const QUESTIONS=[
  'Estamos tendo resultados ruins nos últimos dois meses. Por quê e o que podemos fazer?',
  'O Discover está puxando o desempenho para baixo? Compare com Pesquisa Google.',
  'Quais canais e editorias merecem atenção prioritária?',
  'A queda é de distribuição ou de engajamento? O que podemos testar?',
];
const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
const compact=new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:2});
function fmt(value:number|null,unit:'quantidade'|'taxa'='quantidade') {return value===null?'—':unit==='taxa'?number.format(value*100)+'%':number.format(value);}
function change(value:number|null){return value===null?'Sem base':`${value>0?'+':''}${number.format(value)}%`;}
function shortDate(s:string){const [y,m,d]=s.split('-');return `${d}/${m}/${y}`;}
function LegendValue({value}:{value:number|null}){
  return <span className={'ai-delta '+(value===null?'neutral':value<0?'down':'up')}>{value!==null&&(value<0?<TrendingDown size={13}/>:<TrendingUp size={13}/>)}{change(value)}</span>;
}
function EvidenceTable({items,visible=true}:{items:Evidence[];visible?:boolean}){
  const [all,setAll]=useState(false);
  const display=all?items:items.slice(0,9);
  return <section className="ai-evidence-section" id="dados-auditaveis"><div className="ai-section-head"><div><span className="ai-overline">FONTE E CÁLCULO</span><h3>Dados que sustentam a análise</h3><p>Valores obtidos das APIs, não gerados pela OpenAI.</p></div><ShieldCheck size={23}/></div>
   <div className="ai-table-wrap"><table className="ai-table"><thead><tr><th>ID</th><th>Fonte / Métrica</th><th>Atual</th><th>Comparação</th><th>Variação</th></tr></thead><tbody>{display.map(e=><tr key={e.id}><td><span className="ai-id">{e.id}</span></td><td><strong>{e.indicador}</strong><small>{e.fonte}</small></td><td>{fmt(e.atual,e.unidade)}</td><td>{fmt(e.anterior,e.unidade)}</td><td><LegendValue value={e.variacaoPercentual}/></td></tr>)}</tbody></table></div>
   {items.length>9&&<button className="ai-text-button" type="button" onClick={()=>setAll(x=>!x)}>{all?'Mostrar menos':`Ver todos os ${items.length} indicadores`} <ChevronDown size={15}/></button>}
  </section>;
}
function BarBreakdown({rows,title,note}:{rows:Ranked[];title:string;note:string}){
  const [full,setFull]=useState(false);
  const display=full?rows:rows.slice(0,7);
  return <article className="ai-panel"><div className="ai-section-head"><div><h3>{title}</h3><p>{note}</p></div></div>
    {display.length===0?<p className="ai-empty">Detalhamento não retornado pelas APIs.</p>:<div className="ai-breakdown">{display.map((r,i)=>{
      const largest=Math.max(...display.map(x=>Math.abs(x.delta)),1);
      return <div className="ai-break-row" key={`${r.label}-${i}`}><div className="ai-break-line"><span title={r.label}>{r.url&&/^https:\/\//.test(r.url)?<a href={r.url} target="_blank" rel="noopener noreferrer">{r.label}<ExternalLink size={12}/></a>:r.label}</span><strong className={r.delta<0?'neg':'pos'}>{r.delta>0?'+':''}{compact.format(r.delta)}</strong></div><div className="ai-bar-rail"><div className={r.delta<0?'ai-bar-fill red':'ai-bar-fill green'} style={{width:`${Math.max(2,Math.abs(r.delta)/largest*100)}%`}}/></div></div>;
    })}</div>}
    {rows.length>7&&<button type="button" className="ai-text-button" onClick={()=>setFull(x=>!x)}>{full?'Mostrar menos':'Mostrar todas as linhas disponíveis'} <ChevronDown size={14}/></button>}
  </article>;
}
function AnswerCard({answer,data,model,notice,question}:{answer:AnalystReply;data:Investigation;model:string;notice?:string;question:string}){
  const byId=new Map(data.evidence.map(e=>[e.id,e]));
  const top=['GA1','GA3','SC1','SC4','SC7'].map(id=>byId.get(id)).filter((x):x is Evidence=>Boolean(x));
  const chart=top.filter(e=>e.atual!==null&&e.anterior!==null&&e.anterior>0).map(e=>({key:e.fonte==='GA4'?e.indicador:e.fonte,atual:Math.round((e.atual!/e.anterior!)*1000)/10,anterior:100}));
  return <div className="ai-answer"><section className="ai-answer-intro"><div className="ai-answer-by"><BrainCircuit size={18}/> Analista IA <span>· {model}</span></div><h2>{answer.titulo}</h2><p>{answer.resumo}</p><div className="ai-periods"><span><Clock3 size={14}/> Período: {shortDate(data.current.start)} a {shortDate(data.current.end)}</span><span>Base: {shortDate(data.previous.start)} a {shortDate(data.previous.end)}</span></div>{notice&&<p className="ai-notice">{notice}</p>}</section>
    <div className="ai-editorial-focus"><strong>Diagnóstico primeiro</strong><span>O que mudou, onde se concentrou a mudança, qual mecanismo os dados indicam e que teste editorial podemos fazer. Os indicadores completos estão abaixo, como comprovação.</span></div>
    <section className="ai-panel"><div className="ai-section-head"><div><span className="ai-overline">DIAGNÓSTICO</span><h3>O que os dados realmente indicam</h3></div><BookOpen size={21}/></div>{answer.achados.length?answer.achados.map((a,i)=><article className="ai-finding" key={i}><div className="ai-finding-head"><span className="ai-seq">0{i+1}</span><h4>{a.titulo}</h4></div><p>{a.analise}</p><div className="ai-proof">{a.evidencias.map(id=><a key={id} href="#dados-auditaveis">{id} · {byId.get(id)?.indicador||'Evidência'}</a>)}</div></article>):<p className="ai-empty">Sem achados verificáveis. Confira as evidências e avisos técnicos.</p>}</section>
    <section className="ai-panel"><div className="ai-section-head"><div><span className="ai-overline">PRÓXIMAS AÇÕES</span><h3>Plano de melhoria</h3></div><CheckCircle2 size={21}/></div>{answer.acoes.length?<div className="ai-actions">{answer.acoes.map((a,i)=><article key={i} className="ai-action"><span className="ai-priority">{a.prioridade}</span><div><h4>{a.acao}</h4><p>{a.justificativa}</p><small>Métrica para acompanhar: {a.metrica}</small></div></article>)}</div>:<p className="ai-empty">Sem recomendações geradas. Verifique a conexão com a OpenAI.</p>}</section>
    <details className="ai-support-data"><summary><BarChart3 size={18}/> Mostrar gráficos e rankings que embasam a análise</summary>
    {top.length>0&&<div className="ai-number-grid">{top.slice(0,4).map(e=><div className="ai-number" key={e.id}><small>{e.fonte} · {e.indicador}</small><strong>{fmt(e.atual,e.unidade)}</strong><LegendValue value={e.variacaoPercentual}/></div>)}</div>}
    {chart.length>1&&<section className="ai-panel"><div className="ai-section-head"><div><span className="ai-overline">COMPARATIVO</span><h3>Desempenho relativo</h3><p>Índice: período anterior = 100. Cada métrica mantém sua unidade original, mas os movimentos relativos podem ser comparados.</p></div><BarChart3 size={22}/></div><div className="ai-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} layout="vertical" margin={{left:8,right:25,top:10,bottom:5}}><CartesianGrid horizontal={false} stroke="#e8edf5" strokeDasharray="3 5"/><XAxis type="number" tickFormatter={n=>`${n}`} tick={{fontSize:11,fill:'#7c8696'}}/><YAxis dataKey="key" type="category" width={120} tick={{fontSize:11,fill:'#4c5970'}}/><Tooltip formatter={(value)=>`${number.format(Number(value??0))} (índice)`}/><Legend/><Bar dataKey="anterior" name="Comparação" fill="#b9c8df" radius={[0,4,4,0]}/><Bar dataKey="atual" name="Atual" fill="#f07c30" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div></section>}
    <div className="ai-two-col"><BarBreakdown title="Canais: perdas de sessões" note="GA4 · sessões; apenas canais observados nos dois períodos" rows={data.channels}/><BarBreakdown title="Recortes editoriais" note="GA4 · visualizações por frente ou editoria selecionada" rows={data.editorials||[]}/></div>
    <BarBreakdown title="Páginas comparáveis (amostra)" note="GA4 + GSC · TOPs limitados, não representam toda a variação" rows={data.articles}/>
    </details>
    <EvidenceTable items={data.evidence}/>

    <details className="ai-limits"><summary>Limitações e verificações necessárias</summary><ul>{[...answer.limites,...data.warnings].map((s,i)=><li key={i}>{s}</li>)}</ul></details>
    {answer.proximaPergunta&&<div className="ai-next"><MessageCircle size={17}/><span>Próxima investigação sugerida: {answer.proximaPergunta}</span></div>}
    <p className="ai-query">Pergunta analisada: “{question}” · Consulta em {new Date(data.collectedAt).toLocaleString('pt-BR')}</p>
  </div>;
}

type Turn={question:string;answer:AnalystReply;data:Investigation;model:string;notice?:string};
const DEFAULT_Q=QUESTIONS[0];
export function AnalystChat(){
 const [scope,setScope]=useState<Scope>('geral');const [editor,setEditor]=useState<keyof typeof EDITORIAS>('todas');const [platform,setPlatform]=useState<Platform>('web');
 const [months,setMonths]=useState<1|2|3>(2);const [compare,setCompare]=useState<'anterior'|'ano_anterior'>('anterior');
 const [draft,setDraft]=useState(DEFAULT_Q);const [turns,setTurns]=useState<Turn[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const history=useMemo(()=>turns.flatMap(t=>[{role:'user' as const,content:t.question},{role:'assistant' as const,content:t.answer.resumo}]).slice(-4),[turns]);
 async function send(e?:FormEvent<HTMLFormElement>){e?.preventDefault();if(busy||draft.trim().length<5)return;
   const question=draft.trim();setBusy(true);setError('');
   const input:InvestigationInput={question,scope,editor,platform,months,compare};
   try{
     const response=await fetch('/api/analista',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,history}),cache:'no-store'});
     const payload=await response.json();if(!response.ok)throw new Error(payload.error||`Erro HTTP ${response.status}`);
     setTurns(prev=>[...prev,{question,answer:payload.answer,data:payload.investigation,model:payload.model,notice:payload.notice}]);setDraft('');
   }catch(err){setError(err instanceof Error?err.message:'Não foi possível analisar.');}finally{setBusy(false);}
 }
 return <div className="ai-page"><header className="ai-top"><Link href="/" className="ai-back"><ArrowLeft size={17}/> Painel de audiência</Link><span className="ai-workspace"><Sparkles size={15}/> CIDADE ON · INTELIGÊNCIA</span><span className="ai-local">AMBIENTE LOCAL</span></header>
  <main className="ai-container"><div className="ai-hero"><div className="ai-pill"><BrainCircuit size={16}/> ASSISTENTE DE ANÁLISE DIGITAL</div><h1>Investigue além <em>dos indicadores.</em></h1><p>Faça perguntas sobre audiência, distribuição e conteúdo. O assistente consulta os dados do GA4 e Search Console antes de responder.</p></div>
  <section className="ai-composer"><div className="ai-controls">
    <label>Frente<select value={scope} onChange={e=>setScope(e.target.value as Scope)}>{Object.entries(SCOPE_LABELS).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
    <label>Editoria<select value={editor} onChange={e=>setEditor(e.target.value as keyof typeof EDITORIAS)}>{Object.entries(EDITORIAS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>Plataforma<select value={platform} onChange={e=>setPlatform(e.target.value as Platform)}><option value="web">Web</option><option value="amp">AMP</option><option value="both">Web + AMP</option></select></label>
    <label>Período<select value={months} onChange={e=>setMonths(Number(e.target.value) as 1|2|3)}><option value={1}>Último mês fechado</option><option value={2}>Últimos 2 meses fechados</option><option value={3}>Últimos 3 meses fechados</option></select></label>
    <label>Comparar com<select value={compare} onChange={e=>setCompare(e.target.value as 'anterior'|'ano_anterior')}><option value="anterior">Período anterior</option><option value="ano_anterior">Mesmo período do ano anterior</option></select></label>
  </div><form onSubmit={send}><label htmlFor="ai-question" className="ai-composer-title">Qual pergunta você quer investigar?</label><textarea id="ai-question" value={draft} onChange={e=>setDraft(e.target.value)} rows={3} maxLength={850} placeholder="Ex.: O que explica a queda do Discover e o que podemos fazer?" disabled={busy}/><div className="ai-composer-foot"><span><ShieldCheck size={15}/> Respostas com dados e critérios de validação</span><button className="ai-send" type="submit" disabled={busy||draft.trim().length<5}>{busy?<LoaderCircle className="ai-spin" size={18}/>:<SendHorizontal size={18}/>} {busy?'Investigando…':'Investigar'} </button></div></form></section>
  {!turns.length&&<div className="ai-suggestions"><p>Perguntas para começar</p><div>{QUESTIONS.map((q,i)=><button type="button" key={i} onClick={()=>setDraft(q)}><FileText size={16}/>{q}<ArrowRight size={14}/></button>)}</div></div>}
  {busy&&<div className="ai-loading"><LoaderCircle size={23} className="ai-spin"/><div><strong>Investigando as fontes oficiais</strong><p>Consultando GA4 e Search Console, comparando períodos e preparando a análise.</p></div></div>}
  {error&&<div role="alert" className="ai-error"><strong>Não foi possível concluir.</strong> {error}</div>}
  {turns.map((t,i)=><AnswerCard key={i} question={t.question} answer={t.answer} data={t.data} model={t.model} notice={t.notice}/>)}
  {turns.length>0&&<button type="button" className="ai-new" onClick={()=>{setTurns([]);setDraft(DEFAULT_Q);setError('');}}>Iniciar nova investigação</button>}
  <footer className="ai-footer">Local primeiro · Dados via Google APIs · OpenAI Responses API · Nenhuma conclusão causal sem evidências</footer>
  </main></div>;
}
