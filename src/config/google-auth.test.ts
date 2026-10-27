import { describe, expect, it } from 'vitest';
import { googleSocialProviders } from './google-auth.js';

describe('optional Google provider', () => {
  it.each([{}, { GOOGLE_CLIENT_ID: 'id' }, { GOOGLE_CLIENT_SECRET: 'secret' }, { GOOGLE_CLIENT_ID: ' ', GOOGLE_CLIENT_SECRET: 'secret' }])('leaves Google unregistered with incomplete credentials', env => {
    expect(googleSocialProviders(env)).toEqual({});
  });
  it('registers server credentials using the standard Google provider defaults', () => {
    expect(googleSocialProviders({ GOOGLE_CLIENT_ID: ' client-id ', GOOGLE_CLIENT_SECRET: ' client-secret ' })).toEqual({ google: { clientId: 'client-id', clientSecret: 'client-secret' } });
  });
});
