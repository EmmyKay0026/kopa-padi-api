import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { allowedAuthRedirects, allowedBrowserWrite, trustedProxies } from './http-security.js';

describe('HTTP trust boundaries', () => {
  it('refuses wildcard and hop-count proxy trust', () => {
    expect(trustedProxies('')).toBe(false);
    expect(trustedProxies('127.0.0.1,::1')).toEqual(['127.0.0.1', '::1']);
    for (const value of ['true', '*', '1', '0.0.0.0/0', '::/0', '127.0.0.1/99']) expect(() => trustedProxies(value)).toThrow();
  });
  it('does not use spoofed forwarded headers by default', async () => {
    const app = Fastify({trustProxy: trustedProxies('')});
    app.get('/', request => ({ip:request.ip,protocol:request.protocol}));
    try { const response = await app.inject({url:'/',headers:{'x-forwarded-for':'198.51.100.1','x-forwarded-proto':'https'}});expect(response.json()).toEqual({ip:'127.0.0.1',protocol:'http'}); }
    finally { await app.close(); }
  });
  it('requires exact Origin for browser writes; CORS is not authorization', () => {
    const web='https://staging.example.invalid';
    for (const origin of ['null','https://hostile.invalid',web+'.hostile.invalid']) expect(allowedBrowserWrite('POST',origin,'cross-site',web)).toBe(false);
    expect(allowedBrowserWrite('POST',web,'same-site',web)).toBe(true);
    expect(allowedBrowserWrite('POST',undefined,'cross-site',web)).toBe(false);
    expect(allowedBrowserWrite('GET',undefined,'cross-site',web)).toBe(true);
  });
  it('rejects open redirects including protocol-relative and backslash URLs', () => {
    const origins=['https://staging.example.invalid'];
    for(const redirectTo of ['https://hostile.invalid','//hostile.invalid','/\\hostile.invalid']) expect(allowedAuthRedirects({redirectTo},origins)).toBe(false);
    expect(allowedAuthRedirects({redirectTo:'/reset-password'},origins)).toBe(true);
  });
});
