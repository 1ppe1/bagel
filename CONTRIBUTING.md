# Contributing to bagel

Thanks for your interest! bagel is young and small — issues, discussions, and
PRs are all welcome.

## Getting set up

```sh
git clone https://github.com/1ppe1/bagel.git
cd bagel
npm install
npm run dev        # API :8787 + web :5173
npm test           # node --test suite
```

`npm run build` runs the type-check, web bundle, and scaffold check — the same
gate CI runs.

## Ground rules

- **Branches**: target `dev`. `main` tracks releases.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` + scope).
- **Tests**: changes to `apps/api`, `packages/*`, or the review bridge should
  come with a test in `tests/`. `npm test` must stay green.
- **Security posture**: artifacts are untrusted input. Anything that renders
  artifact HTML must keep the sandboxed-iframe + CSP model intact
  (see `.docs/security.md`). PRs that weaken it will be declined.
- **Scope**: bagel stays localhost-first. Features that require a hosted
  backend belong in the (future) hosted offering, not the OSS core.

## Good first areas

- `apps/web` UI polish (empty states, keyboard support)
- CLI ergonomics (`packages/cli/src/index.ts`)
- Docs and examples (`examples/`, README)

## Questions

Open a [Discussion](https://github.com/1ppe1/bagel/discussions) — happy to help.
