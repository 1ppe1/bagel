import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../apps/api/src/app.mjs';

async function text(path) {
  return readFile(path, 'utf8');
}

describe('web review UI', () => {
  it('serves the built React app from the API review URL', async () => {
    const app = createApp();
    const createResponse = await app.request('/api/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Docksync Demo'
      })
    });
    assert.equal(createResponse.status, 201);
    const { reviewToken } = await createResponse.json();

    const reviewResponse = await app.request(`/r/${reviewToken}`);
    assert.equal(reviewResponse.status, 200);
    assert.match(reviewResponse.headers.get('content-type'), /^text\/html\b/);

    const html = await reviewResponse.text();
    assert.match(html, /<div id="root"><\/div>/);
    const scriptMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
    assert.ok(scriptMatch?.[1]);

    const assetResponse = await app.request(scriptMatch[1]);
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('content-type'), /^text\/javascript\b/);

    const traversalResponse = await app.request('/assets/%2e%2e/index.html');
    assert.equal(traversalResponse.status, 404);
  });

  it('uses a Vite React entry instead of the Node stdlib placeholder server', async () => {
    const [packageJson, indexHtml, mainTsx] = await Promise.all([
      text('apps/web/package.json'),
      text('apps/web/index.html'),
      text('apps/web/src/main.tsx')
    ]);

    const manifest = JSON.parse(packageJson);
    assert.equal(manifest.scripts.dev, 'vite');
    assert.match(manifest.scripts.build, /vite build/);
    assert.match(indexHtml, /<script type="module" src="\/src\/main\.tsx"><\/script>/);
    assert.match(mainTsx, /createRoot\(root\)\.render/);
  });

  it('renders artifact HTML only through a sandboxed iframe src', async () => {
    const appSource = await text('apps/web/src/App.tsx');

    assert.match(appSource, /<iframe/);
    assert.match(appSource, /sandbox="allow-scripts"/);
    assert.match(appSource, /src=\{bridge\.src\}/);
    assert.doesNotMatch(appSource, /allow-same-origin/);
    assert.doesNotMatch(appSource, /dangerouslySetInnerHTML/);
  });

  it('uses existing review API routes and refreshes comments after creating a comment', async () => {
    const [apiSource, appSource] = await Promise.all([
      text('apps/web/src/api.ts'),
      text('apps/web/src/App.tsx')
    ]);

    assert.match(apiSource, /\/api\/reviews\/\$\{encodeURIComponent\(reviewToken\)\}/);
    assert.match(apiSource, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/revisions/);
    assert.match(apiSource, /\/comments/);
    assert.match(appSource, /workflowStatus: 'open'/);
    assert.match(appSource, /anchorStatus: 'attached'/);
    assert.match(appSource, /await refreshComments\(\)/);
    assert.match(appSource, /Refresh comments/);
    assert.match(appSource, /No comments yet/);
  });

  it('serves instrumented artifacts with strict CSP and the static bridge script', async () => {
    const app = createApp();
    const createResponse = await app.request('/api/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Docksync Security Demo'
      })
    });
    assert.equal(createResponse.status, 201);
    const { project, reviewToken } = await createResponse.json();

    const revisionResponse = await app.request(`/api/projects/${project.id}/revisions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        reviewToken,
        artifactName: 'safe.html',
        html: '<!doctype html><html><head><title>Safe</title></head><body><main><h1 data-docsync-id="hero">Safe artifact</h1></main></body></html>'
      })
    });
    assert.equal(revisionResponse.status, 201);
    const { revision } = await revisionResponse.json();

    const bridgeResponse = await app.request('/docsync-bridge.js');
    assert.equal(bridgeResponse.status, 200);
    assert.match(bridgeResponse.headers.get('content-type'), /^text\/javascript\b/);
    assert.match(await bridgeResponse.text(), /docsync:element-selected/);

    const bridgeNonce = '0123456789abcdef0123456789abcdef';
    const artifactResponse = await app.request(
      `/api/reviews/${reviewToken}/revisions/${revision.id}/artifact?bridgeNonce=${bridgeNonce}`
    );
    assert.equal(artifactResponse.status, 200);
    const artifactCsp = artifactResponse.headers.get('content-security-policy');
    assert.match(artifactCsp, /default-src 'none'/);
    assert.match(artifactCsp, /script-src 'self'/);
    assert.doesNotMatch(artifactCsp, /script-src[^;]*unsafe-inline/);

    const html = await artifactResponse.text();
    assert.match(html, /src="\/docsync-bridge\.js"/);
    assert.match(html, new RegExp(`data-docsync-bridge-nonce="${bridgeNonce}"`));
    assert.match(html, new RegExp(`data-docsync-revision-id="${revision.id}"`));
  });

  it('rejects unsafe artifact HTML before it can run in the iframe', async () => {
    const app = createApp();
    const createResponse = await app.request('/api/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Docksync Unsafe Demo'
      })
    });
    assert.equal(createResponse.status, 201);
    const { project, reviewToken } = await createResponse.json();

    for (const html of [
      '<!doctype html><main><script>alert(1)</script></main>',
      '<!doctype html><main><button onclick="alert(1)">Danger</button></main>'
    ]) {
      const response = await app.request(`/api/projects/${project.id}/revisions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          reviewToken,
          artifactName: 'unsafe.html',
          html
        })
      });

      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'unsafe_artifact');
    }
  });

  it('validates opaque-origin iframe messages without relying on origin equality', async () => {
    const appSource = await text('apps/web/src/App.tsx');
    const validationSource = await text('apps/web/src/messageValidation.ts');

    assert.match(appSource, /event\.source !== iframeRef\.current\?\.contentWindow/);
    assert.match(validationSource, /SELECTION_MESSAGE_TYPE = 'docsync:element-selected'/);
    assert.match(validationSource, /MAX_SELECTION_MESSAGE_BYTES = 32_000/);
    assert.match(validationSource, /data\.bridgeNonce !== expectedBridgeNonce/);
    assert.match(validationSource, /data\.revisionId !== expectedRevisionId/);
    assert.doesNotMatch(validationSource, /event\.origin/);
  });

  it('renders comment bodies as React text content', async () => {
    const appSource = await text('apps/web/src/App.tsx');

    assert.match(appSource, /<p className="comment-body">\{comment\.body\}<\/p>/);
    assert.doesNotMatch(appSource, /dangerouslySetInnerHTML/);
  });
});
