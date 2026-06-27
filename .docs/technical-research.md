# Technical Research

この文書は、Notion から抽出した Docksync 要件に対して、実装技術の妥当性と注意点を調査した結果です。

## Summary

推奨 stack:

- TypeScript monorepo
- Hono API on Node.js for MVP
- React + Vite web app
- Node.js CLI
- Shared `core` package for contracts, hashing, anchor extraction, anchor rebase
- SQLite or JSON persistence for MVP
- Sandboxed iframe + CSP for HTML preview
- SSE only if implementation timeが残る。MVP は polling fallback を必ず持つ

## Hono API

Hono は Web Standards ベースで、Node.js や edge runtime など複数環境に対応します。公式 docs では Hono が lightweight、zero dependency、TypeScript first であること、Web APIs の Request/Response を中心に扱えることが示されています。

Docksync では Hono を API server として使うのが妥当です。理由:

- API、artifact serving、comment CRUD、SSE を同じ service に集約しやすい
- TypeScript domain type と合わせやすい
- Hono RPC を使うと server-side API specs を client と共有しやすい
- `secureHeaders`, `bodyLimit`, `cors`, `etag`, `logger` など MVP に必要な middleware が揃っている

Sources:

- Hono docs: https://hono.dev/docs
- Hono getting started: https://hono.dev/docs/getting-started/basic
- Hono RPC guide: https://hono.dev/docs/guides/rpc
- Hono secure headers middleware: https://hono.dev/docs/middleware/builtin/secure-headers
- Hono body limit middleware: https://hono.dev/docs/middleware/builtin/body-limit

## React + Vite

Review app は DOM selection、comment panel、revision state を扱う UI なので React が適しています。Vite は React + TypeScript app の dev server / build tool として素直です。

Docksync での React の責務:

- Review shell UI
- iframe wrapper
- selected anchor の表示
- comment editor / list
- revision switcher
- sync status 表示

React がやらないこと:

- arbitrary HTML を React DOM に直接描画しない
- local file を直接変更しない
- local Codex を直接起動しない

Source:

- Vite guide: https://vite.dev/guide/

## Iframe Sandbox

任意 HTML をレビューするため、preview は sandboxed iframe に閉じ込めます。MDN の iframe docs では `sandbox` 属性が、埋め込みコンテンツに追加制限をかけ、必要な capability だけ token で戻す仕組みとして説明されています。

MVP 推奨:

```html
<iframe
  sandbox="allow-scripts"
  src="/api/reviews/:reviewId/revisions/:revisionId/artifact"
></iframe>
```

初期値として `allow-same-origin` は避ける方が安全です。`allow-scripts` と `allow-same-origin` を同時に与えると、同一 origin 扱いの script が sandbox を弱めるリスクがあります。DOM selection が必要な場合は、iframe 内へ小さな review bridge script を注入するか、artifact を server-side に instrument して `postMessage` で親 window に selection event を送ります。

Source:

- MDN iframe element: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe

## Content Security Policy

CSP は XSS や code injection の影響を下げるための防御層です。MVP では iframe artifact response と review app response で CSP を分けます。

Review app CSP:

- `default-src 'self'`
- `script-src 'self'`
- `style-src 'self' 'unsafe-inline'` if Vite/dev UI requires it
- `connect-src 'self'`
- `frame-src 'self'`

Artifact iframe CSP:

- `default-src 'none'`
- `script-src 'self'` only if injected bridge is served from same app
- `style-src 'unsafe-inline'` for AI-generated HTML styling
- `img-src data: blob: https:`
- `font-src data: https:`
- `connect-src 'none'`
- `form-action 'none'`
- `base-uri 'none'`

Hono の `secureHeaders` middleware は CSP や related security headers を設定できます。ただし artifact iframe は通常 app と違う policy が必要なので route-specific に設定します。

Sources:

- MDN CSP guide: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- Hono secure headers: https://hono.dev/docs/middleware/builtin/secure-headers

## Server-Sent Events

SSE は server から browser に一方向 update を送る仕組みで、browser 側は `EventSource` を使います。Hono には `streamSSE()` helper があります。

Docksync で SSE が有効な場面:

- reviewer が comment を追加したときの comment list update
- CLI push / pull / sync run 状態表示
- v2 revision arrival

ただしハッカソン MVP では、SSE は必須にしない方が堅いです。SSE が不安定な環境では polling に落とせるようにするべきです。

Sources:

- MDN using server-sent events: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- Hono streaming helper: https://hono.dev/docs/helpers/streaming

## Node.js CLI

CLI は local filesystem の唯一の owner にします。ブラウザは local file を変更せず、CLI が `.docsync` 配下を更新します。

CLI で必要な Node API:

- `fs` / `fs/promises`: HTML, config, comments, context の読み書き
- `crypto`: content hash、unguessable token、revision fingerprint

Local writes should be atomic:

1. temp file に書く
2. validate JSON
3. rename で置き換える

Sources:

- Node.js file system API: https://nodejs.org/api/fs.html
- Node.js crypto API: https://nodejs.org/api/crypto.html

## Storage

MVP の選択肢:

### JSON file storage

Pros:

- 実装が早い
- demo で中身を見せやすい
- migration 不要

Cons:

- concurrent writes に弱い
- query が弱い
- public deployment に向かない

### SQLite

Pros:

- single process API server と相性がよい
- comment / revision / sync run を query しやすい
- production-like な設計に近い

Cons:

- schema と migration が必要
- deployment target によって永続化戦略が変わる

Recommendation:

ハッカソンでは server-side SQLite を第一候補にし、時間が足りなければ JSON file storage に落とす。CLI 側の `.docsync/comments.json` は requirement なので必ず JSON とする。

## HTML Instrumentation

DOM comment を成立させるには、review UI が「どの DOM 要素が選ばれたか」を anchor として取り出す必要があります。

MVP 方針:

- server が artifact HTML を返す前に review bridge script を注入する
- bridge script は hover/click を捕捉し、selector、text quote、heading path、tag、attributes、DOM position を親 window に `postMessage` する
- 親 window は trusted origin と message schema を検証してから comment editor を開く

危険な点:

- arbitrary script を含む HTML をそのまま実行すると reviewer browser を攻撃できる
- `allow-same-origin` を付けると sandbox の隔離が弱まる
- bridge script と user HTML script の衝突を考える必要がある

MVP では HTML 内 script を pre-push check で拒否し、iframe は `allow-scripts` のみで bridge script だけを動かすのが安全です。

## Type Sharing

Shared `core` package に置くもの:

- domain types
- API request / response schemas
- anchor extraction / rebase types
- hash utilities
- Markdown context renderer

Hono RPC または Zod schema で web/cli/API 間の contract drift を減らします。

## Testing Priorities

1. Anchor Rebase deterministic unit tests
2. CLI idempotent pull tests
3. context markdown snapshot tests
4. pre-push security check tests
5. API contract tests
6. iframe message schema tests

UI e2e は余裕があれば Playwright で、最低限は manual demo checklist に落とします。
