import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title:'Cidade ON | InteligÃªncia Digital',
  description:'Monitoramento GA4 e Search Console do portal Cidade ON',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>
    {(process.env.NODE_ENV !== 'production' || process.env.ANALISTA_ENABLED === 'true') && <nav aria-label="NavegaÃ§Ã£o principal" style={{display:'flex',justifyContent:'center',alignItems:'center',gap:20,padding:'11px 16px',background:'#142139',color:'#fff',fontSize:13,fontWeight:650}}>
      <Link href="/" style={{color:'inherit',textDecoration:'none'}}>GA4 e Search Console</Link>
      <span style={{opacity:0.35}}>|</span>
      <Link href="/analista" style={{color:'#ffc285',textDecoration:'none'}}>âœ¦ Analista IA</Link>
    </nav>}
    {children}
  </body></html>;
}
