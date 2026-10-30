import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AnalystChat } from '@/components/analyst-chat';

export const metadata: Metadata = {
  title: 'Analista IA | Cidade ON',
  description: 'InvestigaÃ§Ãµes de audiÃªncia digital com GA4 e Search Console',
};

export default function AnalystPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ANALISTA_ENABLED !== 'true') notFound();
  return <AnalystChat />;
}
