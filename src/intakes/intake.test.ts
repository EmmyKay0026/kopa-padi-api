import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../common/auth.guard.js';
import { IntakeAdminController } from './intake.controller.js';
import { activeIntake } from './intake.domain.js';
import { changeActiveIntakeSchema, createIntakeSchema } from './intake.schemas.js';

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('../auth.js', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('../db/database.js', () => ({ db: {} }));

beforeEach(() => { vi.clearAllMocks(); });

describe('admin-managed NYSC intake', () => {
  it('accepts only recognized batch/stream identities and valid orientation dates', () => {
    const valid = { serviceYear: '2026', batch: 'Batch B', stream: 'Stream 1' };
    expect(createIntakeSchema.parse(valid)).toMatchObject({ ...valid, orientationStartDate: null, orientationEndDate: null });
    for (const body of [{ ...valid, batch: 'Batch Z' }, { ...valid, stream: 'Stream 4' }, { ...valid, serviceYear: '26' }, { ...valid, status: 'ACTIVE' }, { ...valid, orientationStartDate: '2026-02-30' }, { ...valid, orientationStartDate: '2026-11-10', orientationEndDate: '2026-11-01' }]) {
      expect(createIntakeSchema.safeParse(body).success).toBe(false);
    }
  });

  it('requires the observed active ID for every activation or closure', () => {
    expect(changeActiveIntakeSchema.parse({ expectedActiveId: null })).toEqual({ expectedActiveId: null });
    expect(changeActiveIntakeSchema.safeParse({}).success).toBe(false);
    expect(changeActiveIntakeSchema.safeParse({ expectedActiveId: 'invalid' }).success).toBe(false);
  });

  it.each([0, 2])('returns no user-selectable intake when %i active rows exist', async (count) => {
    const limit = vi.fn(async () => Array.from({ length: count }, (_, id) => ({ id })));
    const connection = { select: () => ({ from: () => ({ where: () => ({ limit }) }) }) };
    expect(await activeIntake(connection as any)).toBeNull();
    expect(limit).toHaveBeenCalledWith(2);
  });

  it('returns the sole active row without changing its identity', async () => {
    const row = { id: 'active', batch: 'Batch A', stream: 'Stream 2' };
    const connection = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) };
    expect(await activeIntake(connection as any)).toBe(row);
  });

  function context() {
    return { getHandler: () => IntakeAdminController.prototype.list, getClass: () => IntakeAdminController, switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as any;
  }
  it('rejects anonymous users and ordinary users from all admin routes', async () => {
    const guard = new AuthGuard(new Reflector());
    mocks.session.mockResolvedValue(null);
    await expect(guard.canActivate(context())).rejects.toThrow('Authentication required');
    mocks.session.mockResolvedValue({ user: { id: 'user', role: 'USER', accountStatus: 'ACTIVE' } });
    await expect(guard.canActivate(context())).rejects.toThrow('Admin permission required');
  });

  it('allows an active administrator through the existing admin guard', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN', accountStatus: 'ACTIVE' } });
    expect(await new AuthGuard(new Reflector()).canActivate(context())).toBe(true);
  });
});
