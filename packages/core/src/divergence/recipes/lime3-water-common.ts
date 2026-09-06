/**
 * M4完成 T-10a/T-11:LIME3(AIST-IDEA Ver.4.0)水消費トレースを読むための共通部品。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §7.2.1、
 *         docs/data/lime3-coefficients-notes.md §3.1〜§3.2・§5.1
 *
 * LIME3 の水は「基本フロー(表層水 001511000 / 地下水 001515000)× 地理的視点(消費国・世界平均 /
 * 消費国・日本)」の4列からなる。手法IDと版だけでは同一手法の内部変種を区別できないため、
 * **トレースに記録された一次資料の列名(evidence.locator)から採用列を読み取る**。
 * 係数の生値はここに転記せず、列名・行コードだけを扱う(§0.2・licensing.md)。
 */

import type { EvidenceRef } from "../../types/comparison";
import type { MethodEvaluationTrace } from "../../types/trace";
import { findLiteral, type LiteralSelector } from "./trace-swap";

/** LIME3 水の係数照会ステップ(`plugins/lime3-water.ts` の `buildDecomposedSteps`)。 */
export const LIME3_LOOKUP_STEP_KIND = "coefficient_lookup" as const;
export const LIME3_USD_STEP_ID = "lime3-water.coefficient_application.usd";
export const LIME3_ENDPOINT_ALLOCATION_STEP_ID = "lime3-water.endpoint_allocation";

export const LIME3_DALY_SELECTOR: LiteralSelector = {
  key: "daly_per_m3",
  settingKey: "daly_per_m3",
  label: "人間健康 DALY/m³(採用列)",
};

export const LIME3_PERSPECTIVE_SELECTOR: LiteralSelector = {
  key: "perspective_column",
  settingKey: "perspective_column",
  label: "採用列マーカー(地理的視点)",
};

export const LIME3_USD_PER_DALY_SELECTOR: LiteralSelector = {
  key: "usd_per_daly",
  settingKey: "usd_per_daly",
  label: "統合化係数 US$/DALY(採用列)",
};

/** 人間健康エンドポイントへの配分率。`settingKey` を持たないためオペランド名で照合する。 */
export const LIME3_ALLOCATION_SELECTOR: LiteralSelector = {
  key: "endpoint_allocation_fraction",
  operandName: "allocationFraction",
  label: "人間健康エンドポイントへの配分率",
};

export function lime3LookupStepId(trace: MethodEvaluationTrace): string | undefined {
  return trace.steps.find((step) => step.kind === LIME3_LOOKUP_STEP_KIND)?.id;
}

export function lime3UsdStepId(trace: MethodEvaluationTrace): string | undefined {
  return trace.steps.find((step) => step.id === LIME3_USD_STEP_ID)?.id;
}

export function lime3AllocationStepId(trace: MethodEvaluationTrace): string | undefined {
  return trace.steps.find((step) => step.kind === "endpoint_allocation")?.id;
}

export type Lime3Perspective = "consumption_world_average" | "consumption_japan";

export interface Lime3Column {
  /** 基本フローコード(001511000 表層水 / 001515000 地下水)。 */
  flowId: string;
  perspective: Lime3Perspective;
}

/**
 * トレースの一次資料引用から採用列を読み取る。読み取れない場合は null を返し、
 * 「たぶん日本列だろう」といった推定をしない(D-15)。
 *
 * `plugins/lime3-water.ts` が `config.lime3WaterCoefficient` を持たずに組み立てた
 * 単一係数トレース(構成要素非公開)には係数照会ステップが無いため、常に null になる。
 */
export function readLime3Column(trace: MethodEvaluationTrace): Lime3Column | null {
  if (trace.methodId !== "lime3-water") return null;
  const stepId = lime3LookupStepId(trace);
  if (!stepId) return null;
  const daly = findLiteral(trace, stepId, LIME3_DALY_SELECTOR);
  if (!daly) return null;

  const locators = daly.evidence.map((evidence: EvidenceRef) => evidence.locator ?? "").join(" | ");
  const flowId = /row\s+(\d{9})/.exec(locators)?.[1];
  const perspective: Lime3Perspective | undefined = locators.includes("世界平均")
    ? "consumption_world_average"
    : locators.includes("日本")
      ? "consumption_japan"
      : undefined;
  if (!flowId || !perspective) return null;
  return { flowId, perspective };
}

export const LIME3_PERSPECTIVE_LABEL: Record<Lime3Perspective, string> = {
  consumption_world_average: "消費国・世界平均",
  consumption_japan: "消費国・日本",
};

export const LIME3_FLOW_LABEL: Record<string, string> = {
  "001511000": "資源, 表層水, 水圏, 取水",
  "001515000": "資源, 地下水, 水圏, 取水",
};

/** LIME3 水係数の一次資料(値は転記せず、ファイル・行・列の位置だけを持つ)。 */
export const LIME3_CSV_EVIDENCE: EvidenceRef = {
  source: "docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv",
  locator: "基本フロー 001511000(表層水)/ 001515000(地下水)、利子率2%・消費国・世界平均/日本の各列",
  version: "AIST-IDEA Ver.4.0 標準版(リリース日2026-05-15)",
  tier: "primary",
  note: "docs/data/lime3-coefficients-notes.md §5.1(元Excel全980行との差分0行を確認済み)",
};

export const LIME3_NOTES_EVIDENCE: EvidenceRef = {
  source: "docs/data/lime3-coefficients-notes.md",
  locator: "§3.1・§3.2(採用列の選定根拠と未確認の仮定)",
  tier: "secondary",
};

export const LIME3_ALLOCATION_EVIDENCE: EvidenceRef = {
  source:
    "Yamasaki, Ikaga & Itsubo (2020)「国際対応型LCIA手法LIME3の枠組みに基づく世界42カ国の行政区域の年間環境影響評価」",
  locator: "Table 2(42カ国×影響カテゴリ×保護対象のクロス集計、水消費行)",
  version: "doi:10.3130/aije.85.67",
  tier: "primary",
  note:
    "水消費の損害は100%人間健康に配分され、社会資産・生物多様性・一次生産への配分はゼロ" +
    "(CSVの該当3列も空欄)。ゼロ寄与公理を実データ構造で検証するための根拠。",
};
