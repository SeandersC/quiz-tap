import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubmissionGuard } from '../frontend/src/lib/submissionGuard.js';

test('createSubmissionGuard prevents overlapping submissions', () => {
  const guard = createSubmissionGuard();

  assert.equal(guard.tryAcquire(), true);
  assert.equal(guard.tryAcquire(), false);

  guard.release();

  assert.equal(guard.tryAcquire(), true);
});
