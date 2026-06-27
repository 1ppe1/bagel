export type WorkflowStatus = 'open' | 'resolved';

export type AnchorStatus = 'attached' | 'needs_review' | 'orphaned';

export const workflowStatuses = ['open', 'resolved'] as const;

export const anchorStatuses = ['attached', 'needs_review', 'orphaned'] as const;

export const defaultWorkflowStatus: WorkflowStatus = 'open';

export const defaultAnchorStatus: AnchorStatus = 'attached';

export type Project = {
  id: string;
  name: string;
  localRootHint?: string;
  createdAt: string;
  updatedAt: string;
};

export type Review = {
  id: string;
  projectId: string;
  tokenHash: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicReview = Omit<Review, 'tokenHash'>;

export type Revision = {
  id: string;
  projectId: string;
  reviewId: string;
  artifactName: string;
  contentHash: string;
  artifactStorageKey: string;
  parentRevisionId?: string;
  createdAt: string;
};

export type TextQuote = {
  exact: string;
  prefix?: string;
  suffix?: string;
};

export type CompositeAnchor = {
  stableId?: string;
  selector: string;
  textQuote?: TextQuote;
  headingPath: string[];
  element: {
    tagName: string;
    id?: string;
    classList: string[];
    attributes: Record<string, string>;
    indexPath: number[];
  };
  fingerprint: {
    textHash?: string;
    attributesHash: string;
    subtreeHash?: string;
  };
};

export type RebaseResult = {
  fromRevisionId: string;
  toRevisionId: string;
  status: AnchorStatus;
  confidence: number;
  matchedSelector?: string;
  reasons: string[];
  createdAt: string;
};

export type Comment = {
  id: string;
  reviewId: string;
  projectId: string;
  revisionId: string;
  body: string;
  authorName?: string;
  workflowStatus: WorkflowStatus;
  anchorStatus: AnchorStatus;
  anchor: CompositeAnchor;
  rebaseHistory: RebaseResult[];
  createdAt: string;
  updatedAt: string;
};

export type ReviewComment = Comment;

export type CreateProjectRequest = {
  name: string;
  localRootHint?: string;
  title?: string;
};

export type CreateProjectResponse = {
  project: Project;
  review: PublicReview;
  reviewToken: string;
  reviewUrl: string;
};

export type CreateRevisionRequest = {
  reviewToken: string;
  artifactName: string;
  html: string;
  parentRevisionId?: string;
};

export type CreateRevisionResponse = {
  revision: Revision;
  reviewToken: string;
  reviewUrl: string;
  artifactUrl: string;
};

export type CreateCommentRequest = {
  revisionId: string;
  body: string;
  authorName?: string;
  workflowStatus?: WorkflowStatus;
  anchorStatus?: AnchorStatus;
  anchor: CompositeAnchor;
};

export type UpdateCommentRequest = {
  body?: string;
  workflowStatus?: WorkflowStatus;
  anchorStatus?: AnchorStatus;
  anchor?: CompositeAnchor;
};

export type CommentResponse = {
  comment: Comment;
};

export type CommentsResponse = {
  comments: Comment[];
};

export type ContextComment = Pick<
  Comment,
  'id' | 'body' | 'workflowStatus' | 'anchorStatus' | 'revisionId' | 'anchor'
> & {
  suggestedInstruction?: string;
};

export type ReviewTokenContract = {
  reviewToken: string;
  tokenHash: string;
  reviewId: string;
};

export const mockCreateProjectResponse: CreateProjectResponse = {
  project: {
    id: 'proj_mock',
    name: 'Docksync Demo',
    createdAt: '2026-06-27T00:00:00.000Z',
    updatedAt: '2026-06-27T00:00:00.000Z'
  },
  review: {
    id: 'revw_mock',
    projectId: 'proj_mock',
    title: 'Docksync Demo',
    createdAt: '2026-06-27T00:00:00.000Z',
    updatedAt: '2026-06-27T00:00:00.000Z'
  },
  reviewToken: 'raw-token-visible-only-locally',
  reviewUrl: '/r/raw-token-visible-only-locally'
};

export function isWorkflowStatus(value: unknown): value is WorkflowStatus {
  return typeof value === 'string' && (workflowStatuses as readonly string[]).includes(value);
}

export function isAnchorStatus(value: unknown): value is AnchorStatus {
  return typeof value === 'string' && (anchorStatuses as readonly string[]).includes(value);
}
