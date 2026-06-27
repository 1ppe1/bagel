# Anchor Rebase

## Owner Lane

Lane A - API + Core, or separate Rebase Assignee if Lane A is overloaded

## Estimate

L

## Dependencies

`01b-define-core-contracts.md`; integration depends on `02-api-artifact-storage.md`

## Priority

Must

## Goal

v1 の DOM コメントを v2 の HTML に再接続する Anchor Rebase を実装する。

## Context

参照: `.docs/anchor-rebase.md`, `.docs/data-model.md`, `.docs/mvp-plan.md`

原則は「誤接続より orphan」。同じ入力には同じ結果を返す deterministic algorithm にする。

## Checklist

- [x] `CompositeAnchor` schema が `packages/core` の契約と一致していることを確認する。
- [x] candidate generation を実装する。
- [x] exact id、selector、text quote、heading path、tag、attributes、DOM position の scoring を実装する。
- [x] threshold により `anchorStatus: attached | needs_review | orphaned` を返す。
- [x] rebase は `workflowStatus` を変更せず、`anchorStatus` と anchor/rebase reasons だけを更新する。
- [x] rebase reasons を保存・表示できる形で返す。
- [x] push v2 時に open comments を rebase する。

## Acceptance

- safe edit 後の v2 push で comment が `attached` になる。
- target section 削除後の v2 push で comment が `orphaned` になる。
- ambiguous match は `needs_review` または `orphaned` になり、誤接続しない。
- `workflowStatus` は `open` のまま維持され、rebase で `resolved` にならない。

## Notes

死守: attach と orphan の demo。Cut可: `needs_review` path の完全実装、詳細 reason UI。Unit tests は attach / needs_review / orphaned の3系統を必須にする。

2026-06-27:

- `packages/core` に `extractCompositeAnchors(html)` と `rebaseAnchor(anchor, html)` を追加。Node/browser bridge と同じ FNV-1a fingerprint 形式、`data-docsync-id` 優先 selector、heading path、DOM index path を使う。
- 同点 top candidates は confidence を下げて `attached` にならないよう cap する。原則「誤接続より orphan」を守るため、`orphaned` の場合は既存 anchor を保持する。
- API storage の revision 作成時に同一 review の `workflowStatus: open` comments を同期 rebase する。変更するのは `revisionId`, `anchorStatus`, `anchor`, `rebaseHistory`, `updatedAt` のみで、`workflowStatus` は維持する。
- 検証: `npm test` 通過。31 tests / 6 suites / 0 failed。
