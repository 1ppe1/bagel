# Notion Extraction

## Read Status

Codex CLI の Notion MCP 経由で対象リンクを読み取りました。リンク先は通常ページではなく、Notion データベース `ドキュメントハブ` として解決されました。

Exact database view query は失敗しました。Notion MCP の応答は `query_database_view` が Business plan 以上と Notion AI を要求する `validation_error` でした。そのため、この文書はデータベース検索で確認できた次の 2 行を根拠にしています。

- `要件定義`: https://app.notion.com/p/387199a85bf98080b843eb60bddadc83
- `Docksync｜Hono + React アプリ設計`: https://app.notion.com/p/387199a85bf9800d8f34e6f9ae3bf169

## Project Idea

Docksync は AI が生成したローカル HTML 成果物をレビュー URL として公開し、ブラウザ上のコメントをローカルの coding agent context に戻すためのレビュー同期ツールです。

中核コンセプト:

> Publish local AI-generated specs. Collect comments in the browser. Pull them back for your coding agent.

AI coding agent は HTML spec、dashboard mock、UI mock、実装計画などを作れる一方で、人間が視覚的にレビューしたコメントをローカルの agent context に戻す自然な導線がありません。Docksync は DOM 要素に紐づいたコメントを構造化し、Codex が読める Markdown context に変換します。

## Target Users

- Codex、Claude Code、Cursor などで仕様書や HTML mock を生成するエンジニア
- PRD や visual spec を AI で作る PdM、founder
- ローカルファイルと Git を中心に作業する小規模チーム

Main job-to-be-done:

> AI 生成の visual spec を他者に見せ、成果物上の具体的なフィードバックを受け取り、それを位置情報つきでローカル AI agent に戻したい。

## Core Workflow

```text
Codex generates local HTML spec
-> docsync push
-> browser review URL
-> reviewer comments on DOM elements
-> docsync pull
-> docsync context --open-comments
-> Codex reads context and fixes HTML
-> push v2
-> existing comments are reconnected to the new DOM
```

## Hackathon Success Criteria

1. Codex が 1 ファイル HTML spec を生成する
2. `docsync push` が review URL を発行する
3. HTML がブラウザで正しく表示される
4. reviewer が DOM 要素を選択してコメントできる
5. `docsync pull` がコメントをローカル JSON に同期する
6. `docsync context --open-comments` が AI 向け Markdown を生成する
7. Codex が context を読んで HTML を更新する
8. v2 を push できる
9. 既存コメントが正しい DOM 要素に再接続される
10. 低信頼度コメントは誤接続ではなく `orphaned` になる

## Must-Have Requirements

- `docsync init`
- `docsync push`
- Single HTML file publishing
- Review URL generation
- Sandboxed iframe preview
- DOM-element comments
- Comment list
- `docsync pull`
- `.docsync/comments.json` への保存
- `docsync context --open-comments`
- `.docsync/context.md` の生成
- Revision content hash
- Composite Anchor storage
- Anchor Rebase from v1 to v2
- Confidence-based status: `attached`, `needs_review`, `orphaned`
- Pre-push security checks

## Should-Have Features

- Text-range comments
- Resolve / reopen comments
- Reviewer name
- Local preview
- Highlight target elements
- Re-push AI-updated comment state
- SSE reconnect
- Command-copy button
- Link selected comments to diff hunks

## Out Of Scope

- Markdown browser conversion
- Mermaid node/edge comments
- Real-time collaboration
- Advanced auth/permissions
- GitHub integration
- MCP Server
- Complex context graph
- Screenshot-coordinate comments
- Multi-tenant billing
- AI-based related-file inference
- Browser-triggered local Codex execution

## Key Constraints

- Browser cannot directly modify local files or run local Codex
- React should observe and display state, not fake local execution
- CLI owns local actions: `push`, `pull`, `context`
- Hono API stores and serves projects, revisions, comments, sync runs, and events
- Arbitrary HTML must not be inserted directly into React DOM
- Artifact preview must use sandboxed iframe and CSP
- Demo should work fully on `localhost` even if public deployment fails
- Pull must be idempotent
- Failed operations must not destroy local files

## Planned Architecture From Notion

- Monorepo
- TypeScript
- React web app
- Hono API
- Node.js CLI
- Shared core package for API contracts, domain types, revision hashing, Anchor Rebase
- Storage: SQLite or simple persistent JSON for MVP
- Preview: sandboxed iframe
- Communication: HTTP JSON API
- Progress events: SSE

## Open Questions From Notion

- Public URL を用意するか、localhost demo に寄せるか
- Persistence は SQLite、D1、PostgreSQL のどれにするか
- CLI token をどう発行するか
- Review URL は unguessable URL のみでよいか
- Diff generation は server-side か CLI-side か
- Anchor Rebase は push 中に同期実行するか、非同期にするか
- Codex completion event は user action、CLI、agent hook のどれで出すか
- `resolved` は誰が確定するか
- Sync Run と Review は同じ app に置くか
- SSE を実装するか、short polling に落とすか

## External Links In Notion

- Codex Community Hackathon Hanoi: https://luma.com/h16o7bq4
- Claude Code HTML vs Markdown post: https://x.com/ClaudeCode_UT/status/2053010619650216304
