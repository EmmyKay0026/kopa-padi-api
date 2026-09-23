import { describe, expect, it } from 'vitest';

const base = process.env.TEST_BASE_URL;
describe.skipIf(!base)('Phase 1 deployed happy path', () => {
  it('rejects anonymous access to verified and admin routes', async () => {
    const [verified, admin] = await Promise.all([fetch(`${base}/api/verified-area`), fetch(`${base}/api/admin/verifications`)]);
    expect(verified.status).toBe(401); expect(admin.status).toBe(401);
  });
});
