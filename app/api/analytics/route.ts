import {NextRequest,NextResponse} from 'next/server';
import {dateSP,shiftDate,validateDate,EDITORIAS} from '@/lib/config';
import {ga4Data,gscData,type AnalyticsInput} from '@/lib/providers';
import type {Source,Scope,Platform,Surface,Grain,DataState} from '@/lib/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const SCOPES=['geral','campinas','ribeiraopreto','tudoep'];
const SOURCES=['ga4','gsc'];const PLATFORMS=['web','amp','both'];
const SURFACES=['web','discover','googleNews'];const GRAINS=['day','week','month','hour'];
const DEVICE=['all','mobile','desktop','tablet'];const COUNTRY=['all','BR','US','PT','AR'];
type CacheEntry={expires:number;response:unknown};
const cache=new Map<string,CacheEntry>();
function one(p:URLSearchParams,name:string,allowed:string[],defaultVal:string):string {
 const raw=p.get(name)||defaultVal;if(!allowed.includes(raw))throw new Error(`Filtro ${name} inválido.`);return raw;
}
export async function GET(request:NextRequest){
 try{
  const p=request.nextUrl.searchParams;
  const endLimit=dateSP(new Date(),1);
  const start=p.get('start')||shiftDate(endLimit,-89);
  const end=p.get('end')||endLimit;
  if(!validateDate(start)||!validateDate(end)||start>end||end>endLimit)throw new Error('Período inválido: data final deve ser até D-1.');
  const diff=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;
  if(diff>550)throw new Error('Limite de consulta: 551 dias por vez.');
  const source=one(p,'source',SOURCES,'gsc') as Source;
  const grain=one(p,'grain',GRAINS,'month') as Grain;
  const input:AnalyticsInput={source,scope:one(p,'scope',SCOPES,'geral') as Scope,
    editor:one(p,'editor',Object.keys(EDITORIAS),'todas') as AnalyticsInput['editor'],
    platform:one(p,'platform',PLATFORMS,source==='ga4'?'web':'both') as Platform,
    surface:one(p,'surface',SURFACES,'web') as Surface,grain,start,end,
    device:one(p,'device',DEVICE,'all'),country:one(p,'country',COUNTRY,'all'),
    dataState:one(p,'dataState',['final','all'],'final') as DataState};
  if(input.source==='gsc'&&input.surface==='discover'&&input.device!=='all')throw new Error('Discover não permite filtro de dispositivo.');
  const key=JSON.stringify(input);const hit=cache.get(key);
  if(hit && hit.expires>Date.now())return NextResponse.json(hit.response,{headers:{'Cache-Control':'private, max-age=0'}});
  const result=source==='ga4'?await ga4Data(input):await gscData(input);
  if(cache.size>60)cache.clear();cache.set(key,{response:result,expires:Date.now()+15*60*1000});
  return NextResponse.json(result,{headers:{'Cache-Control':'private, max-age=0','X-Content-Type-Options':'nosniff'}});
 }catch(e){
  const message=e instanceof Error?e.message:'Erro interno';
  console.error('[CIDADEON API]',message);
  const invalid=/inválid|Limite|permite filtro/.test(message);
  return NextResponse.json({error:message},{status:invalid?400:503,headers:{'Cache-Control':'no-store'}});
 }
}
