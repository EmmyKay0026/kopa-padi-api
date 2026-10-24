import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ADMIN_ROUTE, AuthGuard, PUBLIC_ROUTE } from '../common/auth.guard.js';
import { BugReportsController } from './bug-reports.controller.js';
import { bugReportSchema, bugStatusSchema, testModeEnabled } from './bug-reports.schemas.js';
const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('../auth.js', () => ({ auth: { api: { getSession: session } } }));
vi.mock('../db/database.js', () => ({ db: {} }));

const request = { user: { id: 'synthetic-user' }, headers: {} } as any;
function context(method: keyof BugReportsController) {
  return { getHandler: () => BugReportsController.prototype[method], getClass: () => BugReportsController,
    switchToHttp: () => ({ getRequest: () => request }) } as any;
}
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('test mode bug reporting', () => {
  it.each([undefined, 'false', 'TRUE', '1', 'invalid', ''])('defaults off for %s', value => {
    vi.stubEnv('TEST_MODE', value); expect(testModeEnabled()).toBe(false);
  });
  it('enables only with exact true', () => { vi.stubEnv('TEST_MODE', 'true'); expect(testModeEnabled()).toBe(true); });
  it('blocks submissions when disabled without persisting', () => {
    vi.stubEnv('TEST_MODE', 'false'); const service = { create: vi.fn() };
    const controller = new BugReportsController(service as any);
    expect(() => controller.create(request, { title: 'A title', description: 'A description' })).toThrow('unavailable');
    expect(service.create).not.toHaveBeenCalled();
  });
  it('uses session identity and preserves inbox access when disabled', async () => {
    vi.stubEnv('TEST_MODE', 'true'); const service = { create: vi.fn().mockResolvedValue({ id: 'reference' }), list: vi.fn().mockResolvedValue([]) };
    const controller = new BugReportsController(service as any);
    await controller.create(request, { title: 'A title', description: 'A description' });
    expect(service.create).toHaveBeenCalledWith('synthetic-user', { title: 'A title', description: 'A description' });
    vi.stubEnv('TEST_MODE', 'false'); const reply = { header: vi.fn() };
    expect(controller.config(reply as any)).toEqual({ enabled: false });
    expect(await controller.list(reply as any)).toEqual([]);
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'private, no-store, max-age=0');
  });
  it('rejects overlong, blank, forged identity and unknown fields', () => {
    const valid = { title: 'Test failure', description: 'Steps to reproduce a synthetic failure.' };
    expect(bugReportSchema.parse(valid)).toEqual(valid);
    for (const body of [{ ...valid, title: ' ' }, { ...valid, description: 'x'.repeat(4001) }, { ...valid, title: 'x'.repeat(161) }, { ...valid, reporterUserId: 'forged' }, { ...valid, url: 'secret' }]) expect(bugReportSchema.safeParse(body).success).toBe(false);
    expect(bugStatusSchema.safeParse({ status: 'DELETED' }).success).toBe(false);
  });
  it('exposes only configuration publicly and protects every inbox action', () => {
    expect(Reflect.getMetadata(PUBLIC_ROUTE, BugReportsController.prototype.config)).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_ROUTE, BugReportsController.prototype.create)).toBeUndefined();
    for (const method of ['list', 'update'] as const) expect(Reflect.getMetadata(ADMIN_ROUTE, BugReportsController.prototype[method])).toBe(true);
  });
  it('rejects anonymous submissions through the actual guard', async () => {
    session.mockResolvedValue(null);
    await expect(new AuthGuard(new Reflector()).canActivate(context('create'))).rejects.toThrow('Authentication required');
  });
  it.each(['list', 'update'] as const)('rejects non-admin %s through the actual guard', async method => {
    session.mockResolvedValue({ user: { id: 'user', role: 'USER', accountStatus: 'ACTIVE' } });
    await expect(new AuthGuard(new Reflector()).canActivate(context(method))).rejects.toThrow('Admin permission');
  });
  it('allows an unverified active tester and an active admin without changing PCM rules', async () => {
    const guard = new AuthGuard(new Reflector());
    session.mockResolvedValue({ user: { id: 'user', role: 'USER', accountStatus: 'ACTIVE' } });
    expect(await guard.canActivate(context('create'))).toBe(true);
    session.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN', accountStatus: 'ACTIVE' } });
    expect(await guard.canActivate(context('list'))).toBe(true);
  });
});
