# M4 乖離原因分解 完成実装 作業台帳

**指示書:** `docs/roadmap/divergence-decomposition-completion-directive.md`(第2版)
**開始:** 2026-09-06
**状態:** 状態A 技術実装 完了(2026-09-06)。状態B 実データ実証 **未達**(H-02 の原本待ちで T-12 blocked)。C/D・全体受入は人間GATE待ち
**関連文書:** `docs/data/divergence-feasibility-report.md` / `docs/data/divergence-validation-report.md` / `docs/roadmap/divergence-human-gates.md` / `docs/roadmap/prism-completion-acceptance.md`

制限付き原本や顧客実値は本書へ転記しない。参照は資料名・位置・ハッシュのみ。

---

## 0. 再開位置

- **状態(2026-09-07 23:46 JST 再確認):** 状態A(技術実装)完了。状態B(実データ実証)未達。C/D は人間GATE待ち。T-21の技術通し・DB検証・受入表更新は完了、1社実データ受入は未完了。今回の差分・証拠は §8。
- **次の実行可能タスク:** T-12(主実証アダプター)— H-02-1(IFVI 方法論PDF、Eq.3-5)/ H-02-2(汚染の第2手法原本)のいずれかが提供された時点で再開。それまでの実行可能作業はない(§7.4 により探索を一旦閉じた)。
- **blocked 解除条件:** H-02 の原本提供 → T-12 →(実データ通過の追加確認)T-13 → T-18 の実証欄更新 → H-04/H-05/H-07。
- 現在の作業差分: `git status --short` で確認。コミットはユーザー専権のため行っていない。設定変更: `vitest.config.mts` / `vitest.db.config.mts` / `eslint.config.mjs` に `.claude/worktrees` 除外を追加、`RESULT_SCHEMA_VERSION` 11。

## 1. タスク台帳

| タスク | 状態 | 成果物 | 証拠(テスト・コマンド) | 残件・依存 |
|---|---|---|---|---|
| T-01 ベースライン診断 | done | `packages/core/src/divergence/diagnostics/baseline-water-case.{ts,test.ts}` | `npx vitest run packages/core/src/divergence/diagnostics` 3件通過(旧エンジン時点、2026-09-06 13:06、作業差分なし=HEAD 94b4a0b) | 新エンジン切替後に新意味論の期待値へ更新(旧値は §2 に履歴として保持) |
| T-02 要件・設計判断の改訂 | done | 本書 §3、`docs/requirements/m4-divergence-decomposition.md`(§0.3/§2.1/§4.2/§5 F-1・F-3/§5.6〜5.9/§10 U-7/付録)、`docs/decisions/design-rationale-log.md` D-130〜D-138 | 文書差分(2026-09-06) | — |
| T-03 比較対象とゼロ意味の型 | done | `types/comparison.ts`、`divergence/comparability.ts`(`compareSubjects` / `checkComparability` / `comparePathways`) | `comparability.test.ts` 24件 | 拠点の水源種別は `unknown` 明示(H-02-4) |
| T-04 因果経路・被覆プロファイル | done(技術対応) | `types/comparison.ts` `CausalPathway`、`monetization/trace/pathway-mapping.ts`(`WATER_PATHWAYS`、`pathway-mapping-v1`) | `build-trace.test.ts` | VFes の AoP(resource_availability vs ecosystem_quality)は `pending_domain_review` → H-01 |
| T-05 再生可能な計算トレース | done(LIME3・IFVI・代替費用。他5プラグインは汎用フォールバック) | `types/trace.ts`、`trace/evaluate-trace.ts`、`monetization/trace/{build-trace,pathway-mapping}.ts`、`lib/data/lime3/water-coefficients.ts` | `trace/evaluate-trace.test.ts` 6件、`build-trace.test.ts` 15件、`water-coefficients.test.ts` 9件(統合化係数 4通り 23,696.265、比 2.56623 / 2.5833) | Eq.3-5 は `not_implemented_formula_published`(H-02-1)。VFaccess 時間列 `not_published` |
| T-06 比較レシピレジストリ | done(基盤) | `types/recipe.ts`、`divergence/recipes/{registry,synthetic-interaction}.ts` | `registry.test.ts` 9件 | 本番レジストリは実データレシピ(T-11/T-12)投入まで空 |
| T-07 真正なShapley評価器 | done | `divergence/shapley.ts`(部分集合の重み付き和・メモ化・予算)、`divergence/counterfactual.ts`(全 v(S) の実式再実行・順序非依存検証・F 縮小) | `shapley.test.ts` 17件、`counterfactual.test.ts` 10件 | — |
| T-08 加法分解と停止条件 | done(エンジン) | `divergence/mode-selection.ts`、`pairwise-decomposition-v2.ts` | `mode-selection.test.ts` 9件、`pairwise-decomposition-v2.test.ts` | 完了条件の実データ手法間ペアは T-11/T-13 で確認 |
| T-09 残差の構造化 | done | `divergence/residual.ts`、`narrative-v2.ts` | `residual.test.ts` 9件、`narrative-v2.test.ts` | — |
| T-10 候補マトリクス | done(初版) | `docs/data/divergence-feasibility-report.md` §1〜§4・§6 | 文書差分(2026-09-06) | 水: 条件4 pending(H-02-1/H-02-4)。汚染: 第2手法 H-02-2/H-03。気候・LIME3 表層水/地下水・IFVI 日本ゼロを負例に固定 |
| T-10a 早期成立性検証 | done | `packages/core/src/divergence/diagnostics/feasibility-lime3-water.{ts,test.ts}`(vitest 診断。`@core` エイリアス前提のため独立スクリプトにしない) | 5候補: 成立1(LIME3 世界平均 vs 日本、完全分解・寄与倍率 2.56623・残差0、**intra_method_variant のため B 不算入**)/ ゼロ寄与2(LIME3 vs VFes 乗法部分分解 r=5.387084、LIME3 vs VFnutrition 加法 R=−57,761.172 円)/ 比較不能1(表層水 vs 地下水 `different_subject`)/ データ待ち1(代替費用 vs VFaccess `no_numerizable_factors`、金額差 −27,900,000 円)。独立検算12件一致 | 手法間の非ゼロ寄与は未達(H-02-1/H-02-2 依存)。§7.4 により探索を一旦閉じる |
| T-11 水の負例 | done | `divergence/recipes/{lime3-water-perspective,lime3-water-endpoint,lime3-vs-ifvi-welfare-water,replacement-cost-vs-vfaccess,trace-swap,lime3-water-common}.ts`、`diagnostics/baseline-water-case.{ts,test.ts}`(V2) | 手法間4ペア: 停止1(代替費用 vs VFaccess)・加法2(LIME3 vs VFnutrition/VFdisease、寄与0・残差=金額差・published_zero 保持)・乗法部分分解1(LIME3 vs VFes、地理較正ゼロ寄与、knownUnquantified 5件)。内訳分析1件(IFVI Eq.2、mixesValueConcepts)。内訳間ペア0件。§6.5: 比較可能率 4/4、数値分解成立率 3/4、要因別非ゼロ寄与0、未分類残差率0 | `lime3-water-endpoint` は本番経路では到達しない(同一親手法はペアにしない)。診断専用 |
| T-12 主実証アダプター | blocked | — | — | 第2手法の実係数(同一物質・媒体)未入手 → H-02/H-03 |
| T-13 M3→M4接続 | done | `divergence/subject.ts`(`buildComparisonSubject`)、`monetization/breakdown-specs.ts`、`pipeline/valuation-pipeline.ts`(V2)、`ledger/assumption-entry.ts`(`deriveM4DecompositionPayload` V2) | `valuation-pipeline.test.ts`・`pipeline/integration.test.ts`・`ledger/integration.test.ts` 更新。取込→分解・停止まで値の手動コピーなし | T-12 完了後に同経路で実データ通過を追加確認 |
| T-14 保存・版管理 | done | `RESULT_SCHEMA_VERSION` 10→11、`lib/demo/build-recalculation-hash.ts`(`m4_recipeRegistryVersion`/`m4_toleranceVersion`/`m4_subjectRuleVersion`/`m4_pathwayMappingVersion`/`m4_f3ThresholdVersion`/`m4_f8ThresholdVersion`)、`lib/pipeline/public-result.ts`(トレースの係数リテラル値・ステップ出力値・差し替え前後値を `valueRedacted` で省略)、`lib/demo/result-schema-version.test.ts` | 版変更でハッシュ変化、f3/f8 有効・無効の区別、旧形式読出しで落ちない | DB テストは docker 未起動のため未実行 |
| T-15 情報設計 | done | `app/valuation/view-model.ts`(結論→含意→数値寄与→既知差異→残差と次アクション→監査ドリルダウンの純関数群)、`app/components/labels.ts`(ゼロ意味6区分・停止理由・含意・要因8区分・Availability 等) | `app/valuation/view-model.test.ts` 36件 | 初見利用者の把握確認は H-04 |
| T-16 画面実装 | done(技術通し) | `app/analysis/page.tsx`(URL 状態 `issue`/`pair`/`unit`、手法間ペアと内訳分析の分離、監査ドリルダウン)、`app/valuation/page.tsx`(要約カード+`/analysis` 導線)、`docs/data/screenshots/divergence-2026-09-06/` 8枚 | 2026-09-06 15:04 別ポート 3100 でブラウザ確認: コンソール/hydration エラーなし、横スクロールなし、存在しない組合せは 404。確認項目は validation-report「UIスクリーンショット」節 | 狭幅は 500px 相当(390px は resize 不安定で未再現)。ウォーターフォール描画はデモ実データでは非表示条件のため合成テストのみ |
| T-17 数理・ドメインテスト | done(技術経路全体) | `divergence/*.test.ts`(新規122件)、`trace/*.test.ts`、`monetization/trace/build-trace.test.ts`、`lib/demo/result-schema-version.test.ts`、`lib/demo/divergence-end-to-end.test.ts`、`app/valuation/view-model.test.ts` | 2026-09-06 15:10 `npm test` 127 files / 801 tests 通過、`npm run test:db` 本体 85件通過(worktree の旧コピー1件のみ失敗→除外設定追加) | 実データでの非ゼロ寄与(T-12)は未達のため、その検証項目は状態B再開後 |
| T-18 実証レポート | done(**未完了報告**として作成) | `docs/data/divergence-validation-report.md`(§3.3 条件充足表、T-10a 5候補、§6.5 指標、負例、再現コマンド、版・ハッシュ、技術限界、GATE 一覧、B 未達の理由と不足資料) | 診断 JSON との照合(比較可能率 1.0、成立率 0.75、非ゼロ寄与 0、残差分布、2.56623)。係数生値の転記なしを確認 | 状態B 未達(手法間の非ゼロ寄与 0 件、10件コーパス未構成)。UI スクリーンショット欄は T-16 後に追記 |
| T-19 業務価値検証資料 | done(資料) | `docs/roadmap/divergence-human-gates.md` §4(シナリオ・A/B構成・質問票・変更記録フォーム・判定基準・5点様式) | 文書差分(2026-09-06)。架空数値は台帳 §2 の現行値とプレースホルダーへ置換済み | 通過判定は H-04(人間)。B 側の数値は T-18 後に転記 |
| T-20 商用利用条件 | done(資料) | `docs/roadmap/divergence-human-gates.md` §5(利用条件表 10件×8項目・派生結果の論点・ライセンス状態の扱い・5点様式) | 文書差分(2026-09-06) | 通過判定は H-05(人間)。IFVI/WDPA/ESVD/CE Delft/IFVI GVFD は書面回答待ち |
| T-21 全体受入 | in_progress(技術通し検証 done・受入表更新中) | `docs/roadmap/prism-completion-acceptance.md`、`lib/demo/divergence-end-to-end.test.ts` | 2026-09-06 14:43 `npx vitest run lib/demo/divergence-end-to-end.test.ts` 6件通過: V2 分解(手法間4・内訳1・内訳間ペア0)、全レコードにトレース・ゼロ意味、再計算ハッシュに M4 V2 の版6種、台帳 M4 decomposition 4件(decomposed 3 / stopped 1)、選択理由の保存と再読出し(台帳 `representative_value_selection`)、交換価値の選択変更で財務接続が変化・VFaccess(公表0)選択時は対策案の出典差し替え警告・厚生価値選択は投資判断へ流れない、開示検証が最後まで通る | 1社実データ受入は未完了(GAP-04 範囲外、H-02/H-03/H-05/H-07)。旧run保持は DB 層(append-only)の既存テストに依存し docker 未起動のため未実行 |

## 2. T-01 ベースライン(旧エンジン、履歴として保持)

実行: `npx vitest run packages/core/src/divergence/diagnostics`(2026-09-06、HEAD 94b4a0b、作業差分なし)。
入力: 物理量 45,000 m³(デモ既定値・実測値ではない)、PPP 94.46 円/国際ドル、LIME3 0.0135886259 US$/m³(AIST-IDEA v4.0 001511000 表層水・取水・消費国日本・統合化)、IFVI JP VFnutrition/VFdisease/VFaccess = 0.00・VFes = 2.97 USD2024/m³(Appendix D Table D1)、代替費用 620 円/m³(デモ既定値)。
版: algorithmVersion shapley-v1、cicesMatchLevel group、aopMappingVersion aop-mapping-v1、f3-v1、f8-v1、calibrationSetVersion ifvi-water-consumption-v2。

| 項目 | 値 |
|---|---|
| ValuationRecord 数 | 6(exchange: replacement-cost, VFaccess / welfare: lime3-water, VFnutrition, VFdisease, VFes) |
| ゼロ値レコード | VFnutrition, VFdisease, VFaccess(3件) |
| ペア総数 | 7(手法間 4・内訳間 3) |
| F-1 加法フォールバック(寄与空配列) | 6(手法間 3・内訳間 3) |
| 乗法分解 | 1(LIME3水 vs VFes、F-4 併発) |
| 符号乖離 | 0 |
| 要因別非ゼロ寄与件数 | endpointCoverage 0 / discountRate 0 / geographicCalibration 0 |
| 乗法ペアの残差 | LIME3水 57,761.17 円 vs VFes 12,624,579 円、ln 比 −5.387084、説明済み 0、残差 −5.387084(乖離の100%が残差) |

指示書 §1.2 の作成時記録(7ペア中6ペアがF-1、残る1ペアが説明率0%)と一致。版差なし。

## 3. T-02 決定(実装前に決着)

| # | 論点 | 決定 | 根拠 |
|---|---|---|---|
| 1 | F-3 の被覆外断定 | 数値安定性の診断値 `magnitudeGapRatio` と、資料根拠の `not_covered`(ゼロ意味・被覆経路)を分離。F-3/F-8 の省略判定は H-06 未承認のため新経路では適用しない(`diagnostics.f3ThresholdApplied: false`) | 指示書 §6.3-7、§9.6 H-06 |
| 2 | f3/f8ThresholdVersion | 新経路は `"f3-disabled-pending-h06"` / `"f8-disabled-pending-h06"`。旧run の `f3-v1`/`f8-v1` と再計算ハッシュが区別される | T-02-9 |
| 3 | `ValuationRecord.recalculability` | トレースへ吸収。フィールドは後方互換のため残し、`trace.endpointBreakdown` / `trace.damageTimeProfile` から機械的に導出したミラーとする。M4はトレースだけを読む | T-02-10 |
| 4 | `MAX_RECORDS_PER_GROUP` | 例外を廃止。手法間比較(親手法数 ≤ 5)と同一手法の内訳分析を別の分析単位に分離。超過ペアは `group_limit_exceeded` として結果に残す | T-02-11、§4-8 |
| 5 | 数値許容誤差 | `divergence/tolerance.ts` `tol-v1`(money atol 1e-6 / rtol 1e-9、log atol 1e-12 / rtol 1e-9、scale = max|値|) | §6.5 |
| 6 | 比較レシピ形式 | コードプラグイン(`divergence/recipes/*.ts`)。レジストリが版・ハッシュ・レビュー状態・testOnly を管理 | §5.4 |
| 7 | IFVI Eq.3-5 | 方法論PDFが手元にないため式を確認できず未実装。`siteCorrection: not_implemented_formula_published` として記録し H-02 へ | T-05.6 |
| 8 | 二重コード体系 | `CausalPathway` は既存 `aopCode`/`metric`/`cicesRef`/`aopSourceLabel` を包含する拡張。第2体系を作らない | §5.2 |
| 9 | 結果型の移行 | 新runは `DivergenceDecompositionV2`(`schemaVersion: 2`)。旧型は `Legacy` として残し、`RESULT_SCHEMA_VERSION` を 10→11 に上げて旧runを自動再計算 | T-14 |

## 4. 読んだ Next.js ガイド(app/ 変更前に必須)

| 日付 | ファイル | 目的 |
|---|---|---|
| 2026-09-06 | `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` | Server/Client Components の境界(page はサーバー、対話は client) |
| 2026-09-06 | `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` | `<Link>` と prefetch、動的ルートの扱い |
| 2026-09-06(フェーズ2) | `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` | searchParams は Promise(`await searchParams`)。両ページとも Server Component のまま |
| 2026-09-06(UI 実装) | `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`、`03-layouts-and-pages.md`、`04-linking-and-navigating.md`、`06-fetching-data.md` | T-15/T-16 の `app/analysis`・`app/valuation` 再実装前に読了(両ページとも Server Component、`await searchParams`、`<Link>` で URL 状態を遷移) |

## 5. 検証履歴

| 日時 | コマンド | 結果 | 差分 |
|---|---|---|---|
| 2026-09-06 12:58 | `npx vitest run packages/core/src/divergence packages/core/src/monetization packages/core/src/pipeline` | 59 files / 269 tests 通過 | HEAD 94b4a0b、差分なし |
| 2026-09-06 13:06 | `npx vitest run packages/core/src/divergence/diagnostics` | 3件通過 | T-01 追加のみ |
| 2026-09-06 13:53 | `npx tsc --noEmit`(worktrees 除外)/ `npx vitest run packages lib app` / `npx eslint packages/core/src lib app` | tsc 空 / 202 files・1146 tests 通過 / eslint 空 | フェーズ1(型契約・計算コアv2・トレースアダプター・文書)の作業差分、未コミット |
| 2026-09-06 14:40 | `npx tsc --noEmit` / `npx vitest run packages lib app` / `npx eslint packages/core/src lib app` / `npm run build` | tsc 空 / 本体 205 files・1181 tests 通過(`.claude/worktrees/` 配下の旧コピー7件のみ失敗→ vitest/eslint の除外設定を追加)/ eslint 空 / build 成功 | フェーズ2(実データレシピ・T-10a・T-13・T-14・lib/app 最小適応)の作業差分、未コミット。`npm run test:db` は docker 未起動のため未実行 |
| 2026-09-06 15:10 | `npm run db:up && npm run db:migrate && npm run test:db` / `npm test` / `npm run typecheck` / `npm run lint` / `npm run build` | test:db 本体 85件通過(持続化の往復テストで負ゼロ `-0` の不一致を検出し `pairwise-decomposition-v2.ts` で正規化して解消)/ npm test 127 files・801 tests 通過 / typecheck 空 / lint 空 / build 成功 | フェーズ3(UI・T-18・T-21 通し検証)までの全作業差分、未コミット。`prism-db` コンテナは起動したまま(`npm run db:down` で停止可) |

## 6. 変更影響表(T-01.3)

| 変更対象 | 影響先 |
|---|---|
| `ValuationRecord`(`trace` 追加) | `build-valuation-records.ts`、`lib/db/serialize.ts`(jsonb `data` に収まる)、`lib/pipeline/public-result.ts`(トレース内の係数値は再配布不可→出力API では省略) |
| `MethodOutput`(`zeroMeaning`/`modelSteps`/`traceMeta`) | 各プラグイン、`build-valuation-records.ts` |
| `PairwiseDecomposition` → `PairwiseDecompositionV2` | `valuation-pipeline.ts`、`assumption-entry.ts`、`lib/pipeline/valuation-insights.ts`、`open-tasks.ts`、`app/valuation/*`、`app/analysis/page.tsx`、`app/components/labels.ts` |
| `DivergenceDecomposition` → V2 | `lib/db/serialize.ts`(列は不変)、`lib/demo/run-demo-pipeline.ts`、`lib/views/pipeline.ts` 経由の全画面 |
| 再計算ハッシュ入力(レシピ版・許容誤差版・同一性規則版・f3/f8 disabled) | `build-divergence-decomposition.ts`、`lib/demo/build-recalculation-hash.ts`、`ledger` payload |

## 7. 既存テストが保証すること/しないこと(T-01.4)

- 保証する: 価値概念分割、F-1/F-2/F-3/F-8 の短絡、地理較正の倍率、対数Shapley の効率性(k≤3、固定倍率)、F-9 表示規則、代表値選択、分位点幅の分解、M3 reconciliation、ライセンスゲート、再計算ハッシュの安定性。
- 保証しない(2026-09-06 開始時点): 反実仮想の実式再実行、加法Shapley、ゼロ意味の区別、比較対象の同一性、比較レシピの版、部分分解の効率性、A/B 反転、全順序平均との一致(相互作用あり)、評価回数予算、内訳ペアの分析単位分離、旧run の安全な読出し。
- フェーズ1完了後(13:53)に保証へ移った項目: 上記のうち旧run読出し・実データ成立を除くすべて(`divergence/*.test.ts` 新規122件、`build-trace.test.ts`、`water-coefficients.test.ts`)。残る未保証: 旧run の安全な読出し(T-14)、実データでの成立(T-11/T-12)。

## 8. 2026-09-07 再開: T-21 受入表の照合

開始時点: HEAD `4032238`、作業差分なし。コード変更なし。§1のT-21行は2026-09-06時点の履歴として保持し、現在の状態は本節を優先する。

| タスク | 状態 | 成果物・証拠 | 残件 |
|---|---|---|---|
| T-21 技術通し・受入表更新 | done(技術部分) | `prism-completion-acceptance.md` の古い「実装中」「DB未実行」を現行コードと検証結果に照合。存在しない実装パス、レシピ登録数、指示書参照、重複節番号、WDPAをCC BYとする既存記載の誤りを修正 | 1社実データ受入・H-07は未完了 |
| T-14 保存・旧run保持の再確認 | done(技術部分) | `lib/db/persistence.db.test.ts` を含むDBスイート通過。旧形式のrunから新runを積み、旧runを残すテストを確認 | 顧客実データ受入とは別 |
| T-12 主実証アダプター | blocked(継続) | リポジトリ内の資料名とH-02依頼一覧を照合。IFVI FIN_04方法論PDF・汚染第2手法原本はリポジトリ内で見つからず | H-02-1またはH-02-2の提供後に再開。外部保管先は未指定 |

| 実行日時 | コマンド | 結果 | 実行時点 |
|---|---|---|---|
| 2026-09-07 23:46 JST | `npm test -- lib/demo/divergence-end-to-end.test.ts lib/demo/result-schema-version.test.ts packages/core/src/divergence/diagnostics` | 4 files / 32 tests 通過 | HEAD `4032238`、コード差分なし |
| 2026-09-07 23:46 JST | `npm run test:db` | 8 files / 47 tests 通過。既存 `prism-db` が healthy | 同上 |

検証件数は現在のテスト設定による今回の実行結果。§5の過去の件数を今回の件数として転記しない。型検査・lint・build・UI再撮影は、コード変更がないため今回は再実行していない。指示書冒頭とH-04/H-05の資料準備状態も台帳に合わせた。状態B・C・Dを完了へ変更せず、新しい契約判断・マッピング判断も行っていない。
