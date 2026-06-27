# CLI Push Pull Context

## Owner Lane

Lane B - CLI + Local Files

## Estimate

M

## Dependencies

`01b-define-core-contracts.md`; API は mock response で先行可。integration は `02-api-artifact-storage.md` に依存。

## Priority

Must

## Goal

`docsync init`, `docsync push`, `docsync pull`, `docsync context --open-comments` を実装し、ローカルファイルと API を接続する。

## Context

参照: `.docs/product-requirements.md`, `.docs/architecture.md`, `.docs/data-model.md`

ブラウザは local file を変更しない。local side effects は CLI が所有する。

## Checklist

- [x] `docsync init` で `.docsync/config.json` を作成する。
- [x] `.docsync/config.json` に `projectId`, raw `reviewToken`, `serverUrl`, `defaultArtifact` を保存する。
- [x] `docsync push <file.html>` で content hash を計算し、API に revision を登録する。
- [x] push 成功時に英語で review URL を表示する。
- [x] `docsync pull` で comments を取得し、id による upsert で `.docsync/comments.json` に atomic write する。
- [x] `docsync context --open-comments` で `.docsync/context.md` を生成する。
- [x] failed operation が既存 local files を壊さないようにする。

## Acceptance

- `docsync init` 後に `.docsync/config.json` が存在する。
- `docsync push examples/spec.html` が review URL を返す。
- `docsync pull` は同じデータを複数回実行しても重複コメントを作らず、既存 comment の `anchorStatus`, `workflowStatus`, `anchor` 更新を反映する。
- generated context は各 comment に selector、text quote、heading path、comment body、suggested instruction を含む。

## Notes

死守: init/push/pull/context、upsert merge、atomic write。Cut可: rich formatting、diff hunk links。CLI output は demo で見えるため英語にする。

## Completion Notes

- CLI entry now runs through `packages/cli/src/index.ts` and the bin wrapper in `packages/cli/bin/docsync.mjs`.
- `init` seeds remote project state and writes `.docsync/config.json` atomically.
- `push` rejects unsafe HTML, computes SHA-256 content hash, reuses `lastContentHash` to skip duplicate publishes, and prints the review URL in English.
- `pull` upserts comments by `id`, preserves newer local entries when `updatedAt` is newer, and updates `lastPulledAt`.
- `context --open-comments` renders English Markdown for unresolved comments only.
- Verified with `npm test`, `npm run build`, `npm run lint`, and a manual end-to-end flow against the local API server.
