import type { InputCoverageSummary, MethodAvailability } from "@/lib/demo/run-demo-pipeline";
import type { PhysicalQuantityInput, ValuationRecord } from "@core/types/valuation";
import { categoryLabel } from "../components/labels";

export function physicalQuantityLabel(category: PhysicalQuantityInput["category"]): string {
  if (category === "climate") return "GHG排出量(年間)";
  if (category === "water") return "取水量(年間)";
  if (category === "pollution") return "汚染物質排出量";
  if (category === "waste") return "廃棄物量";
  return "土地利用量";
}

export function coverageStatusLabel(status: "calculated" | "unmapped" | "transferOnly" | "blocked"): string {
  return {
    calculated: "算定済み",
    unmapped: "係数未対応",
    transferOnly: "移動量(算定対象外)",
    blocked: "算定停止",
  }[status];
}

export function coverageRows(coverage: InputCoverageSummary) {
  return coverage.quantities.flatMap((breakdown) =>
    (Object.entries({
      calculated: breakdown.calculated,
      unmapped: breakdown.unmapped,
      transferOnly: breakdown.transferOnly,
      blocked: breakdown.blocked,
    }) as ["calculated" | "unmapped" | "transferOnly" | "blocked", number][])
      .filter(([status, quantity]) => quantity > 0 || breakdown.rowCounts[status] > 0)
      .map(([status, quantity]) => [status, quantity, breakdown.unit, breakdown.rowCounts[status]] as const)
  );
}

export function availabilityLabel(availability: MethodAvailability): string {
  if (availability.status === "available") return "利用可能";
  if (availability.status === "pending_review") return "利用条件を確認中";
  if (availability.status === "expired") return "利用期限切れ";
  return "利用不可";
}

export function inputSourceLabel(sourceKind: string): string {
  return {
    public_prtr: "環境省の公開PRTR（照合・デモ用）",
    customer_prtr: "顧客提供PRTR（顧客確認値）",
    customer_csv: "顧客提供CSV",
    demo_sample: "架空のデモサンプル",
  }[sourceKind] ?? sourceKind;
}

export function inputDetail(input: PhysicalQuantityInput | undefined): string | null {
  if (!input) return null;
  if (input.category === "pollution") {
    return `${input.prtrSubstanceCode} ・ ${mediumLabel(input.releaseMedium)} ・ PRTR ${input.reportingYear}年度`;
  }
  if (input.category === "waste") {
    const internalCost = input.internalTreatmentCost === undefined
      ? "内部処理費用は未入力"
      : `内部処理費用 ${new Intl.NumberFormat("ja-JP").format(input.internalTreatmentCost)}円（厚生価値へ非加算）`;
    return `${input.wasteTypeCode} ・ ${input.treatmentRoute} ・ ${input.treatmentLocation === "onsite" ? "事業所内" : "事業所外"} ・ ${internalCost}`;
  }
  if (input.category === "land_use") {
    return input.activityKind === "conversion"
      ? `${input.landClassBefore} → ${input.landClassAfter}への転換`
      : `${input.landClass}の占有`;
  }
  return null;
}

export function mediumLabel(medium: string): string {
  return {
    air: "大気",
    public_water: "公共用水域",
    soil: "土壌",
    onsite_landfill: "事業所内埋立",
    sewer: "下水道への移動",
    offsite_waste: "事業所外への移動",
  }[medium] ?? medium;
}

export function isLime3SingleMethodPilot(records: ValuationRecord[]): boolean {
  const methods = new Set(records.map((record) => record.methodId));
  return methods.size === 1 && [...methods][0]?.startsWith("lime3-") === true;
}

export function categoryDescription(category: PhysicalQuantityInput["category"]): string {
  return `${categoryLabel(category)}の入力・係数・算定範囲を記録しています。`;
}
