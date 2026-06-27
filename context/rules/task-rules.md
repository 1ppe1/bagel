# Task Rules

## Purpose

このファイルは、`context/task/` 配下でタスクを管理するための運用ルールとナレッジを記録する場所です。タスクの状態を明確にし、作業の抜け漏れや重複を減らすことを目的にします。

## Directory Rules

- `context/task/backlog/`: これからやるタスク、まだ着手していないアイデアを置く。
- `context/task/in-progress/`: 現在進行中のタスクを置く。
- `context/task/done/`: 完了したタスクを置く。

タスクの状態が変わったら、該当ファイルを対応するディレクトリへ移動します。状態だけを本文で書き換えるのではなく、ディレクトリ移動で状態を表現します。

## Task File Format

タスクは 1 タスク 1 Markdown ファイルにします。ファイル名は短く、内容が分かる名前にします。

Example:

```text
context/task/backlog/build-cli-init.md
context/task/in-progress/design-anchor-rebase.md
context/task/done/create-docs-directory.md
```

推奨テンプレート:

```md
# Task Title

## Owner Lane

担当レーン。例: Lane A - API + Core。

## Estimate

S / M / L のいずれか。S は半日未満、M は半日〜1日、L は1日以上または不確実性が高い作業。

## Dependencies

先に完了している必要があるタスク、または依存する契約。

## Priority

Must / Should / Cuttable のいずれか。

## Goal

このタスクで達成すること。

## Context

背景、関連ドキュメント、判断材料。

## Checklist

- [ ] 実装または調査項目
- [ ] 確認項目

## Acceptance

完了と判断できる具体的な条件。

## Notes

作業中に分かったこと、次に活かす知識。
```

## Lane Rules

- Lane A - API + Core: Hono API、storage、domain types、Anchor Rebase を担当する。
- Lane B - CLI + Local Files: `docsync` command、`.docsync/comments.json`、`.docsync/context.md`、atomic write を担当する。
- Lane C - Web + Review UX: React review UI、sandboxed iframe shell、comment editor、MVP UI copy を担当する。
- Shared: scaffold、contracts、walking skeleton など、全レーンを unblock する横断タスクを担当する。

担当者名が未確定の場合は、タスクにはレーン名だけを記録します。複数レーンにまたがるタスクは、主担当レーンを 1 つ決め、連携先を `Context` に記録します。

WIP は原則として 1 レーン 1 タスクまでにします。Shared タスクは、短時間で完了させてから各レーンを解放します。

## Language Rules

- All MVP UI copy must be English.
- MVP の UI 表示文言、button label、empty state、error message、status label は英語で統一する。
- CLI output と demo で見える command guidance も英語にする。
- タスク本文、調査メモ、内部コメントは日本語でもよい。
- UI 文言をタスクに書く場合は、実装者が迷わないよう英語の exact copy を記録する。

## Scope Rules

- スライド作成はユーザー担当のため、`context/task/` には実装タスクとして追加しない。
- `.docs/` は設計・調査の公式資料、`context/` は作業運用とタスク状態の記録として使い分ける。
- MVP は localhost demo 完走を優先し、public deployment は明示タスクが作られるまで backlog 外に置く。

## Contract Rules

- `packages/core` の API response shape、domain types、`CompositeAnchor`、comment schema は各レーンが実装を始める前に先出しする。
- Browser-visible URL は raw `reviewToken` を使う。Server は token hash から internal `reviewId` を解決し、storage は `reviewId` に紐付ける。
- comment status は二軸で扱う。`workflowStatus` は人間の解決状態、`anchorStatus` は再接続の確信度。
- MVP では `workflowStatus` は default `open` として保持し、resolve/reopen UI は Cuttable とする。UI に出す必須 status は `anchorStatus` の `attached`, `needs_review`, `orphaned`。

## Knowledge Rules

- タスク中に分かった実装判断、制約、落とし穴は `Notes` に残す。
- 複数タスクに共通する知識は、この `context/rules/` 配下に新しいルールファイルとして切り出す。

## Completion Rules

タスクを `done` に移す前に、完了条件を本文で確認します。テスト、動作確認、作成ファイル、未解決事項がある場合は `Notes` に残します。
