import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    DEV_BYPASS: process.env.DEV_BYPASS,
    NEXT_PUBLIC_DEV_BYPASS: process.env.NEXT_PUBLIC_DEV_BYPASS,
    NODE_ENV: process.env.NODE_ENV,
  });
}
