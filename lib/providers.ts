import {googlePost} from './auth';
import {SCOPE_LABELS,SITES,SURFACE_LABELS,pathRegex,pageRegex,shiftDate,type Editor} from './config';
import {combine,summaryGsc} from './aggregation';
import type {DashboardData,Scope,Platform,Surface,Grain,TrendRow,DataState,Breakdown,Ga4Extra,Ga4Segment,Ga4Event} from './types';

export type AnalyticsInput = {source:'ga4'|'gsc';scope:Scope;editor:Editor;platform:Platform;surface:Surface;grain:Grain;
  start:string;end:string;device:string;country:string;dataState:DataState};
const GA4_IDS={web:process.env.GA4_WEB_PROPERTY_ID||'326427533',amp:process.env.GA4_AMP_PROPERTY_ID||'410193156'};
const ga4endpoint=(id:string)=>`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`;
const gscendpoint=(site:string)=>`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
const FILTER=(field:string,value:string,matchType:'FULL_REGEXP'|'EXACT'='FULL_REGEXP')=>({filter:{fieldName:field,stringFilter:{matchType,value,caseSensitive:false}}});
const number=(x:unknown)=>{const n=Number(x||0);return Number.isFinite(n)?n:0};
const single=(obj:any)=>String(obj?.value ?? '');
function ga4Filter(input:AnalyticsInput){
  const filters:any[]=[];
  const url=pathRegex(input.scope,input.editor);
  if (url) {
    // GA4 Data API: FULL_REGEXP compara a expressão com o caminho INTEIRO.
    // Os padrões de config.ts descrevem somente o prefixo da praça/editoria
    // (por exemplo: ^/campinas/cotidiano(?:/|$)). Sem o sufixo, só a capa da
    // editoria é retornada e as URLs das matérias são excluídas da consulta.
    // Home é intencionalmente exata: NÃO deve incluir as matérias da praça.
    const fullPathRegex = input.editor === 'home' ? url : `${url}.*`;
    filters.push(FILTER('unifiedPagePathScreen', fullPathRegex));
  }
  if(input.device!=='all') filters.push(FILTER('deviceCategory',input.device,'EXACT'));
  if(input.country!=='all') filters.push(FILTER('countryId',input.country,'EXACT'));
  if(!filters.length)return undefined;
  return filters.length===1?filters[0]:{andGroup:{expressions:filters}};
}
async function ga4Report(id:string, input:AnalyticsInput, dimension:string|string[]|null, metricNames:string[], limit=100):Promise<any> {
  const params:any={dateRanges:[{startDate:input.start,endDate:input.end}],metrics:metricNames.map(name=>({name})),limit:String(limit),keepEmptyRows:false};
  if(dimension)params.dimensions=(Array.isArray(dimension)?dimension:[dimension]).map(name=>({name}));
  const filter=ga4Filter(input);if(filter)params.dimensionFilter=filter;
  if(dimension)params.orderBys=typeof dimension==='string' && (dimension==='yearMonth'||dimension==='date'||dimension==='yearWeek'||dimension==='dateHour')
    ? [{dimension:{dimensionName:dimension}}] : [{metric:{metricName:metricNames[0]},desc:true}];
  return googlePost('ga4',ga4endpoint(id),params);
}
const CORE=['screenPageViews','activeUsers','sessions','engagedSessions'];
const ADVANCED=['totalUsers','newUsers','eventCount','scrolledUsers','userEngagementDuration','averageSessionDuration','bounceRate','dauPerMau','wauPerMau','screenPageViewsPerSession','sessionsPerUser','screenPageViewsPerUser'] as const;
function fieldMap(report:any,names:readonly string[]):Record<string,number>{
  const values=report?.rows?.[0]?.metricValues||[];
  return Object.fromEntries(names.map((name,i)=>[name,number(values[i]?.value)]));
}
function parseGa4Series(report:any,names:string[],grain:Grain):TrendRow[]{
  return (report.rows||[]).map((r:any)=>{
    const raw=single(r.dimensionValues?.[0]);let period=raw;
    if(grain==='month'&&/^\d{6}$/.test(raw))period=`${raw.slice(0,4)}-${raw.slice(4,6)}`;
    if(grain==='day'&&/^\d{8}$/.test(raw))period=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
    if(grain==='hour'&&/^\d{10}$/.test(raw))period=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)} ${raw.slice(8,10)}h`;
    if(grain==='week'&&/^\d{6}$/.test(raw))period=`${raw.slice(0,4)}-S${raw.slice(4,6)}`;
    const m=Object.fromEntries(names.map((name,i)=>[name,number(r.metricValues?.[i]?.value)]));
    return {period,views:m.screenPageViews,activeUsers:m.activeUsers,sessions:m.sessions,engagedSessions:m.engagedSessions,
      engagementRate:m.sessions>0?m.engagedSessions/m.sessions:null};
  });
}
function parseGa4Rank(report:any):Breakdown[]{
  return (report.rows||[]).map((r:any)=>({label:single(r.dimensionValues?.[0]),views:number(r.metricValues?.[0]?.value),value:number(r.metricValues?.[0]?.value)}));
}
function combineGa4Platforms(parts:TrendRow[][], input:AnalyticsInput):TrendRow[]{
  const map=new Map<string,TrendRow[]>();
  parts.flat().forEach(r=>map.set(r.period,[...(map.get(r.period)||[]),r]));
  return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([period,items])=>{
    const views=items.reduce((s,r)=>s+(r.views||0),0),sessions=items.reduce((s,r)=>s+(r.sessions||0),0),engagedSessions=items.reduce((s,r)=>s+(r.engagedSessions||0),0);
    return {period,views,sessions,engagedSessions,engagementRate:sessions>0?engagedSessions/sessions:null,
      activeUsers:input.platform==='both'?null:(items[0]?.activeUsers??null)};
  });
}
const mergeRank=(parts:Breakdown[][]):Breakdown[]=>{
  const map=new Map<string,Breakdown>();
  for(const r of parts.flat()){
    const found=map.get(r.label);
    map.set(r.label,{label:r.label,value:(found?.value||0)+r.value,views:(found?.views||0)+(r.views||0)});
  }
  return [...map.values()].sort((a,b)=>b.value-a.value).slice(0,15);
};
function parseSegments(report:any,names:string[],scope:'content'|'session'|'audience'):Ga4Segment[]{
  return (report.rows||[]).map((r:any)=>{
    const m=Object.fromEntries(names.map((name,i)=>[name,number(r.metricValues?.[i]?.value)]));
    const users=m.activeUsers??null;
    const seconds=m.userEngagementDuration??null;
    const sessions=scope==='session'||scope==='audience'?m.sessions??null:null;
    const engaged=scope==='session'?m.engagedSessions??null:null;
    return {label:single(r.dimensionValues?.[0]),views:m.screenPageViews??0,sessions,engagedSessions:engaged,
      activeUsers:users,newUsers:m.newUsers??null,engagementSeconds:seconds,
      engagementRate:sessions!==null&&sessions>0&&engaged!==null?engaged/sessions:null,
      engagementSecondsPerUser:users!==null&&users>0&&seconds!==null?seconds/users:null};
  });
}
/** Canonicaliza URLs para associar o título, sem alterar a dimensão do ranking.
 * Um artigo Web e sua versão AMP usam a mesma chave somente para localizar título.
 */
function titleKey(value:string):string{
  let raw=value.trim();
  if(!raw)return '';
  try { if(/^https?:\/\//i.test(raw)) raw=new URL(raw).pathname; } catch { /* usa o valor recebido */ }
  raw=raw.split('#')[0].split('?')[0].replace(/\/amp\/?$/i,'').replace(/\/+/g,'/');
  return ('/'+raw.replace(/^\/+|\/+$/g,'')).toLocaleLowerCase('pt-BR');
}
function realTitle(value:string):string|null{
  const title=value.trim();
  if(!title || /^\(?not set\)?$/i.test(title) || title==='-')return null;
  return title;
}

const SEGMENT_DEFS={
  channelQuality:{dimension:'sessionDefaultChannelGroup',metrics:['sessions','engagedSessions','screenPageViews','activeUsers','newUsers','userEngagementDuration'],scope:'session',limit:20},
  sourceMedium:{dimension:'sessionSourceMedium',metrics:['sessions','engagedSessions','screenPageViews','activeUsers','newUsers','userEngagementDuration'],scope:'session',limit:25},
  contentQuality:{dimension:'unifiedPagePathScreen',metrics:['screenPageViews','activeUsers','userEngagementDuration'],scope:'content',limit:180},
  landingPages:{dimension:'landingPage',metrics:['sessions','engagedSessions','screenPageViews','activeUsers'],scope:'session',limit:120},
  audience:{dimension:'newVsReturning',metrics:['sessions','screenPageViews','activeUsers'],scope:'audience',limit:10}
} as const;
function combineSegments(parts:Ga4Segment[][],crossProperty:boolean):Ga4Segment[]{
  const map=new Map<string,Ga4Segment[]>();
  parts.flat().forEach(r=>map.set(r.label,[...(map.get(r.label)||[]),r]));
  return [...map.entries()].map(([label,items])=>{
    const views=items.reduce((s,r)=>s+r.views,0);
    const add=(key:'sessions'|'engagedSessions'|'engagementSeconds')=>{
      const some=items.filter(r=>r[key]!==null);return some.length===items.length?some.reduce((s,r)=>s+(r[key]||0),0):null;
    };
    const sessions=add('sessions'),engagedSessions=add('engagedSessions'),engagementSeconds=add('engagementSeconds');
    const activeUsers=crossProperty?null:items[0]?.activeUsers??null;
    const newUsers=crossProperty?null:items[0]?.newUsers??null;
    return {label,views,sessions,engagedSessions,activeUsers,newUsers,engagementSeconds,
      engagementRate:sessions!==null&&sessions>0&&engagedSessions!==null?engagedSessions/sessions:null,
      engagementSecondsPerUser:activeUsers!==null&&activeUsers>0&&engagementSeconds!==null?engagementSeconds/activeUsers:null};
  }).sort((a,b)=>b.views-a.views);
}
function emptyAdvanced():Ga4Extra['metrics']{
  return {totalUsers:null,newUsers:null,eventCount:null,scrolledUsers:null,engagementSeconds:null,
    averageSessionDuration:null,bounceRate:null,dauPerMau:null,wauPerMau:null,pagesPerSession:null,
    sessionsPerUser:null,viewsPerUser:null,engagementSecondsPerUser:null};
}
export async function ga4Data(input:AnalyticsInput):Promise<DashboardData>{
  const platforms=input.platform==='both'?(['web','amp'] as const):([input.platform] as ('web'|'amp')[]);
  const crossProperty=platforms.length>1;
  const dimension=input.grain==='month'?'yearMonth':input.grain==='week'?'yearWeek':input.grain==='hour'?'dateHour':'date';
  const span=input.grain==='hour'?{...input,start:shiftDate(input.end,-1)}:input;
  // Série e totais são independentes: usuários distintos não são somados entre períodos.
  const corePerPlatform=await Promise.all(platforms.map(async p=>{
    const [series,totals]=await Promise.all([
      ga4Report(GA4_IDS[p],span,dimension,CORE,700),
      ga4Report(GA4_IDS[p],span,null,CORE,1)
    ]);
    return {series:parseGa4Series(series,CORE,input.grain),total:fieldMap(totals,CORE)};
  }));
  const series=combineGa4Platforms(corePerPlatform.map(r=>r.series),input);
  const scalars=corePerPlatform.map(x=>x.total);
  const views=scalars.reduce((s,r)=>s+r.screenPageViews,0);
  const sessions=scalars.reduce((s,r)=>s+r.sessions,0);
  const engagedSessions=scalars.reduce((s,r)=>s+r.engagedSessions,0);
  const summary:TrendRow={period:'Total do intervalo',views,sessions,engagedSessions,
    activeUsers:crossProperty?null:scalars[0].activeUsers,
    engagementRate:sessions>0?engagedSessions/sessions:null};
  const warnings:string[]=[];
  const limitations:string[]=[];
  // Consultas secundárias são isoladas: se uma combinação falhar, o painel principal continua carregando.
  const advanced:Record<string,number>[]=[];
  await Promise.all(platforms.map(async (p,i)=>{
    const output:Record<string,number>={};
    for(const batch of [ADVANCED.slice(0,5),ADVANCED.slice(5)]){
      try{Object.assign(output,fieldMap(await ga4Report(GA4_IDS[p],span,null,[...batch],1),batch));}
      catch{
        // Plano B: consulta individual para preservar as métricas compatíveis.
        for(const name of batch){
          try{Object.assign(output,fieldMap(await ga4Report(GA4_IDS[p],span,null,[name],1),[name]));}
          catch{limitations.push(`${p.toUpperCase()}: ${name} não disponível no recorte.`);}
        }
      }
    }
    advanced[i]=output;
  }));
  const am=emptyAdvanced();
  const sumMetric=(key:string):number|null=>advanced.every(r=>r[key]!==undefined)?advanced.reduce((s,r)=>s+r[key],0):null;
  const only=(key:string):number|null=>crossProperty?null:advanced[0]?.[key]??null;
  am.totalUsers=only('totalUsers');
  am.newUsers=only('newUsers');
  am.scrolledUsers=only('scrolledUsers');
  am.eventCount=sumMetric('eventCount');
  am.engagementSeconds=sumMetric('userEngagementDuration');
  am.pagesPerSession=sessions>0?views/sessions:null;
  // activeUsers é opcional no tipo TrendRow e também pode ser nulo quando Web + AMP.
  // Só calculamos a média quando ambos os valores forem números válidos.
  const activeUsers = summary.activeUsers;
  const engagementSeconds = am.engagementSeconds;
  am.engagementSecondsPerUser =
    typeof activeUsers === 'number' && activeUsers > 0 &&
    typeof engagementSeconds === 'number'
      ? engagementSeconds / activeUsers
      : null;
  am.sessionsPerUser=only('sessionsPerUser');
  am.viewsPerUser=only('screenPageViewsPerUser');
  am.dauPerMau=only('dauPerMau');am.wauPerMau=only('wauPerMau');
  am.averageSessionDuration=sessions>0&&advanced.every(r=>r.averageSessionDuration!==undefined)
    ?advanced.reduce((s,r,i)=>s+r.averageSessionDuration*scalars[i].sessions,0)/sessions:null;
  // Taxa de rejeição ponderada pela quantidade de sessões.
  am.bounceRate=sessions>0?(advanced.every(r=>r.bounceRate!==undefined)
    ?advanced.reduce((s,r,i)=>s+r.bounceRate*scalars[i].sessions,0)/sessions
    :1-engagedSessions/sessions):null;
  const segmentKeys=(Object.keys(SEGMENT_DEFS) as (keyof typeof SEGMENT_DEFS)[]);
  const segments=await Promise.all(segmentKeys.map(async key=>{
    const spec=SEGMENT_DEFS[key];
    const parts=await Promise.all(platforms.map(async p=>{
      let names:string[]=[...spec.metrics];
      try{return {result:await ga4Report(GA4_IDS[p],span,spec.dimension,names,spec.limit),names};}
      catch{
        // Alguns pares dimensão/métrica são incompatíveis na Data API.
        names=key==='channelQuality'||key==='sourceMedium'?['sessions','engagedSessions','screenPageViews']:
          key==='landingPages'?['sessions','engagedSessions']:
          key==='contentQuality'?['screenPageViews','activeUsers']:['activeUsers','screenPageViews'];
        try{
          const result=await ga4Report(GA4_IDS[p],span,spec.dimension,names,spec.limit);
          warnings.push(`${key}/${p}: detalhamento reduzido por compatibilidade de métricas.`);
          return {result,names};
        }catch{return null;}
      }
    }));
    if(parts.some(x=>x===null)){
      warnings.push(`Análise ${key} indisponível neste recorte; a série principal continua válida.`);
      return [] as Ga4Segment[];
    }
    return combineSegments(parts.map(x=>parseSegments(x!.result,x!.names,spec.scope)),crossProperty);
  }));
  // Consulta complementar: busca os títulos reais sem modificar os totais por URL.
  // Agrupar simultaneamente por pageTitle + URL no ranking principal poderia
  // desdobrar uma mesma matéria em várias linhas quando o título é alterado.
  const titleSelections=await Promise.all(platforms.map(async p=>{
    try {
      const report=await ga4Report(GA4_IDS[p],span,['unifiedPagePathScreen','pageTitle'],['screenPageViews'],1500);
      return (report.rows||[]).map((row:any)=>({
        path:single(row.dimensionValues?.[0]),
        title:realTitle(single(row.dimensionValues?.[1])),
        views:number(row.metricValues?.[0]?.value)
      }));
    } catch {
      warnings.push(`Títulos de páginas indisponíveis em ${p.toUpperCase()}; exibiremos nomes derivados das URLs.`);
      return [] as {path:string;title:string|null;views:number}[];
    }
  }));
  const bestTitle=new Map<string,{title:string;views:number}>();
  for(const item of titleSelections.flat()){
    if(!item.title)continue;
    const key=titleKey(item.path);
    if(!key)continue;
    const previous=bestTitle.get(key);
    if(!previous || item.views>previous.views)bestTitle.set(key,{title:item.title,views:item.views});
  }
  for(const index of [segmentKeys.indexOf('contentQuality'),segmentKeys.indexOf('landingPages')]){
    if(index<0)continue;
    segments[index]=segments[index].map(row=>({
      ...row,
      title:bestTitle.get(titleKey(row.label))?.title??null
    }));
  }
  const eventParts=await Promise.allSettled(platforms.map(p=>ga4Report(GA4_IDS[p],span,'eventName',['eventCount'],25)));
  const events:Ga4Event[]=[];
  if(eventParts.every(x=>x.status==='fulfilled')){
    const map=new Map<string,number>();
    for(const part of eventParts){
      const report=(part as PromiseFulfilledResult<any>).value;
      for(const row of report.rows||[]){
        const name=single(row.dimensionValues?.[0]);
        map.set(name,(map.get(name)||0)+number(row.metricValues?.[0]?.value));
      }
    }
    events.push(...[...map.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,20));
  }else warnings.push('Eventos por tipo indisponíveis neste recorte.');
  // Detalhamentos usados pela interface anterior, preservados para GA4.
  const legacy=await Promise.all(platforms.map(async p=>{
    const specs=[['deviceCategory',8],['country',12]] as const;
    return Promise.all(specs.map(async ([dim,limit])=>{
      try{return parseGa4Rank(await ga4Report(GA4_IDS[p],span,dim,['screenPageViews'],limit));}
      catch{warnings.push(`Detalhamento ${dim} indisponível para ${p}.`);return [] as Breakdown[];}
    }));
  }));
  const extra:Ga4Extra={metrics:am,channelQuality:segments[0],sourceMedium:segments[1],contentQuality:segments[2],landingPages:segments[3],audience:segments[4],events,limitations};
  return {source:'ga4',scope:input.scope,sourceLabel:'Google Analytics 4',description:`${SCOPE_LABELS[input.scope]} · ${input.platform.toUpperCase()}`,
    platform:input.platform,granularity:input.grain,start:span.start,endRequested:input.end,endAvailable:series.at(-1)?.period||null,status:'final',generatedAt:new Date().toISOString(),
    propertyIds:platforms.map(p=>GA4_IDS[p]),summary,series,ga4Extra:extra,
    devices:mergeRank(legacy.map(x=>x[0])),countries:mergeRank(legacy.map(x=>x[1])),
    pages:extra.contentQuality.map(r=>({label:r.label,value:r.views,views:r.views})).slice(0,15),queries:[],
    channels:extra.channelQuality.map(r=>({label:r.label,value:r.views,views:r.views})).slice(0,15),warnings,
    notes:['GA4: consulta até D-1 no fuso de São Paulo. Os dados podem sofrer processamento posterior.',
      'Web e AMP são propriedades separadas. Usuários distintos e métricas por usuário ficam indisponíveis quando ambas são selecionadas.',
      'As taxas de rejeição/engajamento são ponderadas pelas sessões; o tempo médio da sessão também é ponderado.',
      'Os rankings são limitados às principais linhas retornadas e não devem ser somados como totais do portal.',
      'Editorias são identificadas por padrão de URL; valide URLs fora dos prefixos previstos.',
      ...(input.grain==='hour'?['Consulta horária: últimos dois dias completos; indicadores do topo usam o mesmo período curto.']:[])
    ]};
}

function gscFilter(input:AnalyticsInput):any[] {
 const filters:any[]=[];
 const p=pageRegex(input.scope,input.editor);
 if(p)filters.push({dimension:'page',operator:'includingRegex',expression:p});
 if(input.platform==='amp')filters.push({dimension:'page',operator:'includingRegex',expression:'(?i)/amp/?(?:\\?.*)?$'});
 if(input.platform==='web')filters.push({dimension:'page',operator:'excludingRegex',expression:'(?i)/amp/?(?:\\?.*)?$'});
 if(input.device!=='all' && input.surface!=='discover')filters.push({dimension:'device',operator:'equals',expression:input.device.toUpperCase()});
 if(input.country!=='all')filters.push({dimension:'country',operator:'equals',expression:({BR:'bra',US:'usa',PT:'prt',AR:'arg'} as Record<string,string>)[input.country]||'bra'});
 return filters;
}
async function gscReport(input:AnalyticsInput,dimensions:string[],limit:number,dataState:DataState|'hourly_all'=input.dataState):Promise<any>{
 const site=SITES[input.scope];
 const start=input.grain==='hour'?shiftDate(input.end,-2):input.start;
 const body:any={startDate:start,endDate:input.end,type:input.surface,dimensions,rowLimit:limit,startRow:0,dataState};
 const filters=gscFilter(input);if(filters.length)body.dimensionFilterGroups=[{groupType:'and',filters}];
 // Totais de Discover e Google Notícias: somente agregação auto.
 return googlePost('gsc',gscendpoint(site),body);
}
function parseGscRank(body:any, labelField:string):Breakdown[] {
 return (body.rows||[]).map((r:any)=>({label:String(r.keys?.[0]||''),clicks:number(r.clicks),impressions:number(r.impressions),value:number(r.clicks),ctr:number(r.impressions)>0?number(r.clicks)/number(r.impressions):null,
  position:typeof r.position==='number'?r.position:null}));
}
export async function gscData(input:AnalyticsInput):Promise<DashboardData> {
  const warnings:string[]=[];
  const gscGrain=input.grain==='hour'?'hour':'date';
  const main=await gscReport(input,[gscGrain],input.grain==='hour'?400:1800,input.grain==='hour'?'hourly_all':input.dataState);
  const raw:TrendRow[]=(main.rows||[]).map((r:any)=>({period:String(r.keys?.[0]||''),clicks:number(r.clicks),impressions:number(r.impressions),
    ctr:number(r.impressions)>0?number(r.clicks)/number(r.impressions):null,
    position:input.surface==='web'&&typeof r.position==='number'?r.position:null})).sort((a:TrendRow,b:TrendRow)=>a.period.localeCompare(b.period));
  // Totais consolidados em query SEM dimensões, não são estimados a partir dos rankings.
  const totalRaw=input.grain==='hour'?null:await gscReport(input,[],1,input.dataState);
  const total=totalRaw?.rows?.[0];
  const summary:TrendRow=total?{period:'Total do intervalo',clicks:number(total.clicks),impressions:number(total.impressions),
    ctr:number(total.impressions)>0?number(total.clicks)/number(total.impressions):null,
    position:input.surface==='web'&&typeof total.position==='number'?total.position:null}:
    summaryGsc(raw);
  const series=input.grain==='week'||input.grain==='month'?combine(raw,input.grain):raw;
  const reqs:{key:'pages'|'queries'|'devices'|'countries';dims:string[];allowed:boolean;limit:number}[]=[
    {key:'pages',dims:['page'],allowed:true,limit:100},
    {key:'queries',dims:['query'],allowed:input.surface==='web',limit:100},
    {key:'devices',dims:['device'],allowed:input.surface!=='discover',limit:10},
    {key:'countries',dims:['country'],allowed:true,limit:20}
  ];
  const extras=await Promise.all(reqs.map(async q=>{
    if(!q.allowed)return [] as Breakdown[];
    try{const res=await gscReport(input,q.dims,q.limit,input.grain==='hour'?'all':input.dataState);return parseGscRank(res,q.key);}
    catch{warnings.push(`${q.key}: consulta indisponível neste recorte.`);return [] as Breakdown[];}
  }));
  const available=raw.length?raw.at(-1)!.period.slice(0,10):null;
  const site=SITES[input.scope];
  return {source:'gsc',sourceLabel:SURFACE_LABELS[input.surface],description:`${SCOPE_LABELS[input.scope]} · ${SURFACE_LABELS[input.surface]}`,
    scope:input.scope,site,surface:input.surface,platform:input.platform,granularity:input.grain,
    start:input.grain==='hour'?shiftDate(input.end,-2):input.start,endRequested:input.end,endAvailable:available,
    generatedAt:new Date().toISOString(),status:input.dataState==='all'||input.grain==='hour'?'preliminary':'final',summary,series,
    devices:extras[2],countries:extras[3],pages:extras[0],queries:extras[1],channels:[],warnings,
    notes:[
      'Search Console: final por padrão; a última data finalizada pode ser anterior a D-1.',
      'Rankings de páginas/consultas mostram apenas as principais linhas retornadas pela API, não o total.',
      'O filtro por editoria usa caminhos de URL e pode excluir páginas fora dos prefixos conhecidos.',
      ...(input.scope==='campinas'?['Campinas é consultada na propriedade GSC geral com filtro de URLs de Campinas + Piracicaba.']:[]),
      ...(input.platform!=='both'?['Filtro Web/AMP no GSC é heurístico baseado em URL /amp/; não corresponde diretamente à separação entre propriedades GA4.']:[]),
      ...(input.grain==='hour'?['Série horária: últimos três dias, dados preliminares; API não permite agrupar simultaneamente por data e hora.']:[]),
      ...(input.surface==='discover'?['Discover não oferece agrupamento por dispositivo nesta API.']:[])
    ]};
}
