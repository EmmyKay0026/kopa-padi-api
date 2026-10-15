import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTarget } from './support.mjs';

test('only the designated localhost PostgreSQL URL is accepted', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.doesNotThrow(() => assertTarget(`postgresql://synthetic:synthetic@${host}:5432/kopa_padi_p2_e2e`));
  }
  for (const value of [
    'postgresql://synthetic:synthetic@remote.invalid/kopa_padi_p2_e2e',
    'postgresql://synthetic:synthetic@localhost/kopa_padi',
    'postgresql://synthetic:synthetic@localhost/kopa_padi_p2_e2e?host=remote.invalid',
    'postgresql://synthetic:synthetic@localhost/kopa_padi_p2_e2e?options=-csearch_path=other',
    'https://localhost/kopa_padi_p2_e2e',
    'postgresql://synthetic:synthetic@localhost:5433/kopa_padi_p2_e2e',
  ]) assert.throws(() => assertTarget(value));
});
