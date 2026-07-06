import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractCompositeAnchors } from '@docsync/core';
import { createApp } from '../apps/api/src/app.mjs';
import { createJsonFileStorage, createMemoryStorage } from '../apps/api/src/storage.mjs';

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

function tokenHash(token) {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

function createTestApi() {
  const storage = createMemoryStorage();
  let tokenIndex = 0;
  let nowIndex = 0;
  const app = createApp({
    storage,
    tokenGenerator: () => {
      tokenIndex += 1;
      return `raw-review-token-${tokenIndex}`;
    },
    now: () => {
      nowIndex += 1;
      return new Date(Date.UTC(2026, 0, 1, 0, 0, nowIndex)).toISOString();
    }
  });

  return { app, storage };
}

function createJsonTestApi(filePath, options = {}) {
  const storage = createJsonFileStorage({
    filePath,
    idGenerator: options.idGenerator
  });
  let tokenIndex = 0;
  let nowIndex = 0;
  const app = createApp({
    storage,
    tokenGenerator: () => {
      tokenIndex += 1;
      return options.reviewToken ?? `json-review-token-${tokenIndex}`;
    },
    now: () => {
      nowIndex += 1;
      return new Date(Date.UTC(2026, 0, 2, 0, 0, nowIndex)).toISOString();
    }
  });

  return { app, storage };
}

async function json(response) {
  return response.json();
}

async function createProject(app) {
  const response = await app.request('/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Docksync Demo',
      localRootHint: '/tmp/docsync',
      title: 'Launch Review'
    })
  });

  assert.equal(response.status, 201);
  return json(response);
}

async function createRevision(app, projectId, reviewToken, html = '<!doctype html><h1>Launch plan</h1>') {
  const response = await app.request(`/api/projects/${projectId}/revisions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      reviewToken,
      artifactName: 'spec.html',
      html
    })
  });

  assert.equal(response.status, 201);
  return json(response);
}

describe('API artifact storage', () => {
  it('creates a project with a raw review token while storing token hash and internal review id', async () => {
    const { app, storage } = createTestApi();

    const result = await createProject(app);

    assert.equal(result.project.name, 'Docksync Demo');
    assert.equal(result.project.localRootHint, '/tmp/docsync');
    assert.equal(result.review.title, 'Launch Review');
    assert.equal(result.reviewToken, 'raw-review-token-1');
    assert.equal(result.reviewUrl, '/r/raw-review-token-1');
    assert.equal(result.review.tokenHash, undefined);

    const storedReview = storage.inspect().reviewsById.get(result.review.id);
    assert.equal(storedReview.projectId, result.project.id);
    assert.equal(storedReview.tokenHash, tokenHash('raw-review-token-1'));
    assert.equal(storage.resolveReviewToken('raw-review-token-1').id, result.review.id);
  });

  it('stores an HTML revision and returns review URL details', async () => {
    const { app, storage } = createTestApi();
    const { project, reviewToken } = await createProject(app);
    const html = '<!doctype html><main><h1>Launch plan</h1></main>';

    const result = await createRevision(app, project.id, reviewToken, html);

    assert.equal(result.revision.projectId, project.id);
    assert.equal(result.revision.artifactName, 'spec.html');
    assert.equal(result.revision.contentHash, tokenHash(html));
    assert.equal(result.reviewToken, reviewToken);
    assert.equal(result.reviewUrl, `/r/${reviewToken}`);
    assert.equal(
      result.artifactUrl,
      `/api/reviews/${reviewToken}/revisions/${result.revision.id}/artifact`
    );

    const storedRevision = storage.inspect().revisionsById.get(result.revision.id);
    assert.equal(storedRevision.reviewId, result.revision.reviewId);
    assert.equal(storage.inspect().artifactsByKey.get(storedRevision.artifactStorageKey), html);
  });

  it('returns exact artifact HTML by raw review token and revision id', async () => {
    const { app } = createTestApi();
    const { project, reviewToken } = await createProject(app);
    const html = '<!doctype html><html><body><p>&lt;escaped&gt;</p></body></html>';
    const { revision } = await createRevision(app, project.id, reviewToken, html);

    const response = await app.request(
      `/api/reviews/${reviewToken}/revisions/${revision.id}/artifact`
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html\b/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(response.headers.get('content-security-policy'), /object-src 'none'/);
    assert.equal(await response.text(), html);
  });

  it('returns public review details without leaking token hash', async () => {
    const { app } = createTestApi();
    const { reviewToken } = await createProject(app);

    const response = await app.request(`/api/reviews/${reviewToken}`);

    assert.equal(response.status, 200);
    const result = await json(response);
    assert.equal(result.reviewToken, reviewToken);
    assert.equal(result.review.tokenHash, undefined);
    assert.equal(result.reviewUrl, `/r/${reviewToken}`);
  });

  it('lists comments by raw review token, starting empty and then including created comments', async () => {
    const { app } = createTestApi();
    const { project, reviewToken } = await createProject(app);
    const { revision } = await createRevision(app, project.id, reviewToken);

    const emptyResponse = await app.request(`/api/reviews/${reviewToken}/comments`);
    assert.equal(emptyResponse.status, 200);
    assert.deepEqual(await json(emptyResponse), { comments: [] });

    const body = '<img src=x onerror=alert(1)> keep as text';
    const createResponse = await app.request(`/api/reviews/${reviewToken}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        revisionId: revision.id,
        body,
        authorName: 'Reviewer',
        anchor: sampleAnchor
      })
    });

    assert.equal(createResponse.status, 201);
    const { comment } = await json(createResponse);
    assert.equal(comment.body, body);
    assert.equal(comment.workflowStatus, 'open');
    assert.equal(comment.anchorStatus, 'attached');
    assert.deepEqual(comment.anchor, sampleAnchor);

    const listResponse = await app.request(`/api/reviews/${reviewToken}/comments`);
    assert.equal(listResponse.status, 200);
    assert.deepEqual(await json(listResponse), { comments: [comment] });
  });

  it('allows a valid explicit initial anchor status when creating a comment', async () => {
    const { app } = createTestApi();
    const { project, reviewToken } = await createProject(app);
    const { revision } = await createRevision(app, project.id, reviewToken);

    const response = await app.request(`/api/reviews/${reviewToken}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        revisionId: revision.id,
        body: 'Please check this selector.',
        anchorStatus: 'needs_review',
        anchor: sampleAnchor
      })
    });

    assert.equal(response.status, 201);
    const { comment } = await json(response);
    assert.equal(comment.workflowStatus, 'open');
    assert.equal(comment.anchorStatus, 'needs_review');
  });

  it('rebases open comments on new revisions without changing workflow status', async () => {
    const { app } = createTestApi();
    const { project, reviewToken } = await createProject(app);
    const v1 =
      '<!doctype html><main><h1>Spec</h1><section data-docsync-id="anchor-rebase"><h2>Anchor Rebase</h2><p>Existing comments should reattach after a safe edit.</p></section></main>';
    const v2 =
      '<!doctype html><main><h1>Spec</h1><section data-docsync-id="anchor-rebase"><h2>Anchor Rebase</h2><p>Existing comments should reattach after a safe copy edit.</p></section></main>';
    const v3 = '<!doctype html><main><h1>Spec</h1><section><h2>Different</h2></section></main>';
    const { revision: firstRevision } = await createRevision(app, project.id, reviewToken, v1);
    const anchor = extractCompositeAnchors(v1).find(
      (candidate) => candidate.stableId === 'anchor-rebase'
    );
    assert.ok(anchor, 'expected anchor-rebase anchor');

    const createCommentResponse = await app.request(`/api/reviews/${reviewToken}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        revisionId: firstRevision.id,
        body: 'Keep this attached through safe edits.',
        anchor
      })
    });
    assert.equal(createCommentResponse.status, 201);
    const { comment } = await json(createCommentResponse);
    assert.equal(comment.workflowStatus, 'open');
    assert.equal(comment.anchorStatus, 'attached');

    const { revision: secondRevision } = await createRevision(app, project.id, reviewToken, v2);
    const attachedResponse = await app.request(`/api/reviews/${reviewToken}/comments`);
    const { comments: attachedComments } = await json(attachedResponse);
    assert.equal(attachedComments[0].workflowStatus, 'open');
    assert.equal(attachedComments[0].anchorStatus, 'attached');
    assert.equal(attachedComments[0].revisionId, secondRevision.id);
    assert.equal(attachedComments[0].anchor.stableId, 'anchor-rebase');
    assert.equal(attachedComments[0].rebaseHistory.length, 1);
    assert.equal(attachedComments[0].rebaseHistory[0].status, 'attached');
    assert.ok(attachedComments[0].rebaseHistory[0].reasons.includes('matched data-docsync-id'));

    const { revision: thirdRevision } = await createRevision(app, project.id, reviewToken, v3);
    const orphanedResponse = await app.request(`/api/reviews/${reviewToken}/comments`);
    const { comments: orphanedComments } = await json(orphanedResponse);
    assert.equal(orphanedComments[0].workflowStatus, 'open');
    assert.equal(orphanedComments[0].anchorStatus, 'orphaned');
    assert.equal(orphanedComments[0].revisionId, thirdRevision.id);
    assert.equal(orphanedComments[0].anchor.stableId, 'anchor-rebase');
    assert.equal(orphanedComments[0].rebaseHistory.length, 2);
    assert.equal(orphanedComments[0].rebaseHistory[1].status, 'orphaned');
  });

  it('patches body, workflow status, and anchor status without collapsing the two status axes', async () => {
    const { app } = createTestApi();
    const { project, reviewToken } = await createProject(app);
    const { revision } = await createRevision(app, project.id, reviewToken);
    const createResponse = await app.request(`/api/reviews/${reviewToken}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        revisionId: revision.id,
        body: 'Original',
        anchorStatus: 'needs_review',
        anchor: sampleAnchor
      })
    });
    const { comment } = await json(createResponse);

    const updatedAnchor = {
      ...sampleAnchor,
      selector: 'main > section:nth-of-type(2) > h2',
      headingPath: ['Docksync', 'Updated']
    };
    const patchResponse = await app.request(
      `/api/reviews/${reviewToken}/comments/${comment.id}`,
      {
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
      }
    );

    assert.equal(patchResponse.status, 200);
    const { comment: updated } = await json(patchResponse);
    assert.equal(updated.body, 'Updated body');
    assert.equal(updated.workflowStatus, 'resolved');
    assert.equal(updated.anchorStatus, 'orphaned');
    assert.deepEqual(updated.anchor, updatedAnchor);

    const listResponse = await app.request(`/api/reviews/${reviewToken}/comments`);
    const { comments } = await json(listResponse);
    assert.equal(comments[0].workflowStatus, 'resolved');
    assert.equal(comments[0].anchorStatus, 'orphaned');
  });

  it('returns 404 for invalid review tokens', async () => {
    const { app } = createTestApi();

    const response = await app.request('/api/reviews/missing-token/comments');

    assert.equal(response.status, 404);
    assert.equal((await json(response)).error, 'review_not_found');
  });

  it('returns 404 when creating a revision with a review token from another project', async () => {
    const { app } = createTestApi();
    const first = await createProject(app);
    const second = await createProject(app);

    const response = await app.request(`/api/projects/${first.project.id}/revisions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        reviewToken: second.reviewToken,
        artifactName: 'spec.html',
        html: '<!doctype html><h1>Wrong project</h1>'
      })
    });

    assert.equal(response.status, 404);
    assert.equal((await json(response)).error, 'review_not_found');
  });

  it('returns 404 when creating a comment for a revision outside the review', async () => {
    const { app } = createTestApi();
    const first = await createProject(app);
    const second = await createProject(app);
    const { revision } = await createRevision(app, second.project.id, second.reviewToken);

    const response = await app.request(`/api/reviews/${first.reviewToken}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        revisionId: revision.id,
        body: 'Wrong review',
        anchor: sampleAnchor
      })
    });

    assert.equal(response.status, 404);
    assert.equal((await json(response)).error, 'revision_not_found');
  });

  it('persists projects, revisions, artifacts, token hashes, and comments in JSON storage', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'docsync-api-storage-'));
    const filePath = join(storageDir, 'store.json');
    const reviewToken = 'raw-token-that-must-not-be-stored';
    let idIndex = 0;
    const idGenerator = (prefix) => {
      idIndex += 1;
      return `${prefix}_${idIndex}`;
    };

    const first = createJsonTestApi(filePath, {
      reviewToken,
      idGenerator
    });
    const { project } = await createProject(first.app);
    const html = '<!doctype html><main><h1>Persistent Launch</h1></main>';
    const { revision } = await createRevision(first.app, project.id, reviewToken, html);
    const createCommentResponse = await first.app.request(`/api/reviews/${reviewToken}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        revisionId: revision.id,
        body: '<strong>Persist this as text</strong>',
        anchor: sampleAnchor
      })
    });
    assert.equal(createCommentResponse.status, 201);
    const { comment } = await json(createCommentResponse);

    const storedJson = await readFile(filePath, 'utf8');
    assert.doesNotMatch(storedJson, new RegExp(reviewToken));
    assert.match(storedJson, new RegExp(tokenHash(reviewToken)));
    assert.match(storedJson, /Persistent Launch/);

    const second = createJsonTestApi(filePath, {
      reviewToken: 'unused-after-reload'
    });

    const artifactResponse = await second.app.request(
      `/api/reviews/${reviewToken}/revisions/${revision.id}/artifact`
    );
    assert.equal(artifactResponse.status, 200);
    assert.equal(await artifactResponse.text(), html);

    const commentsResponse = await second.app.request(`/api/reviews/${reviewToken}/comments`);
    assert.equal(commentsResponse.status, 200);
    assert.deepEqual(await json(commentsResponse), { comments: [comment] });
    assert.equal(second.storage.resolveReviewToken(reviewToken).id, revision.reviewId);
  });

  it('returns 400 for invalid workflow or anchor status values', async () => {
    const { app } = createTestApi();
    const { project, reviewToken } = await createProject(app);
    const { revision } = await createRevision(app, project.id, reviewToken);

    const invalidCreate = await app.request(`/api/reviews/${reviewToken}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        revisionId: revision.id,
        body: 'Invalid',
        workflowStatus: 'attached',
        anchorStatus: 'resolved',
        anchor: sampleAnchor
      })
    });
    assert.equal(invalidCreate.status, 400);

    const createResponse = await app.request(`/api/reviews/${reviewToken}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        revisionId: revision.id,
        body: 'Valid',
        anchor: sampleAnchor
      })
    });
    const { comment } = await json(createResponse);

    const invalidPatch = await app.request(
      `/api/reviews/${reviewToken}/comments/${comment.id}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          workflowStatus: 'needs_review'
        })
      }
    );
    assert.equal(invalidPatch.status, 400);
  });
});
