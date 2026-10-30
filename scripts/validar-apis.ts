import {config} from 'dotenv';
config({path:'.env.local'});
import {googlePost} from '../lib/auth';
async function main(){
 const web=process.env.GA4_WEB_PROPERTY_ID||'326427533';
 const amp=process.env.GA4_AMP_PROPERTY_ID||'410193156';
 const ids=[web,amp];
 for(const id of ids){
  try{
   const data=await googlePost('ga4',`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`,{
    dateRanges:[{startDate:'7daysAgo',endDate:'yesterday'}],metrics:[{name:'screenPageViews'}]});
   console.log(`GA4 ${id}: OK · ${data.rows?.[0]?.metricValues?.[0]?.value||0} visualizações (propriedade inteira, 7 dias).`);
  }catch(e){console.error(`GA4 ${id}: ${e instanceof Error?e.message:e}`);process.exitCode=1;}
 }
 try{
  const data=await googlePost('gsc','https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent('https://www.acidadeon.com/')+'/searchAnalytics/query',{
   startDate:'2026-10-20',endDate:'2026-10-24',dimensions:['date'],type:'web',dataState:'final',rowLimit:10});
  console.log(`GSC Cidade ON Geral: OK · ${data.rows?.length||0} dias de exemplo (2026-10-20 a 24).`);
 }catch(e){console.error(`GSC: ${e instanceof Error?e.message:e}`);process.exitCode=1;}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Falha');process.exitCode=1});
