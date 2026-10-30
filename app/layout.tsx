import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Cidade ON | Inteligência Digital',description:'Monitoramento GA4 e Search Console do portal Cidade ON'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
