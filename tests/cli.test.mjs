import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/api/src/app.mjs';
import { createMemoryStorage, hashString } from '../apps/api/src/storage.mjs';
import { main } from '../packages/cli/dist/index.js';

const sampleAnchor = {
  selector: 'main > h1',
  textQuote: {
    exact: 'Launch plan',
    prefix: 'Docksync ',
    suffix: ' overview'
  },
  headingPath: ['Docksync', 'Launch plan'],
  element: {
    tagName: 'h1',
    id: 'hero-title',
    classList: ['headline'],
    attributes: {
      'data-docsync-id': 'hero-title'
    },
    indexPath: [0, 1]
  },
  fingerprint: {
    textHash: 'sha256:text',
    attributesHash: 'sha256:attrs',
    subtreeHash: 'sha256:subtree'
  }
};

function createTestApi() {
  let tokenIndex = 0;
  let idIndex = 0;
  const storage = createMemoryStorage({
    idGenerator: (prefix) => `${prefix}_${++idIndex}`
  });
  const app = createApp({
    storage,
    tokenGenerator: () => `raw-review-token-${++tokenIndex}`,
    now: () => {
      const seconds = String(tokenIndex + idIndex).padStart(2, '0');
      return `2026-01-01T00:00:${seconds}.000Z`;
    }
  });

  return { app, storage };
}

function createFetchFromApp(app) {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? new URL(input) : new URL(input.url);
    const method = init.method ?? (typeof input === 'string' ? 'GET' : input.method);
    const headers = init.headers ?? (typeof input === 'string' ? undefined : input.headers);
    const body = init.body ?? (typeof input === 'string' ? undefined : await input.text());

    return app.request(url.pathname + url.search, {
      method,
      headers,
      body
    });
  };
}

async function runCli(args, { cwd, app, env = {} } = {}) {
  const stdout = [];
  const stderr = [];
  const exitCode = await main(args, {
    cwd,
    env,
    fetchImpl: createFetchFromApp(app),
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

async function createWorkspace(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeConfiglessHtml(workspace, html = '<!doctype html><main><h1>Launch plan</h1></main>') {
  const filePath = join(workspace, 'spec.html');
  await writeFile(filePath, html, 'utf8');
  return filePath;
}

describe('docsync CLI task 3', () => {
  it('creates .docsync/config.json atomically during init', async () => {
    const workspace = await createWorkspace('docsync-init-');
    const { app } = createTestApi();

    const result = await runCli(['init', '--server', 'http://docsync.test'], {
      cwd: workspace,
      app
    });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Initialized \.docsync\/config\.json/);

    const configPath = join(workspace, '.docsync', 'config.json');
    const config = await readJson(configPath);

    assert.equal(config.projectId, 'proj_1');
    assert.equal(config.reviewId, 'revw_2');
    assert.equal(config.reviewToken, 'raw-review-token-1');
    assert.equal(config.serverUrl, 'http://docsync.test');
    assert.equal(config.defaultArtifact, 'spec.html');
    assert.equal(config.lastContentHash, null);
    assert.equal(config.lastPulledAt, null);
    assert.equal(config.workspaceRoot, workspace);
    assert.equal(config.commentsPath, '.docsync/comments.json');
    assert.equal(config.contextPath, '.docsync/context.md');
  });

  it('pushes a secure HTML file, creates config when missing, and prints the review URL', async () => {
    const workspace = await createWorkspace('docsync-push-');
    const { app, storage } = createTestApi();
    const filePath = await writeConfiglessHtml(workspace);

    const result = await runCli(['push', filePath, '--server', 'http://docsync.test'], {
      cwd: workspace,
      app
    });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Review URL:/);
    assert.match(result.stdout, /\/r\/raw-review-token-1/);

    const config = await readJson(join(workspace, '.docsync', 'config.json'));
    assert.equal(config.reviewToken, 'raw-review-token-1');
    assert.equal(config.projectId, 'proj_1');
    assert.equal(config.defaultArtifact, 'spec.html');

    const revisions = [...storage.inspect().revisionsById.values()];
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].artifactName, 'spec.html');
    assert.equal(revisions[0].contentHash, hashString('<!doctype html><main><h1>Launch plan</h1></main>'));

    const secondResult = await runCli(['push', filePath, '--server', 'http://docsync.test'], {
      cwd: workspace,
      app
    });
    assert.equal(secondResult.exitCode, 0);
    assert.match(secondResult.stdout, /No changes detected/);
    assert.equal(storage.inspect().revisionsById.size, 1);

    const secondConfig = await readJson(join(workspace, '.docsync', 'config.json'));
    assert.equal(secondConfig.lastContentHash, hashString('<!doctype html><main><h1>Launch plan</h1></main>'));
  });

  it('rejects unsafe HTML before pushing it to the API', async () => {
    const workspace = await createWorkspace('docsync-security-');
    const { app, storage } = createTestApi();
    const filePath = await writeConfiglessHtml(
      workspace,
      '<!doctype html><main><button onclick="alert(1)">Danger</button></main>'
    );

    const result = await runCli(['push', filePath, '--server', 'http://docsync.test'], {
      cwd: workspace,
      app
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /security/i);
    assert.equal(storage.inspect().revisionsById.size, 0);
    await assert.rejects(readFile(join(workspace, '.docsync', 'config.json'), 'utf8'));
  });

  it('rejects script tags before pushing them to the API', async () => {
    const workspace = await createWorkspace('docsync-script-security-');
    const { app, storage } = createTestApi();
    const filePath = await writeConfiglessHtml(
      workspace,
      '<!doctype html><main><script>alert(1)</script></main>'
    );

    const result = await runCli(['push', filePath, '--server', 'http://docsync.test'], {
      cwd: workspace,
      app
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /<script>/);
    assert.equal(storage.inspect().revisionsById.size, 0);
  });

  it('merges remote comments by id and overwrites updated fields on pull', async () => {
    const workspace = await createWorkspace('docsync-pull-');
    const { app } = createTestApi();
    const filePath = await writeConfiglessHtml(workspace);
    const commentsPath = join(workspace, '.docsync', 'comments.json');

    const initResult = await runCli(['init', '--server', 'http://docsync.test'], {
      cwd: workspace,
      app
    });
    assert.equal(initResult.exitCode, 0);

    const config = await readJson(join(workspace, '.docsync', 'config.json'));
    const { projectId, reviewToken } = config;

    const revisionResponse = await app.request(`/api/projects/${projectId}/revisions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        reviewToken,
        artifactName: 'spec.html',
        html: await readFile(filePath, 'utf8')
      })
    });
    assert.equal(revisionResponse.status, 201);
    const { revision } = await revisionResponse.json();

    const createCommentResponse = await app.request(`/api/reviews/${reviewToken}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        revisionId: revision.id,
        body: 'Please improve the intro.',
        anchorStatus: 'needs_review',
        anchor: sampleAnchor
      })
    });
    assert.equal(createCommentResponse.status, 201);
    const { comment } = await createCommentResponse.json();

    const firstPull = await runCli(['pull'], {
      cwd: workspace,
      app
    });
    assert.equal(firstPull.exitCode, 0);

    const firstComments = await readJson(join(workspace, '.docsync', 'comments.json'));
    assert.equal(firstComments.comments.length, 1);
    assert.equal(firstComments.comments[0].id, comment.id);
    assert.equal(firstComments.comments[0].body, 'Please improve the intro.');
    assert.equal(firstComments.comments[0].anchorStatus, 'needs_review');
    assert.match(await readFile(join(workspace, '.docsync', 'config.json'), 'utf8'), /"lastPulledAt":/);

    const updatedAnchor = {
      ...sampleAnchor,
      selector: 'main > section:nth-of-type(2) > h2',
      headingPath: ['Docksync', 'Updated']
    };

    const patchResponse = await app.request(`/api/reviews/${reviewToken}/comments/${comment.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        body: 'Updated body',
        workflowStatus: 'resolved',
        anchorStatus: 'orphaned',
        anchor: updatedAnchor
      })
    });
    assert.equal(patchResponse.status, 200);

    const secondPull = await runCli(['pull'], {
      cwd: workspace,
      app
    });
    assert.equal(secondPull.exitCode, 0);

    const secondComments = await readJson(join(workspace, '.docsync', 'comments.json'));
    assert.equal(secondComments.comments.length, 1);
    assert.equal(secondComments.comments[0].id, comment.id);
    assert.equal(secondComments.comments[0].body, 'Updated body');
    assert.equal(secondComments.comments[0].workflowStatus, 'resolved');
    assert.equal(secondComments.comments[0].anchorStatus, 'orphaned');
    assert.deepEqual(secondComments.comments[0].anchor, updatedAnchor);

    const thirdPull = await runCli(['pull'], {
      cwd: workspace,
      app
    });
    assert.equal(thirdPull.exitCode, 0);

    const localNewer = {
      ...secondComments,
      comments: [
        {
          ...secondComments.comments[0],
          body: 'Local draft beats remote',
          updatedAt: '2026-01-01T00:00:99.000Z'
        }
      ]
    };
    await writeFile(commentsPath, `${JSON.stringify(localNewer, null, 2)}\n`, 'utf8');

    const stalePull = await runCli(['pull'], {
      cwd: workspace,
      app
    });
    assert.equal(stalePull.exitCode, 0);

    const thirdComments = await readJson(join(workspace, '.docsync', 'comments.json'));
    assert.equal(thirdComments.comments.length, 1);
    assert.equal(thirdComments.comments[0].body, 'Local draft beats remote');
  });

  it('leaves existing comments.json intact when pull fails before write', async () => {
    const workspace = await createWorkspace('docsync-failure-');
    const { app } = createTestApi();

    const initResult = await runCli(['init', '--server', 'http://docsync.test'], {
      cwd: workspace,
      app
    });
    assert.equal(initResult.exitCode, 0);

    const commentsPath = join(workspace, '.docsync', 'comments.json');
    const before = {
      projectId: 'proj_1',
      reviewId: 'revw_2',
      syncedAt: '2026-01-01T00:00:00.000Z',
      comments: [
        {
          id: 'cmt_1',
          body: 'Keep me safe',
          workflowStatus: 'open',
          anchorStatus: 'attached',
          revisionId: 'rev_1',
          anchor: sampleAnchor,
          rebaseHistory: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    };
    await writeFile(commentsPath, `${JSON.stringify(before, null, 2)}\n`, 'utf8');

    const result = await main(['pull'], {
      cwd: workspace,
      env: {},
      fetchImpl: async () => new Response('server failed', { status: 500 }),
      stdout: () => {},
      stderr: () => {}
    });

    assert.equal(result, 1);
    const after = await readJson(commentsPath);
    assert.deepEqual(after, before);
  });

  it('writes context.md for open comments and omits resolved ones', async () => {
    const workspace = await createWorkspace('docsync-context-');
    const { app } = createTestApi();

    const initResult = await runCli(['init', '--server', 'http://docsync.test'], {
      cwd: workspace,
      app
    });
    assert.equal(initResult.exitCode, 0);

    const commentsPath = join(workspace, '.docsync', 'comments.json');
    const payload = {
      projectId: 'proj_1',
      reviewId: 'revw_2',
      syncedAt: '2026-01-01T00:00:00.000Z',
      comments: [
        {
          id: 'cmt_open_attached',
          body: 'Clarify the CTA.',
          workflowStatus: 'open',
          anchorStatus: 'attached',
          revisionId: 'rev_1',
          anchor: sampleAnchor,
          rebaseHistory: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'cmt_open_review',
          body: 'Check the heading hierarchy.',
          workflowStatus: 'open',
          anchorStatus: 'needs_review',
          revisionId: 'rev_1',
          anchor: {
            ...sampleAnchor,
            selector: 'main > section:nth-of-type(2) > h2'
          },
          rebaseHistory: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'cmt_open_orphan',
          body: 'This section may have moved.',
          workflowStatus: 'open',
          anchorStatus: 'orphaned',
          revisionId: 'rev_1',
          anchor: {
            ...sampleAnchor,
            selector: 'main > section:nth-of-type(3) > p'
          },
          rebaseHistory: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'cmt_resolved',
          body: 'Do not include this.',
          workflowStatus: 'resolved',
          anchorStatus: 'attached',
          revisionId: 'rev_1',
          anchor: sampleAnchor,
          rebaseHistory: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    };
    await writeFile(commentsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    const result = await runCli(['context', '--open-comments'], {
      cwd: workspace,
      app
    });

    assert.equal(result.exitCode, 0);
    const context = await readFile(join(workspace, '.docsync', 'context.md'), 'utf8');
    assert.match(context, /# Docksync Review Context/);
    assert.match(context, /cmt_open_attached/);
    assert.match(context, /cmt_open_review/);
    assert.match(context, /cmt_open_orphan/);
    assert.doesNotMatch(context, /cmt_resolved/);
    assert.match(context, /Selector:/);
    assert.match(context, /Text quote:/);
    assert.match(context, /Heading path:/);
    assert.match(context, /Comment:/);
    assert.match(context, /Suggested instruction:/);
  });
});
