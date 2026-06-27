# Security Notes

## Security Posture

Docksync handles arbitrary AI-generated HTML. Treat every artifact as untrusted input, even if it was generated locally by a trusted user. The product must protect the reviewer browser, the local filesystem, and the server process.

## Main Threats

- Malicious script in uploaded HTML
- HTML escaping out of preview into app shell
- iframe accessing parent window
- local file overwrite during `pull`
- oversized artifact causing memory or storage issues
- comment body XSS
- review URL guessing
- server-side path traversal
- accidental execution of local Codex from browser

## Preview Isolation

Rules:

- Do not render artifact HTML with React `dangerouslySetInnerHTML`
- Serve artifact inside sandboxed iframe
- Use separate CSP for artifact route
- Avoid `allow-same-origin` unless there is a strong reason
- Communicate from iframe to parent only through validated `postMessage`

Recommended iframe:

```html
<iframe sandbox="allow-scripts" src="/api/reviews/:reviewId/revisions/:revisionId/artifact"></iframe>
```

The only script that should run in MVP is the injected Docksync bridge script. If user HTML contains `<script>` or inline event handlers, reject it during pre-push checks.

References:

- MDN iframe: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- MDN CSP: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP

## Artifact CSP

Start strict:

```text
default-src 'none';
script-src 'self';
style-src 'unsafe-inline';
img-src data: blob: https:;
font-src data: https:;
connect-src 'none';
form-action 'none';
base-uri 'none';
object-src 'none';
```

If bridge script is inlined instead of loaded from same origin, `script-src` must change. Prefer serving the bridge as a static file with a known path.

## Pre-Push Checks

Reject:

- `<script>`
- inline event handlers like `onclick`, `onload`
- `<iframe>`
- `<object>`, `<embed>`
- `<form>`
- `javascript:` URLs
- files over max size

Warn:

- external image/font URLs
- huge inline data URLs
- unknown custom elements

## Server Safety

- Never use user-provided filenames as filesystem paths
- Store artifacts by generated revision id or content hash
- Use body size limits
- Validate all JSON request bodies
- Escape comment body when rendering
- Use secure headers on app routes
- Store review token hash, not raw token

Hono relevant docs:

- Secure headers: https://hono.dev/docs/middleware/builtin/secure-headers
- Body limit: https://hono.dev/docs/middleware/builtin/body-limit

## CLI Safety

- Browser cannot trigger local filesystem writes
- `docsync pull` writes only inside `.docsync`
- Use atomic writes for `comments.json` and `context.md`
- Keep backups or temp files until JSON is valid
- Do not delete local comments unless server explicitly tombstones them
- Failed operations must leave previous files intact

## Review URL Access

MVP can use unguessable review URLs:

```text
/r/:reviewToken
```

Requirements:

- token generated with cryptographic randomness
- raw token shown only to user/browser
- server stores hash
- token length enough to resist guessing

This is not full auth. It is acceptable for localhost hackathon demo, but should not be represented as enterprise permission control.

## Comment Content

Comments are user input. Render comment body as escaped text or sanitized Markdown. Do not allow arbitrary HTML in comments for MVP.

## Browser-To-Local Boundary

Non-negotiable rule:

> Browser never directly modifies local files and never directly runs Codex.

All local effects happen through CLI commands run by the user:

- `docsync push`
- `docsync pull`
- `docsync context --open-comments`

## Security Acceptance Tests

- HTML with `<script>alert(1)</script>` is rejected or script never executes
- HTML with `<button onclick="alert(1)">` is rejected
- comment containing `<img src=x onerror=alert(1)>` renders as text
- path traversal artifact name does not write outside storage directory
- failed `pull` leaves previous `.docsync/comments.json` intact
- missing or invalid review token returns 404/403
