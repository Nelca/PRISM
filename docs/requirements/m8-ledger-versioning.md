# M8:記録・版管理基盤 — 要件定義

**対象モジュール:** M8(記録・版管理基盤)
**参照元:** `docs/concept-v2.md` 8.9 / 9.3、`docs/roadmap/build-plan.md` §5.8
**参照:** M1〜M7の全要件定義書(AssumptionEntryへの記録要求はすべてここに集約する)
**status:** 確定(D-1〜D-6ですべての論点が決定済み)
**最終更新:** 2026-08-02

---

## 0. 位置づけ

**継続理由であって購入理由ではない**(design-rationale-log D-04)。構造は初日から完全に、UIは最小に。営業では前面に出さない。

**MVP範囲:** AssumptionEntryの蓄積(判断が発生する全箇所で自動生成)、再計算ハッシュ、係数セットの版管理と旧版での再計算、ライセンス区分の制御。

**後回しでよい:** DecisionRecordの実績照合(n年後の乖離アラート)。初年度には価値を生まない。構造だけ用意し、機能は後で。

**完了条件:** M1〜M7のすべての判断箇所からAssumptionEntryが自動生成され、任意のレコードを旧版係数で再計算できる。

---

## 1. 決定事項 D-1:AssumptionEntryは、M1〜M7で既に約束された記録要求をすべて集約する統一型とする

### 各モジュールから既に約束されている記録内容(棚卸し)

| モジュール | 記録すべき内容 | 出典 |
|---|---|---|
| M1 | MaterialIssue生成時の除外理由 | m1-target-definition.md §1 |
| M2 | 深掘り昇格/除外の判断とその理由 | m2-assessment-execution.md §4 |
| M3 | 集計関数の版・ゴールデンテスト結果、地理較正パラメータの版(PPP出典・η値)、適合度ティアの判定根拠 | m3-monetization-engine.md §2・§3.2・§5 |
| M4 | 分解アルゴリズム版、対称性公理の採用、CICES一致階層、AoP対応表の版、適用したフォールバック、分解不能とした要因、F-3/F-8の閾値版、代表値の選択 | m4-divergence-decomposition.md §9(全9項目) |
| M6 | 拘束方式の選択・変更履歴と理由 | m6-decision-record.md §9 |
| M7 | ギャップ判定結果、意図的判断として記録する場合の理由 | m7-disclosure-verification.md §4 |

### 採用する統一型

```typescript
interface AssumptionEntry {
  id: string;
  createdAt: string;
  sourceModule: "M1" | "M2" | "M3" | "M4" | "M6" | "M7";
  relatedRecordId: string;   // MaterialIssueId / ValuationRecordId / DivergenceDecompositionId
                             // / DecisionRecordId / GapFindingId 等、判断が発生した対象のID
  payload: AssumptionEntryPayload;   // モジュール別の判別可能ユニオン(下記)
}

type AssumptionEntryPayload =
  | { module: "M1"; kind: "exclusion"; reason: string }
  | { module: "M2"; kind: "depth_decision"; promotedManually: boolean; exclusionReason?: string }
  | { module: "M3"; kind: "coefficient_calibration"; setVersion: string; pppSource: string; incomeElasticity: number }
  | { module: "M3"; kind: "reconciliation_check"; aggregationFunctionVersion: string; goldenTestPassed: boolean }
  | { module: "M3"; kind: "fitness_tier_assignment"; tier: "A" | "B" | "C" | "not_applicable"; compositeScore: number | null }
  | { module: "M4"; kind: "decomposition"; algorithmVersion: string; symmetryAxiomApplied: true; cicesMatchLevel: string;
      aopMappingVersion: string; fallbackApplied: string[]; nonDecomposableFactors: string[];
      f3ThresholdVersion: string; f8ThresholdVersion: string }
  | { module: "M4"; kind: "representative_value_selection"; selectedMethodId: string; reason: string }
  | { module: "M6"; kind: "binding_mechanism_change"; previous: string; next: string; reason: string }
  | { module: "M7"; kind: "gap_finding"; gapType: string }
  | { module: "M7"; kind: "intentional_decision"; reason: string };
```

**「後から手で入力する」設計にしない。** 上記のpayloadは、各モジュールの該当する判断ロジックが実行された時点で、そのロジック自身が自動的に生成する。人間が後からAssumptionEntry画面を開いて記入する、という経路は用意しない(build-plan §5.8「AssumptionEntryは『後から手で入力する』設計にしない」を型で担保する)。

### 具体例(2026-08-02追記)

M3が地理較正(§3.3の例:PPP1.15・η=0.7)を適用した瞬間、以下のAssumptionEntryが自動生成される。人間はこの画面を開いて入力する必要はない。

```json
{
  "id": "ae-1001",
  "createdAt": "2027-02-14T09:12:00Z",
  "sourceModule": "M3",
  "relatedRecordId": "vr-ifvi-vfes-site042",
  "payload": {
    "module": "M3",
    "kind": "coefficient_calibration",
    "setVersion": "ifvi-water-consumption-v1",
    "pppSource": "世界銀行ICP 2024年版",
    "incomeElasticity": 0.7
  }
}
```

同様に、M4が乖離分解を実行した瞬間に`kind: "decomposition"`のエントリが、M6が拘束方式を変更した瞬間に`kind: "binding_mechanism_change"`のエントリが、それぞれ自動生成される。

---

## 2. 決定事項 D-2:再計算ハッシュは、パイプライン全体(M1〜M7)のパラメータ版を横断的に含む

M4要件定義書§9は、M4単体のハッシュ入力(分解アルゴリズム版、CICES一致階層等)を既に定義している。M8ではこれをパイプライン全体に拡張する。

```typescript
interface RecalculationHash {
  hash: string;
  inputs: {
    m1_sensitivityCriteriaVersion: string;      // TNFD基準の版(M1 D-2)
    m2_priorityFormulaVersion: string;          // 優先度算定式・昇格閾値の版(M2 D-2・D-3)
    m3_methodPluginVersions: Record<string, string>;  // 手法ごとの版(IFVI/LIME3/代替費用法)
    m3_geoCalibrationVersion: string;           // 地理較正式の版(M3 D-3)
    m3_fitnessTierThresholdVersion: string;     // 適合度ティア閾値の版(M3 D-5)
    m4_decompositionAlgorithmVersion: string;   // 分解アルゴリズム版
    m4_cicesMatchLevel: string;
    m4_aopMappingVersion: string;
    m5_carbonPriceScenarioSetVersion: string;   // シナリオセットの版(M5 D-4.2)
    m6_bindingMechanismDefinitionVersion: string;
    m7_gapDetectionRuleVersion: string;
  };
}
```

**理由:** build-plan §4.1「再計算ハッシュの入力定義:何をハッシュに含めるかを先に決める」を、M1〜M7それぞれが個別に定義済みのバージョン管理項目を集約する形で満たす。新しい判断基準を追加するのではなく、既存の「版」概念を横断的に束ねる。

---

## 3. 決定事項 D-3:係数セット・パラメータの版管理はレジストリ形式とし、旧版を保持し続ける

```typescript
interface VersionedParameterSet {
  setId: string;          // 例 "ifvi-water-consumption" / "aop-mapping" / "cices-match-level" / "carbon-price-scenarios"
  version: string;
  effectiveFrom: string;
  supersededBy?: string;  // 後継バージョンのID。存在する場合、旧版として扱う
  changeReason?: string;  // 版を更新した場合は必須(M4「手法変更時は変更理由の入力を必須化」と同じ原則)
}
```

**旧版は削除せず保持し続ける。** 任意のValuationRecord・DivergenceDecomposition・DecisionRecordは、生成時点で使われた`VersionedParameterSet`のバージョンを`RecalculationHash`経由で参照しているため、後から旧版のパラメータで再計算できる。

**理由:** build-plan完了条件「任意のレコードを旧版係数で再計算できる」を直接満たす設計。

### 具体例(2026-08-02追記)

```
setId: "ifvi-water-consumption"
  version: "v1"  effectiveFrom: 2026-04-01  supersededBy: "v2"
  version: "v2"  effectiveFrom: 2027-04-01  changeReason: "IFVIがWater Consumption方法論を改訂(VFaccessの割引率を2%→2.5%に変更)"
```

2026年度に生成されたValuationRecordはすべて`v1`を参照している。2027年度にIFVIがv2を公開した後も、v1のレコードはそのまま(過去の開示と整合させるため)残り、**「このレコードを今のv2で再計算したらどうなるか」という比較を別途行うことができる。** どちらのバージョンで計算したかは常にAssumptionEntryとRecalculationHashに記録されているため、後から取り違えることがない。

---

## 4. 決定事項 D-4:ライセンス区分は実行時にゲーティングする。`pending_review`はM6のpending状態と同じパターンを再利用する

M1(`docs/data/licensing.md`)は、WDPAが契約締結までは`licenseMode: "pending_review"`であることを既に記録している。M8はこの状態を**実行時に強制する仕組み**として実装する。

```typescript
interface LicenseGate {
  dataSourceId: string;
  licenseMode: "embedded" | "reference_only" | "bring_your_own_license" | "pending_review";
}

// pending_reviewのデータソースに依存する評価・判定は実行せず、
// M6のD-10(承認閾値未入力時のpending状態)と同じ表示パターンを使う:
// 「このデータソースはライセンス確認待ちのため、この項目の判定は保留されています」
```

**理由:** M6のD-10で確立した「未確定を`null`ではなく明示的な`pending`状態として扱う」というパターンを、ライセンス未確定の状態にもそのまま適用する。新しいUI・状態管理パターンを発明しない(design-rationale-log D-45と同じ設計の再利用)。**WDPA関連のTNFD基準(M1 D-2の生物多様性重要性基準)は、IBAT Alliance経由の契約締結までは`pending`として扱われ、感応度スコアの該当基準は充足数のカウントに含めない。**

### 具体例(2026-08-02追記)

ある顧客が12拠点を登録しているとする。そのうち3拠点は、保護区(KBA)への近接判定にWDPAデータが必要だが、WDPAは`licenseMode: "pending_review"`(IBAT Alliance契約締結前)である。

```
12拠点中 9拠点: 5基準すべてが評価可能 → sensitivityScore = 0〜5の実数
        3拠点: highBiodiversityImportance基準(WDPA依存)のみpending
              → sensitivityScore は残り4基準の充足数のみで暫定算出、
                画面には「生物多様性重要性の判定はライセンス確認待ちのため
                保留されています(契約確定後に自動反映)」と表示
```

WDPAとの契約が締結された時点で、この3拠点の`pending`状態が解消され、5基準すべてで再計算される。**この再計算もAssumptionEntryとして記録され、「契約締結前は暫定スコアで評価していた」という事実が監査証跡に残る。**

---

## 5. 決定事項 D-5:AssumptionEntryは追記のみ(immutable)とし、訂正は新しいエントリで行う

**既存のAssumptionEntryを編集・削除する経路は用意しない。** 訂正が必要な場合は、新しいAssumptionEntryを追加し、`payload`内に前のエントリへの参照と変更理由を含める(M4の「手法変更時は前年度手法での再計算値を並記」、M6の`bindingMechanismHistory`、本書§3の`VersionedParameterSet.changeReason`と、既にすべて同じ「追記型の訂正」パターンを採用している)。

**理由:** 監査証跡としての性質上、過去の判断記録が書き換え可能だと監査価値が失われる。この原則は既に他モジュールで繰り返し採用されており、M8で初めて明文化するだけである。

---

## 6. 決定事項 D-6:DecisionRecordに「前提の実績照合」フィールドを構造のみ追加する(M6型定義の遡及的修正)

### 発見

構想書8.8はDecisionRecordの構成要素として「前提の実績照合(n年後、当初前提と実績の乖離)」を明記しているが、`docs/requirements/m6-decision-record.md`の型定義(§1)にこのフィールドが含まれていなかった。build-plan §4.1「後から入れると全レコードの作り直しになるものは薄くしない」に該当する項目であり、M8の作業として今のうちに追加する。

### 追加するフィールド

```typescript
interface DecisionRecord {
  // ...(m6-decision-record.md §1の既存フィールドに追加)
  actualOutcomeReview?: {
    reviewedAt: string;
    yearsElapsed: number;
    assumptionDeviation: string;   // 当初前提と実績の乖離の記述
    verdictStillValid: boolean;    // 当初の★判定が今も妥当か
  };
}
```

**機能は実装しない(build-plan §5.8「後回しでよい」)。** フィールドはOptionalとし、n年後に実際にレビューが行われた時点で埋める。自動アラート機能(前提が実績と乖離した場合に過去の「効かない」判定の再判定を促す)はフェーズ2以降とする。

**`docs/requirements/m6-decision-record.md`にも本フィールドを反映すること。**

---

## 7. 完了条件の確認

D-1〜D-6により、build-plan §5.8の完了条件(M1〜M7のすべての判断箇所からAssumptionEntryが自動生成され、任意のレコードを旧版係数で再計算できる)を満たす設計になっている。

---

## 8. 備考

M8では、既存モジュールへの遡及的な追記(D-6)が主な成果であり、これは「継続理由」という位置づけ通り、他モジュールが既に確立したパターン(pending状態、追記型の訂正、版管理)を横断的に束ねる作業だった。新規の事業判断は生じていない。
