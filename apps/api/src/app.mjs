import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { anchorStatuses, workflowStatuses } from '@docsync/core';
import { createMemoryStorage, createReviewToken } from './storage.mjs';

const DEFAULT_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_WORKFLOW_STATUS = 'open';
const DEFAULT_ANCHOR_STATUS = 'attached';
const ARTIFACT_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'unsafe-inline'",
  'img-src data: blob: https:',
  'font-src data: https:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'"
].join('; ');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value) {
  return (
    isRecord(value) &&
    Object.values(value).every((recordValue) => typeof recordValue === 'string')
  );
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNumberArray(value) {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

function isWorkflowStatus(value) {
  return typeof value === 'string' && workflowStatuses.includes(value);
}

function isAnchorStatus(value) {
  return typeof value === 'string' && anchorStatuses.includes(value);
}

function isCompositeAnchor(value) {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.selector !== 'string' || !isStringArray(value.headingPath)) {
    return false;
  }

  if (value.textQuote !== undefined) {
    if (!isRecord(value.textQuote) || typeof value.textQuote.exact !== 'string') {
      return false;
    }

    if (
      (value.textQuote.prefix !== undefined && typeof value.textQuote.prefix !== 'string') ||
      (value.textQuote.suffix !== undefined && typeof value.textQuote.suffix !== 'string')
    ) {
      return false;
    }
  }

  if (!isRecord(value.element)) {
    return false;
  }

  if (
    typeof value.element.tagName !== 'string' ||
    (value.element.id !== undefined && typeof value.element.id !== 'string') ||
    !isStringArray(value.element.classList) ||
    !isStringRecord(value.element.attributes) ||
    !isNumberArray(value.element.indexPath)
  ) {
    return false;
  }

  if (!isRecord(value.fingerprint)) {
    return false;
  }

  return (
    typeof value.fingerprint.attributesHash === 'string' &&
    (value.fingerprint.textHash === undefined ||
      typeof value.fingerprint.textHash === 'string') &&
    (value.fingerprint.subtreeHash === undefined ||
      typeof value.fingerprint.subtreeHash === 'string')
  );
}

async function readJsonObject(c) {
  try {
    const body = await c.req.json();
    if (!isRecord(body)) {
      return { error: 'invalid_json' };
    }

    return { body };
  } catch {
    return { error: 'invalid_json' };
  }
}

function publicReview(review) {
  return {
    id: review.id,
    projectId: review.projectId,
    title: review.title,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  };
}

function jsonError(c, status, error, message) {
  return c.json({ error, message }, status);
}

function escapeHtmlAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function validateCreateCommentBody(body) {
  const workflowStatus = body.workflowStatus ?? DEFAULT_WORKFLOW_STATUS;
  const anchorStatus = body.anchorStatus ?? DEFAULT_ANCHOR_STATUS;

  if (!isWorkflowStatus(workflowStatus)) {
    return { error: 'invalid_status', message: 'workflowStatus must be open or resolved.' };
  }

  if (!isAnchorStatus(anchorStatus)) {
    return {
      error: 'invalid_status',
      message: 'anchorStatus must be attached, needs_review, or orphaned.'
    };
  }

  if (typeof body.revisionId !== 'string' || body.revisionId.length === 0) {
    return { error: 'invalid_request', message: 'revisionId is required.' };
  }

  if (typeof body.body !== 'string') {
    return { error: 'invalid_request', message: 'body is required.' };
  }

  if (body.authorName !== undefined && typeof body.authorName !== 'string') {
    return { error: 'invalid_request', message: 'authorName must be a string.' };
  }

  if (!isCompositeAnchor(body.anchor)) {
    return { error: 'invalid_request', message: 'anchor is required.' };
  }

  return {
    value: {
      revisionId: body.revisionId,
      body: body.body,
      authorName: body.authorName,
      workflowStatus,
      anchorStatus,
      anchor: body.anchor
    }
  };
}

function validatePatchCommentBody(body) {
  const patch = {};

  if (body.body !== undefined) {
    if (typeof body.body !== 'string') {
      return { error: 'invalid_request', message: 'body must be a string.' };
    }
    patch.body = body.body;
  }

  if (body.workflowStatus !== undefined) {
    if (!isWorkflowStatus(body.workflowStatus)) {
      return { error: 'invalid_status', message: 'workflowStatus must be open or resolved.' };
    }
    patch.workflowStatus = body.workflowStatus;
  }

  if (body.anchorStatus !== undefined) {
    if (!isAnchorStatus(body.anchorStatus)) {
      return {
        error: 'invalid_status',
        message: 'anchorStatus must be attached, needs_review, or orphaned.'
      };
    }
    patch.anchorStatus = body.anchorStatus;
  }

  if (body.anchor !== undefined) {
    if (!isCompositeAnchor(body.anchor)) {
      return { error: 'invalid_request', message: 'anchor must be a CompositeAnchor.' };
    }
    patch.anchor = body.anchor;
  }

  return { value: patch };
}

export function createApp(options = {}) {
  const storage = options.storage ?? createMemoryStorage();
  const tokenGenerator = options.tokenGenerator ?? createReviewToken;
  const now = options.now ?? (() => new Date().toISOString());
  const app = new Hono();

  app.use('*', secureHeaders());
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: options.maxBodyBytes ?? DEFAULT_BODY_LIMIT_BYTES,
      onError: (c) =>
        jsonError(c, 413, 'body_too_large', 'Request body exceeds the configured limit.')
    })
  );

  app.get('/health', (c) =>
    c.json({
      service: 'docsync-api',
      status: 'ok'
    })
  );

  app.get('/r/:reviewToken', (c) => {
    const reviewToken = c.req.param('reviewToken');
    const bundle = storage.getReviewBundle(reviewToken);
    if (!bundle) {
      return jsonError(c, 404, 'review_not_found', 'Review token was not found.');
    }

    return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Docksync Review</title>
  </head>
  <body>
    <main id="docsync-review-root" data-review-token="${escapeHtmlAttribute(reviewToken)}"></main>
  </body>
</html>`);
  });

  app.post('/api/projects', async (c) => {
    const parsed = await readJsonObject(c);
    if (parsed.error) {
      return jsonError(c, 400, parsed.error, 'Expected a JSON object request body.');
    }

    const body = parsed.body;
    if (typeof body.name !== 'string' || body.name.length === 0) {
      return jsonError(c, 400, 'invalid_request', 'name is required.');
    }

    if (body.localRootHint !== undefined && typeof body.localRootHint !== 'string') {
      return jsonError(c, 400, 'invalid_request', 'localRootHint must be a string.');
    }

    if (body.title !== undefined && typeof body.title !== 'string') {
      return jsonError(c, 400, 'invalid_request', 'title must be a string.');
    }

    const reviewToken = tokenGenerator();
    const { project, review } = storage.createProjectWithReview({
      name: body.name,
      localRootHint: body.localRootHint,
      title: body.title,
      reviewToken,
      now: now()
    });

    return c.json(
      {
        project,
        review: publicReview(review),
        reviewToken,
        reviewUrl: `/r/${reviewToken}`
      },
      201
    );
  });

  app.get('/api/projects/:projectId', (c) => {
    const project = storage.getProject(c.req.param('projectId'));
    if (!project) {
      return jsonError(c, 404, 'project_not_found', 'Project was not found.');
    }

    return c.json({ project });
  });

  app.post('/api/projects/:projectId/revisions', async (c) => {
    const parsed = await readJsonObject(c);
    if (parsed.error) {
      return jsonError(c, 400, parsed.error, 'Expected a JSON object request body.');
    }

    const body = parsed.body;
    if (typeof body.reviewToken !== 'string' || body.reviewToken.length === 0) {
      return jsonError(c, 400, 'invalid_request', 'reviewToken is required.');
    }

    if (typeof body.artifactName !== 'string' || body.artifactName.length === 0) {
      return jsonError(c, 400, 'invalid_request', 'artifactName is required.');
    }

    if (typeof body.html !== 'string') {
      return jsonError(c, 400, 'invalid_request', 'html is required.');
    }

    if (body.parentRevisionId !== undefined && typeof body.parentRevisionId !== 'string') {
      return jsonError(c, 400, 'invalid_request', 'parentRevisionId must be a string.');
    }

    const result = storage.createRevision({
      projectId: c.req.param('projectId'),
      reviewToken: body.reviewToken,
      artifactName: body.artifactName,
      html: body.html,
      parentRevisionId: body.parentRevisionId,
      now: now()
    });

    if (result.error === 'project_not_found') {
      return jsonError(c, 404, 'project_not_found', 'Project was not found.');
    }

    if (result.error === 'review_not_found') {
      return jsonError(c, 404, 'review_not_found', 'Review token was not found.');
    }

    return c.json(
      {
        revision: result.revision,
        reviewToken: body.reviewToken,
        reviewUrl: `/r/${body.reviewToken}`,
        artifactUrl: `/api/reviews/${body.reviewToken}/revisions/${result.revision.id}/artifact`
      },
      201
    );
  });

  app.get('/api/projects/:projectId/revisions', (c) => {
    const projectId = c.req.param('projectId');
    if (!storage.getProject(projectId)) {
      return jsonError(c, 404, 'project_not_found', 'Project was not found.');
    }

    return c.json({ revisions: storage.listRevisions(projectId) });
  });

  app.get('/api/reviews/:reviewToken', (c) => {
    const reviewToken = c.req.param('reviewToken');
    const bundle = storage.getReviewBundle(reviewToken);
    if (!bundle) {
      return jsonError(c, 404, 'review_not_found', 'Review token was not found.');
    }

    return c.json({
      project: bundle.project,
      review: publicReview(bundle.review),
      reviewToken,
      reviewUrl: `/r/${reviewToken}`
    });
  });

  app.get('/api/reviews/:reviewToken/revisions/:revisionId/artifact', (c) => {
    const result = storage.getArtifactForReview(
      c.req.param('reviewToken'),
      c.req.param('revisionId')
    );
    if (!result) {
      return jsonError(c, 404, 'artifact_not_found', 'Artifact was not found.');
    }

    return new Response(result.html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': ARTIFACT_CSP
      }
    });
  });

  app.get('/api/reviews/:reviewToken/comments', (c) => {
    const comments = storage.listComments(c.req.param('reviewToken'));
    if (!comments) {
      return jsonError(c, 404, 'review_not_found', 'Review token was not found.');
    }

    return c.json({ comments });
  });

  app.post('/api/reviews/:reviewToken/comments', async (c) => {
    const parsed = await readJsonObject(c);
    if (parsed.error) {
      return jsonError(c, 400, parsed.error, 'Expected a JSON object request body.');
    }

    const validated = validateCreateCommentBody(parsed.body);
    if (validated.error) {
      return jsonError(c, 400, validated.error, validated.message);
    }

    const result = storage.createComment({
      reviewToken: c.req.param('reviewToken'),
      now: now(),
      ...validated.value
    });

    if (result.error === 'review_not_found') {
      return jsonError(c, 404, 'review_not_found', 'Review token was not found.');
    }

    if (result.error === 'revision_not_found') {
      return jsonError(c, 404, 'revision_not_found', 'Revision was not found.');
    }

    return c.json({ comment: result.comment }, 201);
  });

  app.patch('/api/reviews/:reviewToken/comments/:commentId', async (c) => {
    const parsed = await readJsonObject(c);
    if (parsed.error) {
      return jsonError(c, 400, parsed.error, 'Expected a JSON object request body.');
    }

    const validated = validatePatchCommentBody(parsed.body);
    if (validated.error) {
      return jsonError(c, 400, validated.error, validated.message);
    }

    const result = storage.updateComment({
      reviewToken: c.req.param('reviewToken'),
      commentId: c.req.param('commentId'),
      patch: validated.value,
      now: now()
    });

    if (result.error === 'review_not_found') {
      return jsonError(c, 404, 'review_not_found', 'Review token was not found.');
    }

    if (result.error === 'comment_not_found') {
      return jsonError(c, 404, 'comment_not_found', 'Comment was not found.');
    }

    return c.json({ comment: result.comment });
  });

  app.notFound((c) => jsonError(c, 404, 'not_found', 'Docksync API route was not found.'));
  app.onError((error, c) =>
    jsonError(c, 500, 'internal_error', error instanceof Error ? error.message : 'Unexpected error.')
  );

  return app;
}
