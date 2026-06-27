# Define Core Contracts

## Owner Lane

Shared

## Estimate

S

## Dependencies

`01-scaffold-monorepo.md`

## Priority

Must

## Goal

各レーンが API 実装完了を待たずに並行実装できるよう、`packages/core` に MVP の共有型と mock contract を先出しする。

## Context

参照: `.docs/data-model.md`, `.docs/architecture.md`, `.docs/anchor-rebase.md`, `context/rules/execution-plan.md`

このタスクは Lane A/B/C の統合衝突を防ぐための unblocker。実装ロジックではなく、型・schema・mock response を確定する。

## Checklist

- [ ] `Project`, `Review`, `Revision`, `Comment`, `CompositeAnchor`, `RebaseResult` の型を定義する。
- [ ] comment status を `workflowStatus` と `anchorStatus` の二軸で定義する。
- [ ] MVP では `workflowStatus` default `open`、resolve/reopen UI は Cuttable と明記する。
- [ ] `reviewToken` 契約を定義する: URL/API は raw token、server storage は token hash から internal `reviewId` に解決する。
- [ ] API request/response の mock JSON を用意する。
- [ ] `context.md` 生成に必要な fields を定義する。
- [ ] `@docsync/core` を package exports 経由で runtime import できることを確認する。

## Acceptance

- Lane B と Lane C が mock response だけで CLI/Web の実装を開始できる。
- `Comment` は `workflowStatus` と `anchorStatus` を混同していない。
- reviewToken と reviewId の使い分けが型コメントまたは contract docs で明確。
- `context.md` 用 comment には selector、text quote、heading path、comment body、suggested instruction を含められる。
- `node -e "import('@docsync/core')"` 相当の疎通が build 後に成功する。

## Notes

死守: core contracts、reviewToken契約、status二軸。Cut可: 厳密な runtime validation。必要なら最初は TypeScript type と fixture JSON だけでよい。
