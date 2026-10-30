import { NextRequest, NextResponse } from 'next/server';
import { EDITORIAS } from '@/lib/config';
import type { Scope, Platform } from '@/lib/types';
import { investigate, type InvestigationInput } from '@/lib/ai/investigation';
import { writeAnalysis } from '@/lib/ai/analyst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const scopes:Scope[]=['geral','campinas','ribeiraopreto','tudoep'];
const platforms:Platform[]=['web','amp','both'];
const quota=new Map<string,{count:number;expires:number}>();

function isInput(raw:any):raw is InvestigationInput {
  return raw && typeof raw.question==='string' && raw.question.trim().length>=5 && raw.question.length<=850 &&
    scopes.includes(raw.scope) && Object.prototype.hasOwnProperty.call(EDITORIAS,raw.editor) &&
    platforms.includes(raw.platform) && [1,2,3].includes(raw.months) && ['anterior','ano_anterior'].includes(raw.compare);
}
export async function POST(request:NextRequest) {
  try {
    // MVP local: recusa produÃ§Ã£o deliberadamente atÃ© autenticaÃ§Ã£o, rate limit persistente e aprovaÃ§Ã£o.
    if(process.env.NODE_ENV === 'production' && process.env.ANALISTA_ENABLED !== 'true') return NextResponse.json({error:'Analista IA ainda habilitado somente para testes locais.'},{status:403});
    const origin=request.headers.get('origin');
    const host=request.headers.get('host');
    if(origin && host && new URL(origin).host!==host)return NextResponse.json({error:'Origem nÃ£o autorizada.'},{status:403});
    const len=Number(request.headers.get('content-length')||'0');
    if(len>12000)return NextResponse.json({error:'Mensagem muito grande.'},{status:413});
    const body=await request.json();
    if(!isInput(body))return NextResponse.json({error:'Informe pergunta, escopo, editoria e perÃ­odo vÃ¡lidos.'},{status:400});
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0]||'local';
    const current=quota.get(ip);
    const now=Date.now();
    if(quota.size>1000)quota.clear();
    const state=current && current.expires>now?current:{count:0,expires:now+300000};
    if(state.count>=6)return NextResponse.json({error:'Limite de 6 anÃ¡lises por 5 minutos atingido.'},{status:429});
    state.count++;quota.set(ip,state);
    const historyRaw:unknown = (body as InvestigationInput & { history?:unknown }).history;
    const history=Array.isArray(historyRaw)?historyRaw.slice(-4).filter((x:any)=>(x?.role==='user'||x?.role==='assistant')&&typeof x.content==='string').map((x:any)=>({role:x.role as 'user'|'assistant',content:String(x.content).slice(0,1800)})):[];
    const results=await investigate(body);
    const output=await writeAnalysis(body.question,results,history);
    return NextResponse.json({...output,investigation:results},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch(e) {
    // Erros de provedores e OAuth nunca sÃ£o registrados ou devolvidos em bruto.
    console.error('[CIDADEON ANALISTA] Falha na consulta ou na anÃ¡lise.');
    return NextResponse.json({error:'NÃ£o foi possÃ­vel concluir a consulta. Verifique as credenciais e tente novamente.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
