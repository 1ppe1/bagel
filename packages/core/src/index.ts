export type WorkflowStatus = 'open' | 'resolved';

export type AnchorStatus = 'attached' | 'needs_review' | 'orphaned';

export const workflowStatuses = ['open', 'resolved'] as const;

export const anchorStatuses = ['attached', 'needs_review', 'orphaned'] as const;

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
};

export type ReviewComment = {
  id: string;
  body: string;
  workflowStatus: WorkflowStatus;
  anchorStatus: AnchorStatus;
  anchor: CompositeAnchor;
  createdAt: string;
  updatedAt: string;
};

export type Revision = {
  id: string;
  contentHash: string;
  artifactName: string;
  createdAt: string;
};

export function isAnchorStatus(value: string): value is AnchorStatus {
  return (anchorStatuses as readonly string[]).includes(value);
}
