import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../apps/api/src/app.mjs';

const BRIDGE_NONCE = 'a'.repeat(32);

async function pushArtifact(app) {
  const created = await app.request('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Pill Demo' })
  });
  const { project, reviewToken } = await created.json();

  const revision = await app.request(`/api/projects/${project.id}/revisions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      reviewToken,
      artifactName: 'spec.html',
      html: '<!doctype html><html><head></head><body><main><h1>Hello</h1><p>Some reviewable text.</p></main></body></html>'
    })
  });
  const revisionBody = await revision.json();
  return { reviewToken, revisionId: revisionBody.revision.id };
}

describe('text-range pill bridge', () => {
  it('instruments artifacts with the Add-comment pill code and styles', async () => {
    const app = createApp();
    const { reviewToken, revisionId } = await pushArtifact(app);

    const response = await app.request(
      `/api/reviews/${reviewToken}/revisions/${revisionId}/artifact?bridgeNonce=${BRIDGE_NONCE}`
    );
    assert.equal(response.status, 200);
    const html = await response.text();

    // Pill behavior is injected inline with the bridge script.
    assert.match(html, /data-docsync-pill/);
    assert.match(html, /Add comment/);
    assert.match(html, /commentOnSelection/);
    // Text quotes carry surrounding context for anchor rebase.
    assert.match(html, /textQuoteWithContext/);
    // Pill styling ships with the injected bridge style tag.
    assert.match(html, /\[data-docsync-pill="true"\]/);
  });

  it('does not instrument plain (nonce-less) previews with the pill', async () => {
    const app = createApp();
    const { reviewToken, revisionId } = await pushArtifact(app);

    const response = await app.request(
      `/api/reviews/${reviewToken}/revisions/${revisionId}/artifact`
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.doesNotMatch(html, /commentOnSelection/);
  });
});
