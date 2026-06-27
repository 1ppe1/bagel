# Cloud Deploy (Cloudflare)

## Owner Lane

Lane A - API + Core(deploy 担当)。07 demo-readiness は別チームが並行実行中なので干渉しない。

## Estimate

M（**half-day timebox**。超えたら Tunnel フォールバックに切り替える）

## Priority

Should（localhost 完走が主、本タスクは add-on）

## Dependencies

`02b-walking-skeleton-e2e.md`(✓ green), `05-iframe-selection-security.md`(✓ green)
→ コアループ緑 + セキュリティ完了のゲートを満たしたので解禁。

## Goal

現状の Hono API と React+Vite Web を Cloudflare に「載せるだけ載せる」。
ローカルの CLI から `--server <workers-url>` で接続し、リモートのレビューURLで
レビューできる状態を最小コストで作る。実装は storage 層の差し替えが中心。

## Context

参照: `.docs/architecture.md`(Deployment Strategy / Phase 2), `.docs/security.md`,
`context/directives/2026-06-27-parallel-work.md`

前提となる事実:
- API は **Hono(`app.fetch`)** で構築済み → Workers がネイティブに動かせる形。
- 起動部のみ Node 依存(`@hono/node-server` の `serve(...)`)。
- **storage に seam がある**: `createStorage({ idGenerator, state, persist })` で、
  状態は丸ごと `snapshotState` / `stateFromSnapshot` で JSON 化可能。Memory と
  JSON file の差は `persist` 関数だけ。→ **KV アダプタは1キーに snapshot を
  read/write するだけで成立する**。
- Web は Vite(`npm run build` → `apps/web/dist`)で静的成果物を出せる。

## Non-Goals（このタスクで広げない）

- D1/SQL への移行（KV snapshot で足りる。SQL が必要になってからで良い）。
- 認証強化（MVP は unguessable review token のまま）。
- CLI を Cloudflare に載せること（engineer 側はローカルのまま。設計通り）。
- localhost デモ経路の置き換え（localhost は主デモのまま死守）。

## Checklist

- [ ] **KV storage adapter**: `createKvStorage({ kv, idGenerator })` を `storage.mjs` に追加。
  - cold start / リクエスト時に KV の単一キー(例 `docsync:state`)から snapshot を読み、
    `stateFromSnapshot` で復元する。
  - `persist(state)` で `snapshotState(state)` を同じキーに `kv.put` する。
  - **注意**: Workers は isolate がリクエストごとに分かれ得るため、`createJsonFileStorage`
    のような「起動時1回ロードしてメモリ保持」は不可。**リクエスト境界で load→mutate→persist**
    する形にする(書き込み頻度は低いので単一キー snapshot で実用上問題なし)。
- [ ] **Workers entry**: `serve({ fetch: app.fetch, ... })` を `export default { fetch: app.fetch }`
  形式の Workers entry に差し替え(Node 版 `server.mjs` は残してローカル用に共存させる)。
- [ ] **bridge script / static の配信**: `node:fs/promises` で読んでいる bridge script と
  web 配信を、Workers Assets もしくは Pages 側配信に置き換え(`/docsync-bridge.js` のパス維持)。
- [ ] **Web → Cloudflare Pages**: `npm run build`(apps/web)→ `wrangler pages deploy apps/web/dist`。
  API base URL を環境変数化し、Pages 環境では Workers の URL を指す。
- [ ] **CORS**: Pages ドメイン ↔ Workers ドメインのクロスオリジンに対応(Hono CORS middleware)。
  05 で決めた CSP / postMessage origin 戦略と矛盾しないことを確認。
- [ ] **CLI 接続確認**: `docsync init --server https://<workers-url>` でローカル CLI から
  リモート API に push できることを確認。
- [ ] **Tunnel フォールバック手順**: 上記が timebox 内に終わらない場合の
  `cloudflared tunnel --url http://localhost:8787`(+ web 用に別トンネル)手順を README に残す。

## Acceptance

- Workers 上の API が `app.fetch` で起動し、`/health` 相当が応答する。
- `docsync push examples/spec.html --server <workers-url>` がリモートに revision を登録し、
  Cloudflare 上の review URL を返す。
- その review URL を別マシン/別ネットワークから開き、iframe で artifact が表示できる。
- リモートで付けたコメントが `docsync pull` でローカルに取り込める(loop がリモートで一周する)。
- KV に状態が永続化され、Worker 再起動後もデータが残る。
- **localhost デモ経路が壊れていない**(Node 版 `server.mjs` + JSON storage が従来通り動く)。
- security: 任意 HTML レンダリング + token-only auth を公開する点を認識し、05 の
  pre-push 拒否 / CSP / sandbox がリモートでも有効であることを確認済み。

## Notes

- **死守**: localhost 主デモ経路。クラウドは「リモートでも繋がる」add-on として見せる。
  当日デモは安定している localhost を主役にし、クラウドは物語の補強に使う。
- **Cut可**: カスタムドメイン、KV の最適なキー分割(単一 snapshot で十分)、D1 化。
- **timebox**: 半日。KV モデリング or wrangler 認証で詰まったら**即 Tunnel に切り替え**、
  「公開URLは確保」を最低ラインとして死守する。
- 必要環境: Cloudflare アカウント + `wrangler` + `cloudflared`(現状どちらも未インストール)。
- デモ脚本の理想形: `local docsync push -> cloud review URL -> 遠隔 reviewer がコメント
  -> local docsync pull -> context -> update`。製品主張(レビューの断絶を埋める)を最も強く見せられる。
