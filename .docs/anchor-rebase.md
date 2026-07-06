# Anchor Rebase Design

## Goal

When a user comments on a DOM element in revision v1, and the HTML changes in v2, Docksync should reconnect that comment to the correct element if confidence is high. If confidence is weak, it should mark the comment as `needs_review` or `orphaned`.

Core principle:

> Better to orphan a comment than attach it to the wrong place.

## Inputs

- Previous revision HTML
- New revision HTML
- Comment's `CompositeAnchor` captured in previous revision

## Output

```ts
type AnchorRebaseOutput = {
  status: 'attached' | 'needs_review' | 'orphaned'
  confidence: number
  matchedSelector?: string
  reasons: string[]
}
```

## Candidate Generation

Generate candidates in this order:

1. Exact stable id
   - `data-docsync-id`
   - `id`
2. Exact selector match
3. Exact text quote match
4. Prefix/suffix contextual text match
5. Same heading path
6. Same tag + similar attributes
7. Nearby DOM index path

Do not stop at selector-only match unless the element also satisfies at least one corroborating signal.

## Scoring

Use deterministic weighted scoring:

```text
stableId exact match             +0.45
selector exact match             +0.20
exact text quote match           +0.25
prefix/suffix context match      +0.15
heading path match               +0.15
tag name match                   +0.05
attribute fingerprint similarity +0.10
DOM position proximity           +0.05
```

Clamp final score to `0.0 - 1.0`.

Penalties:

```text
multiple equal top candidates     -0.20
text quote missing in candidate   -0.15
heading path conflict             -0.15
tag mismatch                      -0.10
interactive role mismatch         -0.10
```

## Thresholds

- `>= 0.80`: `attached`
- `0.55 - 0.79`: `needs_review`
- `< 0.55`: `orphaned`

## Required Reasons

Every rebase result must include human-readable reasons. Examples:

- `matched data-docsync-id`
- `matched exact text quote`
- `selector changed but heading path and quote matched`
- `multiple candidates had equal score`
- `no candidate exceeded orphan threshold`

## Selector Strategy

Capture selectors for explainability, not as the only source of truth.

Preferred selector components:

- `data-docsync-id`
- element id
- semantic tag path
- nth-of-type fallback

Avoid brittle selectors:

- generated class names
- long full DOM paths when a shorter stable selector exists
- style-only attributes

## Text Quote Strategy

For text-bearing elements:

```ts
{
  exact: selectedTextOrElementText,
  prefix: precedingTextWindow,
  suffix: followingTextWindow
}
```

Use normalized text:

- collapse whitespace
- trim
- preserve case for display
- compare with lowercased normalized copy

## Heading Path Strategy

Heading path is the sequence of nearest preceding headings:

```text
h1: "Docksync"
h2: "MVP Workflow"
h3: "Pull"
```

This helps comments survive layout changes where selector path changes but section semantics remain.

## DOM Bridge Capture Payload

The iframe bridge should send:

```ts
type ElementSelectedMessage = {
  type: 'docsync:element-selected'
  revisionId: string
  anchor: CompositeAnchor
  preview: {
    text: string
    boundingClientRect: {
      x: number
      y: number
      width: number
      height: number
    }
  }
}
```

The parent window must validate:

- expected `type`
- expected `revisionId`
- origin
- JSON shape
- max text sizes

## Rebase Timing

For MVP, run Anchor Rebase synchronously during `docsync push` after storing the new revision. This gives immediate demo feedback.

Later, move it to a background job if revisions become large.

## Test Matrix

### Should Attach

- Same element, same text, selector unchanged
- Same `data-docsync-id`, text edited slightly
- Section moved, heading path and exact quote unchanged
- Classes changed, tag and quote unchanged

### Should Need Review

- Same heading, similar but not exact text
- Multiple similar repeated elements under same heading
- Selector points somewhere else but text context partly matches

### Should Orphan

- Target text removed
- Target section deleted
- Multiple candidates are equally plausible
- Only nth-of-type selector matches after large DOM rewrite

## Implementation Notes

- Keep algorithm pure and dependency-light in `packages/core`
- Parse HTML into a DOM-like tree in Node for server-side rebase
- Keep browser capture and server rebase using the same anchor schema
- Snapshot test all scoring examples
- Log confidence and reasons for demo visibility
