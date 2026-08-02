# M7:開示生成と整合検証 — 要件定義

**対象モジュール:** M7(開示生成と整合検証)
**参照元:** `docs/concept-v2.md` 9.3、`docs/roadmap/build-plan.md` §5.7
**参照:** `docs/requirements/m3-monetization-engine.md`(適合度ティア・除外事項の入力元)
**status:** 確定(D-1〜D-6ですべての論点が決定済み)
**最終更新:** 2026-08-02

---

## 0. 位置づけ

予算科目と締切が存在する唯一の入口。差別化要因ではないが、導入の起点になる(build-plan §5.7)。

**MVP範囲:** 入力は既存の統合報告書・TCFD開示(自社が過去に公表した文書)。4段階処理。G1〜G4のみ検出(G5〜G8は後回し)。推奨アクション3種。

**実装上の必須制約(build-plan §5.7、最重要):**
> AIの役割は抽出に限定する。判定はルールで行う。段階3・段階4にLLMを使わない。

**用語の制約:** 「グリーンウォッシュ判定」ではなく「主張の根拠充足度」。断定的評価は法的リスクを伴う。他社評価は行わない(除外事項X6)。

**完了条件:** 自社の過去開示PDFを投入するとDisclosureClaimが抽出され、G1〜G4のギャップが検出される。

---

## 1. 決定事項 D-1:DisclosureClaimは、段階3のルールベース照合に耐える構造化データとして抽出する

### 論点

build-planの制約は「段階3・段階4にLLMを使わない」であり、段階1(抽出)・段階2(主張タイプの分類)にはAIの使用が許容されている。しかし段階3(根拠の紐付けと充足度判定)を**完全にルールベースで行う**ためには、段階1の抽出結果が、曖昧な自然文のままではなく、機械的に照合できる構造化データである必要がある。

### 採用する型

```typescript
interface DisclosureClaim {
  id: string;
  sourceDocument: string;
  sourcePageOrSection: string;
  rawText: string;   // 抽出された原文(そのまま保持。改変しない)

  claimType: "state" | "quantitative" | "trend" | "comparative" | "net_amount" | "future_commitment";
  // 段階2:主張タイプの分類。状態/定量/傾向/比較/純量/将来約束

  extractedMetadata: {
    // 段階1のAI抽出時に構造化して取得する。段階3がこの構造化データのみを使って
    // ルールベースの照合を行うため、ここが曖昧だと段階3が成立しない
    category: ImpactCategory | null;              // 言及されているカテゴリ(気候・水・汚染等)
    quantityMentioned: { value: number; unit: string } | null;
    periodMentioned: { startYear: number; endYear: number } | null;
    scopeMentioned: string | null;                 // 例:「Scope1・2」「国内拠点のみ」
  };

  extractionConfidence: "high" | "low";  // AIの抽出確信度。lowの場合は人間のレビューを促す
}
```

### 段階1・2でAIを使ってよい理由、段階3・4で使わない理由

- **段階1(抽出)・段階2(分類):** 「この文はどんな種類の主張か」を識別する作業であり、真偽・十分性の評価を含まない。build-planが明示的に禁止しているのは段階3・4のみであり、ここは対象外
- **段階3(根拠の紐付けと充足度判定)・段階4(ギャップ類型の判定):** 「この主張は十分に裏付けられているか」という評価そのものであり、build-planの制約により**LLMを一切使わない。** そのためには段階1の出力が構造化されている必要がある(上記の型)

**理由:** 「素朴なLLM実装は実態評価を経ずにグリーンウォッシュと区別できない回答を生成した事例がある」(build-plan)というリスクを避けるには、段階3・4のロジックがLLMの自然言語理解に一切依存しない設計になっている必要がある。抽出結果を構造化することで、これを可能にする。

### 具体例(2026-08-02追記):1件の主張が抽出から判定まで流れる様子

**入力(統合報告書の一文):** 「当社は2030年までに国内主要拠点における水使用量をScope1・2排出量とあわせて20%削減することを目指します。」

**段階1・2の出力(AI使用、構造化抽出):**

```json
{
  "id": "claim-2024-report-p42-01",
  "sourceDocument": "統合報告書2024",
  "sourcePageOrSection": "p.42",
  "rawText": "当社は2030年までに国内主要拠点における水使用量をScope1・2排出量とあわせて20%削減することを目指します。",
  "claimType": "future_commitment",
  "extractedMetadata": {
    "category": "water",
    "quantityMentioned": { "value": 20, "unit": "%" },
    "periodMentioned": { "startYear": 2026, "endYear": 2030 },
    "scopeMentioned": "国内主要拠点"
  },
  "extractionConfidence": "high"
}
```

**段階3(ルールベース照合、§2のEvidenceMatch):** `category: "water"`・`periodMentioned`・`scopeMentioned: "国内主要拠点"`を、既存のMaterialIssue・ValuationRecordの構造化フィールドと完全一致で照合する。もし「国内主要拠点」に該当する拠点のうち、水カテゴリのMaterialIssueが3拠点中1拠点にしか存在しなければ、`matchedRecordIds`は1件のみ返る。

**段階4(§3のGapFinding):** 主張は「主要拠点全体」を指しているのに根拠は1拠点分しかない → **G3(範囲不一致)** と機械的に判定される。この判定はルールのみで行われ、LLMは一切関与しない。

## 2. 決定事項 D-2:段階3の照合ロジックは、M3の既存フィールド(適合度ティア・除外事項)をそのまま参照する

```typescript
interface EvidenceMatch {
  claimId: string;
  matchedRecordIds: string[];   // MaterialIssue / ValuationRecord のID。ルールベースの構造化照合で発見
  matchMethod: "category_period_scope_exact_match";  // 曖昧な意味的類似度ではなく構造化フィールドの完全一致
}
```

**照合ルール:** `DisclosureClaim.extractedMetadata`の`category`・`periodMentioned`・`scopeMentioned`と、既存の`MaterialIssue`・`ValuationRecord`の対応フィールドを**構造化フィールドの一致**で照合する。自然言語的な類似度判定は行わない。

**理由:** M3が既に持つデータ(適合度ティア、除外事項リスト)をそのまま再利用することで、M7独自の評価基準を新設しない(design-rationale-log D-03・D-37・D-41と同じ「既存出力の再利用」原則)。

---

## 3. 決定事項 D-3:G1〜G4は、M3の既存フィールドから機械的に判定する

```typescript
type GapType = "G1_no_evidence" | "G2_weak_evidence" | "G3_scope_mismatch" | "G4_period_mismatch";

interface GapFinding {
  claimId: string;
  gapType: GapType | null;   // nullは根拠充足(ギャップなし)
  evidenceMatch: EvidenceMatch;
  recommendedActions: RecommendedAction[];  // §4参照
}
```

| ギャップ類型 | 判定ルール |
|---|---|
| G1(根拠不在) | `matchedRecordIds`が空配列 |
| G2(根拠薄弱) | 一致するレコードはあるが、すべて`transferFitness.tier === "C"`(M3 §4・§5、design-rationale-log D-19・D-26で既に定義済みのティア)。スクリーニング深度でESVD要約値のみ使った場合の強制ティアC(M3 §6、design-rationale-log D-27)も含む |
| G3(範囲不一致) | 一致するレコードの`scopeMentioned`相当のデータが、主張の`scopeMentioned`と異なる(例:主張は「全社」だが根拠は特定拠点のみ) |
| G4(期間不一致) | 一致するレコードの対象期間が、主張の`periodMentioned`と異なる |

**判定の優先順位:** G1(存在しない)→G2(存在するが薄弱)→G3(範囲が違う)→G4(期間が違う)の順にチェックし、最初に該当したものを採用する。複数該当しうる場合(例:根拠薄弱かつ範囲不一致)は、より根本的な問題(存在・強度)を優先する。

**この4類型はすべて、M3が既に出力するフィールド(`transferFitness.tier`・`scopeExclusions`等)の機械的な参照で判定できる。新しい評価基準を追加していない。**

**G5〜G8はMVPスコープ外。** 特にG6(選択的開示の検出)はM2の除外理由記録(build-plan §5.5「M7のG6を可能にする唯一の情報源」)を必要とするため、G1〜G4の判定にはM2の除外理由データを一切使わない(G6実装時に初めて接続する)。

---

## 4. 決定事項 D-4:推奨アクション3種はすべて提示し、システムはどれかを推奨しない

```typescript
type RecommendedAction =
  | { kind: "weaken_claim" }                                          // ①主張を弱める
  | { kind: "acquire_additional_evidence"; triggersDeepDive: true }    // ②根拠を追加取得する(深掘りへの導線)
  | { kind: "record_as_intentional_decision"; reason: string };        // ③意図的判断として記録する

interface IntentionalDecisionRecord {
  gapFindingId: string;
  reason: string;   // 必須入力。デフォルトなし
  recordedAt: string;
  recordedBy: string;
}
```

**3種すべてを常に提示し、デフォルトの選択肢を設けない。** M6のD-9(拘束方式にデフォルト値を設けず明示選択を必須とする)と同じ原則。「③意図的判断として記録する」を選ぶ場合、理由の入力を必須とする。

**③を用意する理由(build-planより):** 「③を用意しないと実務で使われなくなる」。すべてのギャップを①②で対応させようとすると、実務上対応しきれない軽微なギャップまで無理に修正を迫ることになり、利用が敬遠される。

---

## 5. 決定事項 D-5:ギャップ記録の恒久的な保存は、製品の存在理由そのものであり、後退させない

### 検討した懸念(それ自体は正当だが、採用しなかった案)

M7は顧客自身の過去の公開開示について「根拠が薄弱」等のギャップを検出し記録する。この記録が将来の訴訟・規制調査等で顧客に不利に使われるのではないか、という懸念が想定されうる。この懸念自体は一般論として正当である。

**検討した案:** ギャップ検出結果を、顧客が対応を決めるまでは正式記録とせず、下書き・非永続の状態で保持する。

**採用しなかった理由:**
1. **構想書5.4は「監査・保証への耐性」(ISSA 5000等の保証基準下では『なぜこの数字か』の説明が必須要件になる)を、顧客がPRISMを買う4つの理由の1つとして明記している。** つまり顧客がこの製品を導入する動機の一部は、まさに「自己点検の記録を残すこと」自体にある
2. **M7の位置づけ(構想書9.3・design-rationale-log D-05)は「公表前の自己点検」であり、内部統制・内部監査が意図的に発見事項の記録を残す(それ自体が是正の証拠になる)のと同じ論理構造を持つ。** 記録を残さない設計にすると、この製品が本来提供すべき監査対応力そのものが失われる
3. **M8全体の設計思想(D-04、判断が発生する全箇所で自動的に前提台帳に記録する)と矛盾する。** M7だけ例外的に記録を後退させると、製品全体の一貫性が崩れる

**結論:** ギャップ検出結果は、他のAssumptionEntryと同様に検出時点で記録する。この設計は変更しない。ただし将来、顧客からこの点への懸念が実際に寄せられた場合は、アクセス権限の絞り込み(法務・コンプライアンス部門限定の閲覧権限等)といった運用上の対応を検討する余地を残す(製品設計としては変更しないが、運用上の緩和策は将来の論点として記録する)。

---

## 6. 決定事項 D-6:PDF抽出の失敗は推定せず、抽出不能として明示する

住所ジオコーディング(M1 D-3)と異なり、PDFからのテキスト抽出は解釈を伴う。抽出に失敗した箇所(スキャン画像のみで構成されたページ等)は、**空文字列や推定テキストで埋めず、`extractionConfidence: "low"`または抽出不能フラグを立てて人間のレビューに委ねる。** 推定で埋めない原則(design-rationale-log D-15)の適用。

---

## 7. 完了条件の確認

D-1〜D-4により、build-plan §5.7の完了条件(過去開示PDFを投入するとDisclosureClaimが抽出され、G1〜G4のギャップが検出される)を満たす設計になっている。

---

## 8. 備考

M7では、「顧客自身の過去開示のギャップを記録することの妥当性」という一見重い論点が浮上したが、検討の結果、構想書・design-rationale-logが既に明記している製品の存在理由(監査・保証への耐性、D-05・D-04)から必然的に導かれる結論であり、新規の事業判断を要しなかった(§5参照)。M1(ENCOREライセンス)・M6(承認閾値入力方式)のような外部確認は生じていない。
