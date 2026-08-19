import type { NextResponse } from 'next/server';
import type { RelyingApplicationConfig } from '../config/environment';

export function writeLocalSessionCookie(
  response: NextResponse,
  config: RelyingApplicationConfig,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set({
    name: config.localSessionCookieName,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.localSessionCookieSecure,
    path: '/',
    maxAge: config.localSessionTtlSeconds,
    expires: expiresAt,
    priority: 'high',
  });
}

export function clearLocalSessionCookie(
  response: NextResponse,
  config: RelyingApplicationConfig,
): void {
  response.cookies.set({
    name: config.localSessionCookieName,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.localSessionCookieSecure,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    priority: 'high',
  });
}
