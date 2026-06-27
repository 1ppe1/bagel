import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/api/src/app.mjs';
import { createMemoryStorage } from '../apps/api/src/storage.mjs';
import { main as runCli } from '../packages/cli/dist/index.js';

const sampleAnchor = {
  selector: '[data-docsync-id="hero-title"]',
  textQuote: {
    exact: 'Docksync',
    prefix: '',
    suffix: ''
  },
  headingPath: ['Docksync'],
  element: {
    tagName: 'h1',
    id: 'hero-title',
    classList: [],
    attributes: {
      'data-docsync-id': 'hero-title'
    },
    indexPath: [0, 0, 0]
  },
  fingerprint: {
    textHash: 'sha256:hero',
    attributesHash: 'sha256:hero-attributes'
  }
};

function createTestApp() {
  let tokenIndex = 0;
  let idIndex = 0;
  const storage = createMemoryStorage({
    idGenerator: (prefix) => `${prefix}_${++idIndex}`
  });
  const app = createApp({
    storage,
    tokenGenerator: () => `walking-token-${++tokenIndex}`,
    now: () => `2026-06-27T00:00:${String(idIndex + tokenIndex).padStart(2, '0')}.000Z`
  });

  return { app, storage };
}

function fetchFromApp(app) {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? new URL(input) : new URL(input.url);
    const method = init.method ?? (typeof input === 'string' ? 'GET' : input.method);
    const headers = init.headers ?? (typeof input === 'string' ? undefined : input.headers);
    const body = init.body ?? (typeof input === 'string' ? undefined : await input.text());

    return app.request(`${url.pathname}${url.search}`, {
      method,
      headers,
      body
    });
  };
}

async function runDocsync(args, { cwd, app }) {
  const stdout = [];
  const stderr = [];
  const exitCode = await runCli(args, {
    cwd,
    env: {},
    fetchImpl: fetchFromApp(app),
    stdout: (chunk) => stdout.push(chunk),
    stderr: (chunk) => stderr.push(chunk)
  });

  return {
    exitCode,
    stdout: stdout.join(''),
    stderr: stderr.join('')
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

describe('walking skeleton E2E', () => {
  it('moves one HTML and one comment from push to review URL to local context', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'docsync-walking-skeleton-'));
    const { app, storage } = createTestApp();
    const fixtureHtml = await readFile('examples/spec.html', 'utf8');
    await writeFile(join(workspace, 'spec.html'), fixtureHtml, 'utf8');

    const push = await runDocsync(['push', 'spec.html', '--server', 'http://docsync.test'], {
      cwd: workspace,
      app
    });
    assert.equal(push.exitCode, 0, push.stderr);
    assert.match(push.stdout, /Review URL: http:\/\/docsync\.test\/r\/walking-token-1/);

    const config = await readJson(join(workspace, '.docsync', 'config.json'));
    assert.equal(config.projectId, 'proj_1');
    assert.equal(config.reviewToken, 'walking-token-1');
    assert.equal(config.defaultArtifact, 'spec.html');

    const revisions = [...storage.inspect().revisionsById.values()];
    assert.equal(revisions.length, 1);
    assert.equal(storage.inspect().artifactsByKey.get(revisions[0].artifactStorageKey), fixtureHtml);

    const reviewResponse = await app.request(`/r/${config.reviewToken}`);
    assert.equal(reviewResponse.status, 200);
    const reviewHtml = await reviewResponse.text();
    assert.match(reviewHtml, /<div id="root"><\/div>/);
    assert.match(reviewHtml, /\/assets\/.+\.js/);

    const appSource = await readFile('apps/web/src/App.tsx', 'utf8');
    assert.match(appSource, /<iframe/);
    assert.match(appSource, /sandbox="allow-scripts"/);
    assert.match(appSource, /src=\{bridge\.src\}/);

    const createComment = await app.request(`/api/reviews/${config.reviewToken}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        revisionId: revisions[0].id,
        body: 'Tighten the hero headline.',
        anchorStatus: 'needs_review',
        anchor: sampleAnchor
      })
    });
    assert.equal(createComment.status, 201);
    const { comment } = await createComment.json();

    const pull = await runDocsync(['pull'], {
      cwd: workspace,
      app
    });
    assert.equal(pull.exitCode, 0, pull.stderr);
    assert.match(pull.stdout, /Pulled 1 comment/);

    const commentsFile = await readJson(join(workspace, '.docsync', 'comments.json'));
    assert.equal(commentsFile.comments.length, 1);
    assert.equal(commentsFile.comments[0].id, comment.id);
    assert.equal(commentsFile.comments[0].anchorStatus, 'needs_review');

    const context = await runDocsync(['context', '--open-comments'], {
      cwd: workspace,
      app
    });
    assert.equal(context.exitCode, 0, context.stderr);

    const contextMarkdown = await readFile(join(workspace, '.docsync', 'context.md'), 'utf8');
    assert.match(contextMarkdown, /# Docksync Review Context/);
    assert.match(contextMarkdown, /Selector: `\[data-docsync-id="hero-title"\]`/);
    assert.match(contextMarkdown, /Text quote: "Docksync"/);
    assert.match(contextMarkdown, /Heading path: Docksync/);
    assert.match(contextMarkdown, /Comment: Tighten the hero headline\./);
    assert.match(
      contextMarkdown,
      /Suggested instruction: Review the referenced section against the current HTML before editing it\./
    );
  });
});
