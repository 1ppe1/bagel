# Iframe Selection Security

## Owner Lane

Lane C - Web + Review UX

## Estimate

M

## Dependencies

`01b-define-core-contracts.md`, `04-web-review-ui.md`

## Priority

Must

## Goal

sandboxed iframe 内の DOM selection と、任意 HTML を扱うための最小セキュリティ対策を実装する。

## Context

参照: `.docs/security.md`, `.docs/technical-research.md`, `.docs/anchor-rebase.md`

React DOM に artifact HTML を直接挿入しない。iframe と `postMessage` の境界を明確にする。

## Checklist

- [x] iframe bridge script で hover/click target を取得する。
- [x] bridge から parent へ `postMessage` する payload schema を定義する。
- [x] sandbox without `allow-same-origin` の opaque origin 前提で、`event.source`, message type、bridge nonce、revision id、payload size を検証する。
- [x] route-specific CSP を設定する。
- [x] pre-push security checks と連携し、危険な HTML を拒否または警告する。
- [x] `allow-same-origin` を使わない前提で動作を確認する。

## Acceptance

- DOM element selection が comment editor に渡る。
- `<script>` や inline event handler を含む artifact は安全に扱われる。
- artifact HTML が React DOM に直接挿入されていない。
- security-related user-facing messages は英語。

## Notes

死守: sandboxed iframe、直接DOM挿入禁止、safe message validation。Cut可: fancy hover outline。`allow-same-origin` なしでは `event.origin` が `null` になり得るため、origin equality だけに依存しない。迷った場合は機能性より隔離を優先する。

## Completion Notes

- Added a static iframe bridge script at `/docsync-bridge.js`; artifact pages load it with `script-src 'self'`.
- Artifact iframe uses `sandbox="allow-scripts"` with no `allow-same-origin`.
- Parent message validation checks `event.source`, message type, bridge nonce, revision id, payload size, and anchor schema.
- API rejects unsafe artifact HTML containing `<script>`, inline event handlers, forbidden embedded elements, or `javascript:` URLs.
- Comment bodies are rendered as React text content, not HTML.

## Verification

- `npm run build`
- `npm test` pass, including security coverage for script rejection, inline handler rejection, static bridge CSP, no direct React artifact insertion, and comment body text rendering.
