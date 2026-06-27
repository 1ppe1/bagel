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

- [ ] `docsync init` で `.docsync/config.json` を作成する。
- [ ] `.docsync/config.json` に `projectId`, raw `reviewToken`, `serverUrl`, `defaultArtifact` を保存する。
- [ ] `docsync push <file.html>` で content hash を計算し、API に revision を登録する。
- [ ] push 成功時に英語で review URL を表示する。
- [ ] `docsync pull` で comments を取得し、id による upsert で `.docsync/comments.json` に atomic write する。
- [ ] `docsync context --open-comments` で `.docsync/context.md` を生成する。
- [ ] failed operation が既存 local files を壊さないようにする。

## Acceptance

- `docsync init` 後に `.docsync/config.json` が存在する。
- `docsync push examples/spec.html` が review URL を返す。
- `docsync pull` は同じデータを複数回実行しても重複コメントを作らず、既存 comment の `anchorStatus`, `workflowStatus`, `anchor` 更新を反映する。
- generated context は各 comment に selector、text quote、heading path、comment body、suggested instruction を含む。

## Notes

死守: init/push/pull/context、upsert merge、atomic write。Cut可: rich formatting、diff hunk links。CLI output は demo で見えるため英語にする。
