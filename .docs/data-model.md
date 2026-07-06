# Data Model

## Overview

Docksync needs to track projects, artifact revisions, comments, anchors, and sync runs. MVP can store this in SQLite or JSON. The shape below is storage-neutral.

## Project

```ts
type Project = {
  id: string
  name: string
  localRootHint?: string
  createdAt: string
  updatedAt: string
}
```

## Review

```ts
type Review = {
  id: string
  projectId: string
  tokenHash: string
  title: string
  createdAt: string
  updatedAt: string
}
```

The browser sees only the raw `reviewToken` in the URL. The server stores `tokenHash`.

## Revision

```ts
type Revision = {
  id: string
  projectId: string
  reviewId: string
  artifactName: string
  contentHash: string
  artifactStorageKey: string
  parentRevisionId?: string
  createdAt: string
}
```

`contentHash` should be computed over normalized bytes of the uploaded HTML. Do not use filename or timestamp as revision identity.

## Comment

```ts
type Comment = {
  id: string
  reviewId: string
  projectId: string
  revisionId: string
  body: string
  authorName?: string
  workflowStatus: 'open' | 'resolved'
  anchorStatus: 'attached' | 'needs_review' | 'orphaned'
  anchor: CompositeAnchor
  rebaseHistory: RebaseResult[]
  createdAt: string
  updatedAt: string
}
```

## CompositeAnchor

```ts
type CompositeAnchor = {
  stableId?: string
  selector: string
  textQuote?: {
    exact: string
    prefix?: string
    suffix?: string
  }
  headingPath: string[]
  element: {
    tagName: string
    id?: string
    classList: string[]
    attributes: Record<string, string>
    indexPath: number[]
  }
  fingerprint: {
    textHash?: string
    attributesHash: string
    subtreeHash?: string
  }
}
```

## RebaseResult

```ts
type RebaseResult = {
  fromRevisionId: string
  toRevisionId: string
  status: 'attached' | 'needs_review' | 'orphaned'
  confidence: number
  matchedSelector?: string
  reasons: string[]
  createdAt: string
}
```

## SyncRun

```ts
type SyncRun = {
  id: string
  projectId: string
  type: 'push' | 'pull' | 'context'
  status: 'running' | 'succeeded' | 'failed'
  startedAt: string
  finishedAt?: string
  message?: string
}
```

## Local `.docsync/config.json`

```json
{
  "projectId": "proj_123",
  "reviewId": "revw_123",
  "serverUrl": "http://localhost:8787",
  "reviewToken": "raw-token-visible-only-locally",
  "defaultArtifact": "spec.html",
  "lastPulledAt": null
}
```

## Local `.docsync/comments.json`

```json
{
  "projectId": "proj_123",
  "reviewId": "revw_123",
  "syncedAt": "2026-06-27T00:00:00.000Z",
  "comments": [
    {
      "id": "cmt_123",
      "body": "This section needs a clearer CTA.",
      "workflowStatus": "open",
      "anchorStatus": "attached",
      "revisionId": "rev_1",
      "anchor": {
        "selector": "main > section:nth-of-type(2) > h2",
        "textQuote": {
          "exact": "Launch plan"
        },
        "headingPath": ["Docksync", "Launch plan"],
        "element": {
          "tagName": "h2",
          "classList": [],
          "attributes": {},
          "indexPath": [0, 1, 0]
        },
        "fingerprint": {
          "textHash": "sha256:...",
          "attributesHash": "sha256:..."
        }
      }
    }
  ]
}
```

## Local `.docsync/context.md`

```md
# Docksync Review Context

## Open Comments

### cmt_123: attached

- Target: `main > section:nth-of-type(2) > h2`
- Quote: "Launch plan"
- Comment: This section needs a clearer CTA.
- Instruction: Update the referenced HTML section while preserving unrelated content.
```

## SQLite Tables

If using SQLite, use these tables:

- `projects`
- `reviews`
- `revisions`
- `comments`
- `rebase_results`
- `sync_runs`

Store complex anchor payloads as JSON text in `comments.anchor_json` and `rebase_results.reasons_json` for MVP. Normalize later only if query needs appear.

## Idempotency Rules

- `pull` merges by `comment.id`
- If local and remote both have the same `comment.id`, latest `updatedAt` wins
- Pull never deletes local comments unless server marks them deleted
- Context generation is deterministic from `comments.json`
- Push creates a new revision only when `contentHash` changed
