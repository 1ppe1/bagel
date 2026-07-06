import type { CompositeAnchor } from '@docsync/core';

export type SelectedElement = {
  anchor: CompositeAnchor;
  preview: {
    tagName: string;
    selector: string;
    text: string;
    headingPath: string[];
    stableId?: string;
  };
};

export function createBridgeNonce() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure browser random values are required for iframe selection.');
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function artifactFrameUrl(reviewToken: string, revisionId: string, bridgeNonce: string) {
  const params = new URLSearchParams({
    bridgeNonce
  });

  return `/api/reviews/${encodeURIComponent(reviewToken)}/revisions/${encodeURIComponent(
    revisionId
  )}/artifact?${params.toString()}`;
}
