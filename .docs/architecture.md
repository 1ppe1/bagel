# Architecture

## Design Principles

- HTML-first: MVP の artifact は single HTML file に限定する
- CLI-first: local filesystem への副作用は CLI に集約する
- Browser as review surface: browser はレビューと状態表示に限定する
- Deterministic rebase: Anchor Rebase は同じ入力なら同じ結果を返す
- Prefer orphan over wrong attachment: 不確実なコメントは誤接続しない

## Proposed Monorepo

```text
.
├── apps/
│   ├── api/          # Hono API server
│   └── web/          # React + Vite review app
├── packages/
│   ├── cli/          # docsync command
│   └── core/         # shared domain, contracts, hashing, anchor rebase
├── .docs/            # research and design docs
└── package.json
```

## Runtime Components

### CLI

Owns:

- local config
- local artifact read
- push / pull / context commands
- `.docsync/comments.json`
- `.docsync/context.md`
- local failure safety

Does not own:

- browser comments UI
- server persistence
- reviewer identity beyond local token/user name

### API

Owns:

- project registry
- artifact revisions
- review URLs
- comments
- sync runs
- anchor rebase on new revision
- event stream or polling endpoints

### Web

Owns:

- review page
- sandboxed iframe shell
- DOM target selection UI
- comment editor and list
- revision and comment status display

### Core

Owns:

- domain types
- content hash
- anchor extraction schema
- anchor scoring and rebase
- context Markdown rendering
- API contract schemas

## Data Flow

### Init

```text
docsync init
-> create .docsync/config.json
-> optional create local project via API
```

### Push v1

```text
docsync push spec.html
-> read HTML
-> run pre-push checks
-> compute content hash
-> POST /api/projects/:projectId/revisions
-> API stores artifact and revision
-> API returns review URL
```

### Review

```text
Reviewer opens review URL
-> web loads revision metadata
-> web renders artifact iframe
-> injected bridge captures DOM selection
-> web creates comment with anchor payload
-> API stores comment
```

### Pull

```text
docsync pull
-> GET /api/projects/:projectId/comments?since=...
-> merge by comment id
-> write .docsync/comments.json atomically
```

### Context

```text
docsync context --open-comments
-> read .docsync/comments.json
-> select open / needs_review / orphaned comments
-> render .docsync/context.md
```

### Push v2

```text
docsync push spec.html
-> compute new revision hash
-> POST new revision
-> API runs Anchor Rebase for open comments
-> statuses become attached / needs_review / orphaned
```

## API Sketch

```text
POST   /api/projects
GET    /api/projects/:projectId
POST   /api/projects/:projectId/revisions
GET    /api/projects/:projectId/revisions
GET    /api/reviews/:reviewToken
GET    /api/reviews/:reviewToken/revisions/:revisionId/artifact
GET    /api/reviews/:reviewToken/comments
POST   /api/reviews/:reviewToken/comments
PATCH  /api/reviews/:reviewToken/comments/:commentId
GET    /api/projects/:projectId/sync
GET    /api/projects/:projectId/events
```

Browser-visible review APIs use the raw `reviewToken`. The server hashes that token, resolves it to the internal `reviewId`, and stores comments, revisions, and reviews by `reviewId`. Do not expose `reviewId` as the public URL key in the MVP.

## CLI Commands

```text
docsync init [--server http://localhost:8787]
docsync push <file.html>
docsync pull
docsync context --open-comments
docsync preview <file.html>       # should-have
docsync status                    # should-have
```

## Review URL Model

MVP:

```text
http://localhost:8787/r/:reviewToken
```

`reviewToken` は unguessable random token とし、DB 上では hash して保存します。
Browser と CLI が扱う URL key は raw `reviewToken` です。Server internal storage は token hash から解決した `reviewId` に紐付けます。

Public deployment をする場合:

```text
https://<deployment-host>/r/:reviewToken
```

ただし public deployment は MVP の必須条件ではありません。

## Artifact Handling

MVP は single HTML file のみ受け付けます。

Allowed:

- `.html`
- inline CSS
- data URL image if size limit within threshold
- external image URL if CSP policy permits

Rejected or warned:

- `<script>` in user artifact
- inline event handlers such as `onclick`
- forms
- iframes
- object/embed
- huge files over configured max size

## Comment Lifecycle

```text
open
-> resolved
-> reopened

open
-> needs_review
-> attached

open
-> orphaned
-> manually reattached
```

Status fields:

- `workflowStatus`: `open`, `resolved`
- `anchorStatus`: `attached`, `needs_review`, `orphaned`

Keeping these separate avoids mixing human resolution with algorithm confidence.

## Deployment Strategy

Phase 1:

- single localhost Hono server serves API and static web build
- storage local SQLite or JSON

Phase 2:

- public server
- durable storage
- review tokens
- optional user auth

Phase 3:

- team workflows
- GitHub integration
- MCP server

## Key Tradeoffs

### Rebase during push vs async

For MVP, run rebase synchronously during push. It keeps demo behavior obvious and avoids job infrastructure.

### SQLite vs JSON

Use SQLite if the scaffold is ready. Use JSON if time pressure threatens the demo loop.

### SSE vs polling

Use polling by default. Add SSE only after core push/comment/pull/context loop is stable.
