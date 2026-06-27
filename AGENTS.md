# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains planning and research documents for Docksync under `.docs/`. Treat these files as the source of truth until the implementation scaffold exists.

Expected implementation layout:

- `apps/api/` for the Hono API server.
- `apps/web/` for the React + Vite review UI.
- `packages/cli/` for the `docsync` Node.js CLI.
- `packages/core/` for shared types, hashing, context rendering, and Anchor Rebase logic.
- `.docs/` for product requirements, architecture, security notes, and implementation plans.

Keep new documentation in `.docs/` unless it is a top-level contributor or project entry point.

## Build, Test, and Development Commands

Use npm workspaces from the repository root.

- `npm run dev` starts the API and web scaffold together.
- `npm run dev:api` starts the API scaffold on `http://localhost:8787`.
- `npm run dev:web` starts the web scaffold on `http://localhost:5173`.
- `npm test` runs `npm run build` first, then the Node test suite.
- `npm run build` runs `tsc -b` and then checks scaffolded files.
- `npm run lint` currently aliases the build/type-check gate; no formatter is installed yet.
- `./docsync --help` or `npm run docsync -- --help` prints CLI usage.

Document any new command in the relevant README, `AGENTS.md`, or `.docs/mvp-plan.md`.

## Coding Style & Naming Conventions

Use TypeScript for implementation. Prefer small, explicit modules and shared domain types in `packages/core/`. Runtime package exports must point to built `dist/` files, not raw `.ts` sources. Use two-space indentation for JSON, TypeScript, and Markdown examples. Name CLI commands and local files exactly as specified in the docs, for example `docsync push`, `.docsync/comments.json`, and `.docsync/context.md`.

## Testing Guidelines

Prioritize tests for deterministic behavior and local safety. Add unit tests for Anchor Rebase scoring, context Markdown rendering, pre-push security checks, and idempotent pull merging. Use descriptive test names such as `rebase-orphans-deleted-target` or `pull-merges-existing-comments`.

## Commit & Pull Request Guidelines

This directory is not currently a Git repository, so no local commit history is available. Use concise, imperative commit messages once Git is initialized, such as `Add anchor rebase tests`. Pull requests should include a short summary, linked issue or task when available, test results, and screenshots for review UI changes.

## Security & Agent-Specific Instructions

Do not render arbitrary artifact HTML directly in React. Follow `.docs/security.md`: use sandboxed iframes, CSP, pre-push checks, and atomic writes under `.docsync/`. Browser code must not modify local files or launch Codex; local side effects belong to the CLI.
