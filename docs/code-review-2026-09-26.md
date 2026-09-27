# プロダクト全体のコードレビューと修正（2026-09-26）

依頼: 「プロダクトの品質を向上させるために効くリファクタリング」。全ソース（約37,500行・288ファイル）を対象に、要件・仕様から重要箇所を優先度付けし、重点レビューで見つかった重大な問題だけを修正した。軽微・非クリティカルな指摘は修正せず、本書 §5 に記録した。

変更はすべて未コミット。同日前半の「Codex追加分のリファクタリング」（第1段）と同じ作業ツリーに積んでいる。第2段で新たに変更したファイルは §6 に列挙した。

## 1. 進め方

| 段階 | 実施内容 | 担当（モデル） |
|---|---|---|
| 優先度付け | 構想書・M1〜M8要件・設計判断ログから「壊れると数字や監査証跡が誤る不変条件」17件を抽出し、実装箇所へ対応付けて、影響×不具合の起きやすさ（複雑さ・テスト不足・直近の変更量）で順位付け | Planエージェント（Sonnet） |
| 構造調査 | ディレクトリ別の行数・テスト有無、層違反、型エスケープ、Server Action一覧、追記専用テーブルへの更新有無 | Exploreエージェント（Haiku。機械的な計測のみ） |
| 重点レビュー | 下表の7領域を並列にレビュー（読取専用。疑わしい箇所は一時テストで確認し削除） | レビューエージェント×7（Sonnet） |
| 検証・修正 | 指摘をコードと仕様で再確認し、重大なものだけ修正。回帰テストは修正前のコードで失敗することを確認 | 主担当（Opus）＋実装エージェント1件（Sonnet） |

### 重点レビューの領域と主な不変条件

| # | 領域 | 守るべき不変条件（出典） |
|---|---|---|
| 1 | M4 乖離分解のコア（comparability / pairwise-decomposition-v2 / shapley / counterfactual / residual） | 効率性・停止条件、ゼロ≠欠損、単位を黙って換算しない、レビュー待ちの対応付けを確定結果に混ぜない（M4 §4.3・§5.5・§5.9、完成指示書 §9.5） |
| 2 | 台帳・テナント分離・追記専用・再計算ハッシュ（lib/db、proxy.ts、core/ledger） | テナントIDはサーバー側で決める、追記専用、判定件数は1回だけ、書込の直列化（M8 D-2〜D-5、M6 D-8、GAP-15） |
| 3 | M3 貨幣化エンジン（build-valuation-records、較正、不確実性、プラグイン） | 交換価値と厚生価値を合算しない、既定値で埋めない、較正は1回、再構成値の照合（M3 D-2〜D-5、D-15） |
| 4 | M5 財務接続・M6 判定（core＋判定・財務画面） | 判定はP5–P95と承認ラインの交差で機械的に決める、割引率は企業提供のもの（M6 D-2・§4.3・D-10） |
| 5 | パイプライン結線と入力取込（run-demo-pipeline、lib/intake、拠点系Server Action） | 利用者データを既定値で埋めない、デモと実データを混ぜない、失敗時は何も書かない（D-15） |
| 6 | M7 開示検証・M1/M2 感度スコア（core/disclosure、lib/ai、core/site・assessment） | AIは抽出のみ、指摘は永続、未評価の基準は分母に入れない（M7 D-1〜D-6、M8 D-4） |
| 7 | 結果表示（/valuation・/analysis・/ledger・公開API） | 表示で合算・単位の取り違え・停止結果の誤表示をしない |

同日前半に見直した `lib/environment/`・`app/portfolio/`・`app/research/`・`lib/research/`、および文言・CSS・デモ用データは対象外とした。

## 2. 修正した問題

| 重大度 | 問題 | 修正 | 回帰テスト |
|---|---|---|---|
| 高 | **利用者拠点の割引率・評価期間を 6%・10年で補完していた。** 拠点登録フォームに入力欄がなく、判定画面にも表示されないまま★判定に使われていた。CSV取込では顧客が指定した `baselineNpv.discountRate/horizon` を捨てて 6%/10年に置き換えていた（M6 §4.3「M6独自の割引率は設けない」、D-10「業界標準値で仮置きしない」に違反） | 登録フォームに「NPVの算出に使った割引率」「NPVの評価期間」を追加（空欄は未入力のまま）。CSV取込は設定値を引き継ぐ。未入力の拠点は判定を作らず「投資の前提待ち」に回す。「投資判断の前提」画面で保存済みの値があればそれを使う。両フォームで割引率は0〜1の小数に制限 | `product-review-regression.test.ts`（未入力→保留、0.08/7年がそのまま使われる、判定画面の保存値で判定）、`to-site-entries.test.ts`、`site-form.test.ts` |
| 高 | **CSV一括取込で、詳細評価の対象外の拠点に架空の値を入れていた**（10,000m³・500円/m³・NPV1億円・承認ライン1.2億円）。後から評価対象画面で詳細評価に進めると、その架空の数値で算定・判定が表示された。対象拠点の単価が無い場合も500円で補完していた | 対象外の拠点は「優先度算定専用（`screeningOnly`）」とし、詳細評価に進めても算定せず、理由を /valuation に警告表示。`methodConfig.unitReplacementCost` は取込時に必須（1件追加フォームと同じ扱い） | `product-review-regression.test.ts`、`to-site-entries.test.ts`、`engagement-config.test.ts` |
| 高 | **M4: 影響経路の対応付けが専門家レビュー待ち（`pending_domain_review`）の手法（IFVI VFes）を含む比較が、確定した分解結果として表示されていた。** 完成指示書 §9.5「pendingの候補は隔離した検証用途に限り、確定結果へ混ぜない」に違反 | 本番では比較可能性チェックで停止し、「比較手順がまだレビュー中」と専門家確認（H-01）を次のアクションとして表示。診断・成立性検証（T-10a/T-11）は隔離した検証用レジストリ（`createVerificationRegistry`）で従来どおり分解する。分解結果が変わるため `recipe-registry-v3` に版を上げた | `lime3-vs-ifvi-welfare-water.test.ts`、`integration.test.ts`、`divergence-end-to-end.test.ts` |
| 中 | **M4: 完全分解を宣言したレシピで要因を除外しても「完全分解」と表示されうる。** 未宣言の差が偶然打ち消し合うと V* = V_A となり、必要な要因を差し替えていないのに完全分解と表示された（§5.9「偶然値が一致しただけでは完全分解へ昇格しない」） | 除外した要因がある場合は部分分解として扱う（`effectiveDecompositionKind`） | `pairwise-decomposition-v2.test.ts`（修正前のコードで失敗することを確認） |
| 中 | **読み出し時の再計算がテナントのロックを取っていなかった。** 初回・結果の版更新後・ライセンス期限切れ後に画面を開くと、同時に保存中の操作を反映しない古いrunが「最新」になりえた。また run の実行時刻がトランザクション開始時刻で、ロック待ちの間に追い越されうる | 再計算を書込と同じロックの下で行い、ロック取得後に最新runを再確認（同時アクセスで重複保存しない）。run の時刻を挿入時刻（`clock_timestamp()`）に変更。ロック取得を `lockTenantForWrite` に共通化 | `try-run-with-interaction.db.test.ts`（別トランザクションがロック中は再計算が待つ） |
| 中 | **PDFからの主張抽出で、AIの出力スキーマのカテゴリに「廃棄物」「土地利用」がなかった。** 該当する主張はカテゴリ不明（null）として保存され、選択的開示の検出（G6）で全カテゴリに照合されていた。出力上限で途切れた場合の扱いもなかった | カテゴリを `ImpactCategory` の全値から生成（値の追加漏れは型エラーになる）。途切れた出力は保存せずエラーにする | 型で担保（`Record<ImpactCategory, true>`） |

あわせて、結果構造の版 `RESULT_SCHEMA_VERSION` を 18 に上げた（保存済みrunは初回読込時に再計算される）。

## 3. 問題がなかったこと（確認済み）

- テナント分離: `proxy.ts` はサブドメインからテナントIDを決め、外部から来た `x-tenant-id` を上書きする。全リポジトリ関数が tenantId で絞り込む。
- 追記専用: マイグレーションが全台帳テーブルで UPDATE/DELETE/TRUNCATE を剥奪し、テストが新規テーブルの剥奪漏れを検出する。例外は `site` テーブルのみ（設計どおり）。
- 判定件数: `(tenantId, decisionRecordId)` の主キーと `onConflictDoNothing` で、run と同じトランザクション内に1回だけ積む。保留は数えない。
- 判定ロジック（P5 ≤ 承認ライン ≤ P95 で交差、境界の扱い、緩衝なし）、Bridge1/Bridge2 の型分離、非GAAP表示の必須化。
- Shapley の重み・効率性、乗法/加法の選択、順序依存の検出、F-3/F-8 の無効化（H-06 待ち）。
- 地理較正は1回だけ適用、交換価値と厚生価値は型と実行時チェックの両方で分離、IFVI の再構成と照合失敗時の出力停止。
- AIは抽出のみで、証拠照合・ギャップ判定はルールで行う。ギャップ指摘を削除・編集する経路はない。未評価の感度基準は分母に入れない。ジオコーディング失敗は理由付きで除外する。
- 表示: 交換価値と厚生価値を合算しない、P5/P95 の取り違えなし、停止した分解を分解済みとして描画しない、公開APIはキー必須で係数を秘匿。

## 4. 利用者・運用への影響

- **登録済みの利用者拠点で割引率・評価期間が未入力のもの**（今回より前に登録したもの）は、判定が「投資の前提待ち」に移る。拠点の「編集」で割引率・評価期間を入力するか、「投資判断の前提」画面で入力すると判定が戻る。
- **以前にCSV一括取込した拠点**は、保存済みのパラメータに「優先度算定専用」の印がないため、旧来の既定値が残っている。取り込み直すと新しい扱いになる。
- **/analysis の「IFVI（生態系）× LIME3」**は、分解結果ではなく「比較手順がまだレビュー中」と表示される。H-01（VFes の保護対象の対応付け）が承認されたら `pathway-mapping.ts` のレビュー状態を更新すれば分解に戻る。`docs/data/divergence-validation-report.md` の診断値（検証用レジストリで算出）は変わらない。

## 5. 修正しなかった指摘（記録のみ）

| 指摘 | 判断理由 |
|---|---|
| M3 適合度の5次元に範囲外の値（負数等）が入ると NaN になり階層Cに落ちる（`fitness.ts`） | 入力元の `vfesFitnessDimensions` は現在パイプラインに接続されていない（取込で未反映項目として表示済み）。接続する時に範囲検証を入れる |
| M3 公式集計値との照合の許容誤差が絶対値 1e-6（`ifvi-water-consumption.ts`） | 公式集計値を渡す呼び出し元が現在ない。実データを接続する時に、公表値の丸め桁に合わせた許容誤差を設計する |
| M4 `buildPairDiagnostics` の桁差比が端点2値だけから計算される（仕様は全 v(S)） | F-3 は H-06 待ちで無効化されており判定に影響しない。F-3 を有効化する前に直す |
| 台帳画面の旧パラメータ再計算が、比較元runの結果構造の版を確認しない | 現状、較正レコードの形は変わっておらず誤表示は確認できない。防御的な強化として検討 |
| /valuation の選択手法の値が見つからない場合 `?? 0` で0円表示になる | 上流で到達不能（選択できない手法は警告付きで外される）。テストで不到達を固定するか、明示的な「算定不能」表示にする |
| PDF抽出テキストの長さ上限がない | 失敗時は安全側（保存しない）。長い文書はページ分割の案内で運用 |
| `lib/` から `app/components` の表示用関数（`formatYen`・ラベル）を参照している層違反（`open-actions.ts`・`pipeline-findings.ts` 等） | 動作上の問題はない。表示用の整形関数を `lib/` 側へ移す整理は別作業 |
| 判定画面の「投資判断の前提」フォームが、拠点登録で入力した割引率等を初期値に表示しない | 誤った値は使われない（登録値で判定）。入力の手間の問題として別途改善 |

## 6. 第2段で変更したファイル

コア: `packages/core/src/divergence/{comparability,pairwise-decomposition-v2,residual}.ts`、`recipes/registry.ts`、`diagnostics/feasibility-lime3-water.ts`
パイプライン・DB: `lib/pipeline/execute-run.ts`、`lib/pipeline/try-run-with-interaction.ts`、`lib/db/client.ts`、`lib/db/repositories/runs.ts`、`lib/demo/{run-demo-pipeline,site-entry,user-site-defaults}.ts`
取込・AI: `lib/intake/{to-site-entries,engagement-config}.ts`、`lib/ai/extract-disclosure-claims.ts`
画面・Server Action: `app/sites/{site-form,add-site-form,prtr-actions,category-input-actions}.ts(x)`、`app/decision/{actions,deferred-decisions}.ts(x)`
テスト: `pairwise-decomposition-v2.test.ts`、`integration.test.ts`、`recipes/{lime3-vs-ifvi-welfare-water,registry}.test.ts`、`diagnostics/baseline-water-case.test.ts`、`lib/demo/{product-review-regression,divergence-end-to-end,result-schema-version}.test.ts`、`lib/intake/{to-site-entries,engagement-config}.test.ts`、`app/sites/site-form.test.ts`、`lib/pipeline/try-run-with-interaction.db.test.ts`

## 7. 検証結果

- `npm run typecheck`: 成功
- `npm test`: 134ファイル・881件成功
- `npm run test:db`: 10ファイル・55件成功（Docker の `prism-db` を起動して実行）
- `npm run build`: 成功
- `npm run lint`: 本作業のコードはエラー0件。ただし作業ツリーに別作業で追加された未追跡の `tools/promotion/check-and-export.cjs` が `require()` の規則で4件エラーになる（本作業では変更していない）
- 画面確認（隔離テナント `portfolio-ui-test`、ポート3100）: 主要12画面が正常表示、/analysis で VFes の比較がレビュー待ちとして表示、拠点登録フォームに割引率・評価期間の入力欄、ハイドレーションエラーなし

作業ツリーには、本作業とは別に `output/`・`public/promotion/`・`tools/` のプロモーション素材（2026-09-26 23:35〜23:46作成・未追跡）がある。本レビューでは作成・変更していない。
