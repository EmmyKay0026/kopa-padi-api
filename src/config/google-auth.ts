/** Google is optional; password authentication stays available without credentials. */
export function googleSocialProviders(env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return {};
  return { google: { clientId, clientSecret } };
}
