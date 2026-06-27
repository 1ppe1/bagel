import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function hashString(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function createReviewToken() {
  return randomBytes(24).toString('base64url');
}

function makeId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function setIfDefined(target, key, value) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function createEmptyState() {
  return {
    projectsById: new Map(),
    reviewsById: new Map(),
    reviewIdsByTokenHash: new Map(),
    revisionsById: new Map(),
    revisionIdsByReviewId: new Map(),
    artifactsByKey: new Map(),
    commentsById: new Map(),
    commentIdsByReviewId: new Map()
  };
}

function snapshotState(state) {
  return {
    version: 1,
    projects: [...state.projectsById.values()],
    reviews: [...state.reviewsById.values()],
    reviewIdsByTokenHash: [...state.reviewIdsByTokenHash.entries()],
    revisions: [...state.revisionsById.values()],
    revisionIdsByReviewId: [...state.revisionIdsByReviewId.entries()],
    artifacts: [...state.artifactsByKey.entries()],
    comments: [...state.commentsById.values()],
    commentIdsByReviewId: [...state.commentIdsByReviewId.entries()]
  };
}

function stateFromSnapshot(snapshot) {
  const state = createEmptyState();
  for (const project of snapshot.projects ?? []) {
    state.projectsById.set(project.id, project);
  }
  for (const review of snapshot.reviews ?? []) {
    state.reviewsById.set(review.id, review);
  }
  for (const [tokenHash, reviewId] of snapshot.reviewIdsByTokenHash ?? []) {
    state.reviewIdsByTokenHash.set(tokenHash, reviewId);
  }
  for (const revision of snapshot.revisions ?? []) {
    state.revisionsById.set(revision.id, revision);
  }
  for (const [reviewId, revisionIds] of snapshot.revisionIdsByReviewId ?? []) {
    state.revisionIdsByReviewId.set(reviewId, revisionIds);
  }
  for (const [artifactStorageKey, html] of snapshot.artifacts ?? []) {
    state.artifactsByKey.set(artifactStorageKey, html);
  }
  for (const comment of snapshot.comments ?? []) {
    state.commentsById.set(comment.id, comment);
  }
  for (const [reviewId, commentIds] of snapshot.commentIdsByReviewId ?? []) {
    state.commentIdsByReviewId.set(reviewId, commentIds);
  }

  return state;
}

function readJsonState(filePath) {
  try {
    return stateFromSnapshot(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return createEmptyState();
    }
    throw error;
  }
}

let atomicWriteIndex = 0;

function writeJsonState(filePath, state) {
  mkdirSync(dirname(filePath), { recursive: true });
  atomicWriteIndex += 1;
  const tmpPath = `${filePath}.${process.pid}.${atomicWriteIndex}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(snapshotState(state), null, 2)}\n`, 'utf8');
  renameSync(tmpPath, filePath);
}

function createStorage({ idGenerator, state, persist }) {
  const projectsById = state.projectsById;
  const reviewsById = state.reviewsById;
  const reviewIdsByTokenHash = state.reviewIdsByTokenHash;
  const revisionsById = state.revisionsById;
  const revisionIdsByReviewId = state.revisionIdsByReviewId;
  const artifactsByKey = state.artifactsByKey;
  const commentsById = state.commentsById;
  const commentIdsByReviewId = state.commentIdsByReviewId;

  function save() {
    persist(state);
  }

  function resolveReviewToken(reviewToken) {
    const reviewId = reviewIdsByTokenHash.get(hashString(reviewToken));
    if (!reviewId) {
      return null;
    }

    return reviewsById.get(reviewId) ?? null;
  }

  function getProjectReview(reviewToken) {
    const review = resolveReviewToken(reviewToken);
    if (!review) {
      return null;
    }

    const project = projectsById.get(review.projectId);
    if (!project) {
      return null;
    }

    return { project, review };
  }

  return {
    createProjectWithReview({ name, localRootHint, title, reviewToken, now }) {
      const project = {
        id: idGenerator('proj'),
        name,
        createdAt: now,
        updatedAt: now
      };
      setIfDefined(project, 'localRootHint', localRootHint);

      const review = {
        id: idGenerator('revw'),
        projectId: project.id,
        tokenHash: hashString(reviewToken),
        title: title ?? name,
        createdAt: now,
        updatedAt: now
      };

      projectsById.set(project.id, project);
      reviewsById.set(review.id, review);
      reviewIdsByTokenHash.set(review.tokenHash, review.id);
      save();

      return { project, review };
    },

    getProject(projectId) {
      return projectsById.get(projectId) ?? null;
    },

    resolveReviewToken,

    getReviewBundle(reviewToken) {
      return getProjectReview(reviewToken);
    },

    createRevision({ projectId, reviewToken, artifactName, html, parentRevisionId, now }) {
      const project = projectsById.get(projectId);
      if (!project) {
        return { error: 'project_not_found' };
      }

      const review = resolveReviewToken(reviewToken);
      if (!review || review.projectId !== projectId) {
        return { error: 'review_not_found' };
      }

      const revisionId = idGenerator('rev');
      const artifactStorageKey = `artifact:${review.id}:${revisionId}`;
      const revision = {
        id: revisionId,
        projectId,
        reviewId: review.id,
        artifactName,
        contentHash: hashString(html),
        artifactStorageKey,
        createdAt: now
      };
      setIfDefined(revision, 'parentRevisionId', parentRevisionId);

      revisionsById.set(revision.id, revision);
      artifactsByKey.set(artifactStorageKey, html);

      const revisionIds = revisionIdsByReviewId.get(review.id) ?? [];
      revisionIds.push(revision.id);
      revisionIdsByReviewId.set(review.id, revisionIds);

      project.updatedAt = now;
      review.updatedAt = now;
      save();

      return { project, review, revision };
    },

    listRevisions(projectId) {
      return [...revisionsById.values()].filter((revision) => revision.projectId === projectId);
    },

    getArtifactForReview(reviewToken, revisionId) {
      const review = resolveReviewToken(reviewToken);
      if (!review) {
        return null;
      }

      const revision = revisionsById.get(revisionId);
      if (!revision || revision.reviewId !== review.id) {
        return null;
      }

      const html = artifactsByKey.get(revision.artifactStorageKey);
      if (html === undefined) {
        return null;
      }

      return { review, revision, html };
    },

    listComments(reviewToken) {
      const review = resolveReviewToken(reviewToken);
      if (!review) {
        return null;
      }

      const commentIds = commentIdsByReviewId.get(review.id) ?? [];
      return commentIds.map((commentId) => commentsById.get(commentId)).filter(Boolean);
    },

    createComment({
      reviewToken,
      revisionId,
      body,
      authorName,
      workflowStatus,
      anchorStatus,
      anchor,
      now
    }) {
      const review = resolveReviewToken(reviewToken);
      if (!review) {
        return { error: 'review_not_found' };
      }

      const revision = revisionsById.get(revisionId);
      if (!revision || revision.reviewId !== review.id) {
        return { error: 'revision_not_found' };
      }

      const comment = {
        id: idGenerator('cmt'),
        reviewId: review.id,
        projectId: review.projectId,
        revisionId,
        body,
        workflowStatus,
        anchorStatus,
        anchor,
        rebaseHistory: [],
        createdAt: now,
        updatedAt: now
      };
      setIfDefined(comment, 'authorName', authorName);

      commentsById.set(comment.id, comment);
      const commentIds = commentIdsByReviewId.get(review.id) ?? [];
      commentIds.push(comment.id);
      commentIdsByReviewId.set(review.id, commentIds);

      review.updatedAt = now;
      save();

      return { comment };
    },

    updateComment({ reviewToken, commentId, patch, now }) {
      const review = resolveReviewToken(reviewToken);
      if (!review) {
        return { error: 'review_not_found' };
      }

      const existing = commentsById.get(commentId);
      if (!existing || existing.reviewId !== review.id) {
        return { error: 'comment_not_found' };
      }

      const updated = {
        ...existing,
        updatedAt: now
      };
      setIfDefined(updated, 'body', patch.body);
      setIfDefined(updated, 'workflowStatus', patch.workflowStatus);
      setIfDefined(updated, 'anchorStatus', patch.anchorStatus);
      setIfDefined(updated, 'anchor', patch.anchor);

      commentsById.set(commentId, updated);
      review.updatedAt = now;
      save();

      return { comment: updated };
    },

    inspect() {
      return {
        projectsById,
        reviewsById,
        reviewIdsByTokenHash,
        revisionsById,
        revisionIdsByReviewId,
        artifactsByKey,
        commentsById,
        commentIdsByReviewId
      };
    }
  };
}

export function createMemoryStorage(options = {}) {
  return createStorage({
    idGenerator: options.idGenerator ?? makeId,
    state: createEmptyState(),
    persist: () => {}
  });
}

export function createJsonFileStorage({ filePath, idGenerator } = {}) {
  if (!filePath) {
    throw new TypeError('filePath is required for JSON file storage.');
  }

  const state = readJsonState(filePath);
  return createStorage({
    idGenerator: idGenerator ?? makeId,
    state,
    persist: (nextState) => writeJsonState(filePath, nextState)
  });
}
