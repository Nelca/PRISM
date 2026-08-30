# PRISM 算定対象拡大 実装指示書

**対象:** PRTR汚染MVP → 廃棄物 → LIME3土地利用パイロット
**作成日:** 2026-08-28
**状態:** LIME3第1手法の実装完了・外部第2手法は人間GATE待ち
**設計判断:** `docs/decisions/0004-category-expansion-scope.md`
**取得手順:** `docs/data/category-expansion-acquisition.md`

**Next.js実装時に確認した現行ガイド:** `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`、`07-mutating-data.md`、`01-app/02-guides/forms.md`、`data-security.md`、`server-actions.md`

---

## 0. この文書の使い方

この文書は、次の実装セッションをPlanモードで自律的に進めるための作業台帳である。作業者は、チャット履歴ではなく本書と関連文書を正とする。

実装開始前に、次を順に読む。

1. `docs/concept-v2.md`
2. `docs/decisions/design-rationale-log.md`
3. `docs/decisions/0004-category-expansion-scope.md`
4. `docs/data/category-expansion-acquisition.md`
5. `docs/requirements/m3-monetization-engine.md`
6. 本書

`app/`、Server Actions、Route Handlers、React Server Components等を変更する前に、リポジトリの`AGENTS.md`に従い、**`node_modules/next/dist/docs/`から該当機能の現行Next.jsガイドを読む。** 読んだファイルを各タスクの作業メモへ記録する。学習済み知識だけでNext.jsコードを書かない。

## 1. 固定済みの方針

Planモード中に再質問せず、そのまま実装してよい判断:

- 汚染MVPの最初の入力はPRTR対象有害化学物質
- 第1手法はLIME3
- PRTR対象でもLIME3係数未対応なら未算定として残す
- 廃棄物は同じ拡大リリースの後半に実装する
- 廃棄物は汚染と同じリリースだが、別の物理入力型・別の算定カテゴリとして扱う
- 土地利用・土地改変はLIME3単独の内部パイロットを開始する
- IFVI、CE Delft、ESVDは書面許諾まで顧客向け計算に使わない
- 送粉は実装しない

## 2. 非交渉の設計規律

1. **推定で埋めない。** 未対応物質、係数空欄、不明な排出媒体、不明な土地転換前状態は`unmapped`/`uncomputable`とする。
2. **物質名だけで自動対応しない。** PRTRコード、CAS、媒体、年度を使う。ファジー一致はレビュー候補の生成まで。
3. **単位を型と検証で固定する。** 汚染と廃棄物はkg、土地改変はm²、土地占有はm²year。単位文字列を無検証で通さない。
4. **直接排出と移動量を分ける。** PRTRの下水道/事業所外移動量を汚染MVPで貨幣化しない。
5. **廃棄物との二重計上を防ぐ。** 同じsource recordを汚染と廃棄物の両方へ計上しない。
6. **係数値だけを保存しない。** 版、フロー、単位、通貨、価格年、視点、出典ハッシュ、ライセンス状態を持たせる。
7. **価値概念を混ぜない。** 既存のExchange/Welfareの型ガードを維持する。LIME3統合化スコアはwelfareとして扱う。
8. **AoPを偽装しない。** 複数AoPを含む統合値を、便宜上`human_health`等の単一AoPへ置かない。金額内訳を再現できなければ`unmapped`。
9. **不確実性を捏造しない。** 出典に分布がない新規係数へ根拠のないsigmaを設定しない。中央値のみ/不確実性未取得を表現できる型へ拡張する。
10. **ライセンスを実行時にもゲートする。** `pending_review`の手法は登録されていても計算結果を返さない。
11. **公開PRTR値と顧客確定値を区別する。** デモ/照合用の公開値を顧客提供値として表示しない。
12. **台帳と再計算性を先に通す。** 新カテゴリだけM8を迂回する実装を作らない。

## 3. 目標アーキテクチャ

### 3.1 物理入力

現在の`PhysicalQuantityInput`はカテゴリ、数量、単位、拠点、地域だけであり、追加カテゴリには不足する。共通基底を持つ判別可能なunionへ移行する。

```ts
type PhysicalQuantityInput =
  | ClimateQuantityInput
  | WaterQuantityInput
  | PollutionReleaseInput
  | WasteQuantityInput
  | LandUseInput;
```
最低限の追加フィールド:

- `PollutionReleaseInput`: PRTRリスト版、PRTR物質コード、CAS、排出媒体、年度、kg、元レコードID
- `WasteQuantityInput`: 廃棄物種類、有害フラグ、処理経路、オン/オフサイト、kg、元レコードID
- `LandUseInput`: `occupation | conversion`、転換前/後クラス、m²またはm²year、案件ID、根拠ID

既存の気候・水呼び出しを一度に壊さないよう、型移行と全コンパイルエラーの修正を同じタスク内で完了する。`any`やoptionalの大量追加で一時回避しない。

### 3.2 カテゴリ

`ImpactCategory`には`waste`と`land_use`を追加する。廃棄物を`pollution`のquantityとして押し込まない。画面上は「汚染・廃棄物」リリースとしてまとめてよいが、M2の開示必須性、M3プラグイン選択、M7の基準マッピングは別々に扱える構造にする。

### 3.3 係数レジストリ

`MethodConfig.externalValueFactors?: Record<string, number>`は、水の後方互換のため当面残してもよいが、新カテゴリは構造化した係数レジストリを使う。

```ts
interface ValueFactorRecord {
  factorId: string;
  methodId: string;
  methodVersion: string;
  sourceFlowId: string;
  sourceFlowName: string;
  medium?: "air" | "public_water" | "soil" | "onsite_landfill";
  valuePerUnit: number;
  denominatorUnit: "kg" | "m2" | "m2year";
  currency: "USD" | "EUR" | "JPY";
  priceYear: number | null;
  geographicPerspective: string;
  sourceRegion: string;
  sourceHash: string;
  licenseMode: LicenseMode;
}
```

価格年不明は`null`で保持し、現在年を推定で入れない。係数の差し替えは既存の`VersionedParameterSet`と再計算ハッシュへ接続する。

### 3.4 対応表

計算経路は必ず次の順にする。

```text
原本入力
  → 正規化された物理入力
  → レビュー済み対応表
  → 係数レコード
  → 手法プラグイン
  → ValuationRecord + AssumptionEntry
```

プラグイン内部で物質名を検索しない。対応表の結果として`factorId`を受け取る。

## 4. 実装順序

### Wave A: 共通基盤とLIME3データ接続

#### T-01 要件・型影響監査

**状態:** 未着手
**依存:** なし

1. `ImpactCategory`と`PhysicalQuantityInput`を参照する全箇所を`rg`で列挙する。
2. DBの保存JSON、結果スキーマ版、取込UI、デモ、開示、ラベル、テストへの影響表を作る。
3. 既存GHG・水の出力が変わらない後方互換テストを先に追加する。
4. 必要なら`docs/requirements/m3-monetization-engine.md`に追加カテゴリ要件を追記する。

**完了条件:** 変更対象ファイルと移行戦略がテスト単位で確定し、既存カテゴリのgolden結果が固定されている。

#### T-02 物理入力unionとカテゴリ拡張

**状態:** 未着手
**依存:** T-01

1. `packages/core/src/types/common.ts`へ`waste`・`land_use`を追加する。
2. `packages/core/src/types/valuation.ts`を判別可能な入力unionへ移行する。
3. `assessment/disclosure-requirement.ts`、M1/M2/M7のカテゴリ表、ラベル、intake validatorを網羅的に更新する。
4. 保存済みrunの互換処理として`RESULT_SCHEMA_VERSION`を上げる。古いrunを削除しない。
5. 気候・水の全既存テストを修正し、意味が変わっていないことを確認する。

**完了条件:** 型で媒体・処理経路・土地活動種別を取り違えられず、気候・水の結果が回帰しない。

#### T-03 係数レジストリとLIME3ローダー

**状態:** 未着手
**依存:** T-02

1. `packages/core`または`lib/data`に構造化係数型と検索インターフェースを作る。ファイルI/Oはcoreの外へ置く。
2. 抽出済みCSVを読んで`ValueFactorRecord`へ変換するローダーを作る。
3. LIME3の日本・生産国・統合化列を明示的に選ぶ。列番号のマジックナンバーを散在させない。
4. 元Excel/CSVハッシュ、LIME3版、基本フローコードを係数レコードへ入れる。
5. 空欄セルを0に変換しない。
6. ライセンス期限をメタデータとして持ち、期限切れ警告を出せるようにする。
7. 日本視点の係数は`sourceRegion=JP`として扱う。円換算と価格年調整を、海外係数の便益移転(所得差・生態差等)と区別し、同じ調整を二重に掛けない。

**テスト:** CSV 980行、代表的なPRTR物質候補、NOx/SOx、産廃埋立、森林→建物用地、空欄のNH3/森林占有。

**完了条件:** 同じCSVと版から同じ係数レコードとハッシュを再現できる。

### Wave B: PRTR汚染MVP

#### T-04 PRTR取込と正規化

**状態:** 未着手
**依存:** T-02

1. 年度別物質マスタと個別事業所3ファイルの取込器を`lib/intake/prtr/`に作る。
2. 文字コード、引用符、空欄、修正データ、0/未測定を区別する。
3. 整理番号で3ファイルを結合し、排出媒体別の長形式へ変換する。
4. 下水道/事業所外移動量は保持するが`calculationEligibility: transfer_only`として計算対象外にする。
5. 顧客ファイルと公開PRTRの`sourceKind`を区別する。

**完了条件:** 公式サンプル/フィクスチャから事業所×物質×媒体の入力が再現され、不正行は行番号付きで全件表示される。部分取込しない。

#### T-05 PRTR→LIME3対応表

**状態:** 未着手
**依存:** T-03、T-04

1. `docs/data/mappings/prtr-lime3-flow-mapping-v1.csv`のスキーマとvalidatorを作る。
2. CAS・媒体一致による候補生成スクリプトを作る。
3. `exact`と`reviewed_alias`だけを計算可能とする。
4. 対応率を物質数と排出量kgで出す。
5. 対応表の版とハッシュをAssumptionEntry/再計算ハッシュへ流す。

**人間GATE:** あいまい候補の採否は人がレビューする。Planモードは候補生成、根拠整理、未対応化まで自律的に進めてよい。回答待ちの候補を自動採用しない。

**完了条件:** 同じPRTRコードでも媒体が異なれば別対応になり、未対応量が見える。

#### T-06 `lime3-pollution`プラグイン

**状態:** 未着手
**依存:** T-05

1. 計算式を`quantityKg × valuePerKg`に限定し、係数検索は呼び出し側で終わらせる。
2. 係数単位と入力単位の一致を実行時検証する。
3. LIME3統合値はwelfare、地理視点と通貨を係数メタデータから受ける。
4. AoP金額内訳を復元できない間は`aopCode: unmapped`とし、統合値が複数AoPを含みうることをscope exclusionへ入れる。
5. 出典にない不確実性分布を置かない。中央値のみの表現をcoreに追加する。
6. `pending_review`/期限切れ係数を実行時に拒否する。
7. 日本視点係数では、通貨換算以外の地理較正倍率が1であることをテストする。

**完了条件:** 代表的なマッピング済み物質で再現可能な円建て結果が出て、未対応物質・媒体不一致・空欄係数は計算されない。

#### T-07 パイプライン、台帳、保存

**状態:** 未着手
**依存:** T-06

1. M1→M8の既存パイプラインにPRTR入力を接続する。
2. `ValuationRecord`、`AssumptionEntry`、`VersionedParameterSet`、record hashへ、PRTRデータ版・対応表版・係数版を流す。
3. 1拠点に複数カテゴリ/複数物質がある前提へ、`representativeRecordForSite`等の暗黙の「1拠点=1意思決定」を監査する。
4. 集計は物質別→媒体別→拠点別の順で復元できるようにする。
5. 公開PRTRから作ったrunと顧客データrunを表示・保存上で区別する。

**完了条件:** 任意の金額から元PRTR行、対応表行、LIME3係数行までドリルダウンできる。

#### T-08 取込UIと結果UI

**状態:** 未着手
**依存:** T-07

Next.jsコードへ触れる前に`node_modules/next/dist/docs/`の該当ガイドを読む。

1. `/intake`にPRTRファイル取込を追加する。
2. マッピング済み量、未対応量、移動量、エラーを分けて表示する。
3. `/valuation`に物質/媒体/拠点の絞り込みと、係数版・出典・ライセンス表示を追加する。
4. `/decision`では対策前後の排出量差分を設備投資ROIへ接続する。対策後量がない場合は推定しない。
5. `/disclosure`にTNFD汚染指標向けの構造化素材を渡す。PRTR対応=TNFD完全準拠と表示しない。

**完了条件:** 初見利用者が「入力総量のうち何kgを貨幣化できたか」と「なぜ残りを計算していないか」を画面で確認できる。

### Wave C: 廃棄物

#### T-09 廃棄物取込・重複防止

**状態:** 未着手
**依存:** T-07

1. `WasteQuantityInput`用のCSVテンプレート/validatorを追加する。
2. 廃棄物種類、処理経路、オン/オフサイト、湿/乾重量、有害性を検証する。
3. PRTR移動量との照合キーを持たせ、同じsource recordの二重計上を拒否する。
4. 内部処理費用と外部費用を別フィールド/価値概念で保持する。

#### T-10 `lime3-waste`プラグインとUI

**状態:** 未着手
**依存:** T-09

1. LIME3基本フローの粒度と一致する処理経路だけを計算する。
2. リサイクル、焼却等に係数がない場合、埋立係数を流用しない。
3. 処理費用(内部化済み)と社会的費用を比較表示し、「廃棄物量×処理費」を社会的費用として二重計上しない。
4. IFVI許諾後は別プラグインとして追加し、LIME3値を置換しない。

**完了条件:** PRTR移動量と廃棄物台帳が重なるフィクスチャで二重計上テストが落ちず、処理経路不明は未算定になる。

### Wave D: LIME3土地利用パイロット

Wave Bとデータ準備を並行してよい。共通型(T-02)と係数レジストリ(T-03)の完了後にコード接続する。

#### T-11 土地入力・公開データ照合

**状態:** 未着手
**依存:** T-03

1. 案件ポリゴン、面積、転換前後クラス、占有期間の入力型/validatorを作る。
2. 国土数値情報2021年100mメッシュをスクリーニング用adapterとして外出しする。
3. 公開メッシュと顧客申告が不一致でも自動上書きせず、review findingを返す。
4. `conversion(m²)`と`occupation(m²year)`を別計算にする。

#### T-12 `lime3-land-use`プラグイン

**状態:** 未着手
**依存:** T-11

1. レビュー済み土地クラス対応表を経由する。
2. 原則として日本・生産国・統合化係数を使う。
3. 森林→建物用地等、係数が存在する転換だけを算定する。
4. 係数空欄の森林占有等を0扱いしない。
5. 占有と転換を別ValuationRecordとして保持し、合算時も内訳を復元可能にする。
6. ESVD/IFVIが未許諾でもLIME3単独で動作する。画面には「単一手法パイロット」と表示し、M4乖離分解を作動させない。

**完了条件:** 森林→建物用地の既知係数でgolden testが通り、森林占有の空欄係数は明示的に未算定になる。

### Wave E: 外部第2手法

#### T-13 IFVI / CE Delft / ESVDアダプター

**状態:** 人間GATE待ち
**依存:** 各書面許諾、T-07またはT-12

許諾されたソースだけを個別プラグインとして追加する。公開されていることを埋込許諾と解釈しない。

- CE Delft: PRTR汚染の第2手法。EU27平均の地理移転誤差を明示
- IFVI Water Pollution: PRTR公共用水域排出との対応物質のみ
- IFVI Air Pollution: 6大気汚染物質のみ。PRTR全物質対応を謳わない
- IFVI Waste: 処理経路が一致する場合のみ
- IFVI/ESVD Land: 土地用途・地域・生態系サービスの適合度を保持

**完了条件:** 同じ物理入力を複数手法で並列計算でき、M4が価値概念・AoP・地理較正・不確実性の違いを既存規律どおり扱う。

## 5. Planモードの自律実行ルール

### 5.1 最初に作るplan

Planモード開始時は、上記T-01〜T-13をそのまま1件ずつplanへ展開しない。まず現在のコードを再監査し、次の5段階にまとめる。

1. 共通型・係数レジストリ・回帰テスト
2. PRTR取込・対応表・LIME3汚染
3. パイプライン・UI・台帳のend-to-end接続
4. 廃棄物と土地利用
5. ライセンス回答済みの第2手法だけ追加

常に`in_progress`は1件だけにする。各段階の中では、本書のタスク順と依存を守る。

### 5.2 自律的に決めてよいこと

- ファイル配置、関数分割、テストフィクスチャ名
- 後方互換を保つための内部adapter
- validatorのエラーメッセージ
- 公開PRTRデモ用の少量フィクスチャ
- ライセンス待ちプラグインのinterface/disabled stub

### 5.3 止める必要があること

- 対応候補が複数あるPRTR物質をどれか1つへ確定する
- IFVI/CE Delft/ESVDの契約条件に同意する、係数を商用有効化する
- 顧客の公開PRTRと社内実績の差異を正しいと断定する
- LIME3ライセンスの範囲を拡張解釈して原係数を顧客へ再配布する
- 送粉を実装対象へ戻す

停止理由があるタスクだけを`blocked`として記録し、依存しないタスクへ進む。

### 5.4 各タスク共通の検証

最低限、変更範囲に応じて次を実行する。

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

DBスキーマ/永続化を変えた場合:

```bash
npm run db:up
npm run db:migrate
npm run test:db
```

さらに次のドメインテストを必須とする。

- 未対応物質が0円にならない
- 媒体不一致の係数を使わない
- 空欄係数が0に変換されない
- PRTR移動量と廃棄物が二重計上されない
- `kg`/`m²`/`m²year`を取り違えられない
- `pending_review`の手法が結果に入らない
- 係数版/対応表版が変わると再計算ハッシュが変わる
- 既存のGHG・水のgolden結果が変わらない

## 6. リリース判定

### 汚染MVP

- PRTR事業所データを取り込める
- 物質×媒体のレビュー済み対応表を経由する
- 算定対象kg、未対応kg、移動量kgを分けて表示する
- LIME3係数・版・出典まで追跡できる
- 1拠点の対策前後差分がM6へ届く
- 公開PRTR値を顧客確定値と誤表示しない

### 廃棄物

- 処理経路別に計算する
- 内部処理費用と社会的費用を区別する
- PRTR移動量との二重計上防止がテストされている

### 土地利用パイロット

- 顧客/案件の転換前後と面積を一次入力にする
- 公開メッシュは照合に限定する
- LIME3単独手法であることを明示する
- 算定できない土地用途を未算定として残す

## 7. Planモード開始用プロンプト

次回の実装セッションでは、以下をそのまま依頼文として使用できる。

```text
docs/roadmap/category-expansion-directive.md を実行指示書として、
docs/decisions/0004-category-expansion-scope.md と
docs/data/category-expansion-acquisition.md を先に読み、Planモードで実装を進めてください。

最初に現状コードを監査し、指示書§5.1の5段階planを作ってください。
その後、外部契約・顧客判断を必要としない作業は確認待ちで止めず、自律的に実装・検証してください。
PRTRのあいまい物質対応、外部ライセンスの有効化、顧客データの確定だけは人間GATEとして残してください。

各段階でnpm test / typecheck / lintを実行し、UI変更時はbuild、DB変更時はtest:dbまで行ってください。
app/を変更する前にnode_modules/next/dist/docs/の該当ガイドを読み、参照したファイルを作業記録に残してください。
既存のGHG・水の結果を回帰させず、未対応物質・空欄係数・媒体不一致を0や近似値で埋めないでください。
```
