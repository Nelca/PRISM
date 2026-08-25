# リファクタリング引き継ぎ

更新日: 2026-08-26

## 現在地

`main` は `origin/main` と同期済みで、作業ツリーはクリーン。

直近のリファクタリングコミット:

- `588fc61 refactor: split pipeline progress and valuation insights`
- `3a02ca9 refactor: extract decision input assembly`
- `350344e refactor: extract assessment phase`
- `256b87b refactor: extract recalculation hash config`
- `86e277e refactor: validate action targets`

直近の検証結果:

- `npm test`: 89ファイル、463テスト成功
- `npm run test:db`: 7ファイル、41テスト成功
- `npm run typecheck`: 成功
- `npm run lint`: 成功
- `npm run build`: 成功
- Chrome操作E2E: 主要9画面の表示、対策案の保存・再計算・元の案への復元に成功
- ブラウザのコンソール警告・エラー: なし

## 残作業（推奨順）

### 1. `open-tasks.ts` の追加分割

対象: `lib/pipeline/open-tasks.ts`（現在約399行）

次の責務を独立させる。

1. `open-actions.ts`
   - `OpenTask`
   - `deriveOpenTasks`
   - 未完了判断の順序とリンク先を維持する
2. `pipeline-findings.ts`
   - `Finding`
   - `deriveFindings`
   - 表示用の金額整形、最大乖離、開示ギャップ優先順位を移す
3. `open-tasks.ts` は互換性のためのre-exportだけにするか、全import元を更新して削除する

既存の `lib/pipeline/open-tasks.test.ts` を分割先ごとに移す。最低限、次を固定する。

- タスクの件数、順序、リンク、アンカー
- 代表値未選択、承認ライン未入力、弱い拘束方式
- 最大乖離の発見と金額レンジ
- verdict、減損、開示ギャップの発見順序
- 空状態

### 2. 意思決定フェーズの追加分割

対象: `lib/demo/run-demo-pipeline.ts`（現在約725行）のM5・M6部分。

一度に全体を移動せず、次の順で分ける。

1. `build-countermeasure-previews.ts`
   - 4種類の対策案preview生成
   - `NoContributingRecordError` の候補単位の除外
   - 除外時の `PipelineWarning` 生成
2. `select-countermeasure.ts`
   - 保存済み対策案の復元
   - 利用不能時の既定案フォールバックと警告
3. `build-site-decision.ts`
   - 最終 `runDecisionPipeline` 呼び出し
   - 拘束方式変更履歴の引き継ぎ
   - `DecisionRecord` と `assumptionEntries` の組み立て
4. 可能なら `build-financial-bridge.ts`
   - M5の財務接続
   - 気候拠点のNGFSシナリオ別コスト

追加するコアテスト:

- 対策案が4種類かつ順序が安定する
- 同一入力・同一seedで結果が一致する
- 承認ライン未入力では `pending`
- `NoContributingRecordError` の候補だけが除外され、他候補は残る
- 保存済み対策案が存在すれば復元される
- 存在しない対策案は警告付きで既定案になる
- 拘束方式と履歴、変更理由が失われない

## ブラウザ併走手順

1. `npm run db:up`
2. 必要なら `npm run db:migrate`
3. `npm run dev`
4. CodexのBrowser/Chrome接続で `http://localhost:3000` を開く
5. 各小変更の前後で対象画面を再読み込みし、表示とコンソールを確認する

主要導線:

`/` → `/sites` → `/assessment` → `/valuation` → `/financial-bridge` → `/decision` → `/disclosure` → `/ledger`

意思決定フェーズ変更時の操作E2E:

1. `/decision` で本社工場を表示
2. 現在と異なる対策案を選択
3. 選択中表示と再計算されたNPV・判定を確認
4. `/ledger` に操作履歴が追加されたことを確認
5. 元の対策案へ戻す
6. コンソールに警告・エラーがないことを確認

フォーム入力を試す場合は既存値を控え、テスト後に復元する。削除操作は回帰確認に使わない。

## 完了条件

各コミット前に最低限、対象テスト、`npm run typecheck`、`npm run lint`、Chrome対象画面の操作確認を行う。最終コミット前に以下をすべて実行する。

```sh
npm test
npm run test:db
npm run typecheck
npm run lint
npm run build
git diff --check
```

推奨コミット単位:

1. `refactor: split open tasks and findings`
2. `refactor: extract countermeasure previews`
3. `refactor: extract site decision assembly`
4. 必要なら `refactor: extract financial bridge assembly`

## 注意事項

- Next.jsは16.2.12。Next.js関連コードを変更する前に、`node_modules/next/dist/docs/` の該当ガイドを読む。
- `open-tasks.ts` の公開APIは複数画面から参照されるため、まずre-exportで互換性を維持する。
- `NoContributingRecordError` 以外の例外を対策案preview層で握りつぶさない。
- ブラウザE2E中に作成・変更したデモデータは、可能な限り元の状態へ戻す。
- 「全リファクタ完了」「デグレなし」と断言せず、自動検証と操作確認で実際に確認した範囲を報告する。
