# Product Requirements

## Product

Product name: Docksync

CLI command: `docsync`

Docksync は、AI が生成したローカル HTML を review URL に公開し、人間の DOM 要素コメントをローカルの AI agent context に戻すツールです。

## Problem

AI coding agent は HTML ベースの spec や mock を作れるが、レビューはブラウザ上で起きます。そのコメントはローカルファイル、DOM 上の位置、差分、次の agent instruction と自然には接続されません。

Docksync はこの断絶を埋めます。

## MVP Goal

ハッカソン demo で次の loop を live に通すこと:

1. ローカル HTML を `docsync push` で公開
2. レビュー UI で DOM 要素にコメント
3. `docsync pull` でコメントを `.docsync/comments.json` に保存
4. `docsync context --open-comments` で `.docsync/context.md` を生成
5. Codex が context を読み HTML を修正
6. v2 push 時に既存コメントを正しい DOM 要素へ再接続
7. 不確かなコメントは `orphaned` にする

## Personas

### Engineer

- AI agent で spec や UI mock を生成する
- 人間のレビューを実装タスクとして agent に戻したい
- ローカルファイルと Git workflow を維持したい

### Reviewer

- ブラウザで成果物を見て、該当箇所にコメントしたい
- CLI やローカル環境を触りたくない
- コメントが修正後も残ってほしい

### Demo Operator

- localhost で完走する安定 demo が必要
- public URL や高度な auth より、目に見える loop の成功を優先する

## Functional Requirements

### CLI

- `docsync init`
  - `.docsync/config.json` を作成する
  - project id、server URL、local artifact path を保存する
- `docsync push <file.html>`
  - HTML を読み取る
  - pre-push security checks を実行する
  - content hash を計算する
  - revision を API に登録する
  - review URL を出力する
- `docsync pull`
  - server 側コメントを取得する
  - `.docsync/comments.json` を idempotent に更新する
  - 既存ローカルファイルを破壊しない
- `docsync context --open-comments`
  - open / needs_review / orphaned コメントを Markdown 化する
  - `.docsync/context.md` を生成する
  - Codex がそのまま読める指示形式にする

### Web Review App

- Published HTML を sandboxed iframe で表示する
- iframe 内の DOM 要素を hover / click で選択できる
- 選択した DOM 要素にコメントを作成できる
- コメント一覧を表示できる
- comment status を `attached`, `needs_review`, `orphaned`, `resolved` で表示できる
- v2 以降の revision で再接続結果を見せる

### API

- project / revision / comment / sync run を保存する
- HTML artifact を配信する
- comment CRUD を提供する
- revision push 時に Anchor Rebase を実行する
- SSE または polling で更新通知を提供する

## Non-Functional Requirements

- Arbitrary HTML は React DOM に直接挿入しない
- iframe sandbox と CSP を使う
- pre-push security checks で危険な HTML を検出する
- localhost で全機能が demo 可能
- pull は idempotent
- failed operation は local file を破壊しない
- Anchor Rebase は deterministic
- 誤接続より orphan を優先する

## Explicit Non-Goals For MVP

- Markdown から HTML への変換
- Mermaid node / edge comments
- Real-time collaborative editing
- GitHub integration
- MCP Server
- Multi-tenant billing
- Advanced auth
- Browser から local Codex を直接起動すること

## Acceptance Criteria

- `docsync init` 後に `.docsync/config.json` ができる
- `docsync push sample.html` が review URL を返す
- review URL で HTML が iframe 内に表示される
- DOM 要素をクリックしてコメントできる
- `docsync pull` 後に `.docsync/comments.json` にコメントが保存される
- `docsync context --open-comments` 後に `.docsync/context.md` が生成される
- HTML を編集して再 push したとき、同じ要素へのコメントが `attached` になる
- 類似度が低い変更では `orphaned` になる
- 危険な HTML は push 前に警告または拒否される

## Product Decisions

- MVP の storage は SQLite か JSON でよい。demo 安定性を優先するなら server-side JSON file でも許容する
- Public URL は optional。localhost 完走が最重要
- Auth は MVP では unguessable review token + local CLI token に留める
- Diff hunk linking は should-have に落とす
- SSE は nice-to-have。安定しない場合は polling で代替する
