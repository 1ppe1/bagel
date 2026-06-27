import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { anchorStatuses, workflowStatuses } from '@docsync/core';
import { createMemoryStorage, createReviewToken } from './storage.mjs';

const DEFAULT_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_WORKFLOW_STATUS = 'open';
const DEFAULT_ANCHOR_STATUS = 'attached';
const DEFAULT_WEB_DIST_DIR = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const BRIDGE_SCRIPT_PATH = '/docsync-bridge.js';
const BRIDGE_SCRIPT_FILE = fileURLToPath(new URL('./review-bridge.js', import.meta.url));
const BRIDGE_SCRIPT_BODY = readFileSync(BRIDGE_SCRIPT_FILE, 'utf8');
const REVIEW_APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "img-src 'self' data: blob: https:",
  "base-uri 'none'",
  "object-src 'none'"
].join('; ');
const BRIDGE_SCRIPT_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "base-uri 'none'",
  "object-src 'none'"
].join('; ');
const WEB_ASSET_CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

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

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function readWebDistFile(webDistDir, relativePath) {
  const root = resolve(webDistDir);
  const filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    return null;
  }

  try {
    return {
      body: await readFile(filePath),
      contentType: WEB_ASSET_CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream'
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function validateArtifactHtml(html) {
  if (/<script\b/i.test(html)) {
    return 'Artifact contains a <script> tag.';
  }

  if (/\bon[a-z]+\s*=/i.test(html)) {
    return 'Artifact contains an inline event handler.';
  }

  if (/<\s*(iframe|object|embed|form)\b/i.test(html)) {
    return 'Artifact contains a forbidden embedded element.';
  }

  if (/javascript\s*:/i.test(html)) {
    return 'Artifact contains a javascript: URL.';
  }

  return null;
}

function stripUnsafePreviewHtml(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/giu, '')
    .replace(/<\s*(iframe|object|embed|form)\b[\s\S]*?<\/\s*\1\s*>/giu, '')
    .replace(/<\s*(iframe|object|embed|form|base)\b[^>]*\/?>/giu, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/giu, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, '')
    .replace(
      /\s+(href|src|action|formaction|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]*)/giu,
      ''
    );
}

function bridgeStyleTag() {
  return `<style data-docsync-bridge="true">
    [data-docsync-selected="true"] {
      outline: 3px solid #0f766e !important;
      outline-offset: 3px !important;
    }

    [data-docsync-hover="true"] {
      outline: 2px dashed #f59e0b !important;
      outline-offset: 3px !important;
      cursor: crosshair !important;
    }
  </style>`;
}

function artifactCsp(bridgeNonce) {
  const scriptSource = bridgeNonce ? `script-src 'self' 'nonce-${bridgeNonce}'` : "script-src 'self'";
  return [
    "default-src 'none'",
    scriptSource,
    "style-src 'unsafe-inline'",
    'img-src data: blob: https:',
    'font-src data: https:',
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'"
  ].join('; ');
}

function scriptContentForHtml(scriptBody) {
  return scriptBody.replace(/<\/script/giu, '<\\/script');
}

function bridgeScriptTag({ revisionId, bridgeNonce }) {
  return `<script nonce="${escapeHtmlAttribute(
    bridgeNonce
  )}" data-docsync-revision-id="${escapeHtmlAttribute(
    revisionId
  )}" data-docsync-bridge-nonce="${escapeHtmlAttribute(bridgeNonce)}">${scriptContentForHtml(
    BRIDGE_SCRIPT_BODY
  )}</script>`;
}

function injectBeforeClosingTag(html, tagName, content) {
  const pattern = new RegExp(`</${tagName}\\s*>`, 'iu');
  if (pattern.test(html)) {
    return html.replace(pattern, `${content}</${tagName}>`);
  }

  return `${html}${content}`;
}

function instrumentArtifactHtml(html, { revisionId, bridgeNonce }) {
  let nextHtml = stripUnsafePreviewHtml(html);
  nextHtml = injectBeforeClosingTag(nextHtml, 'head', bridgeStyleTag());
  nextHtml = injectBeforeClosingTag(
    nextHtml,
    'body',
    bridgeScriptTag({
      revisionId,
      bridgeNonce
    })
  );
  return nextHtml;
}

function isBridgeNonce(value) {
  return typeof value === 'string' && /^[a-f0-9]{32}$/u.test(value);
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
  const webDistDir = options.webDistDir ?? DEFAULT_WEB_DIST_DIR;
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

  app.get('/r/:reviewToken', async (c) => {
    const reviewToken = c.req.param('reviewToken');
    const bundle = storage.getReviewBundle(reviewToken);
    if (!bundle) {
      return jsonError(c, 404, 'review_not_found', 'Review token was not found.');
    }

    const index = await readWebDistFile(webDistDir, 'index.html');
    if (!index) {
      return jsonError(c, 503, 'review_app_unavailable', 'Review UI build was not found.');
    }

    return new Response(index.body, {
      status: 200,
      headers: {
        'content-type': index.contentType,
        'cache-control': 'no-store',
        'content-security-policy': REVIEW_APP_CSP
      }
    });
  });

  app.get(BRIDGE_SCRIPT_PATH, async () => {
    const body = await readFile(BRIDGE_SCRIPT_FILE);
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': BRIDGE_SCRIPT_CSP
      }
    });
  });

  app.get('/app-icon.png', async (c) => {
    const icon = await readWebDistFile(webDistDir, 'app-icon.png');
    if (!icon) {
      return jsonError(c, 404, 'asset_not_found', 'App icon was not found.');
    }

    return new Response(icon.body, {
      status: 200,
      headers: {
        'content-type': icon.contentType,
        'cache-control': 'public, max-age=86400'
      }
    });
  });

  app.get('/assets/*', async (c) => {
    const assetPath = decodePathSegment(c.req.path.slice('/assets/'.length));
    if (
      !assetPath ||
      assetPath.includes('\0') ||
      assetPath.startsWith('/') ||
      assetPath.startsWith('\\') ||
      assetPath.split(/[\\/]/u).includes('..')
    ) {
      return jsonError(c, 404, 'asset_not_found', 'Review UI asset was not found.');
    }

    const asset = await readWebDistFile(webDistDir, `assets/${assetPath}`);
    if (!asset) {
      return jsonError(c, 404, 'asset_not_found', 'Review UI asset was not found.');
    }

    return new Response(asset.body, {
      status: 200,
      headers: {
        'content-type': asset.contentType,
        'cache-control': 'public, max-age=31536000, immutable'
      }
    });
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

    const securityError = validateArtifactHtml(body.html);
    if (securityError) {
      return jsonError(c, 400, 'unsafe_artifact', securityError);
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
    const bridgeNonce = c.req.query('bridgeNonce');
    if (bridgeNonce !== undefined && !isBridgeNonce(bridgeNonce)) {
      return jsonError(c, 400, 'invalid_bridge_nonce', 'A valid bridge nonce is required.');
    }

    const result = storage.getArtifactForReview(
      c.req.param('reviewToken'),
      c.req.param('revisionId')
    );
    if (!result) {
      return jsonError(c, 404, 'artifact_not_found', 'Artifact was not found.');
    }

    const html = bridgeNonce
      ? instrumentArtifactHtml(result.html, {
          revisionId: result.revision.id,
          bridgeNonce
        })
      : stripUnsafePreviewHtml(result.html);

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': artifactCsp(bridgeNonce)
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
