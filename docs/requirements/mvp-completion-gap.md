# MVP完成までのギャップ — 要件定義

**対象:** M1〜M8の実装済みコード全体 + 統合層(`packages/core/src/pipeline/`・`lib/`・`app/`)
**参照元:** `docs/concept-v2.md`、`docs/roadmap/build-plan.md` §1 / §5 / §6 / §7 / §10、`docs/requirements/m1〜m8`
**status:** ドラフト(GAP-01〜GAP-21を提示。着手順・スコープはユーザー判断待ち)
**最終更新:** 2026-08-08(本文)/ **2026-08-15 追記:GAP-11がNGFSデータ取得・気候カテゴリ拠点の追加により解消済み。各GAP冒頭の状態タグを参照**

**2026-08-10 現状確認(コード監査による):** 本文提示から2日で、着手順(§6)第1〜3波の大半が実装済みになっている。**GAP-01・02・03・06・08・09・10・12・13・16・17・18は解消済み。**GAP-07・15は部分解消(下記参照)。GAP-04(契約待ちの一部)・GAP-05(AI提供者決定待ち)・GAP-11(NGFS未取得)・GAP-14(スコープ判断待ち)は、外部データ・契約・人間の判断が前提のままのため、コードでは解消できない。詳細な検証結果は各GAPの節に追記した。

**2026-08-11 追記:** E-1(気候カテゴリを追加)・E-3(AnthropicClaude APIを使う)・GAP-15残作業(サブドメイン方式)の3点の人間判断が確定したことを受けて、**GAP-05・GAP-14・GAP-15(部分解消→解消)を実装した。**GAP-05はDPA締結・顧客同意取得という運用開始前の人間作業を残す(詳細は各節)。

**2026-08-15 追記:** NGFS Climate Scenarios Data Set v5.1を取得し、GAP-11を解消した。GAP-14で追加した気候プラグインがデモのどの拠点にも接続されていなかったことが判明したため、気候カテゴリ専用の拠点(site-070)を新規追加した。詳細はGAP-11節・design-rationale-log D-127/D-128。

**2026-08-11 追記2:** §4 C-4(CICES V5.1確認、D-125で解消)と §7 判断待ちリストの一部(上記の3点)が、この追記の後も「未着手」「未決」のまま本文に残っていたのを修正した。**この文書は`docs/README.md`「現在地」・design-rationale-log.mdと同じ状態を別の言葉で書いているため、1箇所を更新したら他も見直すこと。**

---

## 0. 判定

### 0.1 結論

**「設計文書に書かれた計算ロジックは充足している。プロダクトとして成立させる層が不足している。」**

- `packages/core/`(M1〜M8のドメインロジック)は、要件定義書D-項目に対して**ほぼ完全に実装されている**。テスト291件通過、`tsc --noEmit`・ESLint通過。要件定義書の数値例をテストで再現している箇所も多い
- 一方、**build-plan §1が定める「完成の定義」(1社分の実データがM1→M8を最後まで通る)は未達**である。理由は計算ロジックの欠落ではなく、(a)実データを入れる経路がない (b)入れたデータが保存されない (c)外部データ照会の実装とライセンスがない、の3点

### 0.2 充足しているもの(再実装不要)

| 領域 | 状態 |
|---|---|
| M3 貨幣化 | 地理較正5項・適合度ティア・モンテカルロ1万回・3プラグイン・集計整合性検証・トルネード図。**充足** |
| M4 乖離分解 | 価値概念分割・対数空間Shapley・F-0〜F-9・効率性公理の数値検証・読み下し文・グループ内N≤5の強制。**充足** |
| M6 意思決定 | 自然調整後NPV・★判定3ケース・拘束方式4種の判別可能ユニオン・変更履歴。**充足** |
| M1/M2 | 5基準判定・MaterialIssue組み立て・優先度算定・深度昇格・除外理由記録。**充足**(GAP-13は2026-08-10解消) |
| M5 | 2ブリッジの型レベル分離・非GAAPラベル必須化・未内部化コスト/内部化率・自然債務。**充足**(GAP-10・GAP-11とも解消) |
| M7 | 段階3・4のルールベース判定(G1〜G4・推奨アクション3種・意図的判断記録)。**規定スコープ内では充足**(GAP-05は未着手) |
| M8 | AssumptionEntryの自動生成(payload導出10種)・版レジストリ・ライセンスゲート関数。**充足**(GAP-06/08は解消。GAP-07は係数値自体の永続化のみ既知の制約として残る) |
| 除外事項ガード | X1〜X7の違反は監査済み(D-104)。厚生価値/交換価値の合算は型レベルで不能 |

### 0.3 不足しているものの分類

| 重大度 | 意味 | 該当 |
|---|---|---|
| **S1** | build-plan §1「1社分の実データが通る」を直接ブロックする | GAP-01〜05 |
| **S2** | 各要件定義書の完了条件に未達、または仕様と実装が乖離している | GAP-06〜14 |
| **S3** | パイロット運用・監査説明で問題になる | GAP-15〜18 |
| **S4** | 意図的な後回し(記録のみ。今回作らない) | GAP-19〜21 |

---

## 1. S1 — 実データ通しをブロックするもの

### GAP-01 永続化層が存在しない 【2026-08-10 解消済み】

**解消の確認:** `d4ac836 feat: 永続化基盤(Docker + Postgres + Drizzle)を導入する (GAP-01/15/16)` で対応済み。`lib/db/client.ts`が`drizzle-orm/node-postgres`経由の実Postgres接続を持ち、`lib/db/schema.ts`に`pipeline_run`・`assumption_entry`・`versioned_parameter_set`等の追記専用テーブル(`APPEND_ONLY_TABLES`でUPDATE/DELETE権限をDBロールから剥奪)が定義されている。`lib/pipeline/execute-run.ts`の`executeAndPersistRun`/`getOrCreateLatestResult`が実際の読み書き経路になっており、ページはDBから最新runを読むだけ(再計算しない)。モンテカルロのシード(`DEFAULT_RNG_SEED`)も`pipeline_run.rng_seed`列に永続化される。**サーバーを再起動してもデータが残ることを確認済み(D-111・D-112)。**

**以下は当初の記述(履歴として残す):**

**現状:** 全状態が Node プロセス内メモリ(`lib/demo/site-store.ts`・`lib/demo/interaction-store.ts`)。サーバー再起動で消える。各ページは毎リクエスト `runDemoPipeline()` をゼロから再実行しており、M3のモンテカルロ乱数はデモ層でシード固定して辻褄を合わせている(D-103)。

**なぜ必要か:** M8の存在理由(継続理由=前提と実績の照合履歴、構想書9.3)は、記録が残ることが前提である。またM4「手法変更時は前年度手法での再計算値を並記」・M6 `bindingMechanismHistory`・M8「AssumptionEntryは追記のみ(D-5)」は、いずれも**過去のレコードが残っていることを前提にした仕様**であり、メモリ揮発では成立しない。

**作るもの:**
1. 永続ストア(SQLite または Postgres)。スキーマは `packages/core/src/types/` の型をそのまま写す
2. 追記専用テーブル:`AssumptionEntry`・`VersionedParameterSet`・`BindingMechanismChangeEntry`(UPDATE/DELETE経路を用意しない。M8 D-5)
3. 計算結果テーブル:`Site`・`NatureInterface`・`MaterialIssue`・`ValuationRecord`・`DivergenceDecomposition`・`DecisionRecord`・`GapFinding`。**再計算のたびに上書きせず、`recalculationHash` 単位で新レコードとして積む**(旧版係数での再計算=GAP-07の前提)
4. モンテカルロ結果は生成時に永続化する。`Math.random` の差し替え(D-103)を廃し、`combineUncertainty()` に rng を注入できる公開APIを `buildValuationRecords()` に追加する

**完了条件:** サーバーを再起動しても、投入した拠点・選択した代表値・拘束方式・意図的判断がすべて残っており、同一の `recalculationHash` を持つレコードが再計算なしで読み出せる。

---

### GAP-02 実データを投入する経路がUIにない 【2026-08-10 解消済み】

**解消の確認:** `387ff7e feat: 実データ取込UIを実装する (GAP-02)` で対応済み。`app/intake/page.tsx`・`app/intake/import-form.tsx`・`app/intake/actions.ts`が3ファイル(拠点一覧CSV・NatureInterface調査結果CSV・エンゲージメント設定JSON)のアップロードUIを提供し、`loadCompanyDataset`(`lib/intake/`)を呼び出して`executeAndPersistRun`に接続している(D-119、部分取込をしない設計)。`app/sites/add-site-form.tsx`(1件ずつの手入力)は選択肢として残っている。

**以下は当初の記述(履歴として残す):**

**現状:** `lib/intake/`(CSVパーサ・拠点一覧テンプレート・NatureInterface調査結果テンプレート・エンゲージメント設定JSON・統合ローダー)は実装済みでテストも通っているが、**`app/` からは一度も呼ばれていない**(`grep` で参照ゼロ)。UIから拠点を追加する経路は `app/sites/add-site-form.tsx` の1件ずつの手入力フォームのみ。

**なぜ必要か:** build-plan §6は「データ取込のエラーハンドリング:実データは汚れている前提。**どこで落ちたかが分かること**」をP3の必須項目としている。`docs/data-intake-guide.md` を書いた相手(顧客の非エンジニア)が、実際にファイルを渡せる先が存在しない。

**作るもの:**
1. 3ファイル(拠点一覧CSV / NatureInterface調査結果CSV / エンゲージメント設定JSON)のアップロードUI
2. `loadCompanyDataset()` の検証結果を**行単位で表示する**取込プレビュー画面。エラー行は「何行目の何列がなぜ不正か」を出し、正常行のみの部分取込を許すか全件却下するかを利用者に選ばせる
3. `SiteIngestionError`(既存型)をUIに露出する。現在 `assessment-pipeline` は返しているが表示されていない

**完了条件:** `docs/data-intake-guide.md` に従って記入した3ファイルを画面からアップロードすると、拠点が登録され、不正行は行番号・理由付きで一覧表示される。

---

### GAP-03 財務パラメータの入力インターフェースが存在しない 【2026-08-10 解消済み】

**解消の確認:** `aa8453b feat: 財務パラメータ入力UIを実装し、pendingを実際に通す (GAP-03)` で対応済み。`app/financial-bridge/financials-form.tsx`(報告営業利益・Net Debt/EBITDA・内部化済みコスト・減損閾値等)、`app/decision/parameters-form.tsx`(通常NPV・割引率・期間・承認閾値、未定なら空欄可)が実装され、`approvalThreshold`/`verdict`の`pending`状態が実際に画面を通ることをD-120が記録している。

**以下は当初の記述(履歴として残す):**

**現状:** 以下がすべて `lib/demo/company.ts` / `run-demo-pipeline.ts` のハードコード値である。

| 値 | 現状 | 参照 |
|---|---|---|
| 報告営業利益 | `baselineNpv.value` を流用(**別概念の値を代入している**) | run-demo-pipeline.ts:220,235 |
| 承認閾値 | `BASELINE_NPV.value + 25,000,000` | run-demo-pipeline.ts:215 |
| 通常NPV・割引率・期間 | `BASELINE_NPV` 定数 | company.ts |
| 内部化済みコスト | `2,000,000` 固定 | run-demo-pipeline.ts:218 |
| 内部化確率 | 3シナリオ均等 1/3・period=5 固定 | run-demo-pipeline.ts:226-228 |
| 減損テスト閾値 | `50,000,000` 固定 | run-demo-pipeline.ts:237 |
| レバレッジ比率・インタレストカバレッジ | before/after とも固定値 | run-demo-pipeline.ts:238-239 |

**なぜ必要か:** M6 D-10(段階的開示)は「承認閾値・通常NPVが未入力でも自然調整後NPVのレンジまでは表示し、★判定のみ `pending` にする」という設計を採用している。**この設計の要は「未入力状態が存在すること」だが、現在は入力欄自体がないため `pending` 状態を一度も通らない。**design-rationale-log R-1が営業難度の核心と位置づけた入力インターフェースが、まだ設計されていない。

**作るもの:**
1. **企業単位の財務入力画面**:報告営業利益・Net Debt/EBITDA・インタレストカバレッジ・減損テスト前提閾値・全社割引率。M5 D-4.4の「開示単位で1つの割引率」に対応
2. **決定単位の入力画面**:通常NPV・割引率・期間・承認閾値・`source`("manual_entry" | "csv_upload")。M6 §1の `BaselineNpvInput`・`ApprovalThreshold` にそのまま対応
3. **内部化確率の設定画面**:3シナリオ × 対象年。初期値は均等割り(1/3)で「これは中立的な初期値であり推奨ではない」と明示(M5 D-4.3)
4. 未入力時は `approvalThreshold: "pending"` / `verdict: "pending"` を実際に通し、★判定欄を「承認閾値を入力すると判定が確定します」に差し替える(M6 D-10のUI含意)

**完了条件:** 承認閾値を空のまま拠点を評価すると `verdict = "pending"` で表示され、判定件数がカウントされない。閾値を入力すると `does_not_cross` / `crosses` に確定し、その瞬間にカウントされる。

---

### GAP-04 外部データ照会の実装がない(ジオコーディング・空間レイヤ)

**現状:** `Geocode`・レイヤ照会はいずれも注入インターフェースのみ(D-89〜D-91)。実体は `lib/demo/company.ts` の `demoGeocode` と `lookup: () => true` の固定値。

**なぜ必要か:** M1完了条件「拠点CSVを投入するとMaterialIssue群が生成され、各々に感応度スコアが付く」は、**座標を持つCSVを前提にすれば現状でも成立するが、実データでは座標がない拠点が必ず出る**(build-plan §7.1「よくある詰まり方」の筆頭)。またLocate(拠点座標 × 保護区・生態系レイヤ)が固定値である限り、感応度スコアは実質ダミーである。

**作るもの:**
1. ジオコーディングアダプタ(住所→座標)。M1 D-3の3段階(座標あり→そのまま / 住所のみ→ジオコーディング / どちらもなし→除外理由を記録して除外)を実データで通す
2. WDPA(IBAT Alliance経由)・Aqueduct・ENCORE のアダプタ実装。**ただしライセンス契約が前提**(§4 C-2)
3. ENCORE参照画面へのCC BY-SA 4.0帰属表示(M1 D-4。契約不要・低コストの義務)

**完了条件:** 座標なし・住所ありの拠点を含むCSVを投入し、ジオコーディングを経て感応度スコアが算出される。住所もない拠点は `excluded: true` + 除外理由付きでMaterialIssueが残る。

**ブロッカー:** 2以降は§4のライセンス契約が必要。契約前は GAP-08 のライセンスゲートで `pending` として扱う(=先に GAP-08 を実装すべき理由)。

---

### GAP-05 M7の段階1・2(PDF抽出・主張タイプ分類)が存在しない 【2026-08-11 実装完了(運用開始前の人間作業が残る)】

**解消の確認:** E-3(AIプロバイダの判断)が「Anthropic Claude APIを事業体名義のAPIキーで使う」で確定したことを受けて実装した。
- `packages/core/src/disclosure/claim-extraction.ts`:AIの構造化出力(`RawExtractedClaim`)を`DisclosureClaim[]`に変換する純粋関数。判定を一切行わない(単体テストあり、APIキー不要で検証可能)
- `lib/pdf/extract-pdf-text.ts`:`unpdf`(pdf.jsベースの純JS実装)でページ単位に抽出。抽出失敗ページは空文字で埋めず`failedPages`に明示する(M7 D-6)
- `lib/ai/extract-disclosure-claims.ts`:Claude API(`claude-opus-5`、`output_config.format`で構造化出力を強制)を呼び、`extractedMetadata`の4フィールドを必ず埋めるかnullにする(M7 D-1)。システムプロンプトに「抽出のみ、判定はしない」制約を明記
- `app/disclosure/actions.ts`の`extractDisclosurePdfAction`・`app/disclosure/pdf-intake-form.tsx`:`/disclosure`画面にPDFアップロードUIを追加
- 抽出結果は新規`InteractionKind: "disclosure_pdf_extracted"`として追記型イベントに保存し、`run-demo-pipeline.ts`が既存の`DisclosureClaim[]`と結合する。**段階3・4(`gap-finding.ts`・`disclosure-pipeline.ts`)は1行も変更していない**(完了条件どおり)
- `extractionConfidence: "low"`の主張は`/disclosure`画面のカードに「AI抽出確信度低・要レビュー」バッジを表示する(GAP-05項3の簡易版。専用レビューワークフローではなく既存カードへのバッジ表示にとどめている)

**運用開始前に残る人間の作業(この実装では完了しない):**
1. Anthropic社とのデータ処理契約(DPA)の確認・締結(顧客の未公表開示PDFを外部APIに送信するため)
2. 顧客への同意取得(開示PDFを外部AIプロバイダに送信することの契約上の明示。B-6)
3. `ANTHROPIC_API_KEY`を事業体名義のAPIキーで発行し、環境変数として設定する(コードにはハードコードしていない)

**以下は当初の記述(履歴として残す):**

**現状:** M7は段階3・4(ルールベース判定)のみ実装。`DisclosureClaim` は `lib/demo/company.ts` に手書きされた固定オブジェクトから供給されている。PDF処理の依存関係はリポジトリに一切ない(`package.json` の依存は next / react のみ)。

**なぜ必要か:** M7完了条件は「**自社の過去開示PDFを投入すると** DisclosureClaim が抽出され、G1〜G4のギャップが検出される」。現状はPDFを投入できない。さらに構想書9.3はM7を「予算科目と締切が存在する唯一の入口」と位置づけており、**導入初日に価値が出る唯一の経路が動かない**ことを意味する。

**作るもの:**
1. PDFテキスト抽出層。抽出失敗ページ(スキャン画像等)は空文字で埋めず、抽出不能として明示(M7 D-6)
2. 段階1(DisclosureClaimの構造化抽出)・段階2(claimTypeの分類)のAI呼び出し。**構造化出力を強制し、`extractedMetadata` の4フィールド(category / quantityMentioned / periodMentioned / scopeMentioned)を必ず埋めるか `null` にする**(M7 D-1。ここが曖昧だと段階3が成立しない)
3. `extractionConfidence: "low"` の主張を人間レビューに回すレビューUI

**実装上の必須制約(build-plan §5.7、AIへの指示に必ず含めること):**
> **AIの役割は抽出に限定する。判定はルールで行う。段階3・段階4にLLMを使わない。**
> 実装後のレビューで、段階3・4のコードパスからAI呼び出しが到達不能であることを確認する。

**完了条件:** 過去の統合報告書PDFを投入すると DisclosureClaim が抽出され、既存の段階3・4がそのまま動作してG1〜G4が検出される。段階3・4のコードは1行も変更されていない。

---

## 2. S2 — 完了条件未達・仕様と実装の乖離

### GAP-06 レコード単位の再計算ハッシュが未実装(placeholder のまま) 【2026-08-10 解消済み】

**解消の確認:** `e63b900 feat: レコード単位の再計算ハッシュを実装する (GAP-06)` で対応済み。`build-valuation-records.ts`・`build-divergence-decomposition.ts`・`build-decision-record.ts`はいずれも`computeRecordHash("vr"|"dd"|"dr", {...})`(実ハッシュ関数)を呼び、methodId・methodVersion・calibration・versions等、実際に計算に入った版情報からハッシュを確定させている(D-113がハッシュ入力の定義を記録)。placeholder文字列は残っていない。

**以下は当初の記述(履歴として残す):**

**現状:** `ValuationRecord` / `DivergenceDecomposition` / `DecisionRecord` の `recalculationHash` はすべて `placeholder:...` を返している(`build-valuation-records.ts:76`、`build-divergence-decomposition.ts:75`、`build-decision-record.ts:69`)。パイプライン層でも上書きされていない。実ハッシュは `computeRecalculationHash()` によるパイプライン全体の1本のみで、これはデモ層でしか呼ばれていない。

**なぜ必要か:** build-plan §4.2は「**すべてのレコードに**再計算ハッシュのフィールドを持たせる」を型定義の完了条件としている。フィールドは存在するが値が入っていない。監査で「このValuationRecordはどの係数版・どの較正パラメータ・どのAoP対応表版で計算されたか」を1レコードから辿れない。

**作るもの:**
- 各 `build*` 関数に、当該レコードの計算に実際に入った版情報(手法プラグイン版・地理較正版・ティア閾値版・AoP対応表版・CICES一致階層・F-3/F-8閾値版)を渡し、`computeRecalculationHash()` と同じハッシュ関数で確定させる
- 呼び出し側が版情報を渡さないとコンパイルが通らない形にする(Optionalにしない。M5 D-6と同じ規律)

**完了条件:** 任意のレコード1件の `recalculationHash` から、そのレコードを生成した全パラメータ版が特定でき、同じ入力で再実行すると同じハッシュになる。

---

### GAP-07 旧版係数での再計算を実行する経路がない 【2026-08-09 対応済み。ただし下記の制約が残る】

**対応した範囲(T-13 / D-118):** `/ledger` に版レジストリ表と旧版パラメータでの再計算比較を実装した。**較正パラメータ**(PPP・所得弾力性・デフレータ・相対価格上昇係数・面積スケーリング)については、過去のrunの値を現在のレコードに当て直して再計算できる。

**残る制約(新規に判明した要件):** **手法の係数値そのもの(IFVIのvalue factor、LIME3の係数等)は、どのレコードにも保存されていない。**`ValuationRecord` が持つのは較正後の中心値と較正パラメータだけで、プラグインに渡した `MethodConfig.externalValueFactors` は永続化されていない。そのため係数の版が変わった場合の差分は再計算できず、`method_version_differs` として明示する(近い値で代用しない、D-15)。

**完全な「旧版係数での再計算」に必要なもの:** 版ごとの係数値の保存。選択肢は2つ。
1. `pipeline_run` に実行時の `MethodConfig` を保存する(最小の変更。runを再現するために必要な入力が揃う)
2. `versioned_parameter_set` に係数値の payload を持たせる(M8 D-3が「値そのものは保持しない」としているため、要件定義の変更を伴う)

**判断が必要:** 1が素直だが、係数値は外部データ(IFVI等)であり、ライセンス上リポジトリ・DBに保存してよいかを契約確認と併せて決める必要がある(`acquisition-runbook.md` B-3)。

**以下は当初の記述(履歴として残す):**

### GAP-07 旧版係数での再計算を実行する経路がない

**現状:** `versioned-parameter-set.ts`(追記のみのレジストリ)と `license-gated-sensitivity.ts` は実装済みで、「旧版係数での再計算はM3の既存計算関数に旧版の値を渡せば実現できる」ことはテストで実証済み(D-97)。しかし**アプリケーションからこれを起動する導線がない**。`app/ledger/page.tsx` はハッシュ文字列とAssumptionEntry一覧を表示するだけである。

**なぜ必要か:** M8完了条件は「**任意のレコードを旧版係数で再計算できる**」。ライブラリ関数の存在は完了条件を満たさない。M8 D-3の具体例(v1のレコードを今のv2で再計算したらどうなるかの比較)が、製品として実行できない。

**作るもの:**
1. 版レジストリ画面:`setId` ごとの版一覧・`effectiveFrom`・`supersededBy`・`changeReason`。版の追加は `changeReason` 必須(M8 D-3)
2. 再計算実行UI:対象レコードと版の組を選び「この版で再計算する」を実行、**現行版の結果と並記**する。上書きしない(GAP-01の追記型ストアが前提)
3. 再計算実行自体をAssumptionEntryとして記録する

**完了条件:** 2026年度のValuationRecordを選び、係数セットv2を指定して再計算すると、v1の値とv2の値が並記され、両者のハッシュが異なることが画面で確認できる。

---

### GAP-08 ライセンスゲーティングがパイプラインに配線されていない 【2026-08-10 解消済み】

**解消の確認:** `1f0e815 fix: 適合度ティア表示とライセンスゲーティングを仕様どおりに修正 (GAP-17/08/13)` で対応済み。`packages/core/src/site/criteria.ts`の`assessCriteria()`が`isLicenseBlocked()`(`types/ledger.ts`)で候補を絞り込み、全候補が`pending_review`の基準は`license_pending`として感応度スコアから除外する(D-110)。`lib/demo/company.ts`のsite-042・site-060のKBA(`licenseMode: "pending_review"`)は今もそのまま宣言されているが、**正しく除外されることを`/sites`画面の実際の表示(「生物多様性の重要性が高い(データ利用契約の確認待ち:IBAT Alliance)」)で確認済み。**

**以下は当初の記述(履歴として残す):**

**現状:** M8 D-4のゲーティング関数は実装済みだが、`assessment-pipeline.ts` からも `criteria.ts` からも呼ばれていない(`grep` で参照ゼロ)。結果として、デモデータで `licenseMode: "pending_review"`(IBAT Alliance契約前)と宣言されているKBAレイヤが、**そのまま `highBiodiversityImportance = true` として感応度スコアに算入されている**(`lib/demo/company.ts:42`)。

**なぜ必要か:** M8 D-4は「WDPA関連のTNFD基準は、契約締結までは `pending` として扱い、**感応度スコアの充足数のカウントに含めない**」と明記している。現在の実装は仕様と逆の挙動をしている。ライセンス未締結のデータを使って算出したスコアが、そうと分からないまま優先度算定(M2)→深掘り昇格→貨幣化(M3)まで伝播する。

**作るもの:**
1. `evaluateCriteriaMet()` の呼び出し経路に `LicenseGate` を通し、`pending_review` の基準を充足数から除外する
2. MaterialIssue に「どの基準がライセンス保留か」を保持し、拠点一覧・評価画面に「生物多様性重要性の判定はライセンス確認待ちのため保留されています(契約確定後に自動反映)」を表示する(M8 D-4の具体例そのまま)
3. 契約締結後の再計算をAssumptionEntryに記録する(「契約締結前は暫定スコアで評価していた」という監査証跡)

**完了条件:** `pending_review` のデータソースに依存する基準が感応度スコアに算入されず、画面に保留表示が出る。ライセンスモードを `embedded` に変えると自動で再計算され、その事実がAssumptionEntryに残る。

---

### GAP-09 M4の代表値選択と「前年度手法での再計算値の並記」が未実装 【2026-08-10 解消済み】

**解消の確認:** `a91b4b8 feat: 代表値選択と、手法変更時の前年度手法での再計算値を実装する (GAP-09)` で対応済み。`recalculatedWithPriorMethod`(`types/divergence.ts`)が`representative-value.ts`で計算され、`app/decomposition/page.tsx`で選択した代表値と並記・差分表示される(D-114)。手法変更時は理由入力が必須。

**以下は当初の記述(履歴として残す):**

**現状:** `DivergenceDecomposition.representativeValueSelection` はコア実装で一度も埋められない(常に undefined)。代表値はデモ層の `interaction-store` が独自に保持し、変更理由も `m4ChangeLogByMaterialIssue` としてデモ層にだけ存在する。`recalculatedWithPriorMethod`(前年度手法での再計算値)は**リポジトリ全体で参照ゼロ**。

**なぜ必要か:** 構想書9.3のM4節が明示的に要求している:
> 手法変更時: 変更理由の入力を必須化し、**前年度手法での再計算値を並記**(手法変更の差分と実態変化の差分を分離)

さらにbuild-plan §10「実装で起きやすい違反」の4項目目が、そのまま「手法変更時に前年度手法での再計算値を出さない」である。**現状はこの違反に該当する。**

**作るもの:**
1. `representativeValueSelection` をコア側で組み立てる関数(選択手法ID・理由・前年度手法ID・前年度手法での再計算値)
2. 前年度手法での再計算:前年度に選択された手法プラグイン+当年度の物理量で `buildValuationRecords()` を再実行し、当年度の代表値と並記する
3. 代表値変更時の理由入力を必須化(デフォルト値なし。M6 D-9と同じ規律)、AssumptionEntry `kind: "representative_value_selection"` を生成する

**完了条件:** 前年度に代替費用法、当年度にVFaccessを代表値として選ぶと、「手法変更による差分」と「実態変化による差分」が分離されて並記され、変更理由が台帳に残る。

---

### GAP-10 M5がパイプライン層に存在せず、比較先の一部が入力任せになっている 【2026-08-10 解消済み】

**解消の確認:** `b091319 feat: M5パイプラインと比較先の算出・表示、レッドフラグのデータ由来化 (GAP-10/18)` で対応済み。`packages/core/src/pipeline/financial-bridge-pipeline.ts`が新設され、`computeComparisonTargets()`の`after`(変化後の比率)が企業財務入力+自然債務から算術で導出されるようになった(D-115)。`app/financial-bridge/page.tsx`に比較先3種が表示される。

**以下は当初の記述(履歴として残す):**

**現状:**
- `packages/core/src/pipeline/` にM5のパイプラインがない(assessment / valuation / decision / disclosure の4本のみ)。M5はデモ層 `run-demo-pipeline.ts` から直接呼ばれている
- `computeComparisonTargets()` は `leverage: {before, after}` と `interestCoverage: {before, after}` を**両方とも企業提供入力として受け取っている**。M5要件§5.2は「比率の数値(**変化前後**)は、企業提供の財務データとD-4の自然債務算出結果から**単純な算術で計算する**」と定めており、`after` はPRISMが算出すべき値である
- 画面(`app/financial-bridge/page.tsx`)に `comparisonTargets` が一切表示されていない。営業利益比・減損テストへの影響・格付/資本コストの定性記述のいずれも出ていない

**なぜ必要か:** M5の位置づけは「**金額を単独で出さず、必ず比較先とセットで出す**」(build-plan §5.6)。比較先が画面に出ていない現状は、この位置づけを満たしていない。

**作るもの:**
1. `packages/core/src/pipeline/financial-bridge-pipeline.ts`:交換価値ValuationRecord群 + 企業財務入力 → 2ブリッジ・内部化率・自然債務・比較先。AssumptionEntryの後処理も他パイプラインと同形式で
2. `computeComparisonTargets()` の入力を「変化前の比率 + 企業の Net Debt / EBITDA / 支払利息」に変え、`after` を自然債務から算術で導出する
3. 財務画面に比較先3種を表示する。固定テンプレート文言はそのまま(D-5.2、AIを使わない)
4. `buildBridge1NatureAdjustedProfit()` に**通常NPVではなく報告営業利益**を渡す(GAP-03と同時に解消)

**完了条件:** 財務画面に、自然調整後利益・期待損失に加えて営業利益比・減損テスト前提への影響・レバレッジ/インタレストカバレッジの変化前後が表示され、変化後の値がPRISMの算出結果である。

---

### GAP-11 炭素価格シナリオ3本が価格軌道を持たない 【2026-08-15 解消済み】

**解消の確認:** NGFS Climate Scenarios Data Set v5.1・GX-ETS一次資料(いずれも取得済み)を反映し、`CarbonPriceScenario`をモデル別5値(`ngfs_net_zero_2050_gcam`/`_remind`・`ngfs_current_policies_gcam`/`_remind`・`gx_ets_official`)に拡張、`computeNatureDebt()`にシナリオ別コスト(`uninternalizedCostByScenario`)を渡せるよう拡張した(design-rationale-log D-127)。ただし、この配線を意味のある形で実証するには気候カテゴリのMaterialIssueが必要であり、デモには一度も存在していなかったため、気候カテゴリ専用の拠点(`site-070`)を新規追加し、GAP-14で追加済みの`ghg-carbon-price-conversion.ts`を初めて実際に接続した(D-128)。

**実装時に発見・修正した既存の潜在バグ:** 地理較正(`calibration.ts`)は1つのMaterialIssueの全プラグイン出力に一律適用される設計だったため、`replacement-cost`(すでに円建て、PPP不要)が`lime3-water`/`ifvi-*`(USD建て、PPP必要)と同じ較正を共有し、**site-042の代替費用が約94倍に誤って膨張していた**(気づかれていなかった。既存テストは恒等較正かローカル固定値のみを使用)。`MethodOutput.skipGeographicCalibration`フラグを追加してこれを修正し、`replacement-cost.ts`・`ghg-carbon-price-conversion.ts`(GX-ETS価格の出力のみ)に適用した。

**完了条件(達成):** NGFS Net Zero 2050(GCAM/REMIND-MAgPIEの2モデルレンジ)とCurrent Policiesで自然債務の値が実際に異なることを`gate-verification.test.ts`で検証済み(GCAM Current Policiesの-¥2,000,000からREMIND Net Zero 2050の+¥486,600,000まで)。各シナリオの価格軌道の出典は`docs/data/carbon-price-scenarios.md`・`packages/core/src/financial-bridge/carbon-price-trajectory.ts`から辿れる。

**以下は当初の記述(履歴として残す):**

**現状:** `CarbonPriceScenario` は3値のラベル型として存在し、`computeNatureDebt()` は「未内部化コスト × 内部化確率 × 割引係数」だけを計算している。**シナリオはラベルとしてしか登場せず、シナリオごとの炭素価格が計算に一切入っていない。**したがって3シナリオは現状、確率の重み付けを3分割しているだけで、シナリオ間の差が数値に現れない。

**評価:** これは**実装の怠慢ではなく、M5 D-4.2の「未確認事項:推定値のまま実装しない」に忠実に従った結果**である(コードコメントにも明記されている)。責めるべき対象は実装ではなくフェーズ0の残作業。

**作るもの(データ作業が先):**
1. NGFS Scenarios Portal(ngfs.net)の一次資料から、Net Zero 2050 / Current Policies の炭素価格軌道(2030 / 2040 / 2050)を確認し `docs/data/` に記録する
2. 経産省 産業構造審議会 排出量取引制度小委員会 資料3(2025-12-19)PDF本体から、GX-ETSの参考上限取引価格・調整基準取引価格と2027年度以降の上昇見込みを確認する
3. 確認後、シナリオ別の価格軌道を `VersionedParameterSet`(setId: "carbon-price-scenarios")として登録し、`computeNatureDebt()` をシナリオ別の未内部化コストを取る形に拡張する

**完了条件:** NGFS Net Zero 2050 と Current Policies で自然債務の値が実際に異なり、各シナリオの価格軌道の出典が台帳から辿れる。

**注意:** 一次資料が取得できない間は、**現状の実装のまま(シナリオ差を数値化しない)を維持する。**推定値で埋めてはならない(D-15)。

---

### GAP-12 判定件数カウンタが永続化されていない(課金接続不能) 【2026-08-10 解消済み】

**解消の確認:** `721b09d feat: 判定件数カウンタを実装する (GAP-12)` で対応済み。`lib/db/schema.ts`の`decision_count_entry`(主キー`(tenant_id, decision_record_id)`で再計算時の重複加算を防止)に、`shouldCountDecision()`でフィルタした結果が`lib/db/repositories/runs.ts`のトランザクション内で永続化される(D-117)。`pending`のままの案件は加算されない。

**以下は当初の記述(履歴として残す):**

**現状:** `shouldCountDecision(verdict)` は「カウント対象かどうか」の判定を返すだけで、リポジトリ内に呼び出し元がない。実際のカウンタは存在しない。

**なぜ必要か:** M6 D-8 / design-rationale-log D-30が定める従量課金の唯一の根拠が「判定件数」である。課金の発生根拠を顧客に説明できることが構想書6.4の設計要件。

**作るもの:** 契約単位の判定件数カウンタ(追記型)。`verdict` が `pending` から確定に遷移した瞬間に1件加算し、`pending` の間は加算しない。カウント根拠(どのDecisionRecordが何件目か)を一覧できる画面。

**完了条件:** 承認閾値を入力して★判定を確定させると件数が1増え、`does_not_cross` でも加算される。`pending` のままの案件は加算されない。

---

### GAP-13 `rapidIntegrityDecline` にデータソースがなく、感応度スコアの上限が実質4になっている 【2026-08-10 解消】

**現状(解消済み):** `criteria.ts` は `rapidIntegrityDecline`(急速な劣化=トレンド)に対応する `layerType` がないため、既定で常に false を返していた(D-91、推定で埋めない原則に従った判断)。結果としてTNFD LEAP L3の5基準のうち1つが**構造的に永久にfalse**であり、`sensitivityScore` の実質的な上限は4だった。

**なぜ必要だったか:** M1 D-2は感応度スコアを「5基準の充足数(0〜5)」と定義しており、その値がそのままM2の優先度算定に渡る。1基準が構造的に欠けていることは、優先度算定の相対順位に影響する。実装は正しかった(推定で埋めていない)が、**この事実が利用者・監査人に見えていなかった**。

**作ったもの:**
1. **短期:完了(2026-08-08、D-110)。**`MaterialIssue.unevaluatedCriteria`が「評価不能な基準」を明示的に保持し、`app/sites/page.tsx`・`app/assessment/page.tsx`に「◯/N」表示と「未評価N件」の注記が実装済み。GAP-08のライセンス保留表示と同じ機構に相乗り済み
2. **中期:調査完了(2026-08-10、`docs/data/ecosystem-integrity-trend-notes.md`)。**候補5件を調査した結果、Sun, Hughes, He, Yu (2026, *Scientific Data*)の"Ecological Integrity Index"(CC BY 4.0・年次2015-2023・1kmラスタ・Zenodo公開)が時系列・商用利用・拠点座標照会の3条件を満たす唯一の候補として見つかり、D-90の前提(「使えるデータ源が無い」)を一部訂正した
3. **実装:完了(2026-08-10、E-8)。**`packages/core/src/site/ecosystem-integrity-trend.ts`(IUCN Red List Criterion A2、10年30%減の閾値を借用したboolean化)、`assessment-pipeline.ts`への`resolveCriterion`注入点追加、`lib/demo/company.ts`への3拠点分の実データ(2015年・2023年のラスタ値、`rasterio`でオフライン抽出)反映。3拠点とも実際の低下率は約1.4〜1.5%で閾値未満(false)という、実データに基づく誠実な結果になった。詳細は`docs/data/ecosystem-integrity-trend-notes.md` §8

**完了条件:** 感応度スコアの分母が何基準だったかが、レコードと画面の両方から判別できる(**達成**)。`rapidIntegrityDecline`が実データで評価され、`unevaluatedCriteria`から外れることを`/sites`ページの実際のレンダリングで確認済み(**達成**)。

**残る制約(2026-08-10、動的座標対応の追加実装後):** ~~ユーザーが追加する拠点にはこの実データが無い~~ → 解消(0.5度グリッドを座標から動的に引く方式に変更、`ecosystem-integrity-trend-notes.md` §8.6)。空間精度は1km→約55kmに低下している。データセット自体の継続更新保証もない(詳細は`ecosystem-integrity-trend-notes.md` §8.5)。

---

### GAP-14 M2の対象3カテゴリに対し、M3プラグインが水のみ 【2026-08-11 解消済み】

**解消の確認:** [HUMAN判断]「気候カテゴリを追加する」で確定。`packages/core/src/monetization/plugins/ghg-carbon-price-conversion.ts`を実装し`registry.ts`の`ALL_PLUGINS`に追加した。X4(GHGインベントリ算定エンジンは作らない)は踏み越えていない — このプラグインはGHG排出量(tCO2e)を算定せず、企業が既に算定した値(`PhysicalQuantityInput.physicalQuantity`)を受け取り、既存資産(炭素の社会的費用・GX-ETS調整基準取引価格)との掛け算のみを行う。2本の内訳値(厚生価値・交換価値)を返し、型レベルで加算不可なため`reconciliation`は不要。

**実装時に発見・修正した既存の潜在バグ:** `ALL_PLUGINS`を直接渡していた9箇所(水カテゴリの深掘り評価・統合テスト)は、気候プラグイン追加により`evaluate()`が気候用係数の欠如でエラーを投げるようになった。全箇所を`getPluginsForCategory("water")`に修正し、カテゴリ別フィルタを徹底した。全394→397件のテストが通過することを確認済み。

**以下は当初の記述(履歴として残す):**

**現状:** `ImpactCategory` は `climate | water | pollution` の3値。M2は3カテゴリを扱う設計。しかしM3の全プラグイン(replacement-cost / lime3-water / ifvi-water-consumption)が `supportedCategories: ["water"]`。気候・汚染のMaterialIssueは貨幣化されない。

**評価:** build-plan §5.2はM3のMVP範囲を明示的に「1カテゴリ(水)× 2〜3手法」としているため、**M3単体としては仕様通り**。しかしM2のMVP範囲は「気候・水・汚染の3つ」であり、優先度算定の `financialExposure` はM3のスクリーニング出力を使うため、**気候・汚染のMaterialIssueは財務エクスポージャが埋まらない**。実データでは気候(GHG)が最も揃っているため、パイロットで真っ先に露見する。

**作るもの(判断が先、実装は後):**
1. **[HUMAN判断]** 実データ通しのスコープを「水カテゴリのみ」に絞るか、気候カテゴリを追加するかを決める。追加する場合はX4(GHGインベントリ算定エンジンは作らない)を踏み越えないこと。作るのは**既存のGHG算定結果 × 炭素の社会的費用/GX-ETS価格**の変換のみ
2. 絞る場合:M2のスクリーニングで気候・汚染を「貨幣化手法未搭載」として除外し、**除外理由を記録する**(M2 D-4。ここを空欄で通さない)

**完了条件:** 3カテゴリのMaterialIssueを投入したとき、貨幣化されないカテゴリが理由付きで除外記録に残り、優先度算定が沈黙で歪まない。

---

## 3. S3 — 運用・監査で問題になるもの

### GAP-15 認証・テナント分離がない 【2026-08-11 解消済み(サブドメイン方式)】

**解消の確認:** [HUMAN判断]「サブドメインのみでOK。ログイン機構は実装コスト・検証のしやすさの観点で見送る」で確定。`proxy.ts`(Next.js 16の`middleware`後継、Host ヘッダーからサブドメインを抽出し`x-tenant-id`ヘッダーに設定)と`lib/db/client.ts`の`getTenantId()`(サブドメインが無い場合は`getDefaultTenantId()`にフォールバック)を実装した。`app/`配下の全ページ・server action・18ファイル33箇所の呼び出しを`getDefaultTenantId()`から`await getTenantId()`に置き換え済み(`app/api/pipeline-result/route.ts`は「テナントをまたぐ参照は行わない。既定テナントの最新runのみ返す」という既存の設計意図があるため対象外、`getDefaultTenantId()`のまま)。ローカル開発では`acme.localhost:3000`のようにアクセスすると動作確認できる(`PRISM_BASE_DOMAIN`環境変数、未設定時は`localhost`)。

**以下は当初の記述(履歴として残す):**

**現状(部分解消の確認、2026-08-10時点):** `d4ac836`(GAP-01/15/16のDB導入コミット)で、`lib/db/repositories/*`の全クエリが`tenantId`でスコープされ、テーブルは`(tenant_id, ...)`複合主キーを持つ(D-111・D-112)。**データモデル上のテナント分離は実装済み。**しかし`lib/db/client.ts`の`getDefaultTenantId()`は環境変数`PRISM_DEFAULT_TENANT_ID`から単一の値を読むだけで(コメントに「認証がないハーネスのための単一値であり、本番のテナント解決ではない」と明記)、**実際のユーザー認証・ログイン・「どのリクエストがどのテナントか」を解決する仕組みはまだ無い**(`middleware.ts`不在、`app/`にログイン画面なし)。build-plan §6「パイロット3〜5社を分離できれば十分」を満たすには、テナント解決方式(サブドメイン・APIキー・簡易ログイン等)の選択がまだ必要。**これは新たな人間の判断事項(下記E-9として追加を検討)。**

**以下は当初の記述(履歴として残す):**

build-plan §6は「最小。パイロット3〜5社を分離できれば十分」と規定。D-102でDB不在を理由に見送られたが、**GAP-01でDBを入れる時点で見送りの前提が消える。**同時に実装する。顧客Aの拠点データ・DecisionRecord・開示ギャップが顧客Bから見えないこと(M7 D-5が記録する内容の性質上、必須)。

### GAP-16 出力APIが無認証で全データを返す 【2026-08-10 解消済み】

**解消の確認:** `app/api/pipeline-result/route.ts`は`x-api-key`ヘッダーが`PRISM_API_KEY`と一致する場合のみ結果を返す。`PRISM_API_KEY`未設定時は503(fail-closed)、不一致時は401を返す。無認証の全開放という当初の懸念は解消済み。

**以下は当初の記述(履歴として残す):**

`app/api/pipeline-result/route.ts` は認証なしで `runDemoPipeline()` の全結果をJSONで返す。build-plan §6の「フェーズ3のERP埋め込みに備えて形だけ用意」の範囲としては妥当だが、**実データを入れた瞬間に無認証の全社データ漏洩経路になる。**GAP-01より前にデータを入れないこと、またはGAP-15と同時に認証を付けること。

### GAP-17 `not_applicable` ティアをUIが "A" に読み替えている 【2026-08-10 解消済み】

**解消の確認:** `1f0e815 fix: 適合度ティア表示とライセンスゲーティングを仕様どおりに修正 (GAP-17/08/13)` で対応済み。`app/valuation/page.tsx`・`app/decomposition/page.tsx`に読み替えコードは残っておらず、`app/components/tag-utils.ts`の`tierLabel()`が`not_applicable`を独立した表示(「移転なし」・`neutral`バリアント)として扱う(D-109)。

**以下は当初の記述(履歴として残す):**

`app/valuation/page.tsx:40` と `app/decomposition/page.tsx:62` に以下がある:

```ts
tier: r.transferFitness.tier === "not_applicable" ? "A" : r.transferFitness.tier
```

M3 D-4.2は明示的にこれを禁じている:
> **「移転していない」ケースを無理にティアA(移転はしたが精度が高い)に押し込めない。**理由が違うものを同じラベルにすると、監査時に「なぜこの評価はAなのか」を正しく説明できなくなる。

**作るもの:** フットボールチャートに `not_applicable` 用の第4の表示(色・凡例「移転なし」)を追加し、読み替えを削除する。**低コストかつ設計規律の直接的な違反であるため、優先して直す。**

### GAP-18 M5の「重要な論点」テーブルが固定文言 【2026-08-10 解消済み】

**解消の確認:** `b091319`(GAP-10/18コミット)で対応済み。`app/financial-bridge/page.tsx`の「重要な論点」は`redFlags`配列(実際の計算結果から導出)を元に構築され、該当なしの場合は「現時点で確認が必要な論点はありません」という空状態を表示する。データに関係なく常に表示される固定文言は残っていない。

**以下は当初の記述(履歴として残す):**

`app/financial-bridge/page.tsx:85-124` の3行のうち2行は、データに関係なく常に表示される固定文言。デモ用としては許容範囲だが、実データではレッドフラグの信頼性を損なう。判定条件をデータから導出するか、この節を落とす。

---

## 4. フェーズ0の未完了項目(実装以前のブロッカー)

実装で解消できない。人間の作業が必要。

| # | 項目 | 状態 | 影響 |
|---|---|---|---|
| C-1 | LOI 3件以上・支払意思ヒアリング20件 | **LOI 0件。**ユーザー判断で充足扱い(ADR-0002)。実行計画のみ準備済み | 構想書10.7の継続条件。「効かないと確定させること」への支払意思が未検証のまま実装が先行している |
| C-2 | ライセンス契約(WDPA/IBAT・ESVD・CE Delft・IFVI・ENCORE) | 条項・料金は確認済み。**締結は未** | GAP-04(実データLocate)が動かない。ESVDなしではティア判定が実データで機能しない |
| C-3 | ESVD日本カバレッジ | **未確認** | ティアA/Bが出ない場合、環境省・林野庁の公的評価値への切替(構想書11.2 A-4)が必要 |
| C-4 | CICES V5.1 階層構造の確認(`docs/data/cices-v51-notes.md`) | **【2026-08-11 解消済み】** 公式スプレッドシートで確認。4層構造・Group単位一致が裏付けられた(D-125) | 実装済みの一致階層 "group" 前提(`m4_cicesMatchLevel: "group"`)に根拠文書が付いた。V5.2には追随しない判断も確定(D-125) |
| C-5 | AoP対応表のCE Delft分 | **未着手** | 汚染カテゴリ(GAP-14)に着手できない |

---

## 5. S4 — 意図的な後回し(今回作らない。記録のみ)【2026-08-10:一部先行実装あり】

いずれも既存文書で明示的に後回しと決定済み。**新しく判断し直す必要はない。**ただし後続の作業で以下の部分実装が先行して入っている(後回しの決定自体を覆すものではなく、器・部分機能のみ):

| # | 項目 | 根拠 | 2026-08-10時点の先行実装 |
|---|---|---|---|
| GAP-19 | `DisclosureView`(出力3層目・基準別の開示文生成) | M7要件§0の2026-08-02追記。型のみ用意済み、生成ロジックはフェーズ2以降 | `a61fe2b`:器(型・空の生成ロジック)を実装済み(D-123。標準準拠を主張しない設計) |
| GAP-20 | DecisionRecordの実績照合・再判定アラート | build-plan §5.8「初年度には価値を生まない」。`actualOutcomeReview` は構造のみ | `2e81b3b`:前提が変わった場合の再判定アラート(前半)を実装済み(D-122。通知のみで書き換えない) |
| GAP-21 | G5〜G8 / 対応4類型の回避・受容 / 集中リスク / 分位点の要因別分解(U-3) / 第4分解要因(U-7) | それぞれ M7 D-3・M6 D-5・M5 D-7・M4 F-6・M4 §7.3.1 で後回しと決定済み | `8605641`:G6(選択的開示)検出を実装済み(D-121)。`b98a032`:M4 U-3(分位点の要因別分解)を実装済み(D-124)。G5・G7・G8・対応4類型・集中リスク・U-7は未着手のまま |

---

## 6. 着手順(推奨)【2026-08-10:第1〜3波は完了済み】

依存関係だけを根拠にした順序。スコープの取捨はユーザー判断。

```
第1波(他のすべての前提)                完了済み(2026-08-10)
  GAP-17  ティア読み替えの削除          … 解消(1f0e815)
  GAP-01  永続化層                      … 解消(d4ac836、Postgres+Drizzle)
  GAP-15  認証・テナント分離            … 部分解消(DBはテナント分離済み、実認証は未)
  GAP-16  出力APIの認証                 … 解消(x-api-key必須、fail-closed)

第2波(実データを通す)                  完了済み(2026-08-10)
  GAP-02  取込UI + エラー表示           … 解消(387ff7e)
  GAP-03  財務パラメータ入力            … 解消(aa8453b)
  GAP-08  ライセンスゲート配線          … 解消(1f0e815)
  GAP-13  評価不能基準の可視化          … 解消(1f0e815の短期対応・2026-08-10の中期対応)

第3波(監査・台帳を完成させる)          完了済み(2026-08-10)
  GAP-06  レコード単位の再計算ハッシュ  … 解消(e63b900)
  GAP-07  旧版係数での再計算UI          … 部分解消(4cedd53。係数値自体は未保存、D-118で既知の制約と明記)
  GAP-09  代表値選択 + 前年度手法での再計算値 … 解消(a91b4b8)
  GAP-12  判定件数カウンタ              … 解消(721b09d)

第4波(M5・M7を完了条件まで)            M5は完了、M7は人間の判断待ち
  GAP-10  M5パイプライン + 比較先の表示 … 解消(b091319)
  GAP-05  M7段階1・2(PDF + AI抽出)     … 未着手。E-3(AI提供者・DPA)の判断待ち
  GAP-11  炭素価格シナリオ              … 解消(2026-08-15。NGFS v5.1取得・気候カテゴリ拠点site-070追加。D-127・D-128)

並行(人間作業・§4)
  C-2 ライセンス契約 → 解けたら GAP-04(WDPA/KBAアダプタ本体)
  C-4 CICES確認     → 解消(2026-08-10、`cices-v51-notes.md`)
  C-1 LOI・支払意思ヒアリング → 継続中
```

---

## 7. この文書の判断が必要な箇所

以下は実装に入る前にユーザー判断が要る。

1. ~~GAP-14: 実データ通しを水カテゴリのみに絞るか、気候カテゴリの貨幣化を追加するか~~ → **解消(2026-08-11、E-1により気候カテゴリ追加が確定・実装済み。`docs/README.md`現在地参照)**
2. ~~GAP-01の永続化選択肢~~ → **解消(2026-08-10、Postgres採用済み、d4ac836)**
3. ~~GAP-05: M7段階1・2で使うAIの提供者・モデルと契約上の扱い~~ → **解消(2026-08-11、E-3によりAnthropic Claude APIの使用が確定・実装済み。DPA締結・顧客同意取得は運用開始前の人間作業として残る)**
4. **§4 C-2:** ライセンス契約交渉を実装より先に進めるか、契約前提の機能(GAP-04)を後回しにして先に第1〜3波を仕上げるか(**未決。第1〜3波は完了済みのため、実質的には契約交渉待ちの状態**)
5. ~~GAP-15の残作業: テナント解決方式~~ → **解消(2026-08-11、サブドメイン方式で実装済み)**
