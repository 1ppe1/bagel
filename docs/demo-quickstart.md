# Docksync Demo Quickstart

Use this guide to start the localhost demo from a clean checkout in about five minutes. Slide preparation is out of scope for this repository.

## Prerequisites

- Node.js 22 or newer
- npm
- A browser that can open `http://127.0.0.1:8787`

## Start The App

Install dependencies and start the API plus review UI:

```sh
npm install
npm run dev
```

The API listens on `http://127.0.0.1:8787`. The review UI is served by the API at `/r/:reviewToken`.

## Publish The Demo Artifact

In another terminal, push the shared HTML fixture:

```sh
./docsync push examples/spec.html --server http://127.0.0.1:8787
```

The command prints a review URL like:

```text
Review URL: http://127.0.0.1:8787/r/<reviewToken>
```

Open that URL in the browser. The page should show the Docksync review UI with the artifact inside a sandboxed iframe.

## Pull Review Context

After adding at least one browser comment:

```sh
./docsync pull
./docsync context --open-comments
```

Open `.docsync/context.md`. Each open comment should include a selector, text quote, heading path, comment body, and suggested instruction.

## Security Smoke Check

This unsafe sample must be rejected before it reaches the review iframe:

```sh
./docsync push examples/unsafe-script.html --server http://127.0.0.1:8787
```

Expected result:

```text
Security check failed: Artifact contains a <script> tag.
```
