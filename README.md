# Docksync

Docksync is a localhost-first review loop for HTML artifacts. It lets a reviewer
open a local HTML preview in the browser, attach comments to DOM elements, pull
those comments into local agent context, and keep comments attached across later
HTML revisions with Anchor Rebase.

The MVP proves this loop:

```text
push -> browser comment -> pull -> context -> edit -> push v2 -> rebase
```

## Demo

<video src="docs/assets/demoview.mov" controls width="100%"></video>

If the embedded player is unavailable, open the demo video directly:
[docs/assets/demoview.mov](docs/assets/demoview.mov).

## Hosted Preview (add-on)

The live demo runs localhost-first (see Quickstart). As an add-on, the same API
and review UI are also reachable through a public URL, so a reviewer on another
machine or network can open the review without a local checkout:

```text
https://bagel.ippei-matsuda.workers.dev/r/bJ3lEcTrOHXKv8qg1ll1umdhKmmpgs7a
```

Health check: `https://bagel.ippei-matsuda.workers.dev/health`.

The hosted path is a stable `workers.dev` Worker that proxies to the running
local server, so the public URL stays constant even if the underlying tunnel is
re-issued. The localhost loop below remains the primary, canonical demo.

## Repository Layout

- `apps/api/` - Hono API server, artifact storage, review routes, and iframe bridge delivery.
- `apps/web/` - React + Vite review UI.
- `packages/cli/` - `docsync` CLI for push, pull, and context generation.
- `packages/core/` - shared contracts, anchor extraction, and Anchor Rebase logic.
- `examples/` - demo HTML fixtures, including a manual unsafe HTML sample.
- `docs/` - demo quickstart and operator script.
- `.docs/` - product, architecture, data model, security, and implementation notes.
- `context/` - task tracking and execution directives.

## Requirements

- Node.js 22 or newer
- npm
- A browser that can open `http://127.0.0.1:8787`

## Quickstart

Install dependencies and start the localhost API plus review UI:

```sh
npm install
npm run dev
```

In another terminal, publish the shared demo artifact:

```sh
./docsync push examples/spec.html --server http://127.0.0.1:8787
```

Open the printed review URL. Add a browser comment, then pull it back into local
files:

```sh
./docsync pull
./docsync context --open-comments
```

Open `.docsync/context.md` to see the generated agent context.

For the full demo checklist, see:

- [docs/demo-quickstart.md](docs/demo-quickstart.md)
- [docs/demo-script.md](docs/demo-script.md)

## CLI

```sh
./docsync --help
./docsync init --server http://127.0.0.1:8787
./docsync push examples/spec.html --server http://127.0.0.1:8787
./docsync pull
./docsync context --open-comments
```

Local state is written under `.docsync/`:

- `.docsync/config.json`
- `.docsync/comments.json`
- `.docsync/context.md`
- `.docsync/api-storage.json`

## Development

Use npm workspaces from the repository root.

```sh
npm run dev
npm run dev:api
npm run dev:web
npm run build
npm test
npm run lint
```

`npm run lint` currently aliases the build/type-check gate.

## Security Model

Docksync does not render arbitrary artifact HTML directly in React. The review UI
uses a sandboxed iframe, route-specific CSP, a static bridge script, and CLI
pre-push checks for obviously unsafe HTML.

Run the manual security smoke check with:

```sh
./docsync push examples/unsafe-script.html --server http://127.0.0.1:8787
```

Expected result:

```text
Security check failed: Artifact contains a <script> tag.
```

See [.docs/security.md](.docs/security.md) for design notes.

## Current Scope

The MVP targets a reliable localhost demo, which remains the primary path. A
public hosted preview is available as a lightweight add-on (see Hosted Preview).
Production-grade hosting, SSE, reviewer identity, and resolve/reopen UI remain
outside the current cut line.
