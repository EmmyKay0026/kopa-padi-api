import { isIP } from 'node:net';

// Trust only explicitly configured immediate proxies, never arbitrary forwarded headers.
export function trustedProxies(value = process.env.TRUST_PROXY): false | string[] {
  if (!value?.trim()) return false;
  const entries = value.split(',').map(part => part.trim());
  for (const entry of entries) {
    const [address, bits, ...extra] = entry.split('/');
    const version = isIP(address);
    if (!version || extra.length || (bits !== undefined && (!/^\d+$/.test(bits) || Number(bits) < 1 || Number(bits) > (version === 4 ? 32 : 128)))) {
      throw new Error('TRUST_PROXY must contain explicit proxy IPs or bounded CIDRs');
    }
  }
  return entries;
}

export function allowedBrowserWrite(method: string, origin: string | undefined, fetchSite: string | undefined, webOrigin: string) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  if (origin !== undefined) return origin === new URL(webOrigin).origin;
  // Non-browser clients may omit Origin. Cross-site browser writes must not.
  return fetchSite !== 'cross-site';
}

export function allowedAuthRedirects(body: unknown, origins: string[]) {
  if (!body || typeof body !== 'object') return true;
  const fields = ['callbackURL', 'redirectTo', 'errorCallbackURL', 'newUserCallbackURL'];
  return fields.every(key => {
    const value = (body as Record<string, unknown>)[key];
    if (value === undefined) return true;
    if (typeof value !== 'string') return false;
    try { return origins.includes(new URL(value, origins[0]).origin); } catch { return false; }
  });
}
