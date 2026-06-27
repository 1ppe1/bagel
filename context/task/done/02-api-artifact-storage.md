# API Artifact Storage

## Owner Lane

Lane A - API + Core

## Estimate

M

## Dependencies

`01b-define-core-contracts.md`

## Priority

Must

## Goal

Hono API で project、revision、comment、review URL を保存・取得できる最小 API を作る。

## Context

参照: `.docs/architecture.md`, `.docs/data-model.md`, `.docs/security.md`

MVP は localhost demo 優先。storage は実装速度を優先し、JSON か SQLite のどちらかで開始してよい。Browser-visible route は `reviewToken`、server internal storage は `reviewId` を使う。

## Checklist

- [x] Hono を導入し、Node stdlib placeholder API server を Hono app に置き換える。
- [x] project 作成 API を実装する。
- [x] revision 作成 API を実装する。
- [x] artifact HTML 配信 API を実装する。
- [x] raw `reviewToken` を hash し、internal `reviewId` に解決する。
- [x] `/r/:reviewToken` と browser-visible API で `reviewToken` を受ける。
- [x] comment create/list/update API を実装する。
- [x] `workflowStatus` と `anchorStatus` を `packages/core` の型どおり保存・返却する。

## Acceptance

- `docsync push` 相当の request で revision が保存される。
- raw `reviewToken` から artifact と comments を取得でき、storage は internal `reviewId` に紐付く。
- created comment は `workflowStatus: open` と `anchorStatus: attached` か指定された初期値を持つ。
- comment body は HTML として実行されず、安全に保存・返却される。

## Notes

死守: Hono 導入、reviewToken→reviewId 解決、artifact配信、comment round-trip。Cut可: sync run/event endpoint、SSE。

## Completion Notes

- Hono app と Node server entry を分離し、tests は app を直接叩く TDD 構成にした。
- API server の default storage は `.docsync/api-storage.json` の JSON file storage。tests と軽量利用向けに in-memory storage も残す。
- raw `reviewToken` は保存せず hash 保存し、browser-visible route/API から internal `reviewId` に解決する。
- Artifact HTML は exact body で返し、dedicated CSP を付与する。comment body は保存・JSON返却のみでHTML実行しない。
- Verified: `npm test`, `npm run build`, `npm run lint`, `npm audit --omit=dev`, manual HTTP E2E against `npm run dev:api`.
