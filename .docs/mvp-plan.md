# MVP Implementation Plan

## Objective

Build the smallest Docksync implementation that proves the full review loop:

```text
local HTML -> push -> browser comment -> pull -> context.md -> Codex update -> push v2 -> anchor rebase
```

## Phase 0: Scaffold

Deliverables:

- monorepo package manager setup
- `apps/api`
- `apps/web`
- `packages/cli`
- `packages/core`
- shared TypeScript config
- basic test runner

Done when:

- API starts locally
- web app starts locally
- `docsync --help` works

## Phase 1: Local Project And Push

Deliverables:

- `docsync init`
- `.docsync/config.json`
- `docsync push <file.html>`
- content hash
- API `POST /api/projects`
- API `POST /api/projects/:projectId/revisions`
- review URL output

Done when:

- one HTML file can be pushed
- server stores a revision
- review URL is printed

## Phase 2: Sandboxed Preview

Deliverables:

- React review route `/r/:reviewToken`
- revision metadata fetch
- artifact endpoint
- sandboxed iframe preview
- route-specific CSP
- pre-push checks for obvious unsafe HTML

Done when:

- review URL renders the pushed HTML in iframe
- unsafe sample HTML is rejected or warned

## Phase 3: DOM Commenting

Deliverables:

- iframe bridge script injection
- hover/click target selection
- `postMessage` schema validation
- comment editor
- comment list
- API create/list comments

Done when:

- reviewer can click an element and save a comment
- comment appears in list with target preview

## Phase 4: Pull And Context

Deliverables:

- `docsync pull`
- `.docsync/comments.json`
- idempotent merge
- `docsync context --open-comments`
- `.docsync/context.md`

Done when:

- local JSON contains remote comments
- context Markdown gives Codex enough location and instruction detail

## Phase 5: Anchor Rebase

Deliverables:

- `CompositeAnchor` schema
- server-side HTML parse
- candidate generation
- confidence scoring
- status assignment
- rebase reasons
- tests for attach / needs_review / orphan

Done when:

- v2 push reattaches a comment after safe edit
- v2 push orphans a comment after target deletion
- demo can show confidence and reasons

## Phase 6: Demo Polish

Deliverables:

- copy review URL button
- copy `docsync pull` / `docsync context --open-comments` command
- visible anchor status badges
- empty/error states
- sample `examples/spec.html`
- README quickstart

Done when:

- demo can be run from clean checkout in under 5 minutes

## Recommended Cut Line

If time is short, cut in this order:

1. SSE
2. reviewer name
3. resolve/reopen
4. diff hunk links
5. public URL
6. SQLite, if JSON storage is already sufficient for demo

Do not cut:

- sandboxed iframe
- DOM comments
- pull
- context generation
- Anchor Rebase attach/orphan demo

## Demo Script

1. Generate or open `examples/spec.html`
2. Run `docsync init`
3. Run `docsync push examples/spec.html`
4. Open review URL
5. Click a DOM element and add comment
6. Run `docsync pull`
7. Run `docsync context --open-comments`
8. Ask Codex to apply `.docsync/context.md`
9. Run `docsync push examples/spec.html`
10. Show comment stayed attached
11. Delete target section
12. Run `docsync push examples/spec.html`
13. Show comment became `orphaned`

## Engineering Checks

- Unit tests for anchor rebase
- Unit tests for context renderer
- CLI test for idempotent pull
- API test for comment CRUD
- Manual browser test for iframe sandbox
- Manual security check with `<script>alert(1)</script>`

## Open Decisions

- Storage: SQLite vs JSON
- HTML parser package
- CLI framework
- Package manager
- Public deployment target
- Whether to add SSE in MVP

Default decisions for speed:

- JSON storage if scaffolding from zero
- SQLite if using an existing template
- polling before SSE
- localhost before public URL
