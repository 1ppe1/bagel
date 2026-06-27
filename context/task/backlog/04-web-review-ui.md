# Web Review UI

## Owner Lane

Lane C - Web + Review UX

## Estimate

M

## Dependencies

`01b-define-core-contracts.md`; mock response で先行可。artifact表示 integration は `02-api-artifact-storage.md` に依存。

## Priority

Must

## Goal

React review UI を作り、reviewer が HTML artifact を見ながら DOM 要素にコメントできるようにする。

## Context

参照: `.docs/product-requirements.md`, `.docs/architecture.md`, `.docs/technical-research.md`

MVP UI は多言語メンバーが使う前提で英語固定にする。UI は `anchorStatus` を必須表示し、resolve/reopen は MVP cuttable として扱う。

## Checklist

- [ ] React + Vite を導入し、Node stdlib placeholder Web server を Vite app に置き換える。
- [ ] `/r/:reviewToken` route を実装する。
- [ ] artifact を sandboxed iframe で表示する。
- [ ] selected element の preview を英語 UI で表示する。
- [ ] comment editor を実装する。
- [ ] comment list を実装する。
- [ ] `anchorStatus` badge として `Attached`, `Needs review`, `Orphaned` を英語で表示する。
- [ ] `workflowStatus` は default `open` として保持するが、resolve/reopen UI は MVP では実装しない。
- [ ] comment 作成後と `Refresh comments` 操作で comment list を再取得する。
- [ ] empty state と error state を英語で用意する。

## Acceptance

- reviewer が review URL を開き、HTML を確認できる。
- reviewer が DOM 要素を選択し、コメントを保存できる。
- comment list に target preview と `anchorStatus` が表示される。
- UI 表示文字列はすべて英語。

## Notes

死守: React + Vite 導入、iframe preview、comment editor/list、英語UI、anchorStatus表示。Cut可: resolve/reopen、SSE、reviewer name。推奨 UI copy: `Add comment`, `Open comments`, `Attached`, `Needs review`, `Orphaned`, `No comments yet`, `Refresh comments`, `Copy command`。
