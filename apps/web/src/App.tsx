import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnchorStatus, Comment, Revision } from '@docsync/core';
import {
  ApiError,
  createComment,
  getReviewDetails,
  listComments,
  listRevisions,
  type ReviewDetailsResponse
} from './api.ts';
import {
  artifactFrameUrl,
  createBridgeNonce,
  type SelectedElement
} from './iframeDocument.ts';
import { parseSelectionMessage } from './messageValidation.ts';
import { WorkspaceGraph } from './workspace/WorkspaceGraph.tsx';
import { useWorkspace } from './workspace/useWorkspace.ts';
import type { Workspace } from './workspace/types.ts';

type BridgeState = {
  nonce: string;
  src: string;
};

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

const anchorStatusLabels: Record<AnchorStatus, string> = {
  attached: 'Attached',
  needs_review: 'Needs review',
  orphaned: 'Orphaned'
};

export function App() {
  const reviewToken = useMemo(() => reviewTokenFromPath(window.location.pathname), []);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [details, setDetails] = useState<ReviewDetailsResponse | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [isRefreshingComments, setIsRefreshingComments] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [fixInstruction, setFixInstruction] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewTab, setViewTab] = useState<'document' | 'relationships'>('document');
  const { workspace: graphWorkspace } = useWorkspace();

  const refreshComments = useCallback(async () => {
    if (!reviewToken) {
      return;
    }

    setIsRefreshingComments(true);
    setCommentsError(null);
    try {
      const response = await listComments(reviewToken);
      setComments(response.comments);
    } catch (error) {
      setCommentsError(errorMessage(error, 'Comments could not be loaded.'));
    } finally {
      setIsRefreshingComments(false);
    }
  }, [reviewToken]);

  useEffect(() => {
    if (!reviewToken) {
      return;
    }

    const currentReviewToken = reviewToken;
    let cancelled = false;

    async function loadReview() {
      setLoadStatus('loading');
      setLoadError(null);
      setCommentsError(null);
      setSubmitError(null);
      setSelectedElement(null);
      setBridge(null);

      try {
        const nextDetails = await getReviewDetails(currentReviewToken);
        const [revisionResponse, commentsResponse] = await Promise.all([
          listRevisions(nextDetails.project.id),
          listComments(currentReviewToken)
        ]);

        const reviewRevisions = revisionResponse.revisions.filter(
          (revision) => revision.reviewId === nextDetails.review.id
        );
        const latestRevision = latestRevisionForReview(reviewRevisions);

        let nextBridge: BridgeState | null = null;
        if (latestRevision) {
          const nonce = createBridgeNonce();
          nextBridge = {
            nonce,
            src: artifactFrameUrl(currentReviewToken, latestRevision.id, nonce)
          };
        }

        if (cancelled) {
          return;
        }

        setDetails(nextDetails);
        setRevisions(reviewRevisions);
        setSelectedRevision(latestRevision);
        setBridge(nextBridge);
        setComments(commentsResponse.comments);
        setLoadStatus('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLoadError(errorMessage(error, 'Review could not be loaded.'));
        setLoadStatus('error');
      }
    }

    void loadReview();

    return () => {
      cancelled = true;
    };
  }, [reviewToken]);

  useEffect(() => {
    if (!bridge || !selectedRevision) {
      return;
    }

    const currentBridge = bridge;
    const currentRevision = selectedRevision;

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const selection = parseSelectionMessage(event.data, currentBridge.nonce, currentRevision.id);
      if (selection) {
        setSelectedElement(selection);
        setSubmitError(null);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [bridge, selectedRevision]);

  async function submitComment() {
    if (!reviewToken || !selectedRevision || !selectedElement) {
      setSubmitError('Select an element before adding a comment.');
      return;
    }

    const body = commentBody.trim();
    if (!body) {
      setSubmitError('Comment body is required.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createComment(reviewToken, {
        revisionId: selectedRevision.id,
        body,
        fixInstruction,
        workflowStatus: 'open',
        anchorStatus: 'attached',
        anchor: selectedElement.anchor
      });
      setCommentBody('');
      setFixInstruction(false);
      await refreshComments();
    } catch (error) {
      setSubmitError(errorMessage(error, 'Comment could not be added.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!reviewToken) {
    return (
      <main className="center-state">
        <h1>Bagle Review</h1>
        <p>Open a valid review URL.</p>
      </main>
    );
  }

  if (loadStatus === 'loading' || loadStatus === 'idle') {
    return (
      <main className="center-state">
        <h1>Bagle Review</h1>
        <p>Loading review...</p>
      </main>
    );
  }

  if (loadStatus === 'error') {
    return (
      <main className="center-state error-state">
        <h1>Review unavailable</h1>
        <p>{loadError}</p>
        <button className="primary-action" type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }

  return (
    <main className="review-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Bagle Review</p>
          <h1>{details?.review.title ?? 'Review'}</h1>
        </div>
        <div className="review-meta" aria-label="Review metadata">
          <span>{details?.project.name}</span>
          <span>{selectedRevision ? selectedRevision.artifactName : 'No artifact'}</span>
        </div>
      </header>

      <section className="workspace" aria-label="Review workspace">
        <div className="artifact-pane">
          <div className="pane-header">
            <div>
              <h2>Artifact preview</h2>
              <p>{revisionSummary(revisions, selectedRevision)}</p>
            </div>
            <div className="tab-bar" role="tablist" aria-label="Review view">
              <button
                type="button"
                role="tab"
                aria-selected={viewTab === 'document'}
                className={viewTab === 'document' ? 'tab tab-active' : 'tab'}
                onClick={() => setViewTab('document')}
              >
                Document
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewTab === 'relationships'}
                className={viewTab === 'relationships' ? 'tab tab-active' : 'tab'}
                onClick={() => setViewTab('relationships')}
              >
                Relationships
              </button>
            </div>
          </div>
          {viewTab === 'document' ? (
            bridge && selectedRevision ? (
              <iframe
                ref={iframeRef}
                className="artifact-frame"
                title={`Artifact preview for ${selectedRevision.artifactName}`}
                sandbox="allow-scripts"
                src={bridge.src}
              />
            ) : (
              <div className="empty-pane">
                <h3>No revisions yet</h3>
                <p>This review does not have an artifact revision.</p>
              </div>
            )
          ) : (
            <div className="relationships-pane">
              <WorkspaceGraph
                workspace={graphWorkspace}
                focusId={focusNodeId(graphWorkspace, selectedRevision?.artifactName)}
                showInspector={false}
              />
            </div>
          )}
        </div>

        <aside className="review-pane" aria-label="Review controls">
          <section className="panel">
            <div className="panel-header">
              <h2>Selected element</h2>
              <AnchorStatusBadge status="attached" />
            </div>
            <SelectedElementPreview selection={selectedElement} />
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Add comment</h2>
            </div>
            <label className="field-label" htmlFor="comment-body">
              Comment
            </label>
            <textarea
              id="comment-body"
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder={fixInstruction ? 'Describe the fix for the local AI' : 'Write a comment'}
              rows={5}
            />
            <label className="fix-toggle">
              <input
                type="checkbox"
                checked={fixInstruction}
                onChange={(event) => setFixInstruction(event.target.checked)}
              />
              <span>
                Fix instruction
                <small>Hand this to the local AI as a change to apply, not just feedback.</small>
              </span>
            </label>
            {submitError ? <p className="inline-error">{submitError}</p> : null}
            <button
              className="primary-action"
              type="button"
              disabled={isSubmitting || !commentBody.trim() || !selectedElement || !selectedRevision}
              onClick={() => void submitComment()}
            >
              {isSubmitting ? 'Adding...' : fixInstruction ? 'Add fix instruction' : 'Add comment'}
            </button>
          </section>

          <section className="panel comments-panel">
            <div className="panel-header">
              <h2>Open comments</h2>
              <button
                className="secondary-action"
                type="button"
                disabled={isRefreshingComments}
                onClick={() => void refreshComments()}
              >
                {isRefreshingComments ? 'Refreshing...' : 'Refresh comments'}
              </button>
            </div>
            {commentsError ? <p className="inline-error">{commentsError}</p> : null}
            <CommentList comments={comments} />
          </section>
        </aside>
      </section>
    </main>
  );
}

export function reviewTokenFromPath(pathname: string) {
  const match = pathname.match(/^\/r\/([^/]+)\/?$/);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

// Map the current artifact file to a node in the workspace so the
// Relationships tab can frame its impact scope. Falls back to no focus.
function focusNodeId(workspace: Workspace, artifactName: string | undefined) {
  if (!artifactName) {
    return undefined;
  }
  return workspace.nodes.find((node) => node.file === artifactName)?.id;
}

function latestRevisionForReview(revisions: Revision[]) {
  if (revisions.length === 0) {
    return null;
  }

  return [...revisions].sort((left, right) => {
    const byTime = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return byTime === 0 ? right.id.localeCompare(left.id) : byTime;
  })[0];
}

function revisionSummary(revisions: Revision[], selectedRevision: Revision | null) {
  if (!selectedRevision) {
    return 'No artifact revision is available.';
  }

  const count = revisions.length === 1 ? '1 revision' : `${revisions.length} revisions`;
  return `${selectedRevision.artifactName} - ${count}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.code === 'review_not_found') {
    return 'Review token was not found.';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function SelectedElementPreview({ selection }: { selection: SelectedElement | null }) {
  if (!selection) {
    return (
      <div className="empty-block">
        <h3>No element selected</h3>
      </div>
    );
  }

  const quote = selection.anchor.textQuote?.exact ?? selection.preview.text;

  return (
    <div className="selection-block">
      {quote ? (
        <blockquote className="selection-quote">{quote}</blockquote>
      ) : null}
      <dl className="selection-details">
        <div>
          <dt>Tag</dt>
          <dd>{selection.preview.tagName}</dd>
        </div>
        <div>
          <dt>Selector</dt>
          <dd>
            <code>{selection.preview.selector}</code>
          </dd>
        </div>
        <div>
          <dt>Heading path</dt>
          <dd>
            {selection.preview.headingPath.length
              ? selection.preview.headingPath.join(' / ')
              : 'None'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function CommentList({ comments }: { comments: Comment[] }) {
  if (comments.length === 0) {
    return (
      <div className="empty-block">
        <h3>No comments yet</h3>
      </div>
    );
  }

  return (
    <ol className="comment-list">
      {comments.map((comment) => (
        <li className="comment-item" key={comment.id}>
          <div className="comment-item-header">
            <div className="comment-badges">
              {comment.fixInstruction ? <span className="fix-badge">Fix</span> : null}
              <AnchorStatusBadge status={comment.anchorStatus} />
            </div>
            <time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
          </div>
          <p className="comment-body">{comment.body}</p>
          <div className="comment-target">
            <strong>{targetPreview(comment)}</strong>
            <code>{comment.anchor.selector}</code>
          </div>
        </li>
      ))}
    </ol>
  );
}

function AnchorStatusBadge({ status }: { status: AnchorStatus }) {
  return <span className={`status-badge status-${status}`}>{anchorStatusLabels[status]}</span>;
}

function targetPreview(comment: Comment) {
  return (
    comment.anchor.textQuote?.exact ||
    comment.anchor.element.attributes['aria-label'] ||
    comment.anchor.element.attributes.alt ||
    comment.anchor.selector
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}
