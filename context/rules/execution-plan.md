# Execution Plan

## Purpose

このファイルは、`context/task/` の個別タスクを並行実行可能な計画として読むための依存順と統合マイルストーンを記録する。

## Milestones

1. Scaffold and fixture
   - Complete `01-scaffold-monorepo.md`.
   - Create the first minimal `examples/spec.html` here, not during demo polish.
2. Shared contracts
   - Complete `01b-define-core-contracts.md`.
   - All lanes implement against `packages/core` contracts or mock data shaped exactly like those contracts.
3. Walking skeleton
   - Complete `02b-walking-skeleton-e2e.md`.
   - Prove: push one HTML file -> iframe renders -> one hard-coded comment round-trips -> context file includes that comment.
4. Feature completion
   - Complete API storage, CLI commands, Web review UI, iframe security, and Anchor Rebase.
5. Demo readiness
   - Complete `07-demo-readiness.md` only after the walking skeleton works.

## Critical Contracts

- Public review route: `/r/:reviewToken`.
- Browser-visible API routes use `reviewToken`; server resolves hash to internal `reviewId`.
- Internal storage joins comments, revisions, and reviews by `reviewId`.
- Comment status remains two-axis:
  - `workflowStatus`: `open` for MVP; `resolved` and `reopened` are Cuttable.
  - `anchorStatus`: `attached`, `needs_review`, `orphaned`.

## Parallel Work

- Lane A starts API storage after contracts.
- Lane B starts CLI against mocked API responses after contracts.
- Lane C starts Web UI against mocked API responses after contracts.
- Anchor Rebase should be assigned separately from scaffold/API if Lane A becomes the critical path.

## Framework Decision

- Task 01 intentionally uses Node stdlib placeholders so the scaffold works without app framework decisions.
- Task 02 must install and introduce Hono before API feature work.
- Task 04 must install and introduce React + Vite before Web feature work.
- Do not silently keep stdlib placeholders past those tasks unless the task file is explicitly changed.

## Cut Rules

- Do not cut: sandboxed iframe, push, pull, context generation, attach/orphan rebase demo.
- Cut first: SSE, resolve/reopen UI, reviewer name, diff hunk links, public deployment.
- `needs_review` is useful but cuttable if attach/orphan are stable.
