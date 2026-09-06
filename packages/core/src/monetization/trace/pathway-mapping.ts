/**
 * 完成実装 T-04:AoPより細かい因果経路(pressure → midpoint → damage pathway → AoP → metric →
 * 貨幣化技法)の対応表。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.2、T-04、
 *         docs/data/aop-mapping-v1.md §1.3・§2、docs/data/method-recalculability.md §3.3
 *
 * IFVI水4内訳(VFnutrition/VFdisease/VFes/VFaccess)とLIME3水消費・代替費用法について、
 * 一次資料を再確認して経路・指標を対応付けたもの。対応不能な階層は "unmapped" のまま残し、
 * 推定で埋めない(§5.2・D-15)。
 *
 * ---
 *
 * **既存の二重コード体系との関係(§5.2「既存の二重コード体系との関係を先に決める」への対応)。**
 * `ValuationRecord` / `MethodOutput` が既に持つフィールドが、この階層のどこに位置するかを
 * 明示する。並行する第2の分類体系は作らない。
 *
 * | 既存フィールド | この階層での位置 |
 * |---|---|
 * | `aopCode` | `CausalPathway.aopCode` と同一体系(AoP階層)。そのまま引き継ぐ |
 * | `aopSourceLabel` | この階層には対応する構造化フィールドはない。手法側原表記であり、`damagePathway` の人間可読ラベルに近いが、`damagePathway` はPRISM側の正規化コードである点が異なる |
 * | `aopMappingConfidence` | `aopCode` 対応付けそのものの確度。`CausalPathway.review`(このpathway対応表自体のレビュー状態)とは別軸(前者は値の対応付け精度、後者は表の検証状態) |
 * | `metric` | `CausalPathway.metric` と同一体系。そのまま引き継ぐ |
 * | `cicesRef.cicesCode` / `cicesVersion` | 依存側(生態系サービス、CICES/TEEB)の分類。`CausalPathway` は影響側(pressure→…→damagePathway→AoP→metric→貨幣化技法)の階層であり、CICESとは別軸(M4要件定義書§6.2)。対応なし |
 * | `specifiedLevel` | CICES一致階層(依存側)の粒度区分。`CausalPathway` とは別軸 |
 * | `cicesMatchLevel`(再計算ハッシュ・M4台帳payload) | 同上。CICES一致階層の版。`CausalPathway` とは別軸 |
 *
 * `CausalPathway` が新たに持つのは、`aopCode` より細かい中間階層(`pressure`/`midpoint`/
 * `damagePathway`)と `valuationTechnique`(貨幣化技法)。既存フィールドを置き換えるのではなく、
 * その上位・下位に位置づける拡張である。
 */

import type { CausalPathway } from "../../types/comparison";

export const PATHWAY_MAPPING_VERSION = "pathway-mapping-v1";

/** この対応表を確認した日(ISO 8601)。AIによる一次資料再確認の実施日。 */
const REVIEWED_AT = "2026-09-06";

/**
 * LIME3水消費の一次資料に基づく引用群。
 * 出典: Yamasaki, Ikaga & Itsubo (2020)「国際対応型LCIA手法LIME3の枠組みに基づく
 * 世界42カ国の行政区域の年間環境影響評価」日本建築学会環境系論文集85(767)、
 * doi:10.3130/aije.85.67、Table 2(42カ国×影響カテゴリ×保護対象のクロス集計)。
 */
const LIME3_WATER_EVIDENCE = [
  {
    source:
      "Yamasaki, Ikaga & Itsubo (2020)「国際対応型LCIA手法LIME3の枠組みに基づく世界42カ国の行政区域の年間環境影響評価」",
    locator: "Table 2(42カ国×影響カテゴリ×保護対象のクロス集計、水消費行)",
    version: "doi:10.3130/aije.85.67",
    tier: "primary" as const,
    note:
      "水消費(Water consumption)の損害額(42カ国合計1.36×10¹²ドル)は100%人間健康エンドポイントに配分され、" +
      "社会資産・生物多様性・一次生産への配分はゼロ(欄が空白)であることを確認済み。",
  },
  {
    source: "docs/data/aop-mapping-v1.md",
    locator: "§2.1 水資源との接続",
    tier: "secondary" as const,
  },
  {
    source: "docs/data/method-recalculability.md",
    locator: "§3.3 水資源エンドポイントの配分:確定",
    tier: "secondary" as const,
  },
];

/**
 * IFVI Water Consumption Topic Methodology(最終版・VTPC承認済み、2026年3月)の一次資料引用。
 */
const IFVI_METHODOLOGY_EVIDENCE = {
  source: "IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf(最終承認版)",
  version: "2026年3月",
  tier: "primary" as const,
};

const AOP_MAPPING_V1_13 = {
  source: "docs/data/aop-mapping-v1.md",
  locator: "§1.3 Water Consumption(最終版・VTPC承認済み 2026年3月)",
  tier: "secondary" as const,
};

/**
 * IFVI水4内訳とLIME3水消費・代替費用法の因果経路対応表(T-04)。
 * キーは `ValuationRecord.methodId`(`{親手法ID}.{内訳ID}` 形式、単一内訳の手法は手法IDそのもの)。
 */
export const WATER_PATHWAYS: Record<string, CausalPathway> = {
  /**
   * LIME3(水消費)。水消費の損害は100%人間健康エンドポイントに配分される
   * (Yamasaki et al. 2020 Table 2)。pressure/midpointはLIME3の特性化モデル
   * (取水→水不足→健康影響)の一次資料記述から確認済み。
   */
  "lime3-water": {
    pressure: "water_withdrawal",
    midpoint: "freshwater_scarcity",
    damagePathway: "water_scarcity_human_health",
    aopCode: "human_health",
    metric: "DALY",
    valuationTechnique: "daly_monetization",
    mappingVersion: PATHWAY_MAPPING_VERSION,
    review: {
      status: "evidence_verified",
      reviewer: { kind: "ai" },
      reviewedAt: REVIEWED_AT,
      verification: [
        "aop-mapping-v1.md §2.1・method-recalculability.md §3.3で、水消費損害が100%人間健康に配分されることを一次資料(Yamasaki et al. 2020 Table 2)で確認",
      ],
    },
    evidence: LIME3_WATER_EVIDENCE,
  },

  /**
   * IFVI VFnutrition(Affected health from malnutrition)。農業用水制限による地域の
   * 栄養不良→DALY損失をVSLで評価(出典元データはLC-Impact)。
   */
  "ifvi-water-consumption.VFnutrition": {
    pressure: "unmapped",
    midpoint: "unmapped",
    damagePathway: "agricultural_water_shortage_malnutrition",
    aopCode: "human_health",
    metric: "DALY",
    valuationTechnique: "vsl",
    mappingVersion: PATHWAY_MAPPING_VERSION,
    review: {
      status: "evidence_verified",
      reviewer: { kind: "ai" },
      reviewedAt: REVIEWED_AT,
      verification: [
        "aop-mapping-v1.md §1.3 VFnutrition行(健康影響として明記、DALY/VSL使用、確度:高)を一次資料本文で確認",
      ],
    },
    evidence: [
      { ...IFVI_METHODOLOGY_EVIDENCE, locator: "VFnutrition(Affected health from malnutrition)節" },
      AOP_MAPPING_V1_13,
    ],
  },

  /**
   * IFVI VFdisease(Affected health from water-borne disease)。家庭用淡水利用・
   * 上下水道接続・GDP・気温からDALYを推定(Motoshita et al. 2011)、VSLで評価。
   */
  "ifvi-water-consumption.VFdisease": {
    pressure: "unmapped",
    midpoint: "unmapped",
    damagePathway: "waterborne_disease",
    aopCode: "human_health",
    metric: "DALY",
    valuationTechnique: "vsl",
    mappingVersion: PATHWAY_MAPPING_VERSION,
    review: {
      status: "evidence_verified",
      reviewer: { kind: "ai" },
      reviewedAt: REVIEWED_AT,
      verification: [
        "aop-mapping-v1.md §1.3 VFdisease行(健康影響として明記、DALY/VSL使用、確度:高)を一次資料本文で確認",
      ],
    },
    evidence: [
      { ...IFVI_METHODOLOGY_EVIDENCE, locator: "VFdisease(Affected health from water-borne disease)節" },
      AOP_MAPPING_V1_13,
    ],
  },

  /**
   * IFVI VFes(Altered ecosystem services)。水の可用性と生態系サービス供給力の関係を
   * ESVD(Brander et al. 2024)・実蒸発散量(AET)で評価。
   *
   * **H-01候補(人間GATE対象):** aop-mapping-v1.md §1.3は「生態系の状態(種の絶滅リスク等)
   * ではなく、生態系が提供するサービス供給力の毀損を扱うため `ecosystem_quality` ではなく
   * `resource_availability` と判断」と記す(確度:中〜高)。`ecosystem_quality` という合理的な
   * 別解釈が残り、顧客説明・監査結論を変えうるため `pending_domain_review` とする。
   */
  "ifvi-water-consumption.VFes": {
    pressure: "unmapped",
    midpoint: "unmapped",
    damagePathway: "altered_ecosystem_services",
    aopCode: "resource_availability",
    metric: "USD",
    valuationTechnique: "benefit_transfer_esvd",
    mappingVersion: PATHWAY_MAPPING_VERSION,
    review: {
      status: "pending_domain_review",
      reviewer: { kind: "ai" },
      reviewedAt: REVIEWED_AT,
      verification: [
        "aop-mapping-v1.md §1.3の判断根拠: 生態系の状態(種の絶滅リスク等)ではなく、生態系が提供する" +
          "サービス供給力の毀損を扱うため `ecosystem_quality` ではなく `resource_availability` と判断(確度:中〜高)。" +
          "`ecosystem_quality` という合理的な別解釈が残り、選択が顧客説明・監査結論を変えうるためH-01候補として保留",
      ],
    },
    evidence: [
      { ...IFVI_METHODOLOGY_EVIDENCE, locator: "VFes(Altered ecosystem services)節、Appendix B19-B25" },
      { ...AOP_MAPPING_V1_13, note: "確度「中〜高」。生物多様性(種の絶滅リスク)とサービス供給力の区別が判断の核心" },
    ],
  },

  /**
   * IFVI VFaccess(Financial costs to access future water)。水ストレス(需要/供給比)が1を
   * 超える分の抽出について、将来の水供給単価(IBnetベンチマーク)を用いて2080年まで割引現在
   * 価値化する代替費用モデル。AoP体系(損害到達先の分類)の対象外。
   */
  "ifvi-water-consumption.VFaccess": {
    pressure: "water_withdrawal",
    midpoint: "water_stress_exceedance",
    damagePathway: "future_water_access_cost",
    aopCode: "not_applicable",
    metric: "USD",
    valuationTechnique: "replacement_cost",
    mappingVersion: PATHWAY_MAPPING_VERSION,
    review: {
      status: "evidence_verified",
      reviewer: { kind: "ai" },
      reviewedAt: REVIEWED_AT,
      verification: [
        "aop-mapping-v1.md §1.3 VFaccess行: 損害到達先(AoP)の分類ではなく、代替費用法と同型の直接費用モデルであり、" +
          "正規化コードのいずれにも該当しないと確認(確度:高)",
      ],
    },
    evidence: [
      { ...IFVI_METHODOLOGY_EVIDENCE, locator: "VFaccess(Financial costs to access future water)節、Appendix B26-B33" },
      AOP_MAPPING_V1_13,
    ],
  },

  /**
   * 代替費用法(自社定義)。エンドポイントモデルを用いない直接的な代替調達コストであり、
   * AoP体系の対象外(aop-mapping-v1.md §3)。
   */
  "replacement-cost": {
    pressure: "water_withdrawal",
    midpoint: "unmapped",
    damagePathway: "own_replacement_procurement_cost",
    aopCode: "not_applicable",
    metric: "USD",
    valuationTechnique: "replacement_cost",
    mappingVersion: PATHWAY_MAPPING_VERSION,
    review: {
      status: "evidence_verified",
      reviewer: { kind: "ai" },
      reviewedAt: REVIEWED_AT,
      verification: [
        "aop-mapping-v1.md §3: 代替費用法はエンドポイント被覆モデルを用いず、直接的な代替調達コストを算出する" +
          "交換価値ベースの手法であり、対応付けの対象にならない(対応不能ではなくモデル構造上の対象外)と確認",
      ],
    },
    evidence: [
      { source: "docs/data/aop-mapping-v1.md", locator: "§3 代替費用法", tier: "secondary" },
      { source: "docs/requirements/m4-divergence-decomposition.md", locator: "§6.1", tier: "secondary" },
    ],
  },
};
