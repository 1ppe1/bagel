import type { Comment, Project, PublicReview, Revision } from '@docsync/core';

export type ReviewDetailsResponse = {
  project: Project;
  review: PublicReview;
  reviewToken: string;
  reviewUrl: string;
};

export type RevisionListResponse = {
  revisions: Revision[];
};

export type CommentsResponse = {
  comments: Comment[];
};

export type CreateCommentResponse = {
  comment: Comment;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function reviewPath(reviewToken: string) {
  return `/api/reviews/${encodeURIComponent(reviewToken)}`;
}

async function apiErrorFromResponse(response: Response) {
  const fallback = `Request failed with status ${response.status}.`;

  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    const message = typeof body.message === 'string' ? body.message : fallback;
    const code = typeof body.error === 'string' ? body.error : undefined;
    return new ApiError(message, response.status, code);
  } catch {
    return new ApiError(fallback, response.status);
  }
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');

  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers
  });

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  return (await response.json()) as T;
}

export function getReviewDetails(reviewToken: string) {
  return fetchJson<ReviewDetailsResponse>(reviewPath(reviewToken));
}

export function listRevisions(projectId: string) {
  return fetchJson<RevisionListResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/revisions`
  );
}

export async function getArtifactHtml(reviewToken: string, revisionId: string) {
  const response = await fetch(
    `${reviewPath(reviewToken)}/revisions/${encodeURIComponent(revisionId)}/artifact`,
    {
      headers: {
        accept: 'text/html'
      }
    }
  );

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  return response.text();
}

export function listComments(reviewToken: string) {
  return fetchJson<CommentsResponse>(`${reviewPath(reviewToken)}/comments`);
}

export function createComment(reviewToken: string, payload: unknown) {
  return fetchJson<CreateCommentResponse>(`${reviewPath(reviewToken)}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
