import type { TrendRow, Grain } from './types';
export function isoWeek(date: string):string {
  const d=new Date(`${date}T00:00:00Z`),day=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-day);
  const year=d.getUTCFullYear();const first=new Date(Date.UTC(year,0,1));
  return `${year}-S${String(Math.ceil(((d.getTime()-first.getTime())/86400000+1)/7)).padStart(2,'0')}`;
}
export function bucket(date: string, grain: Grain): string {
  if(grain==='month') return date.slice(0,7);
  if(grain==='week') return isoWeek(date);
  if(grain==='hour') return date;
  return date.slice(0,10);
}
export function combine(rows:TrendRow[],grain:Grain):TrendRow[] {
  const groups=new Map<string,TrendRow[]>();
  rows.forEach(r=>{const key=bucket(r.period,grain);groups.set(key,[...(groups.get(key)||[]),r]);});
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([period,items])=> {
    const sum=(key:'views'|'clicks'|'impressions'|'sessions'|'engagedSessions')=>items.reduce((s,r)=>s+(r[key]||0),0);
    const views=sum('views'),clicks=sum('clicks'),impressions=sum('impressions'),sessions=sum('sessions'),engagedSessions=sum('engagedSessions');
    const positionNumerator=items.reduce((s,r)=>s+(r.position??0)*(r.impressions||0),0);
    // activeUsers: NUNCA soma para representar usuários distintos entre dias/propriedades.
    return {period,views,clicks,impressions,ctr:impressions>0?clicks/impressions:null,
      position:impressions>0&&items.some(r=>r.position!=null)?positionNumerator/impressions:null,
      sessions,engagedSessions,activeUsers:null,engagementRate:sessions>0?engagedSessions/sessions:null};
  });
}
export function summaryGsc(rows:TrendRow[]):TrendRow {
  const clicks=rows.reduce((x,r)=>x+(r.clicks||0),0),impressions=rows.reduce((x,r)=>x+(r.impressions||0),0);
  const hasPos=rows.some(x=>x.position!=null);
  return {period:'Total do período',clicks,impressions,ctr:impressions>0?clicks/impressions:null,
    position:hasPos&&impressions?rows.reduce((s,r)=>s+(r.position??0)*(r.impressions||0),0)/impressions:null};
}
export function summaryGa4(rows:TrendRow[],platformCount:number):TrendRow {
  const views=rows.reduce((x,r)=>x+(r.views||0),0),sessions=rows.reduce((x,r)=>x+(r.sessions||0),0),engagedSessions=rows.reduce((x,r)=>x+(r.engagedSessions||0),0);
  // Ativos só somáveis entre buckets quando existem buckets únicos? Não. Retornar null.
  return {period:'Total do período',views,sessions,engagedSessions,activeUsers:null,engagementRate:sessions?engagedSessions/sessions:null};
}
