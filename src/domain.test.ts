import { describe, expect, it } from 'vitest';
import { assertTransition, canAccessVerifiedArea, VERIFICATION_STATUSES } from './domain.js';

describe('verification state machine', () => {
  const valid = [
    ['UNVERIFIED','SUBMITTED'], ['SUBMITTED','UNDER_REVIEW'], ['UNDER_REVIEW','VERIFIED'],
    ['UNDER_REVIEW','REJECTED'], ['UNDER_REVIEW','RESUBMISSION_REQUIRED'], ['RESUBMISSION_REQUIRED','SUBMITTED'], ['VERIFIED','REVOKED'],
  ] as const;
  it.each(valid)('allows %s -> %s', (from,to) => expect(() => assertTransition(from,to)).not.toThrow());
  it('rejects every unspecified transition', () => {
    const allowed = new Set(valid.map(x => x.join(':')));
    for (const from of VERIFICATION_STATUSES) for (const to of VERIFICATION_STATUSES) if (!allowed.has(`${from}:${to}`)) expect(() => assertTransition(from,to)).toThrow();
  });
});
describe('verified authorization', () => {
  it('allows active verified PCMs', () => expect(canAccessVerifiedArea('ACTIVE','VERIFIED')).toBe(true));
  it.each(['UNVERIFIED','SUBMITTED','UNDER_REVIEW','REJECTED','RESUBMISSION_REQUIRED','REVOKED'])('rejects %s users', status => expect(canAccessVerifiedArea('ACTIVE',status)).toBe(false));
  it.each(['RESTRICTED','SUSPENDED','CLOSED'])('rejects %s accounts even when verified', account => expect(canAccessVerifiedArea(account,'VERIFIED')).toBe(false));
});
