import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../apps/api/src/app.mjs';

const VALID_WORKSPACE = {
  name: 'demo-workspace',
  artifacts: [
    {
      id: 'spec',
      label: 'Product spec',
      file: 'spec.html',
      type: 'spec',
      summary: 'Main spec.',
      checksPassed: 2,
      checksTotal: 3,
      reviewUrl: '/r/some-token'
    },
    {
      id: 'api',
      label: 'API notes',
      file: 'api.md',
      type: 'notes',
      summary: 'API contract.',
      checksPassed: 1,
      checksTotal: 1
    }
  ],
  links: [{ source: 'spec', target: 'api' }],
  comments: [
    {
      id: 'cmt_1',
      artifactId: 'spec',
      reviewerInitials: 'MO',
      reviewerName: 'Mori',
      text: 'Tighten the intro.',
      fixInstruction: true,
      resolved: false
    }
  ]
};

function postWorkspace(app, body, headers = {}) {
  return app.request('/api/workspace', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

describe('workspace API', () => {
  it('returns 404 before any manifest has been pushed', async () => {
    const app = createApp();
    const response = await app.request('/api/workspace');
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error, 'workspace_not_found');
  });

  it('stores and returns a valid manifest, preserving reviewUrl', async () => {
    const app = createApp();

    const created = await postWorkspace(app, VALID_WORKSPACE);
    assert.equal(created.status, 201);

    const fetched = await app.request('/api/workspace');
    assert.equal(fetched.status, 200);
    const { workspace } = await fetched.json();
    assert.equal(workspace.name, 'demo-workspace');
    assert.equal(workspace.artifacts.length, 2);
    assert.equal(workspace.artifacts[0].reviewUrl, '/r/some-token');
    assert.equal(workspace.artifacts[1].reviewUrl, undefined);
    assert.equal(workspace.comments[0].fixInstruction, true);
  });

  it('rejects links that reference unknown artifact ids', async () => {
    const app = createApp();
    const response = await postWorkspace(app, {
      ...VALID_WORKSPACE,
      links: [{ source: 'spec', target: 'missing' }]
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'invalid_request');
  });

  it('rejects artifacts with an unknown type', async () => {
    const app = createApp();
    const response = await postWorkspace(app, {
      ...VALID_WORKSPACE,
      artifacts: [{ ...VALID_WORKSPACE.artifacts[0], type: 'mystery' }],
      links: [],
      comments: []
    });
    assert.equal(response.status, 400);
  });

  it('rejects tunneled/proxied pushes as local_only', async () => {
    const app = createApp();

    for (const headers of [
      { 'x-forwarded-for': '203.0.113.9' },
      { 'cf-connecting-ip': '203.0.113.9' },
      { 'x-forwarded-host': 'evil.example' }
    ]) {
      const response = await postWorkspace(app, VALID_WORKSPACE, headers);
      assert.equal(response.status, 403);
      const body = await response.json();
      assert.equal(body.error, 'local_only');
    }

    // Reads stay open for remote reviewers.
    const read = await app.request('/api/workspace', {
      headers: { 'x-forwarded-for': '203.0.113.9' }
    });
    assert.equal(read.status, 404);
  });

  it('rate-limits write bursts per client IP', async () => {
    const app = createApp({ rateLimit: { limit: 5, windowMs: 60_000 } });

    const statuses = [];
    for (let index = 0; index < 8; index += 1) {
      const response = await postWorkspace(app, VALID_WORKSPACE, {
        'x-forwarded-for': '198.51.100.7'
      });
      statuses.push(response.status);
    }

    // Forwarded requests are local_only-blocked (403) until the limiter kicks in.
    assert.equal(statuses.filter((status) => status === 429).length, 3);

    // A different client is unaffected.
    const other = await postWorkspace(app, VALID_WORKSPACE);
    assert.equal(other.status, 201);
  });
});
