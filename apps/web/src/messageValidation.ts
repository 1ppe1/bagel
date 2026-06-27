import type { CompositeAnchor } from '@docsync/core';
import type { SelectedElement } from './iframeDocument.ts';

const SELECTION_MESSAGE_TYPE = 'docsync:element-selected';
const MAX_SELECTION_MESSAGE_BYTES = 32_000;

export function parseSelectionMessage(
  data: unknown,
  expectedBridgeNonce: string,
  expectedRevisionId: string
): SelectedElement | null {
  if (!isSafeMessageSize(data) || !isRecord(data)) {
    return null;
  }

  if (
    data.type !== SELECTION_MESSAGE_TYPE ||
    data.bridgeNonce !== expectedBridgeNonce ||
    data.revisionId !== expectedRevisionId ||
    !isRecord(data.selection)
  ) {
    return null;
  }

  const anchor = data.selection.anchor;
  if (!isCompositeAnchor(anchor)) {
    return null;
  }

  const fallbackPreview = {
    tagName: anchor.element.tagName,
    selector: anchor.selector,
    text: anchor.textQuote?.exact ?? '',
    headingPath: anchor.headingPath,
    stableId: anchor.stableId
  };

  return {
    anchor,
    preview: isPreview(data.selection.preview)
      ? {
          tagName: data.selection.preview.tagName,
          selector: data.selection.preview.selector,
          text: data.selection.preview.text,
          headingPath: data.selection.preview.headingPath,
          stableId: data.selection.preview.stableId
        }
      : fallbackPreview
  };
}

function isSafeMessageSize(data: unknown) {
  try {
    return JSON.stringify(data).length <= MAX_SELECTION_MESSAGE_BYTES;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isCompositeAnchor(value: unknown): value is CompositeAnchor {
  if (!isRecord(value)) {
    return false;
  }

  if (
    (value.stableId !== undefined && typeof value.stableId !== 'string') ||
    typeof value.selector !== 'string' ||
    !isStringArray(value.headingPath)
  ) {
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

  if (!isRecord(value.element) || !isRecord(value.fingerprint)) {
    return false;
  }

  return (
    typeof value.element.tagName === 'string' &&
    (value.element.id === undefined || typeof value.element.id === 'string') &&
    isStringArray(value.element.classList) &&
    isStringRecord(value.element.attributes) &&
    isNumberArray(value.element.indexPath) &&
    (value.fingerprint.textHash === undefined || typeof value.fingerprint.textHash === 'string') &&
    typeof value.fingerprint.attributesHash === 'string' &&
    (value.fingerprint.subtreeHash === undefined ||
      typeof value.fingerprint.subtreeHash === 'string')
  );
}

function isPreview(value: unknown): value is SelectedElement['preview'] {
  return (
    isRecord(value) &&
    typeof value.tagName === 'string' &&
    typeof value.selector === 'string' &&
    typeof value.text === 'string' &&
    isStringArray(value.headingPath) &&
    (value.stableId === undefined || typeof value.stableId === 'string')
  );
}
