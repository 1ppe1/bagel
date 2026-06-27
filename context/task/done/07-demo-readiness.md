# Demo Readiness

## Owner Lane

Lane B - CLI + Local Files

## Estimate

S

## Dependencies

`02b-walking-skeleton-e2e.md`; final demo depends on `06-anchor-rebase.md`

## Priority

Should

## Goal

ハッカソンで Docksync MVP の end-to-end loop を安定して見せるための demo assets と確認手順を整える。

## Context

参照: `.docs/mvp-plan.md`, `.docs/product-requirements.md`

スライド作成はユーザー担当のため、このタスクには含めない。`examples/spec.html` の最小版は `01-scaffold-monorepo.md` で作成済みの前提で、ここでは demo 用に整える。

## Checklist

- [x] `examples/spec.html` を demo しやすい内容に整える。
- [x] quickstart を英語で書く。
- [x] demo script を repository 内に置く。
- [x] `docsync init -> push -> comment -> pull -> context -> update -> push v2` の手順を確認する。
- [x] copy command UI と CLI output が一致していることを確認する。
- [x] manual security sample を用意する。

## Acceptance

- clean checkout から 5 分以内に localhost demo を開始できる。
- demo script はスライドなしでも実行順序が分かる。
- visible UI copy と CLI output は英語。
- slide preparation はタスク範囲外として明記されている。

## Notes

死守: quickstart、manual demo checklist、visible English copy。Cut可: public deployment、polished sample design。public deployment は MVP demo が安定してから検討する。

## Completion Notes

- Added `docs/demo-quickstart.md` with clean-checkout setup, localhost startup, push, pull, context generation, and security smoke check commands.
- Added `docs/demo-script.md` with a slide-free operator script for the full MVP loop: push, browser comment, pull, context, edit, push v2, rebase.
- Updated `examples/spec.html` with clearer demo operator cues and stable targets for attach/orphan demonstrations.
- Added `examples/unsafe-script.html` for the manual pre-push security rejection check.
- Added `tests/demo-readiness.test.mjs` to keep the quickstart, demo script, stable fixture targets, and unsafe sample present.
- Verified with `npm test`, `npm run build`, `npm run lint`, and `./docsync push examples/unsafe-script.html --server http://127.0.0.1:8787` returning the expected security rejection.
