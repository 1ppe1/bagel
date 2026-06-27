# Docksync Demo Script

This script is the operator checklist for a live demo. It does not depend on slides.

## Setup

1. Run `npm install`.
2. Run `npm run dev`.
3. Keep a second terminal open at the repository root.

## Demo Flow

1. Show `examples/spec.html` and point out the stable review targets:
   `hero-title`, `workflow`, and `anchor-rebase`.
2. Publish the artifact:

   ```sh
   ./docsync push examples/spec.html --server http://127.0.0.1:8787
   ```

3. Open the printed review URL.
4. Click the hero headline or the Anchor Rebase section in the iframe.
5. Add a comment, for example:

   ```text
   Make this headline more direct for demo viewers.
   ```

6. Pull the browser comment into local JSON:

   ```sh
   ./docsync pull
   ```

7. Generate agent context:

   ```sh
   ./docsync context --open-comments
   ```

8. Show `.docsync/context.md`. Confirm the comment includes:
   selector, text quote, heading path, comment body, and suggested instruction.
9. Apply a safe edit to `examples/spec.html`, such as changing nearby paragraph copy while keeping the commented heading.
10. Push again:

    ```sh
    ./docsync push examples/spec.html --server http://127.0.0.1:8787
    ```

11. Refresh the review page and show the comment remains attached.
12. For the orphan demo, remove the section with `data-docsync-id="anchor-rebase"`.
13. Push again and refresh the review page. Show the comment becomes `Orphaned` when its target disappears.

## Manual Checks

- Review URL opens and shows the iframe preview.
- `Refresh comments` updates the list after adding a comment.
- CLI output uses English copy.
- UI copy uses English copy.
- Unsafe HTML is rejected:

  ```sh
  ./docsync push examples/unsafe-script.html --server http://127.0.0.1:8787
  ```

## Cut Line

Do not spend demo time on public deployment, polished sample design, SSE, resolve/reopen UI, or slide preparation. The demo claim is the localhost loop:

```text
push -> browser comment -> pull -> context -> edit -> push v2 -> rebase
```
