# Dev Directive — Parallel Work (2026-06-27)

開発チーム向けの「今この瞬間どう動くか」の指示書です。恒久ルールは
`context/rules/execution-plan.md` と `context/rules/task-rules.md` を正とし、本書はその
スナップショット運用版です。矛盾した場合は rules を優先してください。

## 1. 現在地

- ✅ done: `01-scaffold` / `01b-define-core-contracts` / `02-api-artifact-storage`
- 🔵 進行中: `03-cli-push-pull-context`(Lane B) / `04-web-review-ui`(Lane C)
- ⚪ 未着手: `02b-walking-skeleton-e2e` / `05-iframe-selection-security` / `06-anchor-rebase` / `07-demo-readiness`

契約(`01b`)と API storage(`02`)が done のため、Lane B/C は既に並列で進められています。
**現状の空きは Lane A(API + Core)**。ここに1本、価値の高い並列作業を差します。

## 2. 今すぐの並列指示

| 担当 | やること | 依存 | 状態 |
|---|---|---|---|
| **Lane A / Rebase 担当** | **`06-anchor-rebase` を今すぐ開始** | 契約(done)+ fixture(done)。他レーン完成を待たない | ⏩ 着手 |
| Lane B | `03` 継続。まず **`02b` のスライス**(push 1ファイル→review URL 出力)を最優先で通す | API(done) | 継続 |
| Lane C | `04` 継続。並行で **`05` のセキュリティ意思決定(spike)を前倒し** | API(done) | 継続 |

### Lane A — 06 Anchor Rebase を最優先で並列着手
これが今いちばん効く一手です。理由:

- **純粋な core ロジックで実行時依存ゼロ**。API サーバ・CLI・Web の完成を待たずに開発・テストできる。
- 前提が全部そろっている:`CompositeAnchor` は `packages/core` に定義済み、
  `examples/spec.html` は **stable id 付き + 削除可能な `<section data-docsync-id="anchor-rebase">`** を持つので
  attach / orphan の両ケースをそのまま再現できる。
- **最難 = 最大リスク**。早く unit test(attach / needs_review / orphaned の3系統)で潰すほどデモが安全になる。

進め方:
1. fixture against で **アルゴリズム単体を先に完成**(`packages/core`、サーバ非依存)。
2. unit test 3系統を緑にする(これが done の最低条件)。
3. その後で `02`(done)の push v2 経路に配線する。**配線は最後**でよい。
4. ガード: rebase は `anchorStatus` と anchor/reasons のみ更新し、**`workflowStatus` を変えない**。

### Lane B — 03 CLI
- 目標を一旦 `02b` のスライスに寄せる:`docsync push examples/spec.html` →
  content hash → revision 登録 → **英語で review URL 出力**、までを最初に貫通させる。
- `pull` は **id による upsert**(新規追加 + 既存コメントの status/anchor 更新)で実装。
  「重複を作らない」だけでなく「v2 後の最新 status を反映する」ことを満たす。
- ブラウザは local file を触らない。local 副作用は CLI が所有。

### Lane C — 04 Web + 05 spike
- `04` は継続。**`05` の実装(iframe bridge)は同一人が 04 の続きとして持つ**(別人に切ると Web 面で merge 衝突する)。
- ただし **`05` の意思決定だけは今すぐ並列で確定**してよく、04 と artifact 配信の両方に効く:
  - route 固有 **CSP** ポリシー
  - `allow-same-origin` を使わない前提での **postMessage origin 戦略**
    （web `:5173` ↔ api `:8787` は **初日からクロスオリジン**である点に注意）
  - pre-push で **拒否/警告する HTML ルール**(`<script>` / inline handler / form / iframe など)
- 決めた内容は `05` の Notes に追記して全レーンへ共有。

## 3. 直近チェックポイント — 02b Walking Skeleton（合流点）

`02b` は並列の開始タスクではなく **03 と 04 が初めて統合する合流点**です。
ここを早めに挟まないと、各機能が完成してから繋ぐ＝デモ前夜に火を噴きます。

- タイミング: 03 が「push→review URL」、04 が「iframe 表示」に届いた時点で**即座に挟む**。
- 通過条件(mock / hard-coded 可):
  push 1ファイル → `/r/:reviewToken` で iframe 表示 → 1 comment を API 保存 →
  `docsync pull` 相当で local JSON → `context.md` にその comment 出力。
- この貫通が緑になるまで、各レーンの**作り込み(polish)を先行させない**。

## 4. ガードレール(全レーン厳守)

- **契約は凍結**:`packages/core` の型に対して実装する。形を変えたくなったら勝手に変えず、
  契約変更として全レーンに周知してから。
- **status は二軸**:`workflowStatus`(MVP は `open` のみ / `resolved`・`reopened` は Cut可)、
  `anchorStatus`(`attached` / `needs_review` / `orphaned`)。UI で混ぜない。
- **review 経路**:URL は `reviewToken`、server が hash を解決して内部 `reviewId` に変換。
  storage の join は `reviewId`。
- **framework 導入**:scaffold の Node stdlib placeholder を惰性で残さない。
  `02` で Hono、`04` で React + Vite を**明示的に導入**(各タスク着手の最初の一歩)。
- **UI 文言は英語固定**(button / empty / error / status / CLI output / demo guidance)。
  タスク本文・調査メモは日本語可。
- **Cut ルール**:
  - 死守: sandboxed iframe / push / pull / context 生成 / attach・orphan rebase デモ
  - 先に切る: SSE / resolve・reopen UI / reviewer name / diff hunk links / public deploy
  - `needs_review` は有用だが attach・orphan が安定すれば Cut可
- **public deployment は範囲外**(localhost 完走が最優先)。公開URLで見せたい時は
  Cloudflare Tunnel で一時公開する運用に留める(常設ホスティングは demo 安定後)。

## 5. 完了の定義 / 報告

- タスク完了時は `context/task/done/` へ移動(状態は本文書き換えでなくディレクトリ移動で表現)。
- 報告には **実際に走らせた検証コマンドと結果**を添える(`npm test` / `npm run dev` /
  `docsync push` の出力など)。「実装した」だけでなく「動いた」を示す。
- 作業中に分かった制約・落とし穴は各タスクの `Notes` に残す。

## まとめ(一言)

**Lane A は今すぐ 06 Anchor Rebase を並列着手。Lane B/C は 02b の貫通を最優先に寄せ、
作り込みは walking skeleton が緑になってから。**
