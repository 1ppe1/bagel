import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/api/src/app.mjs';
import { createMemoryStorage } from '../apps/api/src/storage.mjs';
import { main } from '../packages/cli/dist/index.js';

const sampleAnchor = {
  selector: 'main > h1',
  textQuote: { exact: 'Launch plan' },
  headingPath: ['Launch plan'],
  element: {
    tagName: 'h1',
    classList: [],
    attributes: {},
    indexPath: [0, 0]
  },
  fingerprint: {
    attributesHash: 'sha256:attrs'
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
    now: () => '2026-01-01T00:00:00.000Z'
  });
  return { app, storage };
}

function createFetchFromApp(app) {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? new URL(input) : new URL(input.url);
    const method = init.method ?? 'GET';
    return app.request(url.pathname + url.search, {
      method,
      headers: init.headers,
      body: init.body
    });
  };
}

async function runCli(args, { cwd, app }) {
  const stdout = [];
  const stderr = [];
  const exitCode = await main(args, {
    cwd,
    env: {},
    fetchImpl: createFetchFromApp(app),
    stdout: (chunk) => stdout.push(chunk),
    stderr: (chunk) => stderr.push(chunk)
  });
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}

async function setupPushedWorkspace(app) {
  const workspace = await mkdtemp(join(tmpdir(), 'bagel-fix-'));
  await writeFile(
    join(workspace, 'spec.html'),
    '<!doctype html><main><h1>Launch plan</h1></main>',
    'utf8'
  );
  const push = await runCli(['push', join(workspace, 'spec.html'), '--server', 'http://bagel.test'], {
    cwd: workspace,
    app
  });
  assert.equal(push.exitCode, 0, push.stderr);
  return workspace;
}

describe('fix instruction to agent context', () => {
  it('carries fixInstruction from API comment into context.md with a direct-apply instruction', async () => {
    const { app } = createTestApi();
    const workspace = await setupPushedWorkspace(app);

    const config = JSON.parse(
      await readFile(join(workspace, '.docsync', 'config.json'), 'utf8')
    );

    // One fix instruction and one plain comment.
    for (const [body, fixInstruction] of [
      ['Rename the headline', true],
      ['Nice section overall', false]
    ]) {
      const response = await app.request(`/api/reviews/${config.reviewToken}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          revisionId: (await (await app.request(`/api/projects/${config.projectId}/revisions`)).json())
            .revisions[0].id,
          body,
          fixInstruction,
          anchor: sampleAnchor
        })
      });
      assert.equal(response.status, 201);
    }

    const pull = await runCli(['pull'], { cwd: workspace, app });
    assert.equal(pull.exitCode, 0, pull.stderr);
    const context = await runCli(['context', '--open-comments'], { cwd: workspace, app });
    assert.equal(context.exitCode, 0, context.stderr);

    const markdown = await readFile(join(workspace, '.docsync', 'context.md'), 'utf8');
    assert.match(markdown, /# Bagel Review Context/);
    assert.match(markdown, /- Kind: Fix instruction/);
    assert.match(markdown, /- Fix instruction: Rename the headline/);
    assert.match(
      markdown,
      /Apply this change directly to the referenced section, then keep unrelated content intact\./
    );
    assert.match(markdown, /- Kind: Comment/);
    assert.match(markdown, /- Comment: Nice section overall/);
  });
});

describe('bagel workspace reviewUrl injection', () => {
  it('injects this checkout\'s review URL for its own artifact when pushing a manifest', async () => {
    const { app } = createTestApi();
    const workspace = await setupPushedWorkspace(app);

    await mkdir(join(workspace, '.docsync'), { recursive: true });
    await writeFile(
      join(workspace, '.docsync', 'workspace.json'),
      JSON.stringify({
        name: 'test-ws',
        artifacts: [
          {
            id: 'spec',
            label: 'Spec',
            file: 'spec.html',
            type: 'spec',
            summary: 'Main spec.',
            checksPassed: 1,
            checksTotal: 1
          },
          {
            id: 'other',
            label: 'Other',
            file: 'other.md',
            type: 'notes',
            summary: 'Unrelated.',
            checksPassed: 0,
            checksTotal: 0
          }
        ],
        links: [],
        comments: []
      }),
      'utf8'
    );

    const result = await runCli(['workspace', '--server', 'http://bagel.test'], {
      cwd: workspace,
      app
    });
    assert.equal(result.exitCode, 0, result.stderr);

    const fetched = await (await app.request('/api/workspace')).json();
    const byId = Object.fromEntries(fetched.workspace.artifacts.map((a) => [a.id, a]));
    assert.equal(byId.spec.reviewUrl, '/r/raw-review-token-1');
    assert.equal(byId.other.reviewUrl, undefined);
  });
});
