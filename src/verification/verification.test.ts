import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn(), activeIntake: vi.fn(), lockActiveIntake: vi.fn() }));
vi.mock('../db/database.js', () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock('../intakes/intake.domain.js', () => ({ activeIntake: mocks.activeIntake, lockActiveIntake: mocks.lockActiveIntake, INTAKE_CHANGED: 'The active NYSC intake has changed. Refresh and try again.' }));

import { pcmVerifications, verificationDocuments } from '../db/schema.js';
import { VerificationController } from './verification.controller.js';
import { submitSchema } from './verification.schemas.js';
import { VerificationService } from './verification.service.js';

const input = {
  nyscIntakeId: '11111111-1111-4111-8111-111111111111',
  orientationCampId: '22222222-2222-4222-8222-222222222222',
  dateOfBirth: '2000-02-29',
  matriculationNumber: '001/ENG/2020',
};

describe('Senate list submission validation', () => {
  it('keeps institution formatting and leading zeros while trimming outer spaces', () => {
    expect(submitSchema.parse({ ...input, matriculationNumber: '  001/ENG/2020  ' })).toEqual(input);
  });

  it.each(['', '0000-01-01', '2001-02-29', '2000-04-31', '29/02/2000', '2000-02-29T00:00:00Z', '9999-01-01'])('rejects invalid or future date of birth %s', dateOfBirth => {
    expect(submitSchema.safeParse({ ...input, dateOfBirth }).success).toBe(false);
  });

  it.each([undefined, '', '   ', 'A'.repeat(81), 12345])('requires a nonempty text matriculation number: %s', matriculationNumber => {
    expect(submitSchema.safeParse({ ...input, matriculationNumber }).success).toBe(false);
  });

  it('requires a date of birth on all submissions, including legacy resubmissions', () => {
    const { dateOfBirth, ...legacyInput } = input;
    expect(submitSchema.safeParse(legacyInput).success).toBe(false);
  });
});

describe('multipart verification submissions', () => {
  const submit = vi.fn();
  const controller = new VerificationController({ submit } as unknown as VerificationService);
  beforeEach(() => submit.mockReset());

  function request(fields: Record<string, unknown>) {
    const file = {
      fieldname: 'document', filename: 'callup.pdf', fields: {},
      // Multipart fields after the document are populated when it is consumed.
      toBuffer: async () => {
        file.fields = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value }]));
        return Buffer.from('synthetic-document');
      },
    };
    return { user: { id: 'owner' }, file: async () => file } as unknown as Parameters<VerificationController['submit']>[0];
  }

  it('passes both validated fields to storage regardless of multipart field order', async () => {
    submit.mockResolvedValue({ id: 'verification' });
    await controller.submit(request(input));
    expect(submit).toHaveBeenCalledWith('owner', input, { buffer: Buffer.from('synthetic-document'), filename: 'callup.pdf' });
  });

  it('rejects missing Senate list details before calling the service', async () => {
    await expect(controller.submit(request({ nyscIntakeId: input.nyscIntakeId, orientationCampId: input.orientationCampId }))).rejects.toThrow('Check your NYSC assignment');
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('verification identity persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeIntake.mockResolvedValue({ id: input.nyscIntakeId });
  });

  function query(rows: unknown[]) {
    const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit: async () => rows };
    return chain;
  }

  it.each([false, true])('saves private details on submission (resubmission: %s)', async resubmission => {
    const current = resubmission ? { id: 'existing-verification', status: 'RESUBMISSION_REQUIRED', nyscIntakeId: input.nyscIntakeId, orientationCampId: input.orientationCampId, dateOfBirth: null, matriculationNumber: null } : null;
    mocks.select.mockReturnValueOnce(query([{ userId: 'owner' }]))
      .mockReturnValueOnce(query([{ id: input.orientationCampId }]))
      .mockReturnValueOnce(query(current ? [current] : []))
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ email: 'synthetic@example.invalid', name: 'Synthetic' }] }) });
    const writes: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const tx = {
      insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => {
        writes.push({ table, values });
        return { returning: async () => [values] };
      } }),
      update: (table: unknown) => ({ set: (values: Record<string, unknown>) => {
        writes.push({ table, values });
        return { where: () => ({ returning: async () => [{ ...current, ...values }] }) };
      } }),
    };
    mocks.transaction.mockImplementation(async callback => callback(tx));
    const storage = { store: vi.fn().mockResolvedValue({ storageKey: 'synthetic', originalName: 'callup.pdf', mimeType: 'application/pdf', sizeBytes: 1, sha256: '0'.repeat(64) }), remove: vi.fn() };
    const email = { dispatch: vi.fn().mockResolvedValue(undefined) };
    const service = new VerificationService(storage as unknown as ConstructorParameters<typeof VerificationService>[0], email as unknown as ConstructorParameters<typeof VerificationService>[1]);
    const result = await service.submit('owner', input, { buffer: Buffer.from('synthetic'), filename: 'callup.pdf' });
    expect(result).toMatchObject({ ...input, status: 'SUBMITTED' });
    if (current) expect(result.id).toBe(current.id);
    expect(writes.find(write => write.table === pcmVerifications)?.values).toMatchObject(input);
    expect(writes.some(write => write.table === verificationDocuments)).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
    // Identity details belong to this submission, never notification content.
    expect(JSON.stringify(email.dispatch.mock.calls)).not.toContain(input.matriculationNumber);
    expect(JSON.stringify(email.dispatch.mock.calls)).not.toContain(input.dateOfBirth);
  });
});
