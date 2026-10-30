'use client';

import {useMemo, useState, type ReactNode, type ChangeEvent} from 'react';
import {
  Activity, ArrowRight, BarChart3, BookOpenText, ChevronDown, ChevronLeft,
  ChevronRight, Compass, Download, ExternalLink, Gauge, Info, MousePointer2,
  Search, Sparkles, TrendingUp, Users, UsersRound, Eye, Clock3,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type {DashboardData, Ga4Event, Ga4Segment} from '@/lib/types';
import './ga4-deep-dive.css';

const fmtInt = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 0});
const fmtDec = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1});
const compact = new Intl.NumberFormat('pt-BR', {notation: 'compact', maximumFractionDigits: 1});
const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const inteiro = (n: number | null | undefined) => isNumber(n) ? fmtInt.format(n) : '—';
const taxa = (n: number | null | undefined) => isNumber(n) ? `${fmtDec.format(n * 100)}%` : '—';
const decimal = (n: number | null | undefined) => isNumber(n) ? fmtDec.format(n) : '—';
const duracao = (n: number | null | undefined) => {
  if (!isNumber(n)) return '—';
  const seconds = Math.max(0, Math.round(n));
  return `${Math.floor(seconds / 60)}min ${String(seconds % 60).padStart(2, '0')}s`;
};
const horas = (n: number | null | undefined) => isNumber(n) ? `${fmtDec.format(n / 3600)} h` : '—';
const cat = (s: string) => s || '(não informado)';

const eventLabels: Record<string, string> = {
  page_view: 'Visualização de página', session_start: 'Início de sessão', first_visit: 'Primeira visita',
  user_engagement: 'Engajamento', scroll: 'Rolagem da página', click: 'Clique em link',
  file_download: 'Download de arquivo', view_search_results: 'Busca no site',
  form_start: 'Início de formulário', form_submit: 'Envio de formulário',
};
const channelLabels: Record<string, string> = {
  'Organic Search': 'Pesquisa orgânica', 'Organic Social': 'Redes sociais',
  Direct: 'Acesso direto', Referral: 'Sites de referência',
  'Organic Video': 'Vídeo orgânico', 'Organic Shopping': 'Shopping orgânico',
  'Paid Search': 'Pesquisa paga', 'Paid Social': 'Redes sociais pagas',
  'Cross-network': 'Campanhas multirrede', Unassigned: 'Não atribuído',
  new: 'Novos', returning: 'Recorrentes', '(not set)': 'Não identificado',
};
function channelName(name:string) { return channelLabels[name] || name; }
/** Identificação editorial: URL para classificação, pageTitle para exibição. */
function pageParts(value: string): string[] {
  if (!value || value === '(not set)') return [];
  let path = value;
  try { path = new URL(value).pathname; } catch { path = value.split('?')[0].split('#')[0]; }
  try { path = decodeURIComponent(path); } catch { /* mantém a URL original */ }
  return path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).filter((part, i, list) => !(i === list.length - 1 && part.toLowerCase() === 'amp'));
}
const rootNames: Record<string,string> = {
  campinas: 'Campinas', piracicaba: 'Piracicaba', ribeiraopreto: 'Ribeirão Preto',
  tudoep: 'Tudo EP', araraquara: 'Araraquara', saocarlos: 'São Carlos'
};
const sectionNames: Record<string,string> = {
  politica: 'Política', cotidiano: 'Cotidiano', economia: 'Economia', esportes: 'Esportes',
  'lazer-e-cultura': 'Lazer e cultura', 'lazer-cultura': 'Lazer e cultura',
  agro: 'Agro', games: 'Games', cultura: 'Cultura', 'tudo-cult': 'Cultura',
  'tudo-noticias': 'Tudo Notícias', receitas: 'Receitas', saude: 'Saúde',
  'tudo-saude': 'Saúde', inovacao: 'Inovação', especiais: 'Especiais', 'viu-essa': 'Viu essa?'
};
function humanizeSlug(slug: string): string {
  const phrase = slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return phrase ? phrase[0].toLocaleUpperCase('pt-BR') + phrase.slice(1) : 'Página sem título';
}
function isSectionPage(value: string): boolean {
  const parts = pageParts(value);
  // /, /campinas/ e /campinas/politica/ são home ou páginas de editoria,
  // NÃO matérias. Subeditorias sem slug editorial também são excluídas.
  if (parts.length <= 2) return true;
  const last = parts[parts.length - 1].toLocaleLowerCase('pt-BR');
  return parts.length === 3 && ['eleicoes', 'futebol', 'noticias', 'especiais'].includes(last);
}
function pageContext(value: string): string {
  const parts = pageParts(value);
  const root = rootNames[parts[0]] || (parts[0] ? humanizeSlug(parts[0]) : 'Geral');
  const section = sectionNames[parts[1]] || (parts[1] ? humanizeSlug(parts[1]) : 'Home');
  return parts.length <= 1 ? root : `${root} · ${section}`;
}
function pageLabel(value: string, title?: string | null): string {
  const parts = pageParts(value);
  if (isSectionPage(value)) {
    if (parts.length === 0) return 'Página inicial do portal';
    if (parts.length === 1) return `Página inicial — ${pageContext(value)}`;
    return `Página da editoria — ${pageContext(value)}`;
  }
  // Usa o título coletado no GA4, quando é realmente descritivo;
  // um pageTitle genérico (ex. "Política") nunca substitui a matéria.
  const rawTitle = (title || '').trim().replace(/\s+[|–-]\s+(?:acidade\s?on|acidadeon)(?:\s+.*)?$/i, '').trim();
  const generic = new Set(['(not set)', 'untitled', 'sem título', 'home',
    ...Object.values(sectionNames).map(x => x.toLocaleLowerCase('pt-BR'))]);
  if (rawTitle.length >= 12 && !generic.has(rawTitle.toLocaleLowerCase('pt-BR'))) return rawTitle;
  return humanizeSlug(parts[parts.length - 1] || '');
}
function pageURL(value: string) {
  if (!value || value === '(not set)') return null;
  try { const u=new URL(value); return u.protocol==='https:'||u.protocol==='http:' ? u.href : null; }
  catch { return value.startsWith('/') ? `https://www.acidadeon.com${value}` : null; }
}
function downloadCSV(name: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const cell=(value:unknown)=>`"${String(value ?? '').replaceAll('"','""')}"`;
  const text=[headers, ...rows].map(row=>row.map(cell).join(';')).join('\r\n');
  const blob=new Blob(['\ufeff'+text], {type:'text/csv;charset=utf-8;'});
  const href=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=href; a.download=`cidadeon-ga4-${name}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
}

type Tab='visao'|'aquisicao'|'conteudos'|'fidelizacao'|'eventos';
type MetricKey='views'|'sessions'|'engagedSessions'|'activeUsers'|'newUsers'|'engagementRate'|'engagementSecondsPerUser';
const metricLabel:Record<MetricKey,string>={
  views:'Visualizações',sessions:'Sessões',engagedSessions:'Sessões engajadas',activeUsers:'Usuários ativos',
  newUsers:'Novos usuários',engagementRate:'Taxa de engajamento',engagementSecondsPerUser:'Tempo eng./usuário',
};
const metricFormat:Record<MetricKey,(n:number|null|undefined)=>string>={
  views:inteiro,sessions:inteiro,engagedSessions:inteiro,activeUsers:inteiro,newUsers:inteiro,
  engagementRate:taxa,engagementSecondsPerUser:duracao,
};

function SectionHeader({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}){
  return <div className="ga4x-section-header"><div><span className="ga4x-eyebrow">{eyebrow}</span><h3>{title}</h3><p>{description}</p></div>{action}</div>;
}
function Stat({label,value,detail,icon,tone='blue'}:{label:string;value:string;detail:string;icon:ReactNode;tone?:'blue'|'orange'|'teal'|'violet'}) {
  return <div className={`ga4x-stat ga4x-stat-${tone}`}><div className="ga4x-stat-top"><span>{label}</span><span className="ga4x-stat-icon">{icon}</span></div><strong>{value}</strong><p>{detail}</p></div>;
}
function MiniStat({label,value}:{label:string;value:string}) {
  return <div className="ga4x-mini"><span>{label}</span><strong>{value}</strong></div>;
}
function Notice({children}:{children:ReactNode}) {return <div className="ga4x-note"><Info size={16}/><div>{children}</div></div>}
function NoData({text='Sem dados disponíveis para os filtros selecionados.'}:{text?:string}){
  return <div className="ga4x-empty"><BarChart3 size={24}/><span>{text}</span></div>;
}

function BarRanks({title,subtitle,rows,measure='views',names='page',limit=7,emptyText}:{title:string;subtitle:string;rows:Ga4Segment[];measure?:'views'|'sessions'|'engagedSessions';names?:'page'|'channel';limit?:number;emptyText?:string}) {
  const items=rows.filter(r=>isNumber(r[measure])).slice(0,limit);
  const max=Math.max(1,...items.map(r=>r[measure] ?? 0));
  return <div className="ga4x-card ga4x-chart-card"><SectionHeader eyebrow="DESTAQUES" title={title} description={subtitle}/>
    {!items.length ? <NoData text={emptyText}/> : <div className="ga4x-bar-ranks">{items.map((item,index)=>{
      const label=names==='channel'?channelName(item.label):pageLabel(item.label,item.title);
      return <div className="ga4x-bar-row" key={`${item.label}-${index}`}>
        <span className="ga4x-rank-number">{String(index+1).padStart(2,'0')}</span>
        <div className="ga4x-rank-content"><div className="ga4x-bar-label">
          <span title={item.label} style={{whiteSpace:'normal',overflow:'hidden',textOverflow:'clip',display:'-webkit-box',WebkitBoxOrient:'vertical',WebkitLineClamp:2,lineHeight:1.45,overflowWrap:'anywhere',flex:1}}>
            {names==='page' && pageURL(item.label)
              ? <a href={pageURL(item.label)!} target="_blank" rel="noopener noreferrer" style={{color:'inherit',textDecoration:'none'}}>{label}</a>
              : label}
          </span><strong>{inteiro(item[measure])}</strong></div>
          {names==='page'&&<small style={{display:'block',fontSize:10,color:'#8b9bb0',margin:'-3px 0 8px 0'}}>{pageContext(item.label)}{isSectionPage(item.label)?' · Página de seção':''}</small>}
        <div className="ga4x-bar-bg"><div style={{width:`${Math.max(1,100*(item[measure] ?? 0)/max)}%`}}/></div></div>
      </div>;
    })}</div>}
  </div>;
}
function QualityBars({rows}:{rows:Ga4Segment[]}) {
  const data=rows.filter(r=>isNumber(r.engagementRate)&&r.sessions!==null&&r.sessions>0).slice(0,8).map(r=>({name:channelName(r.label),rate:Math.round((r.engagementRate??0)*1000)/10}));
  return <div className="ga4x-card ga4x-chart-card"><SectionHeader eyebrow="QUALIDADE DO TRÁFEGO" title="Engajamento por canal" description="Percentual de sessões engajadas em cada canal de sessão."/>
    {!data.length?<NoData/>:<div className="ga4x-rechart" style={{height:Math.max(240,data.length*37+38)}}>
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{top:5,right:30,left:8,bottom:5}}>
      <CartesianGrid stroke="#eef1f7" strokeDasharray="3 5" horizontal={false}/>
      <XAxis type="number" domain={[0,100]} tickFormatter={(v:number)=>`${v}%`} tick={{fontSize:11,fill:'#768399'}} axisLine={false} tickLine={false}/>
      <YAxis type="category" dataKey="name" width={118} tick={{fontSize:11,fill:'#52647b'}} axisLine={false} tickLine={false}/>
      <Tooltip formatter={(value:unknown)=>[isNumber(value)?`${fmtDec.format(value)}%`:'—','Taxa de engajamento']} cursor={{fill:'#f5f7fb'}} contentStyle={{border:'1px solid #e3e9f3',borderRadius:10,fontSize:12}}/>
      <Bar dataKey="rate" fill="#18a5a0" radius={[0,6,6,0]} maxBarSize={20} isAnimationActive={false}/>
    </BarChart></ResponsiveContainer></div>}
  </div>;
}

function SegmentTable({title,description,rows,fields,filename,showPageLink=false,defaultOpen=false}:{title:string;description:string;rows:Ga4Segment[];fields:MetricKey[];filename:string;showPageLink?:boolean;defaultOpen?:boolean}) {
  const [expanded,setExpanded]=useState(defaultOpen);
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState<MetricKey>('views');
  const [descending,setDescending]=useState(true);
  const [page,setPage]=useState(0);
  const safeSort=fields.includes(sort)?sort:fields[0];
  const matching=useMemo(()=>rows.filter(r=>(r.label+' '+(r.title||'')).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))),[rows,search]);
  const sorted=useMemo(()=>[...matching].sort((a,b)=>{
    const va=a[safeSort],vb=b[safeSort];
    if(!isNumber(va)&&!isNumber(vb))return a.label.localeCompare(b.label,'pt-BR');
    if(!isNumber(va))return 1;
    if(!isNumber(vb))return -1;
    return descending?vb-va:va-vb;
  }),[matching,safeSort,descending]);
  const pageSize=10;
  const count=Math.max(1,Math.ceil(sorted.length/pageSize));
  const current=Math.min(page,count-1);
  const visible=sorted.slice(current*pageSize,(current+1)*pageSize);
  const csvRows=()=>sorted.map(row=>showPageLink?[pageLabel(row.label,row.title),row.label,...fields.map(f=>row[f])]:[row.label,...fields.map(f=>row[f])]);
  return <div className="ga4x-card ga4x-table-card">
    <div className="ga4x-table-intro"><div><span className="ga4x-eyebrow">DETALHAMENTO</span><h3>{title}</h3><p>{description}</p></div>
      <button type="button" className="ga4x-outline" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>{expanded?'Recolher':'Explorar tabela'} <ChevronDown size={15} className={expanded?'ga4x-rotated':''}/></button>
    </div>
    {expanded && <>
      <div className="ga4x-table-toolbar"><div className="ga4x-search"><Search size={16}/><input aria-label={`Buscar em ${title}`} placeholder="Buscar canal ou página" value={search} onChange={(e:ChangeEvent<HTMLInputElement>)=>{setSearch(e.target.value);setPage(0)}}/></div>
        <button type="button" className="ga4x-outline" disabled={!sorted.length} onClick={()=>downloadCSV(filename,showPageLink?['Título da página','URL',...fields.map(f=>metricLabel[f])]:['Dimensão',...fields.map(f=>metricLabel[f])],csvRows())}><Download size={15}/> CSV</button></div>
      {!sorted.length?<NoData text="Nenhum registro corresponde aos filtros."/>:<>
        <div className="ga4x-table-scroll"><table className="ga4x-table"><thead><tr><th>{showPageLink?'Página':'Canal / origem'}</th>{fields.map(f=><th key={f} className="ga4x-right"><button type="button" onClick={()=>{if(safeSort===f)setDescending(v=>!v);else {setSort(f);setDescending(true)}setPage(0)}}>{metricLabel[f]} {safeSort===f?(descending?'↓':'↑'):''}</button></th>)}</tr></thead>
        <tbody>{visible.map((r,i)=><tr key={`${r.label}-${i}`}><td>{showPageLink?<div className="ga4x-page-cell"><strong title={r.title || r.label} style={{whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.45}}>{pageLabel(r.label,r.title)}</strong><span title={r.label}>{r.label}</span>{pageURL(r.label)&&<a href={pageURL(r.label)!} target="_blank" rel="noopener noreferrer" aria-label="Abrir conteúdo em nova aba"><ExternalLink size={13}/></a>}</div>:<span title={r.label} className="ga4x-plain-label">{channelName(cat(r.label))}</span>}</td>{fields.map(f=><td key={f} className="ga4x-right">{metricFormat[f](r[f])}</td>)}</tr>)}</tbody></table></div>
        <div className="ga4x-pager"><span>{sorted.length} registros · {current*pageSize+1}–{Math.min(sorted.length,(current+1)*pageSize)}</span><div><button aria-label="Página anterior" type="button" disabled={current===0} onClick={()=>setPage(x=>Math.max(0,x-1))}><ChevronLeft size={17}/></button><span>{current+1} / {count}</span><button aria-label="Próxima página" type="button" disabled={current>=count-1} onClick={()=>setPage(x=>x+1)}><ChevronRight size={17}/></button></div></div>
      </>}
    </>}
  </div>;
}

function EventsVisual({events}:{events:Ga4Event[]}) {
  const top=events.filter(e=>e.count>0).slice(0,9);
  const max=Math.max(1,...top.map(e=>e.count));
  return <div className="ga4x-card ga4x-events-card"><SectionHeader eyebrow="INTERAÇÕES" title="Eventos mais frequentes" description="Eventos reais coletados pelo GA4, em ordem de ocorrência."/>
    {top.length?<div className="ga4x-event-list">{top.map((e,i)=><div className="ga4x-event-row" key={`${e.name}-${i}`}><span className="ga4x-event-dot"/><div><span>{eventLabels[e.name]||e.name}</span><small>{e.name}</small><div className="ga4x-event-line"><span style={{width:`${100*e.count/max}%`}}/></div></div><strong>{inteiro(e.count)}</strong></div>)}</div>:<NoData/>}
    <button type="button" className="ga4x-text-link" disabled={!events.length} onClick={()=>downloadCSV('eventos',['Evento','Ocorrências'],events.map(e=>[e.name,e.count]))}>Exportar todos os eventos <Download size={14}/></button>
  </div>;
}

export function Ga4DeepDive({data}:{data:DashboardData}) {
  const [tab,setTab]=useState<Tab>('visao');
  const extra=data.ga4Extra;
  if (!extra) return <div className="ga4x ga4x-empty">O detalhamento do GA4 não foi retornado pela API.</div>;
  const m=extra.metrics;
  const combined=data.platform==='both';
  const scopeText=data.description || 'Período selecionado';
  const userInfo=combined?'Sem deduplicação entre propriedades Web e AMP.':'Usuários únicos dentro da propriedade selecionada.';
  const tabs:{id:Tab,label:string,icon:ReactNode}[]=[
    {id:'visao',label:'Visão executiva',icon:<Gauge size={17}/>},
    {id:'aquisicao',label:'Aquisição',icon:<Compass size={17}/>},
    {id:'conteudos',label:'Conteúdos',icon:<BookOpenText size={17}/>},
    {id:'fidelizacao',label:'Fidelização',icon:<UsersRound size={17}/>},
    {id:'eventos',label:'Eventos',icon:<MousePointer2 size={17}/>},
  ];
  // Matérias não se confundem com homes nem com páginas de editoria.
  // Mantemos o detalhamento separado para que essas páginas não desapareçam.
  const articleRows = extra.contentQuality.filter(r=>!isSectionPage(r.label));
  const sectionRows = extra.contentQuality.filter(r=>isSectionPage(r.label));
  const canShowUserMetrics=!combined;
  const strongest=extra.channelQuality.find(r=>r.views>0);
  const engagedShare=(data.summary.sessions??0)>0 && isNumber(data.summary.engagedSessions)?data.summary.engagedSessions!/data.summary.sessions!:null;
  return <section className="ga4x" aria-label="Análises aprofundadas do GA4">
    <div className="ga4x-header"><div><div className="ga4x-pill"><Sparkles size={14}/> ANÁLISE APROFUNDADA</div><h2>O que os dados revelam sobre a audiência?</h2><p>Explore volume, qualidade, conteúdos e recorrência. Os filtros da página principal continuam aplicados.</p></div>
      <div className="ga4x-context"><span>RECORTE ANALISADO</span><strong>{scopeText}</strong><small>{data.start} a {data.endRequested}</small></div>
    </div>
    <nav className="ga4x-nav" aria-label="Módulos de análise GA4">{tabs.map((t,i)=><button key={t.id} type="button" onClick={()=>setTab(t.id)} className={tab===t.id?'ga4x-selected':''} aria-current={tab===t.id?'page':undefined}><span className="ga4x-nav-icon">{t.icon}</span><span>{t.label}</span><span className="ga4x-nav-index">0{i+1}</span></button>)}</nav>

    {tab==='visao'&&<div className="ga4x-pane">
      <div className="ga4x-intro"><div><span className="ga4x-eyebrow">01 / VISÃO EXECUTIVA</span><h3>Mais do que acessos: como o público consome?</h3></div><p>Indicadores complementares aos totais de visualizações, sessões e engajamento exibidos acima.</p></div>
      <div className="ga4x-stats">
        <Stat label="TOTAL DE USUÁRIOS" value={canShowUserMetrics?inteiro(m.totalUsers):'—'} detail={userInfo} icon={<UsersRound size={19}/>} tone="blue"/>
        <Stat label="NOVOS USUÁRIOS" value={canShowUserMetrics?inteiro(m.newUsers):'—'} detail={userInfo} icon={<Users size={19}/>} tone="violet"/>
        <Stat label="TAXA DE REJEIÇÃO" value={taxa(m.bounceRate)} detail="Parcela de sessões não engajadas." icon={<TrendingUp size={19}/>} tone="orange"/>
        <Stat label="DURAÇÃO MÉDIA DA SESSÃO" value={duracao(m.averageSessionDuration)} detail="Duração da sessão, não tempo de leitura." icon={<Clock3 size={19}/>} tone="teal"/>
      </div>
      <div className="ga4x-minis"><MiniStat label="VISUALIZAÇÕES POR SESSÃO" value={decimal(m.pagesPerSession)}/><MiniStat label="SESSÕES ENGAJADAS" value={inteiro(data.summary.engagedSessions)}/><MiniStat label="TEMPO ENG./USUÁRIO" value={canShowUserMetrics?duracao(m.engagementSecondsPerUser):'—'}/><MiniStat label="EVENTOS REGISTRADOS" value={inteiro(m.eventCount)}/></div>
      <div className="ga4x-two"><BarRanks title="De onde vêm as visualizações" subtitle="Principais canais de aquisição no período." rows={extra.channelQuality} names="channel"/>
        <div className="ga4x-card ga4x-reading"><span className="ga4x-eyebrow">LEITURA RÁPIDA</span><h3>Os indicadores em contexto</h3><div className="ga4x-reading-item"><span className="ga4x-reading-dot"/><div><strong>{taxa(engagedShare)} das sessões engajadas</strong><p>A proporção ajuda a interpretar a qualidade do tráfego, além do volume bruto.</p></div></div>
          <div className="ga4x-reading-item"><span className="ga4x-reading-dot violet"/><div><strong>{strongest?channelName(strongest.label):'Canal principal não disponível'}</strong><p>{strongest?'É o principal canal em visualizações neste recorte; confira sua taxa de engajamento em Aquisição.':'Sem detalhamento de canais para o período.'}</p></div></div>
          <button className="ga4x-next" type="button" onClick={()=>setTab('aquisicao')}>Analisar aquisição <ArrowRight size={16}/></button></div></div>
      {combined&&<Notice>Web e AMP são propriedades distintas. Usuários únicos e métricas por usuário ficam ocultos neste consolidado para evitar contagem duplicada. Selecione uma plataforma para analisá-los.</Notice>}
    </div>}

    {tab==='aquisicao'&&<div className="ga4x-pane">
      <div className="ga4x-intro"><div><span className="ga4x-eyebrow">02 / AQUISIÇÃO</span><h3>Quais canais trazem público mais engajado?</h3></div><p>Compare volume e qualidade do tráfego, sem depender de uma tabela extensa.</p></div>
      <div className="ga4x-two"><BarRanks title="Volume por canal" subtitle="Visualizações nos principais canais." rows={extra.channelQuality} names="channel"/>
        <QualityBars rows={extra.channelQuality}/></div>
      <SegmentTable title="Comparativo dos canais" description="Abra apenas quando precisar conferir números ou ordenar métricas." filename="canais" rows={extra.channelQuality} fields={['views','sessions','engagedSessions','engagementRate','newUsers']}/>
      <SegmentTable title="Origem / mídia da sessão" description="Detalhe Google orgânico, social, acesso direto e referenciadores conforme a atribuição do GA4." filename="origem-midia" rows={extra.sourceMedium} fields={['views','sessions','engagedSessions','engagementRate','activeUsers']}/>
      <Notice>A origem/mídia segue a atribuição de sessão do GA4. Os rótulos Discover e Google Notícias só devem ser tratados separadamente quando houver identificação confiável na coleta.</Notice>
    </div>}

    {tab==='conteudos'&&<div className="ga4x-pane">
      <div className="ga4x-intro"><div><span className="ga4x-eyebrow">03 / CONTEÚDOS</span><h3>Quais matérias atraem e envolvem o público?</h3></div><p>Um ranking legível primeiro; URLs completas e métricas detalhadas ficam disponíveis ao abrir as tabelas.</p></div>
      <div className="ga4x-two"><BarRanks title="Matérias com mais visualizações" subtitle="Top 7 URLs no recorte aplicado." rows={articleRows} emptyText="Nenhuma matéria individual retornada para este recorte. Verifique as URLs nas páginas de editoria abaixo."/><BarRanks title="Principais portas de entrada" subtitle="Páginas que iniciaram mais sessões." rows={[...extra.landingPages].sort((a,b)=>(b.sessions??0)-(a.sessions??0))} measure="sessions"/></div>
      <SegmentTable title="Explorar desempenho das matérias" description="Pesquise pela URL ou por parte do título. Ranking limitado às linhas retornadas pela API." filename="conteudos" rows={articleRows} fields={['views','activeUsers','engagementSecondsPerUser']} showPageLink/>
      {sectionRows.length>0&&<SegmentTable title="Páginas de editoria e navegação" description="Homes e capas de seção são exibidas separadamente das matérias para não distorcer o ranking editorial." filename="paginas-editoria" rows={sectionRows} fields={['views','activeUsers']} showPageLink/>}
      <SegmentTable title="Explorar páginas de entrada" description="Analise sessões e engajamento nas páginas de entrada." filename="paginas-entrada" rows={extra.landingPages} fields={['views','sessions','engagedSessions','engagementRate']} showPageLink/>
      <Notice>Os títulos vêm de pageTitle do GA4; quando ele estiver ausente, o nome da matéria é reconstruído pela URL. Páginas de editoria são separadas do ranking. A lista de páginas é limitada, não um inventário completo; não some suas linhas para obter o total do portal. O GA4 não informa necessariamente a data real de publicação.</Notice>
    </div>}

    {tab==='fidelizacao'&&<div className="ga4x-pane">
      <div className="ga4x-intro"><div><span className="ga4x-eyebrow">04 / FIDELIZAÇÃO</span><h3>Existe hábito de consumo ou apenas visitas pontuais?</h3></div><p>Frequência de utilização e composição da audiência em uma propriedade de cada vez.</p></div>
      <div className="ga4x-stats"><Stat label="SESSÕES POR USUÁRIO" value={canShowUserMetrics?decimal(m.sessionsPerUser):'—'} detail={userInfo} icon={<Activity size={19}/>} tone="blue"/>
        <Stat label="VISUALIZAÇÕES POR USUÁRIO" value={canShowUserMetrics?decimal(m.viewsPerUser):'—'} detail={userInfo} icon={<Eye size={19}/>} tone="violet"/>
        <Stat label="DAU / MAU" value={canShowUserMetrics?taxa(m.dauPerMau):'—'} detail="Frequência diária, não retenção de coorte." icon={<Gauge size={19}/>} tone="teal"/>
        <Stat label="WAU / MAU" value={canShowUserMetrics?taxa(m.wauPerMau):'—'} detail="Frequência semanal, não retenção de coorte." icon={<TrendingUp size={19}/>} tone="orange"/></div>
      <div className="ga4x-two ga4x-one-if-empty"><BarRanks title="Público novo × recorrente" subtitle="Volume de sessões por categoria, quando disponível." rows={extra.audience} measure="sessions" names="channel" limit={6}/>
        <div className="ga4x-card ga4x-reading"><span className="ga4x-eyebrow">COMO INTERPRETAR</span><h3>Frequência não é retenção</h3><p className="ga4x-reading-paragraph">DAU/MAU e WAU/MAU indicam frequência de atividade nas janelas do GA4. Para saber quantos leitores retornam após 7 ou 30 dias, seria necessária uma análise de coortes.</p><p className="ga4x-reading-paragraph">Usuários novos e recorrentes podem participar de mais de uma classificação no período. Evite somá-los como público distinto.</p></div></div>
      {combined&&<Notice>Selecione Web ou AMP para visualizar métricas por usuário sem somar pessoas das duas propriedades.</Notice>}
    </div>}

    {tab==='eventos'&&<div className="ga4x-pane">
      <div className="ga4x-intro"><div><span className="ga4x-eyebrow">05 / EVENTOS</span><h3>Como a audiência interage com o portal?</h3></div><p>Eventos de navegação e de interação que efetivamente estão instrumentados na propriedade.</p></div>
      <div className="ga4x-stats ga4x-stats-three"><Stat label="EVENTOS REGISTRADOS" value={inteiro(m.eventCount)} detail="Ocorrências de todos os eventos coletados." icon={<MousePointer2 size={19}/>} tone="blue"/>
        <Stat label="USUÁRIOS COM ROLAGEM" value={canShowUserMetrics?inteiro(m.scrolledUsers):'—'} detail="Sinal de 90% de rolagem quando coletado." icon={<Activity size={19}/>} tone="teal"/>
        <Stat label="TEMPO TOTAL DE ENGAJAMENTO" value={horas(m.engagementSeconds)} detail="Tempo em foco; não garante leitura efetiva." icon={<Clock3 size={19}/>} tone="orange"/></div>
      <EventsVisual events={extra.events}/>
      <Notice>Eventos automáticos (como <code>page_view</code> e <code>session_start</code>) não representam cliques editoriais. Ações não instrumentadas não podem ser recuperadas retroativamente.</Notice>
    </div>}
    {extra.limitations.length>0&&<details className="ga4x-limitations"><summary><Info size={15}/> Notas de disponibilidade das métricas ({extra.limitations.length})</summary><ul>{extra.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul></details>}
  </section>;
}
