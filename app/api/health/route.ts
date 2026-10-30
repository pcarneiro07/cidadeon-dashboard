import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // Nenhuma informação sobre credenciais, usuários ou propriedades é exposta.
  return NextResponse.json({ status: 'ok', app: 'Cidade ON' });
}
