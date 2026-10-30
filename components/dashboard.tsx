'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AreaChart,Area,CartesianGrid,Legend,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Activity,ArrowDownRight,ArrowUpRight,BarChart3,Calendar,ChartNoAxesCombined,ChevronDown,Download,ExternalLink,FileSearch,Globe,Info,Layers,Monitor,RefreshCw,Search,Smartphone,TrendingUp} from 'lucide-react';
import {EDITORIAS,SCOPE_LABELS,SURFACE_LABELS,dateSP,shiftDate} from '@/lib/config';
import {Ga4DeepDive} from './ga4-deep-dive';
import type {DashboardData,Scope,Source,Surface,Platform,Grain,DataState,Breakdown,TrendRow} from '@/lib/types';
const NF=new Intl.NumberFormat('pt-BR');
const DEC=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
const pct=(n:number|null|undefined)=>n==null?'—':`${DEC.format(n*100)}%`;
const num=(n:number|null|undefined)=>n==null?'—':NF.format(Math.round(n));
const short=(n:number|null|undefined)=>n==null?'—':new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(n);
const money=(n:number|null|undefined)=>n==null?'—':DEC.format(n);
const countryName=(s:string)=>({bra:'Brasil',prt:'Portugal',usa:'Estados Unidos',arg:'Argentina'} as Record<string,string>)[s.toLowerCase()]||s;
const deviceName=(s:string)=>({MOBILE:'Celular',DESKTOP:'Computador',TABLET:'Tablet',mobile:'Celular',desktop:'Computador',tablet:'Tablet'} as Record<string,string>)[s]||s;
const startDefault=shiftDate(dateSP(new Date(),1),-89);
function MetricCard({label,value,detail,icon}:{label:string;value:string;detail?:string;icon:React.ReactNode}){return <div className="metric-card"><div className="metric-label"><span>{label}</span>{icon}</div><strong>{value}</strong><small>{detail||'Período selecionado'}</small></div>}
function Select({label,value,onChange,options,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];disabled?:boolean}){
 return <label className="filter-field"><span>{label}</span><div className="select-wrap"><select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>{options.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={14}/></div></label>;
}
function ExportButton({data}:{data:DashboardData}){
 const doExport=()=>{
  const rows=data.series;
  const cols=data.source==='gsc'?['period','clicks','impressions','ctr','position']:['period','views','activeUsers','sessions','engagedSessions','engagementRate'];
  const lines=[cols.join(';'),...rows.map(row=>cols.map(k=>{
    const x=row[k as keyof TrendRow];return x==null?'':String(x).replace('.',',');
  }).join(';'))];
  const blob=new Blob(['\uFEFF',lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
  a.download=`cidadeon-${data.source}-${data.scope}-${data.granularity}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 };
 return <button className="button outline" type="button" onClick={doExport}><Download size={16}/>Exportar CSV</button>;
}
function Rank({title,rows,kind='default',caption}:{title:string;rows:Breakdown[];kind?:'pages'|'default';caption?:string}){
 const max=rows[0]?.value || 1;
 return <article className="surface"><div className="surface-head"><h3>{title}</h3><span>{caption||'Mais relevantes'}</span></div>
  {!rows.length?<div className="empty-mini">Não disponível neste recorte.</div>:<div className="rank-list">{rows.slice(0,10).map((r,i)=><div className="rank" key={r.label+'-'+i}>
   <div className="rank-main"><span className="rank-name" title={r.label}>{kind==='pages'&&r.label.startsWith('http')?<a href={r.label} target="_blank" rel="noopener noreferrer">{r.label.replace(/^https?:\/\/[^/]+/,'')} <ExternalLink size={10}/></a>:kind==='default'?deviceName(countryName(r.label)):r.label}</span><strong>{num(r.value)}</strong></div>
   <div className="rank-track"><div style={{width:`${Math.max(1,(r.value/max)*100)}%`}} /></div></div>)}</div>}</article>;
}
export function Dashboard(){
 const [source,setSource]=useState<Source>('gsc');const [scope,setScope]=useState<Scope>('geral');const [surface,setSurface]=useState<Surface>('web');
 const [platform,setPlatform]=useState<Platform>('both');const [editor,setEditor]=useState('todas');const [grain,setGrain]=useState<Grain>('month');
 const [device,setDevice]=useState('all');const [country,setCountry]=useState('all');const [dataState,setDataState]=useState<DataState>('final');
 const [start,setStart]=useState(startDefault);const [end,setEnd]=useState(dateSP(new Date(),1));
 const [data,setData]=useState<DashboardData|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [metric,setMetric]=useState('');
 const requestId=useRef(0);
 const allowedMetric=source==='ga4'?['views','sessions','engagedSessions','activeUsers','engagementRate','bounceRate','pagesPerSession']:['clicks','impressions','ctr','position'];
 const selectedMetric=allowedMetric.includes(metric)?metric:allowedMetric[0];
 const metricLabels:Record<string,string>={views:'Visualizações',sessions:'Sessões',engagedSessions:'Sessões engajadas',activeUsers:'Usuários ativos',engagementRate:'Taxa de engajamento',bounceRate:'Taxa de rejeição',pagesPerSession:'Visualizações por sessão',clicks:'Cliques',impressions:'Impressões',ctr:'CTR',position:'Posição média'};
 const load=useCallback(async()=>{
  const id=++requestId.current;setLoading(true);setError('');
  const qp=new URLSearchParams({source,scope,surface,platform,editor,grain,device,country,dataState,start,end});
  try{const res=await fetch(`/api/analytics?${qp}`,{cache:'no-store'});const json=await res.json();if(!res.ok)throw new Error(json.error||`HTTP ${res.status}`);if(id===requestId.current)setData(json as DashboardData);}
  catch(e){if(id===requestId.current){setError(e instanceof Error?e.message:'Não foi possível consultar a API.');setData(null);}}finally{if(id===requestId.current)setLoading(false)}
 },[source,scope,surface,platform,editor,grain,device,country,dataState,start,end]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(surface==='discover')setDevice('all')},[surface]);
 const chartData=useMemo(()=>data?.series.map(r=>({...r,bounceRate:r.engagementRate==null?null:1-r.engagementRate,pagesPerSession:r.sessions?Number(r.views||0)/r.sessions:null}))||[],[data]);
 const isPercent=selectedMetric==='ctr'||selectedMetric==='engagementRate'||selectedMetric==='bounceRate';
 const chartValue=(v:any)=>v==null?'—':isPercent?pct(Number(v)):selectedMetric==='position'||selectedMetric==='pagesPerSession'?money(Number(v)):num(Number(v));
 const chartColor=source==='ga4'?'#f07c30':surface==='discover'?'#0caa9f':surface==='googleNews'?'#8a6ce3':'#3674e9';
 const areaAllowed=!(source==='ga4'&&platform==='both'&&selectedMetric==='activeUsers')&&!(source==='gsc'&&surface!=='web'&&selectedMetric==='position');
 const totals=data?.summary;
 const notes=[...(data?.notes||[]),...(data?.warnings||[])];
 const empty=data&&!chartData.length;
 return <div className="shell">
  <header className="header"><div className="inner"><div className="brand"><div className="brand-emblem"><ChartNoAxesCombined size={23}/></div><div><strong>Cidade<span>ON</span></strong><small>INTELIGÊNCIA DE AUDIÊNCIA DIGITAL</small></div></div><div className="header-right"><span><span className="status-dot"/>DADOS VIA API</span><span className="header-sep"/><span>GA4 & SEARCH CONSOLE</span></div></div></header>
  <section className="hero"><div className="inner"><div className="eyebrow"><Layers size={15}/> ANÁLISE DE DESEMPENHO • CIDADE ON</div><h1>Panorama da <em>audiência digital.</em></h1><p>Dados atualizados pelas APIs oficiais. Compare frentes, editorias, plataformas e superfícies do Google em um só painel.</p></div></section>
  <main className="content"><div className="tabs"><button className={source==='ga4'?'active':''} onClick={()=>{setSource('ga4');setPlatform('web');setDevice('all');}}><Activity size={18}/> Google Analytics 4</button><button className={source==='gsc'?'active':''} onClick={()=>{setSource('gsc');setPlatform('both');setDevice('all');}}><Search size={18}/> Search Console</button></div>
  <div className="section-top"><div><p className="overline">PAINEL DE PERFORMANCE</p><h2>{source==='ga4'?'Audiência do portal':'Distribuição e descoberta no Google'}</h2><p>{source==='ga4'?'Propriedades GA4 Web e AMP, com métricas por recorte.':'Pesquisa Google, Discover e Google Notícias, em frentes separadas.'}</p></div><div className="api-info">{loading?'Consultando…':data?.endAvailable?`Último ponto: ${data.endAvailable}`:'—'}<small>{data?.status==='preliminary'?'Dados preliminares':'Dados finalizados / D-1 como limite'}</small></div></div>
  <div className="filters">
   <Select label="FRENTE" value={scope} onChange={v=>setScope(v as Scope)} options={Object.entries(SCOPE_LABELS).map(([value,label])=>({value,label}))}/>
   <Select label="EDITORIA (URL)" value={editor} onChange={setEditor} options={Object.entries(EDITORIAS).map(([value,label])=>({value,label}))}/>
   {source==='gsc'&&<Select label="SUPERFÍCIE" value={surface} onChange={v=>setSurface(v as Surface)} options={Object.entries(SURFACE_LABELS).map(([value,label])=>({value,label}))}/>}
   <Select label="PLATAFORMA" value={platform} onChange={v=>setPlatform(v as Platform)} options={(source==='ga4'?[{value:'web',label:'Web'},{value:'amp',label:'AMP'},{value:'both',label:'Web + AMP'}]:[{value:'both',label:'Todas as URLs'},{value:'web',label:'URLs sem /amp/'},{value:'amp',label:'URLs /amp/'}])}/>
   <Select label="DISPOSITIVO" value={device} onChange={setDevice} disabled={source==='gsc'&&surface==='discover'} options={[{value:'all',label:'Todos'},{value:'mobile',label:'Celular'},{value:'desktop',label:'Computador'},{value:'tablet',label:'Tablet'}]}/>
   <Select label="PAÍS" value={country} onChange={setCountry} options={[{value:'all',label:'Todos'},{value:'BR',label:'Brasil'},{value:'US',label:'EUA'},{value:'PT',label:'Portugal'},{value:'AR',label:'Argentina'}]}/>
   <Select label="AGRUPAMENTO" value={grain} onChange={v=>setGrain(v as Grain)} options={[{value:'day',label:'Diário'},{value:'week',label:'Semanal'},{value:'month',label:'Mensal'},{value:'hour',label:'Horário (recente)'}]}/>
   {source==='gsc'&&<Select label="STATUS GSC" value={dataState} onChange={v=>setDataState(v as DataState)} options={[{value:'final',label:'Finalizados'},{value:'all',label:'Incluir preliminares'}]}/>}
   <label className="filter-field date"><span>DE</span><input type="date" value={start} max={end} onChange={e=>setStart(e.target.value)}/></label>
   <label className="filter-field date"><span>ATÉ · D-1</span><input type="date" value={end} max={dateSP(new Date(),1)} onChange={e=>setEnd(e.target.value)}/></label>
   <button type="button" className="button refresh" disabled={loading} onClick={()=>void load()}><RefreshCw size={16} className={loading?'spinning':''}/>Atualizar</button>
  </div>
  {error&&<div className="error"><Info size={18}/><div><strong>Não foi possível carregar esta consulta.</strong><p>{error}</p></div></div>}
  {!error&&loading&&!data&&<div className="loading">Consultando os dados oficiais do Google…</div>}
  {data&&<>
   <div className="scope-banner"><div><span className="scope-pip"/>{data.description} <small>• {data.start} a {data.endRequested}</small></div><span className="source-chip">{data.sourceLabel}</span></div>
   <div className="metric-grid">{source==='gsc'?<>
    <MetricCard label="CLIQUES" value={num(totals?.clicks)} detail="Acumulado do intervalo" icon={<Search size={19}/>}/>
    <MetricCard label="IMPRESSÕES" value={num(totals?.impressions)} detail="Acumulado do intervalo" icon={<EyeIcon/>}/>
    <MetricCard label="CTR MÉDIA" value={pct(totals?.ctr)} detail="Cliques ÷ impressões" icon={<TrendingUp size={19}/>}/>
    <MetricCard label="POSIÇÃO MÉDIA" value={surface==='web'?money(totals?.position):'N/D'} detail={surface==='web'?'Ponderada pelas impressões':'Não disponível nesta superfície'} icon={<BarChart3 size={19}/>}/>
   </>:<>
    <MetricCard label="VISUALIZAÇÕES" value={num(totals?.views)} detail="Somáveis entre Web e AMP" icon={<BarChart3 size={19}/>}/>
    <MetricCard label="USUÁRIOS ATIVOS" value={platform==='both'?'N/D':num(totals?.activeUsers)} detail={platform==='both'?'Web+AMP não deduplicados':'Distintos no período consultado'} icon={<Activity size={19}/>}/>
    <MetricCard label="SESSÕES" value={num(totals?.sessions)} detail="Sessões de páginas no filtro" icon={<Monitor size={19}/>}/>
    <MetricCard label="TAXA DE ENGAJAMENTO" value={pct(totals?.engagementRate)} detail="Sessões engajadas ÷ sessões" icon={<TrendingUp size={19}/>}/>
   </>}</div>
   <article className="chart-panel"><div className="chart-head"><div><span className="overline">EVOLUÇÃO TEMPORAL</span><h2>{metricLabels[selectedMetric]}</h2><p>{grain==='hour'?'Consulta horária recente':grain==='month'?'Evolução mês a mês':grain==='week'?'Evolução semanal':'Evolução diária'} · {data.sourceLabel}</p></div><div className="chart-actions"><Select label="MÉTRICA DO GRÁFICO" value={selectedMetric} onChange={setMetric} options={allowedMetric.map(v=>({value:v,label:metricLabels[v]}))}/><ExportButton data={data}/></div></div>
    <div className="chart-inner">{empty?<div className="empty-mini">A API não retornou períodos para os filtros escolhidos.</div>:!areaAllowed?<div className="empty-mini">Esta métrica não pode ser consolidada neste recorte. Escolha uma propriedade individual ou outra métrica.</div>:<ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:20,right:18,left:8,bottom:15}}><defs><linearGradient id="fill-audience" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColor} stopOpacity={0.22}/><stop offset="95%" stopColor={chartColor} stopOpacity={0.01}/></linearGradient></defs><CartesianGrid stroke="#ebedf5" strokeDasharray="3 6" vertical={false}/><XAxis dataKey="period" minTickGap={25} tickLine={false} axisLine={false} tick={{fill:'#858aa0',fontSize:11}}/><YAxis tickLine={false} axisLine={false} tick={{fill:'#858aa0',fontSize:11}} width={65} tickFormatter={(v:number)=>isPercent?`${Math.round(v*100)}%`:short(v)}/><Tooltip formatter={(v:any)=>chartValue(v)} contentStyle={{borderRadius:10,borderColor:'#ebedf5',fontSize:12}}/><Area type="monotone" dataKey={selectedMetric} name={metricLabels[selectedMetric]} stroke={chartColor} strokeWidth={3} fill="url(#fill-audience)" connectNulls={false} isAnimationActive={false} dot={chartData.length<20?{r:3}:false}/></AreaChart></ResponsiveContainer>}</div>
    <div className="chart-foot"><span>{data.series.length} períodos recebidos</span><span>{data.status==='preliminary'?'● Préliminar':'● Finalizado'}</span></div>
   </article>
   {source==='ga4'&&<Ga4DeepDive data={data}/>}
   <div className="split"><Rank title="Dispositivos" rows={data.devices} caption={source==='gsc'&&surface==='discover'?'Indisponível no Discover':'Distribuição no período'}/><Rank title="Países" rows={data.countries.map(r=>({...r,label:countryName(r.label)}))} caption="Principais países"/></div>
   {source==='gsc'&&<div className="split"><Rank title="Páginas mais acessadas" rows={data.pages} kind="pages" caption={source==='gsc'?'Top de páginas — amostra da API':'Por visualizações'}/>{source==='gsc'?<Rank title="Consultas pesquisadas" rows={data.queries} caption={surface!=='web'?'Disponível somente na Pesquisa':'Principais consultas — amostra'}/>:<Rank title="Canais de aquisição" rows={data.channels} caption="Por visualizações"/>}</div>}
   <article className="surface observations"><h3>Regras de leitura e limitações</h3><ul>{notes.map((s,i)=><li key={i}>{s}</li>)}</ul></article>
  </>}
  <footer><div><strong>Cidade<span>ON</span></strong> · Inteligência Digital</div><p>GA4 Web 326427533 · AMP 410193156 · Search Console · Dados sujeitos ao processamento das APIs</p><p>Indexação total e Core Web Vitals dependem de fontes complementares e não são simulados.</p></footer>
  </main>
 </div>;
}
function EyeIcon(){return <Globe size={19}/>}
