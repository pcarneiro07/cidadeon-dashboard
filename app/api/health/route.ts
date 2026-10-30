import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ status: 'ok', app: 'Cidade ON', environment: 'snowflake-app-runtime' }, { status: 200 });
}
