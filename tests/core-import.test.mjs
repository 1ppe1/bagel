import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anchorStatuses, isAnchorStatus } from '@docsync/core';

describe('core package import', () => {
  it('imports the built core package through package exports', () => {
    assert.deepEqual(anchorStatuses, ['attached', 'needs_review', 'orphaned']);
    assert.equal(isAnchorStatus('attached'), true);
    assert.equal(isAnchorStatus('resolved'), false);
  });
});
