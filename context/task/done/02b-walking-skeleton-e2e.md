# Walking Skeleton E2E

## Owner Lane

Shared

## Estimate

S

## Dependencies

`01b-define-core-contracts.md`, partial `02-api-artifact-storage.md`, partial `03-cli-push-pull-context.md`, partial `04-web-review-ui.md`

## Priority

Must

## Goal

機能を作り込みすぎる前に、最小 E2E loop を貫通させて統合リスクを早期に潰す。

## Context

参照: `.docs/mvp-plan.md`, `context/rules/execution-plan.md`

このタスクは完成機能ではなく統合マイルストーン。API、CLI、Web は mock や hard-coded comment を使ってよい。

## Checklist

- [x] `examples/spec.html` を `docsync push` 相当で API に登録する。
- [x] `/r/:reviewToken` で iframe に HTML を表示する。
- [x] hard-coded でもよいので 1 comment を API に保存する。
- [x] `docsync pull` 相当で local comments JSON に取り込む。
- [x] `context.md` にその comment を出力する。

## Acceptance

- 1つの HTML が push され、review URL で表示される。
- 1 comment が API -> local JSON -> context markdown まで移動する。
- `context.md` の comment entry は selector、text quote、heading path、comment body、suggested instruction を含む。
- UI/CLI に見える文言は英語。

## Notes

死守: 最小E2E貫通。Cut可: DOM selection、real rebase、resolve/reopen、見た目の polish。

## Completion Notes

- Added `tests/walking-skeleton-e2e.test.mjs` to prove the integration path:
  `docsync push` -> `/r/:reviewToken` review shell -> API comment create -> `docsync pull` -> `docsync context --open-comments`.
- The generated `context.md` includes selector, text quote, heading path, comment body, and suggested instruction.
- Verified with `npm test`, `npm run build`, `npm run lint`, and a manual local API + CLI E2E using `examples/spec.html`.
