# Docksync Documentation

このディレクトリは、Notion の `ドキュメントハブ` から読み取れた Docksync 構想をもとに、実装前に必要な調査結果と設計判断をまとめたものです。

## Source

- Notion URL: https://app.notion.com/p/387199a85bf980fb87bbc3df09d76499?v=387199a85bf9804199e4000c37302b9b&source=copy_link
- Read method: Codex CLI の Notion MCP OAuth 接続
- Read status: データベース本体と検索で見つかった 2 件の子ページは取得済み
- Limitation: Notion MCP の `query_database_view` は Notion Business plan 以上 + Notion AI が必要という `validation_error` で失敗したため、厳密なビュー実行結果ではなく、検索で確認できた行を根拠にしている

## Document Map

- [notion-extraction.md](./notion-extraction.md): Notion から抽出した原材料
- [product-requirements.md](./product-requirements.md): プロダクト要件、MVP範囲、成功条件
- [technical-research.md](./technical-research.md): Hono、React/Vite、iframe sandbox、CSP、SSE、Node CLI まわりの調査
- [architecture.md](./architecture.md): 推奨アーキテクチャ、パッケージ構成、API、CLI責務
- [data-model.md](./data-model.md): MVPで必要なエンティティと JSON 形状
- [anchor-rebase.md](./anchor-rebase.md): コメント再接続アルゴリズムの設計
- [mvp-plan.md](./mvp-plan.md): ハッカソン向け実装順序とデモチェックリスト
- [security.md](./security.md): 任意HTMLレビュー機能の脅威と安全策

## Current Recommendation

Docksync は「HTML-first, CLI-first」に寄せるべきです。ブラウザ上でローカルファイルや Codex を直接操作しようとすると安全性と実装難度が跳ねるため、ブラウザはレビュー UI と状態表示に限定し、ローカルの副作用は `docsync push`, `docsync pull`, `docsync context --open-comments` に閉じ込めます。

MVP では public deployment より localhost 完走を優先します。Notion の成功条件は、1つの HTML を publish し、DOM 要素にコメントし、pull/context で Codex に戻し、修正後 v2 でコメントを正しく再接続または orphan にできることです。
