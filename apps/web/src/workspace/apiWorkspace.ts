import type { WorkspaceGraph } from '@docsync/core';
import type { Reviewer, Workspace } from './types.ts';

// Avatar palette. Reviewer colors are a UI concern (the API stores only
// initials + name), so they are derived deterministically here.
const AVATAR_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#ecddf6', fg: '#8a5ba8' },
  { bg: '#d6e8f5', fg: '#2f76a0' },
  { bg: '#d7ecd9', fg: '#3f7d57' },
  { bg: '#fbe2d3', fg: '#b5652f' },
  { bg: '#f6e0ec', fg: '#a8497e' },
  { bg: '#e3e6f5', fg: '#5a5fa0' }
];

function paletteFor(initials: string): { bg: string; fg: string } {
  let hash = 0;
  for (let index = 0; index < initials.length; index += 1) {
    hash = (hash * 31 + initials.charCodeAt(index)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Convert the API workspace graph into the shape the graph UI consumes. */
export function apiWorkspaceToWeb(graph: WorkspaceGraph): Workspace {
  const reviewerByInitials = new Map<string, Reviewer>();
  const reviewerFor = (initials: string, name: string): Reviewer => {
    const existing = reviewerByInitials.get(initials);
    if (existing) {
      return existing;
    }
    const { bg, fg } = paletteFor(initials);
    const reviewer: Reviewer = { initials, name, bg, fg };
    reviewerByInitials.set(initials, reviewer);
    return reviewer;
  };

  return {
    name: graph.name,
    nodes: graph.artifacts.map((artifact) => ({
      id: artifact.id,
      label: artifact.label,
      file: artifact.file,
      type: artifact.type,
      summary: artifact.summary,
      checksPassed: artifact.checksPassed,
      checksTotal: artifact.checksTotal
    })),
    links: graph.links.map((link) => ({ source: link.source, target: link.target })),
    comments: graph.comments.map((comment) => ({
      id: comment.id,
      artifactId: comment.artifactId,
      reviewer: reviewerFor(comment.reviewerInitials, comment.reviewerName),
      text: comment.text,
      fixInstruction: comment.fixInstruction,
      resolved: comment.resolved
    }))
  };
}
