# Scaffold Monorepo

## Owner Lane

Shared

## Estimate

S

## Dependencies

None

## Priority

Must

## Goal

Docksync MVP の実装土台として、TypeScript monorepo、最小 dev scripts、共有フィクスチャを作る。

## Context

参照: `.docs/architecture.md`, `.docs/mvp-plan.md`, `AGENTS.md`

このタスクは全レーンの前提になる。最速で完了させ、Lane A に固定しない。

## Checklist

- [x] package manager と root scripts を決める。
- [x] `apps/api`, `apps/web`, `packages/cli`, `packages/core` を作成する。
- [x] TypeScript 設定を共有できる形にする。
- [x] `docsync --help` の最小 CLI entry を用意する。
- [x] API と web が localhost で起動できるようにする。
- [x] test runner を追加する。
- [x] 最小共有フィクスチャ `examples/spec.html` を作成する。

## Acceptance

- `npm run dev` で API/Web のローカル起動方針が明確になっている。
- `npm test` で最小テストが実行できる。
- `docsync --help` が英語で usage を表示する。
- `examples/spec.html` が Web、CLI、Anchor Rebase の共通検証に使える。

## Notes

実装メモ:

- Package manager は npm workspaces。
- 外部依存なしで動く最小 scaffold にした。
- API dev server: `npm run dev:api`
- Web dev server: `npm run dev:web`
- Both dev servers: `npm run dev`
- CLI help: `./docsync --help` または `npm run docsync -- --help`
- Test: `npm test`

完了確認:

- `npm test`: pass, 3 tests.
- `npm run build`: pass, `tsc -b` + scaffold check passed.
- `npm run lint`: pass, currently aliases build/type-check.
- `./docsync --help`: English usage shown.
- `node -e "import('@docsync/core')"`: package exports import succeeded after build.
- `npm run dev`: API/Web both started with elevated localhost permission in this sandbox.
- `curl http://127.0.0.1:8787/health`: returned `{ "service": "docsync-api", "status": "ok" }`.
- `curl http://127.0.0.1:5173/`: returned the Docksync Review scaffold HTML.

補正:

- `build` を存在確認ではなく実際の TypeScript project build に変更した。
- `@docsync/core` は raw `.ts` export ではなく built `dist/` export に変更した。
- `.gitignore` を追加し、`node_modules/`, `dist/`, `.docsync/` などを ignore する。
- Hono 導入は task 02、React + Vite 導入は task 04 の責務として明記した。

死守: monorepo scaffold と共有 fixture。Cut可: 見た目の整った example HTML。実装後、追加した正式コマンドを `AGENTS.md` または `.docs/mvp-plan.md` に反映する。
