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

export type AnchorRebaseOutput = {
  status: AnchorStatus;
  confidence: number;
  matchedSelector?: string;
  reasons: string[];
  anchor?: CompositeAnchor;
};

type HtmlTextNode = {
  kind: 'text';
  text: string;
};

type HtmlElementNode = {
  kind: 'element';
  tagName: string;
  attributes: Record<string, string>;
  children: HtmlChildNode[];
  parent?: HtmlElementNode;
  order: number;
};

type HtmlChildNode = HtmlTextNode | HtmlElementNode;

type AnchorCandidate = {
  anchor: CompositeAnchor;
  node: HtmlElementNode;
  order: number;
  text: string;
  parentText: string;
};

type CandidateScore = {
  candidate: AnchorCandidate;
  score: number;
  reasons: string[];
};

const ignoredCandidateTags = new Set([
  '#document',
  'html',
  'head',
  'body',
  'meta',
  'script',
  'style',
  'link',
  'title'
]);

const voidTags = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

const entityMap: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

export function extractCompositeAnchors(html: string): CompositeAnchor[] {
  return generateAnchorCandidates(html).map((candidate) => candidate.anchor);
}

export function rebaseAnchor(anchor: CompositeAnchor, html: string): AnchorRebaseOutput {
  const candidates = generateAnchorCandidates(html);
  if (candidates.length === 0) {
    return {
      status: 'orphaned',
      confidence: 0,
      reasons: ['no candidates generated', 'no candidate exceeded orphan threshold']
    };
  }

  const scored = candidates
    .map((candidate) => scoreCandidate(anchor, candidate))
    .sort((left, right) => right.score - left.score || left.candidate.order - right.candidate.order);

  const best = scored[0];
  if (!best) {
    return {
      status: 'orphaned',
      confidence: 0,
      reasons: ['no candidates generated', 'no candidate exceeded orphan threshold']
    };
  }

  const equalTopCandidates = scored.filter(
    (candidateScore) => best.score > 0 && Math.abs(candidateScore.score - best.score) < 0.000_001
  );

  let confidence = best.score;
  const reasons = [...best.reasons];
  if (equalTopCandidates.length > 1) {
    confidence = Math.max(0, confidence - 0.2);
    confidence = Math.min(confidence, 0.79);
    reasons.push('multiple candidates had equal score');
  }

  confidence = clampScore(confidence);
  const status = statusForConfidence(confidence);
  if (status === 'orphaned') {
    reasons.push('no candidate exceeded orphan threshold');
  }

  const output: AnchorRebaseOutput = {
    status,
    confidence: roundConfidence(confidence),
    reasons: dedupeReasons(reasons)
  };

  if (status !== 'orphaned') {
    output.anchor = best.candidate.anchor;
    output.matchedSelector = best.candidate.anchor.selector;
  }

  return output;
}

function generateAnchorCandidates(html: string): AnchorCandidate[] {
  const documentNode = parseHtml(html);
  const candidates: AnchorCandidate[] = [];
  const headingStack: string[] = [];

  function visit(node: HtmlElementNode) {
    for (const child of node.children) {
      if (child.kind !== 'element') {
        continue;
      }

      const text = limit(normalizeText(elementText(child)), 240);
      let headingPath = headingStack.filter(Boolean);
      if (isHeadingTag(child.tagName) && text.length > 0) {
        const nextHeadingStack = headingStack.slice(0, headingLevel(child.tagName) - 1);
        nextHeadingStack[headingLevel(child.tagName) - 1] = limit(text, 120);
        headingPath = nextHeadingStack.filter(Boolean);
      }

      if (!ignoredCandidateTags.has(child.tagName)) {
        const attributes = attributesFor(child);
        const anchor: CompositeAnchor = {
          selector: selectorFor(child),
          headingPath,
          element: {
            tagName: child.tagName,
            classList: classListFor(child),
            attributes,
            indexPath: indexPathFor(child)
          },
          fingerprint: {
            attributesHash: hashValue(JSON.stringify(attributes))
          }
        };

        const stableId = child.attributes['data-docsync-id'];
        if (stableId) {
          anchor.stableId = stableId;
        }

        const elementId = child.attributes.id;
        if (elementId) {
          anchor.element.id = elementId;
        }

        if (text.length > 0) {
          anchor.textQuote = {
            exact: text
          };
          anchor.fingerprint.textHash = hashValue(text);
        }

        anchor.fingerprint.subtreeHash = hashValue(limit(outerHtml(child), 1000));
        candidates.push({
          anchor,
          node: child,
          order: child.order,
          text,
          parentText: child.parent ? limit(normalizeText(elementText(child.parent)), 500) : text
        });
      }

      if (isHeadingTag(child.tagName) && text.length > 0) {
        const level = headingLevel(child.tagName);
        headingStack.splice(level - 1);
        headingStack[level - 1] = limit(text, 120);
      }

      visit(child);
    }
  }

  visit(documentNode);
  return candidates;
}

function scoreCandidate(anchor: CompositeAnchor, candidate: AnchorCandidate): CandidateScore {
  let score = 0;
  const reasons: string[] = [];

  const anchorStableId = stableIdFor(anchor);
  const candidateStableId = stableIdFor(candidate.anchor);
  if (anchorStableId && candidateStableId && anchorStableId === candidateStableId) {
    score += 0.45;
    reasons.push(stableIdReason(anchor));
  }

  const selectorMatched = selectorMatchesCandidate(anchor.selector, candidate);
  if (selectorMatched) {
    score += 0.2;
    reasons.push('matched selector');
  }

  const quoteMatched = exactQuoteMatches(anchor, candidate);
  if (quoteMatched) {
    score += 0.25;
    reasons.push('matched exact text quote');
  }

  const contextMatched = quoteContextMatches(anchor, candidate);
  if (contextMatched) {
    score += 0.15;
    reasons.push('matched text quote context');
  }

  const headingMatched = headingPathMatches(anchor.headingPath, candidate.anchor.headingPath);
  if (headingMatched) {
    score += 0.15;
    reasons.push('matched heading path');
  }

  if (normalizeTag(anchor.element.tagName) === candidate.anchor.element.tagName) {
    score += 0.05;
    reasons.push('matched tag name');
  } else {
    score -= 0.1;
    reasons.push('tag mismatch');
  }

  const attributeSimilarityScore = attributeSimilarity(
    anchor.element.attributes,
    candidate.anchor.element.attributes
  );
  if (attributeSimilarityScore > 0) {
    score += 0.1 * attributeSimilarityScore;
    if (attributeSimilarityScore >= 0.8) {
      reasons.push('matched attribute fingerprint');
    }
  }

  const positionScore = positionProximity(
    anchor.element.indexPath,
    candidate.anchor.element.indexPath
  );
  if (positionScore > 0) {
    score += 0.05 * positionScore;
    if (positionScore === 1) {
      reasons.push('matched DOM position');
    }
  }

  if (anchor.textQuote?.exact && candidate.text.length === 0) {
    score -= 0.15;
    reasons.push('text quote missing in candidate');
  } else if (anchor.textQuote?.exact && !quoteMatched) {
    reasons.push('text quote changed');
  }

  if (headingPathConflicts(anchor.headingPath, candidate.anchor.headingPath)) {
    score -= 0.15;
    reasons.push('heading path conflict');
  }

  if (interactiveRole(anchor) !== interactiveRole(candidate.anchor)) {
    score -= 0.1;
    reasons.push('interactive role mismatch');
  }

  if (!selectorMatched && headingMatched && quoteMatched) {
    reasons.push('selector changed but heading path and quote matched');
  }

  return {
    candidate,
    score: clampScore(score),
    reasons: dedupeReasons(reasons)
  };
}

function parseHtml(html: string): HtmlElementNode {
  const root: HtmlElementNode = {
    kind: 'element',
    tagName: '#document',
    attributes: {},
    children: [],
    order: -1
  };
  const stack: HtmlElementNode[] = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g;
  let order = 0;

  for (const match of html.matchAll(tokenPattern)) {
    const token = match[0];
    const parent = stack[stack.length - 1] ?? root;

    if (token.startsWith('<!--') || /^<!/u.test(token)) {
      continue;
    }

    if (/^<\//u.test(token)) {
      const tagName = token.replace(/^<\s*\//u, '').replace(/\s*>$/u, '').trim().toLowerCase();
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index]?.tagName === tagName) {
          stack.length = index;
          break;
        }
      }
      continue;
    }

    if (token.startsWith('<')) {
      const parsedTag = parseStartTag(token, order);
      if (!parsedTag) {
        continue;
      }
      order += 1;
      parsedTag.node.parent = parent;
      parent.children.push(parsedTag.node);
      if (!parsedTag.selfClosing) {
        stack.push(parsedTag.node);
      }
      continue;
    }

    parent.children.push({
      kind: 'text',
      text: decodeHtml(token)
    });
  }

  return root;
}

function parseStartTag(
  token: string,
  order: number
): { node: HtmlElementNode; selfClosing: boolean } | null {
  const tagMatch = token.match(/^<\s*([a-zA-Z][^\s/>]*)/u);
  if (!tagMatch?.[1]) {
    return null;
  }

  const tagName = tagMatch[1].toLowerCase();
  const attributeSource = token
    .slice(tagMatch[0].length, token.endsWith('>') ? -1 : token.length)
    .replace(/\/\s*$/u, '');
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of attributeSource.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase();
    if (!name) {
      continue;
    }
    attributes[name] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }

  return {
    node: {
      kind: 'element',
      tagName,
      attributes,
      children: [],
      order
    },
    selfClosing: /\/\s*>$/u.test(token) || voidTags.has(tagName)
  };
}

function decodeHtml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entity, body: string) => {
    const normalized = body.toLowerCase();
    if (normalized.startsWith('#x')) {
      return codePointToString(Number.parseInt(normalized.slice(2), 16), entity);
    }
    if (normalized.startsWith('#')) {
      return codePointToString(Number.parseInt(normalized.slice(1), 10), entity);
    }
    return entityMap[normalized] ?? entity;
  });
}

function codePointToString(codePoint: number, fallback: string): string {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback;
}

function elementText(node: HtmlElementNode): string {
  const childText = node.children
    .map((child) => (child.kind === 'text' ? child.text : elementText(child)))
    .join(' ');
  if (normalizeText(childText)) {
    return childText;
  }
  return node.attributes.alt ?? node.attributes['aria-label'] ?? '';
}

function outerHtml(node: HtmlElementNode): string {
  const attributes = Object.entries(node.attributes)
    .map(([name, value]) => (value === '' ? name : `${name}="${escapeHtmlAttribute(value)}"`))
    .join(' ');
  const openTag = attributes ? `<${node.tagName} ${attributes}>` : `<${node.tagName}>`;
  if (voidTags.has(node.tagName)) {
    return openTag;
  }
  const children = node.children
    .map((child) => (child.kind === 'text' ? escapeHtmlText(child.text) : outerHtml(child)))
    .join('');
  return `${openTag}${children}</${node.tagName}>`;
}

function attributesFor(node: HtmlElementNode): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.attributes).slice(0, 24)) {
    if (name.startsWith('on') || name === 'style' || name.startsWith('data-docsync-')) {
      continue;
    }
    attributes[name] = limit(value, 160);
  }

  const stableId = node.attributes['data-docsync-id'];
  if (stableId) {
    attributes['data-docsync-id'] = stableId;
  }

  return attributes;
}

function classListFor(node: HtmlElementNode): string[] {
  return (node.attributes.class ?? '').split(/\s+/u).filter(Boolean).slice(0, 16);
}

function selectorFor(node: HtmlElementNode): string {
  const stableId = node.attributes['data-docsync-id'];
  if (stableId) {
    return attributeSelector('data-docsync-id', stableId);
  }

  const elementId = node.attributes.id;
  if (elementId) {
    return `#${cssEscape(elementId)}`;
  }

  const parts: string[] = [];
  let current: HtmlElementNode | undefined = node;
  while (current && current.parent && current.parent.tagName !== '#document') {
    if (current.tagName === 'html') {
      break;
    }
    const parentNode: HtmlElementNode = current.parent;
    const currentTagName = current.tagName;
    const siblings = elementChildren(parentNode).filter(
      (sibling) => sibling.tagName === currentTagName
    );
    const suffix =
      siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
    parts.unshift(`${current.tagName}${suffix}`);
    current = parentNode;
  }

  return parts.join(' > ');
}

function indexPathFor(node: HtmlElementNode): number[] {
  const path: number[] = [];
  let current: HtmlElementNode | undefined = node;
  while (current?.parent && current.parent.tagName !== '#document') {
    const siblings = elementChildren(current.parent);
    path.unshift(siblings.indexOf(current));
    current = current.parent;
  }
  return path;
}

function elementChildren(node: HtmlElementNode): HtmlElementNode[] {
  return node.children.filter((child): child is HtmlElementNode => child.kind === 'element');
}

function selectorMatchesCandidate(selector: string, candidate: AnchorCandidate): boolean {
  const normalizedSelector = normalizeSelector(selector);
  if (normalizedSelector.length === 0) {
    return false;
  }

  return (
    normalizedSelector === normalizeSelector(candidate.anchor.selector) ||
    selectorPathMatches(candidate.node, normalizedSelector)
  );
}

function selectorPathMatches(node: HtmlElementNode, selector: string): boolean {
  const parts = selector
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return false;
  }

  let current: HtmlElementNode | undefined = node;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (!current || !selectorPartMatches(current, parts[index] ?? '')) {
      return false;
    }
    current = current.parent;
    if (current?.tagName === '#document') {
      current = undefined;
    }
  }

  return true;
}

function selectorPartMatches(node: HtmlElementNode, selectorPart: string): boolean {
  let remaining = selectorPart.trim();

  const attributeMatches = [...remaining.matchAll(/\[([^=\]]+)=(?:"([^"]*)"|'([^']*)'|([^\]]+))\]/gu)];
  for (const match of attributeMatches) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (!name || node.attributes[name] !== unescapeSelectorValue(value)) {
      return false;
    }
  }
  remaining = remaining.replace(/\[[^\]]+\]/gu, '');

  const nthMatch = remaining.match(/:nth-of-type\((\d+)\)/u);
  if (nthMatch?.[1]) {
    if (nthOfType(node) !== Number.parseInt(nthMatch[1], 10)) {
      return false;
    }
    remaining = remaining.replace(/:nth-of-type\(\d+\)/u, '');
  }

  const idMatch = remaining.match(/#([a-zA-Z0-9_-]+)/u);
  if (idMatch?.[1] && node.attributes.id !== idMatch[1]) {
    return false;
  }
  remaining = remaining.replace(/#[a-zA-Z0-9_-]+/u, '');

  const classMatches = [...remaining.matchAll(/\.([a-zA-Z0-9_-]+)/gu)];
  const nodeClasses = new Set(classListFor(node));
  for (const classMatch of classMatches) {
    if (classMatch[1] && !nodeClasses.has(classMatch[1])) {
      return false;
    }
  }
  remaining = remaining.replace(/\.[a-zA-Z0-9_-]+/gu, '').trim();

  return remaining.length === 0 || remaining === '*' || remaining.toLowerCase() === node.tagName;
}

function nthOfType(node: HtmlElementNode): number {
  if (!node.parent) {
    return 1;
  }
  return (
    elementChildren(node.parent).filter(
      (sibling) => sibling.tagName === node.tagName && sibling.order <= node.order
    ).length || 1
  );
}

function exactQuoteMatches(anchor: CompositeAnchor, candidate: AnchorCandidate): boolean {
  const exact = anchor.textQuote?.exact;
  if (!exact) {
    return false;
  }
  const normalizedExact = normalizeForCompare(exact);
  const normalizedCandidate = normalizeForCompare(candidate.text);
  return (
    normalizedCandidate.length > 0 &&
    (normalizedCandidate === normalizedExact || normalizedCandidate.includes(normalizedExact))
  );
}

function quoteContextMatches(anchor: CompositeAnchor, candidate: AnchorCandidate): boolean {
  const prefix = anchor.textQuote?.prefix;
  const suffix = anchor.textQuote?.suffix;
  if (!prefix && !suffix) {
    return false;
  }

  const haystack = normalizeForCompare(`${candidate.parentText} ${candidate.text}`);
  const prefixMatches = prefix ? haystack.includes(normalizeForCompare(prefix)) : true;
  const suffixMatches = suffix ? haystack.includes(normalizeForCompare(suffix)) : true;
  return prefixMatches && suffixMatches;
}

function headingPathMatches(left: string[], right: string[]): boolean {
  return (
    left.length > 0 &&
    left.length === right.length &&
    left.every((item, index) => normalizeForCompare(item) === normalizeForCompare(right[index] ?? ''))
  );
}

function headingPathConflicts(left: string[], right: string[]): boolean {
  return left.length > 0 && right.length > 0 && !headingPathMatches(left, right);
}

function attributeSimilarity(
  leftAttributes: Record<string, string>,
  rightAttributes: Record<string, string>
): number {
  const left = attributeTokens(leftAttributes);
  const right = attributeTokens(rightAttributes);
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / new Set([...left, ...right]).size;
}

function attributeTokens(attributes: Record<string, string>): Set<string> {
  return new Set(
    Object.entries(attributes)
      .filter(([name]) => name !== 'style')
      .map(([name, value]) => `${name}=${normalizeForCompare(value)}`)
  );
}

function positionProximity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const length = Math.max(left.length, right.length);
  let distance = Math.abs(left.length - right.length) * 2;
  for (let index = 0; index < length; index += 1) {
    distance += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }

  return clampScore(1 - distance / (length * 4));
}

function stableIdFor(anchor: CompositeAnchor): string | undefined {
  return anchor.stableId ?? anchor.element.attributes['data-docsync-id'] ?? anchor.element.id;
}

function stableIdReason(anchor: CompositeAnchor): string {
  if (anchor.stableId || anchor.element.attributes['data-docsync-id']) {
    return 'matched data-docsync-id';
  }
  return 'matched element id';
}

function interactiveRole(anchor: CompositeAnchor): string {
  return anchor.element.attributes.role ?? interactiveTagRole(normalizeTag(anchor.element.tagName));
}

function interactiveTagRole(tagName: string): string {
  if (tagName === 'button') {
    return 'button';
  }
  if (tagName === 'a') {
    return 'link';
  }
  if (['input', 'select', 'textarea'].includes(tagName)) {
    return 'form-control';
  }
  return '';
}

function statusForConfidence(confidence: number): AnchorStatus {
  if (confidence >= 0.8) {
    return 'attached';
  }
  if (confidence >= 0.55) {
    return 'needs_review';
  }
  return 'orphaned';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function normalizeForCompare(value: string): string {
  return normalizeText(value).toLowerCase();
}

function normalizeTag(value: string): string {
  return value.toLowerCase();
}

function normalizeSelector(value: string): string {
  return value.replace(/\s*>\s*/gu, ' > ').replace(/\s+/gu, ' ').trim();
}

function limit(value: string, maxLength: number): string {
  const text = normalizeText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundConfidence(value: number): number {
  return Number.parseFloat(value.toFixed(3));
}

function dedupeReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter(Boolean))];
}

function isHeadingTag(tagName: string): boolean {
  return /^h[1-6]$/u.test(tagName);
}

function headingLevel(tagName: string): number {
  return Number.parseInt(tagName.slice(1), 10);
}

function attributeSelector(name: string, value: string): string {
  return `[${name}="${value.replace(/"/gu, '\\"')}"]`;
}

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, '\\$&');
}

function unescapeSelectorValue(value: string): string {
  return value.replace(/\\"/gu, '"').trim();
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function hashValue(value: string): string {
  let hash = 2_166_136_261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
