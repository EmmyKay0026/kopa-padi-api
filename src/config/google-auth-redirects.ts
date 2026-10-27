function pathname(url: string, apiOrigin: string) {
  return new URL(url, apiOrigin).pathname.replace(/\/+$/, '');
}

/** App return paths belong to WEB_URL; the OAuth protocol callback stays on the API. */
function frontendReturnURL(value: string, webURL: string, authURL: string) {
  const webOrigin = new URL(webURL).origin;
  const apiOrigin = new URL(authURL).origin;
  let target: URL;
  try { target = new URL(value, webOrigin); } catch { return value; }
  // Leave untrusted values intact so the existing redirect guard rejects them.
  if (target.origin !== webOrigin && target.origin !== apiOrigin) return value;
  const result = new URL(webOrigin);
  result.pathname = target.pathname;
  result.search = target.search;
  result.hash = target.hash;
  return result.href;
}

export function normalizeGoogleAuthRequest(requestURL: string, body: unknown, webURL: string, authURL: string) {
  if (pathname(requestURL, authURL) !== '/api/auth/sign-in/social' || !body || typeof body !== 'object' || (body as Record<string, unknown>).provider !== 'google') return body;
  const input = body as Record<string, unknown>;
  const normalize = (value: unknown, fallback: string): unknown => value === undefined || value === ''
    ? frontendReturnURL(fallback, webURL, authURL)
    : typeof value === 'string' ? frontendReturnURL(value, webURL, authURL) : value;
  const callbackURL = normalize(input.callbackURL, '/verification');
  const errorURL = new URL('/login', new URL(webURL).origin);
  errorURL.searchParams.set('googleAuthError', '1');
  if (typeof callbackURL === 'string') {
    try { const target = new URL(callbackURL); if (target.origin === errorURL.origin) errorURL.searchParams.set('next', `${target.pathname}${target.search}${target.hash}`); } catch { /* The existing validator handles malformed input. */ }
  }
  return { ...input, callbackURL, newUserCallbackURL: normalize(input.newUserCallbackURL, typeof callbackURL === 'string' ? callbackURL : '/verification'), errorCallbackURL: normalize(input.errorCallbackURL, errorURL.href) };
}

/** Also repairs return values inside OAuth state issued before the client update. */
export function normalizeGoogleAuthLocation(requestURL: string, location: string, webURL: string, authURL: string) {
  if (pathname(requestURL, authURL) !== '/api/auth/callback/google') return location;
  let target: URL;
  try { target = new URL(location, new URL(authURL).origin); } catch { return location; }
  if (target.origin !== new URL(authURL).origin || target.pathname === '/api/auth' || target.pathname.startsWith('/api/auth/')) return location;
  return frontendReturnURL(target.href, webURL, authURL);
}
