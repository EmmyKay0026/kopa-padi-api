import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { normalizeGoogleAuthLocation, normalizeGoogleAuthRequest } from './google-auth-redirects.js';
import { allowedAuthRedirects } from './http-security.js';

const web = 'http://localhost:3000';
const api = 'http://localhost:4000';
const signIn = '/api/auth/sign-in/social';
const callback = '/api/auth/callback/google';

describe('Google app return URLs use the frontend', () => {
  it.each(['/verification', `${api}/verification`, `${web}/verification`])('normalizes the app callback %s', callbackURL => {
    const result = normalizeGoogleAuthRequest(signIn, { provider: 'google', callbackURL }, web, api) as Record<string, string>;
    expect(result.callbackURL).toBe(`${web}/verification`);
    expect(result.newUserCallbackURL).toBe(`${web}/verification`);
    expect(new URL(result.errorCallbackURL).origin).toBe(web);
  });
  it('defaults missing callbacks to the frontend and preserves an explicit destination', () => {
    const blank = normalizeGoogleAuthRequest(signIn, { provider: 'google' }, web, api) as Record<string, string>;
    expect(blank.callbackURL).toBe(`${web}/verification`);
    const result = normalizeGoogleAuthRequest(signIn, { provider: 'google', callbackURL: '/travel-plans?destinationState=Borno#details', errorCallbackURL: '/login?googleAuthError=1' }, web, api) as Record<string, string>;
    expect(result.callbackURL).toBe(`${web}/travel-plans?destinationState=Borno#details`);
    expect(result.newUserCallbackURL).toBe(result.callbackURL);
    expect(result.errorCallbackURL).toBe(`${web}/login?googleAuthError=1`);
  });
  it.each(['/verification', `${api}/verification`, '/travel-plans?destinationState=Borno#details'])('repairs the response from previously issued OAuth state: %s', location => {
    expect(normalizeGoogleAuthLocation(callback, location, web, api)).toBe(`${web}${new URL(location, api).pathname}${new URL(location, api).search}${new URL(location, api).hash}`);
  });
  it('preserves the actual Google protocol callback, auth error routes and other providers', () => {
    for (const location of ['/api/auth/error?error=state_mismatch', `${api}/api/auth/callback/google`, 'https://accounts.google.com/o/oauth2/v2/auth', `${web}/verification`]) expect(normalizeGoogleAuthLocation(callback, location, web, api)).toBe(location);
    expect(normalizeGoogleAuthLocation(signIn, 'https://accounts.google.com/o/oauth2/v2/auth', web, api)).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const email = { callbackURL: '/verification' };
    expect(normalizeGoogleAuthRequest('/api/auth/sign-in/email', email, web, api)).toBe(email);
    const other = { provider: 'github', callbackURL: '/verification' };
    expect(normalizeGoogleAuthRequest(signIn, other, web, api)).toBe(other);
  });
  it('does not turn unsafe URLs into allowed callbacks or allow double-slash paths to change origin', () => {
    for (const callbackURL of ['https://hostile.invalid', '//hostile.invalid', '/\\hostile.invalid', 'javascript:alert(1)', 123]) {
      expect(allowedAuthRedirects({ callbackURL }, [web, api])).toBe(false);
      const normalized = normalizeGoogleAuthRequest(signIn, { provider: 'google', callbackURL }, web, api);
      expect(allowedAuthRedirects(normalized, [web, api])).toBe(false);
    }
    const result = normalizeGoogleAuthLocation(callback, `${api}//hostile.invalid/path`, web, api);
    expect(new URL(result).origin).toBe(web);
  });
  it('uses configured production origins rather than hardcoded local ports', () => {
    expect(normalizeGoogleAuthLocation(callback, 'https://api.example.invalid/verification', 'https://app.example.invalid', 'https://api.example.invalid')).toBe('https://app.example.invalid/verification');
  });
  it('sends a legacy callback HTTP redirect to the frontend while retaining separate cookies', async () => {
    const server = Fastify();
    server.get(callback, (request, reply) => {
      const response = new Response(null, { status: 302, headers: { location: '/verification' } });
      response.headers.append('set-cookie', 'oauth_state=; Max-Age=0; Path=/');
      response.headers.append('set-cookie', 'session_token=synthetic; HttpOnly; Path=/');
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, key === 'location' ? normalizeGoogleAuthLocation(request.url, value, web, api) : value));
      return reply.send();
    });
    try {
      const response = await server.inject({ url: callback });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(`${web}/verification`);
      expect(response.cookies).toHaveLength(2);
    } finally { await server.close(); }
  });
});
