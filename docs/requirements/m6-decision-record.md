# M6:対策評価と意思決定注入 — 要件定義

**対象モジュール:** M6(対策評価と意思決定注入)
**参照元:** `docs/concept-v2.md` 8.8 / 9.2 / 9.3、`docs/roadmap/build-plan.md` §5.4
**参照:** `docs/requirements/m3-monetization-engine.md`(ValuationRecordの入力元)、`docs/requirements/m4-divergence-decomposition.md`(代表値選択の入力元)
**status:** 確定(D-1〜D-10ですべての論点が決定済み)
**最終更新:** 2026-08-02

---

## 0. 位置づけ

購入理由の中心。**追加性はここでのみ回収される**(構想書11.4)。「★判定が実際の稟議・投資判断の結論を1件も変えていなければ、PRISMは情報提供層に留まる」(design-rationale-log R-3)。

**MVP範囲(build-plan §5.4):**
- 対応4類型のうち低減・移転(回避・受容は後回し)
- 自然調整後NPV = 通常NPV + Σ 回避される自然関連コスト(割引後)
- 2軸比較(横軸=単位投資あたり財務効果 / 縦軸=単位投資あたり環境アウトカム)
- ★判定(DecisionRecord):レンジが承認閾値をまたぐか
- 拘束方式の選択と記録

**構造制約(X7・8.2):** 厚生価値はDecisionRecordに接続しない。交換価値のみで意思決定接続を成立させる。

**完了条件:** 対策案とValuationRecordを入力するとDecisionRecordが生成され、★判定と拘束方式が記録される。

---

## 1. 決定事項 D-1:DecisionRecordの型は交換価値のみを受け付ける(型レベルでガード)

構想書8.8の構造をそのまま型に落とす。X7(厚生価値をDecisionRecordに接続しない)を、M3・M4で既に確立した「価値概念をbranded typeで分離し合算を型レベルで拒否する」という設計原則(build-plan §4.2、design-rationale-log D-11)と同じ方式でガードする。

```typescript
interface DecisionRecord {
  id: string;
  decisionTarget: "investment_approval" | "procurement_renewal" | "site_location" | "business_plan";
  decisionMaker: string;
  decisionDate: string;
  approvalThreshold: ApprovalThreshold | "pending";   // §2・§10参照。未入力は"pending"として明示(D-10)

  relatedValuationRecordIds: string[];          // valueConcept: "exchange" のみを許可(型レベルでガード)
  baselineNpv: BaselineNpvInput;                // §4参照。通常NPV(企業提供・PRISMは検証しない)
  natureAdjustedNpv: {
    central: number;
    quantileRange: QuantileRange;               // M3のP5/P50/P95をそのまま継承。approvalThresholdの有無によらず常に算出
  };

  verdict: "does_not_cross" | "crosses" | "pending";  // ★判定(§2・§10)。approvalThresholdが"pending"の間はverdictも"pending"
  deepDiveRecommendation?: {                    // verdictが"crosses"の場合のみ
    dominantAssumption: string;                 // M3のトルネード図を流用(§3)
    sourceValuationRecordId: string;
  };

  actualDecisionOutcome?: {                     // 決裁時の実際の選択と理由
    outcome: string;
    reason: string;
  };

  bindingMechanism: BindingMechanism;           // §6
  bindingMechanismHistory: BindingMechanismChangeEntry[];  // §9

  actualOutcomeReview?: {                       // 前提の実績照合(2026-08-02追記、M8 D-6)
    reviewedAt: string;
    yearsElapsed: number;
    assumptionDeviation: string;
    verdictStillValid: boolean;
  };

  assumptionEntryIds: string[];
  recalculationHash: string;
}
```

**2026-08-02追記:** `actualOutcomeReview`は構想書8.8「前提の実績照合(n年後、当初前提と実績の乖離)」に対応するフィールドで、当初この型定義から抜けていた。M8要件定義(`docs/requirements/m8-ledger-versioning.md` §6)で発見・追加した。フィールドはOptionalとし、機能(自動アラート)はフェーズ2以降とする(build-plan §5.8)。

**理由:** 「交換価値のみ」という制約は既に構想書X7で決定済みであり、新しい判断ではない。M3・M4で確立済みの型設計パターンをM6にも一貫して適用するだけ。

---

## 2. 決定事項 D-2:★判定は「レンジが承認閾値をまたぐか」の機械的な事実判定であり、推奨ではない

### 2.1 判定ロジック

M3が既にP5/P50/P95の分位点(D-7)を出力しているため、これをそのまま使う。

```
verdict =
  承認閾値 < P5(自然調整後NPVの下限)  → "does_not_cross"(閾値を上回って確定。結論は変わらない)
  承認閾値 > P95(自然調整後NPVの上限) → "does_not_cross"(閾値を下回って確定。結論は変わらない)
  P5 ≤ 承認閾値 ≤ P95              → "crosses"(レンジが閾値をまたぐ。深掘り推奨)
```

**新しい分位点や閾値を設けない。** M3が既に確定した分位点をそのまま使うことで、M6独自の統計設計を増やさない。

**具体例(2026-08-02追記):**

```
ケース1:承認閾値(稟議の承認ライン) = 3億円
        自然調整後NPVのレンジ = P5:5億円 〜 P95:9億円
        → 閾値(3億円)はP5(5億円)より小さい
        → verdict = "does_not_cross"(閾値を上回って確定。この論点は投資判断の結論を変えない)

ケース2:承認閾値 = 6億円
        自然調整後NPVのレンジ = P5:5億円 〜 P95:9億円
        → 閾値(6億円)がP5〜P95の範囲内にある
        → verdict = "crosses"(レンジが閾値をまたぐ。深掘り推奨、課金対象)

ケース3:承認閾値 = 12億円
        自然調整後NPVのレンジ = P5:5億円 〜 P95:9億円
        → 閾値(12億円)はP95(9億円)より大きい
        → verdict = "does_not_cross"(閾値を下回って確定。この論点は投資判断の結論を変えない)
```

ケース1・3はどちらも"does_not_cross"だが、意味は異なる(ケース1は「どう転んでも稟議を通す価値がある」、ケース3は「どう転んでも稟議を通す価値がない」)。判定結果に至った理由(閾値がレンジのどちら側にあったか)も、`assumptionEntryIds`経由でAssumptionEntryに記録される。

### 2.2 「推奨ではない」ことの明示

構想書9.3・design-rationale-log D-23は「システムが提供するのは判断材料であり、推奨ではない」という原則を、**代表値の選択**のような複数の妥当な選択肢がある場面に適用している。

**★判定はこれとは性質が異なる。** 閾値とレンジの大小関係という客観的な事実の算出であり、複数の妥当な答えが存在する「判断」ではない。したがってD-23の「推奨しない」原則には抵触しない。この区別をM6の設計文書に明記し、実装者が誤って「★判定にも何らかの推奨ロジックを加えるべきでは」と考えることを防ぐ。

### 2.3 暫定値としての位置づけ

P5/P95という境界(バッファなし、閾値が境界にごく近い場合も機械的に判定する)は、M4のF-8(有意乖離閾値5%)のような緩衝を設けない、最も単純な形で開始する。**これは暫定的なMVP設計であり、パイロットで「境界ぎりぎりのケースをどう扱うか」というフィードバックが得られた場合に見直す。**

---

## 3. 決定事項 D-3:深掘り推奨はM3のトルネード図をそのまま流用する

「レンジを支配する前提」(構想書8.8)を特定するための独自のセンシティビティ分析をM6では作らない。M3がMVP範囲として既に「トルネード図」を持つ(build-plan §5.2)。★判定が"crosses"になった場合、M6は自然調整後NPVのレンジを構成する各ValuationRecordのトルネード図から、寄与度が最大のパラメータをそのまま`dominantAssumption`として引用する。

**理由:** 自前構築は複数手法の切替・横断比較の基盤に限定し(design-rationale-log D-03)、既にある機能を重複実装しない。

---

## 4. 決定事項 D-4:通常NPV・回避コストの入力は企業提供の手動入力とし、PRISM側で検証しない

### 4.1 通常NPVの入力方式

M1のパターン(CSV/スプレッドシートでの手動投入、build-plan §5.1)を踏襲し、通常NPV(既存の投資評価プロセスの出力)も同様に手動入力とする。**ERP・投資評価システムとの自動連携はMVPスコープ外**(構想書10.5、フェーズ3の「ERP・調達システムへの埋め込み」に該当)。

### 4.2 PRISMは通常NPVの妥当性を検証しない

構想書8.8「既存の社内決裁プロセスに寄生する(新設プロセスは作らない)」という原則に従い、企業が提供した通常NPVの計算方法・妥当性についてPRISMは検証・監査を行わない。PRISMが担うのは自然関連コストの上乗せ(自然調整後NPVへの変換)のみ。

### 4.3 割引率は企業提供のものを流用する

対応手段(低減・移転)の「回避される自然関連コスト」を割引現在価値化する際の割引率は、企業が通常NPVの算出に使った割引率(WACC・ハードルレート等)をそのまま流用する。M6独自の割引率は設けない。

**理由:** 自然調整後NPVは「通常NPV + 自然関連コスト」という加算構造(構想書8.8)であるため、両者の時間軸・割引率の前提を揃えないと加算自体が無意味になる。

```typescript
interface BaselineNpvInput {
  value: number;
  discountRate: number;      // 企業提供。対応手段の割引現在価値化にも流用
  horizon: number;           // 年数。企業提供
  source: "manual_entry" | "csv_upload";
}
```

---

## 5. 決定事項 D-5:対応手段は低減・移転のみ実装するが、型は回避・受容を含む4値を保持する

```typescript
type CountermeasureType = "reduction" | "transfer" | "avoidance" | "acceptance";
// MVPでは reduction / transfer のみ計算ロジックを実装する。
// avoidance / acceptance は型としては存在するが、算出ロジックは未実装(フェーズ2以降)

interface Countermeasure {
  type: CountermeasureType;
  targetSiteId: string;
  investmentCost: { initial: number; recurring: number };
  avoidedNatureCost: {                          // 割引前の年次時系列
    year: number;
    amount: number;                              // 対応するValuationRecordの単価 × 削減される物理量
    sourceValuationRecordId: string;
  }[];
}
```

**理由:** build-plan §5.2「薄くしてはいけない」型の考え方(後から追加すると過去レコードの作り直しになるものは先に型として持つ)をここにも適用する。回避・受容を後から追加する際に`CountermeasureType`自体を拡張する必要がないようにする。

---

## 6. 決定事項 D-6:拘束方式は判別可能ユニオン型とし、「強」系(予算賦課・契約条項)はMVPでは出力のみ・外部システム非連携

```typescript
type BindingMechanism =
  | { kind: "weak_reference" }                                    // 弱:稟議書に参考値として記載
  | { kind: "npv_formula_replacement" }                            // 強:稟議の判定式そのものを自然調整後NPVに変える
  | { kind: "budget_allocation"; targetSiteId: string; amount: number }  // 強:自然関連コストへの予算賦課
  | { kind: "procurement_contract_clause"; clauseText: string };   // 強:調達契約の更新条件に組み込む
```

**出力フォーマットの違い(build-plan §5.4に対応):**

| kind | PRISMが渡すもの |
|---|---|
| weak_reference | ★判定の結果(またぐ/またがない)のみ |
| npv_formula_replacement | 自然調整後NPVの値そのもの(通常NPVの代わりに使う数値として) |
| budget_allocation | 対象拠点IDと予算賦課額 |
| procurement_contract_clause | 契約条項として使える文言(テンプレートベース) |

**MVPでは「強」系もPRISM内で完結する出力(数値・文言)を生成するに留め、企業のERP・契約管理システムへの自動連携は行わない。** これは構想書10.5がERP・調達システムへの埋め込みをフェーズ3としているため、範囲を越えないための線引きである。

**理由:** ロードマップが既にこの境界を規定している。今回新たに引く線ではなく、既存の区分をM6に適用しているだけ。

---

## 7. 決定事項 D-7:複数の交換価値ValuationRecordがある場合、M4の代表値選択を流用する

MVPの水カテゴリでは、交換価値グループにVFaccess(IFVI)と代替費用法の2本が存在しうる(M4要件定義書§3.2の2026-08-01追記のグループ化ルールにより、両者は`aopCode: "not_applicable"`同士として比較可能)。M6が自然調整後NPVを計算する際、どちらの値を使うかは、**M4の`representativeValueSelection`(§7.4「代表値の選択」)で既にユーザーが選んだ結果をそのまま引き継ぐ。**

**M6独自の代表値選択ロジックは作らない。** 交換価値グループの代表値が1本しかない場合はそれをそのまま使う。

**この決定はM4とM6の依存関係を明確化する副産物でもある。** 以前の整理(「M4とM6は互いに依存しない」)は、M6がM4の乖離分解(DivergenceDecomposition・Shapley分解結果)には依存しない、という意味であって、**M4の代表値選択という別のワークフロー結果には依存する。** この違いを明記しておく。

---

## 8. 決定事項 D-8:判定件数のカウント機構(課金接続)

design-rationale-log D-30(従量課金は「判定超過」1本のみ、結論の向きを問わず一律)を実装レベルに落とす。

```
DecisionRecordが確定するたび(verdictが does_not_cross / crosses のいずれであっても)、
契約単位の判定件数カウンタを1件加算する。
```

**「またがない」場合も1件としてカウントする。** これはD-30で既に決定済みの課金設計であり、M6はこれを実装する側。新しい判断ではない。

---

## 9. 決定事項 D-9:拘束方式の変更にはデフォルト値を設けず、明示選択と変更履歴の記録を必須とする

**デフォルト値なし。** 「推定で埋めない」という全モジュール共通原則(design-rationale-log D-15)をここにも適用する。`bindingMechanism`は必須入力とし、"weak_reference"を暗黙のデフォルトにしない(弱い拘束方式に自然に流れることを防ぐ。design-rationale-log R-3「単一値方式と同じ運命をたどるリスク」への対応)。

**変更履歴の記録は、M4の「手法変更時は前年度手法での再計算値を並記」(構想書9.3)と同じパターンを踏襲する。**

```typescript
interface BindingMechanismChangeEntry {
  changedAt: string;
  previousMechanism: BindingMechanism;
  newMechanism: BindingMechanism;
  reason: string;   // 変更理由の入力を必須化
}
```

**理由:** システムが特定の拘束方式へ誘導すること(ナッジ)は、D-23(代表値をシステムが推奨しない)の精神に反する。一方で、選択を記録せず変更履歴も残さないと、R-3のリスク(拘束方式が実質的に有名無実化する)を後から検証できなくなる。「誘導はしないが、選択と変更は必ず記録する」という中立性を保つ設計。

---

## 10. 決定事項 D-10:承認閾値・通常NPVは段階的開示とする(B案)

### 論点

build-plan §5.4は「承認閾値をどう取り込むか」を[HUMAN]の判断事項としており、design-rationale-log R-1は「決裁の閾値(ハードルレート等)は経理・経営企画の管轄で、サステナビリティ部門は知らないことが多い。M6の入力インターフェース設計が営業難度に直結する」と明記している。エンジニアリングの正解がない、営業戦略・顧客体験に関わる判断のためユーザー確認を経て決定した。

### 検討した案

| 案 | 内容 | 判定 |
|---|---|---|
| A. 必須入力 | 承認閾値・通常NPVがないと★判定自体を出さない | 却下 |
| **B. 段階的開示** | **承認閾値・通常NPVが未入力でも、自然調整後NPVのレンジ・自然関連コストの絶対額までは表示する。★判定(またぐ/またがない)だけを「未確定」として保留し、閾値入力後に確定させる** | **採用** |
| C. 業界標準値を仮置き | 財務部門の入力がない間、業界標準的なハードルレート等を仮の閾値として使い、暫定★判定を出す | 却下 |

### 採用理由(B案)

1. 既存の課金設計(D-30・構想書9.3)が「開示プランで導入し、投資判断予算のあるQ3で判断プランに転換する」という段階的な顧客体験を前提にしており、B案はこの前提とプロダクト機能レベルで一致する
2. 導入初日(サステナビリティ/IR担当者、SSBJ予算)から価値を出せる。構想書6.3のQ1→Q3の年度サイクル(開示準備で使った数字が、後で投資判断に染み出す)と自然に整合する

### 却下理由

- **A案:** 技術的には最もシンプルだが、経営企画・財務部門を巻き込む必要が導入初日から発生し、R-1が既に明記している営業難度のリスクをそのまま体現してしまう
- **C案:** 「推定で埋めない」という全モジュール共通原則(D-15)に抵触しかねない(閾値を仮置きすることは一種の推定値である)。「仮の判定」を顧客が実際の判断材料として誤用するリスクもある

### 型への反映

`DecisionRecord`の`approvalThreshold`・`verdict`フィールドに`"pending"`状態を追加した(§1に反映済み)。**「未入力」を`null`や省略ではなく明示的な状態(`"pending"`)として型に持たせる。** これはD-15(推定で埋めない)と同じ規律で、「まだ確定していない」ことを構造として区別可能にするため。

### UIへの含意

閾値未入力の状態でも、自然調整後NPVのレンジ・トルネード図・自然関連コストの絶対額は通常通り表示する。★判定の表示欄のみ「承認閾値を入力すると判定が確定します」というプレースホルダーに置き換える。**判定件数のカウント(D-8)は、verdictが確定(`does_not_cross`/`crosses`)した時点で発生させ、`pending`の間はカウントしない**(未確定の状態を課金対象にしないため)。

---

## 11. C-3判定・フェーズ0との関係

M6は技術検証(C-3)の対象外(M4・M3固有の論点ではないため)だが、**構想全体の追加性の検証(構想書11.4・design-rationale-log R-3)は、M6のDecisionRecordが実際の投資判断に接続されるかどうかにかかっている。** build-plan §7.2「フェーズ1末の判断基準」("M6のDecisionRecordが実際に少なくとも1件の投資判断に接続された事例があること")は、D-10(段階的開示)の実際の効き方によって影響を受けるため、パイロット時にこの点を重点的に観察する。**特に「pending状態からverdict確定に至った案件の比率・所要期間」は、段階的開示の設計が意図通り機能しているかを測る指標として、パイロットで観測すべき事項に追加する。**
