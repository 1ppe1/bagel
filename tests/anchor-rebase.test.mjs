import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractCompositeAnchors, rebaseAnchor } from '@docsync/core';

const fixtureHtml = readFileSync(new URL('../examples/spec.html', import.meta.url), 'utf8');

function fixtureAnchor() {
  const anchor = extractCompositeAnchors(fixtureHtml).find(
    (candidate) => candidate.stableId === 'anchor-rebase'
  );
  assert.ok(anchor, 'expected anchor-rebase fixture anchor');
  return anchor;
}

describe('anchor rebase', () => {
  it('rebase-attaches-stable-id-after-safe-edit', () => {
    const anchor = fixtureAnchor();
    const editedHtml = fixtureHtml.replace(
      'Existing comments should reattach to matching DOM elements after a safe edit, or become orphaned when the target disappears.',
      'Existing comments should reattach to matching DOM elements after safe copy edits, or become orphaned when the target disappears.'
    );

    const result = rebaseAnchor(anchor, editedHtml);

    assert.equal(result.status, 'attached');
    assert.equal(result.matchedSelector, '[data-docsync-id="anchor-rebase"]');
    assert.equal(result.anchor?.stableId, 'anchor-rebase');
    assert.ok(result.confidence >= 0.8);
    assert.ok(result.reasons.includes('matched data-docsync-id'));
  });

  it('rebase-needs-review-for-same-selector-with-changed-quote', () => {
    const v1 =
      '<!doctype html><main><h1>Spec</h1><section><h2>Budget</h2><p>Approve budget by Friday.</p></section></main>';
    const v2 =
      '<!doctype html><main><h1>Spec</h1><section><h2>Budget</h2><p>Approve final budget by Friday.</p></section></main>';
    const anchor = extractCompositeAnchors(v1).find(
      (candidate) => candidate.element.tagName === 'p'
    );
    assert.ok(anchor, 'expected paragraph anchor');

    const result = rebaseAnchor(anchor, v2);

    assert.equal(result.status, 'needs_review');
    assert.equal(result.matchedSelector, 'section > p');
    assert.ok(result.confidence >= 0.55 && result.confidence < 0.8);
    assert.ok(result.reasons.includes('text quote changed'));
  });

  it('rebase-does-not-attach-ambiguous-equal-candidates', () => {
    const v1 =
      '<!doctype html><main><h1>Spec</h1><section><h2>Budget</h2><p>Approve budget by Friday.</p></section></main>';
    const v2 =
      '<!doctype html><main><h1>Spec</h1><section><h2>Budget</h2><p>Approve budget by Friday.</p><p>Approve budget by Friday.</p></section></main>';
    const anchor = extractCompositeAnchors(v1).find(
      (candidate) => candidate.element.tagName === 'p'
    );
    assert.ok(anchor, 'expected paragraph anchor');

    const ambiguousAnchor = {
      ...anchor,
      element: {
        ...anchor.element,
        indexPath: []
      }
    };
    const result = rebaseAnchor(ambiguousAnchor, v2);

    assert.notEqual(result.status, 'attached');
    assert.ok(['needs_review', 'orphaned'].includes(result.status));
    assert.ok(result.reasons.includes('multiple candidates had equal score'));
  });

  it('rebase-orphans-deleted-target', () => {
    const anchor = fixtureAnchor();
    const deletedHtml = fixtureHtml.replace(
      /\n      <section data-docsync-id="anchor-rebase">[\s\S]*?\n      <\/section>/u,
      ''
    );

    const result = rebaseAnchor(anchor, deletedHtml);

    assert.equal(result.status, 'orphaned');
    assert.equal(result.anchor, undefined);
    assert.ok(result.confidence < 0.55);
    assert.ok(result.reasons.includes('no candidate exceeded orphan threshold'));
  });
});
