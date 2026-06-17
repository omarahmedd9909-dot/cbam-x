import { NextRequest, NextResponse } from 'next/server';
import { DEV_BYPASS_COOKIE, DEV_BYPASS_SECRET, isDevBypassEnabled } from '@/lib/dev-auth';

export async function GET(request: NextRequest) {
  if (!isDevBypassEnabled()) {
    return NextResponse.json({ error: 'Dev bypass not enabled' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'logout') {
    const res = NextResponse.redirect(new URL('/login', request.url));
    res.cookies.delete(DEV_BYPASS_COOKIE);
    return res;
  }

  const res = NextResponse.redirect(new URL('/dashboard', request.url));
  res.cookies.set(DEV_BYPASS_COOKIE, DEV_BYPASS_SECRET, {
    httpOnly: false, // Allow JS to read in dev
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  });
  return res;
}
