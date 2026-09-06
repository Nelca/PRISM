/**
 * M4完成 T-13:同一手法の内訳集計(§4-8)の宣言。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §4-8・T-13.3
 *
 * 分解エンジンは集計式を推測しない。手法アダプター側の知識を持つこの層が、
 * 実装済みの公式集計式(IFVI Eq.2)をそのまま宣言として渡す。
 */

import type { IntraMethodBreakdownSpec } from "../divergence/build-divergence-decomposition-v2";
import type { ValuationRecord } from "../types/valuation";
import { IFVI_WATER_AGGREGATION } from "./plugins/ifvi-water-consumption";

const IFVI_WATER_PARENT_METHOD_ID = "ifvi-water-consumption";
/** IFVI Eq.2 の MAX 候補(近接期3経路)。VFaccess は常に加算される。 */
const IFVI_WATER_MAX_CANDIDATES = ["VFnutrition", "VFdisease", "VFes"] as const;

function subFactorIdOf(methodId: string): string {
  const dot = methodId.indexOf(".");
  return dot === -1 ? methodId : methodId.slice(dot + 1);
}

/**
 * 同一手法の内訳集計の既定宣言。現状は水カテゴリの IFVI Eq.2
 * (`VFaccess + MAX(VFnutrition, VFdisease, VFes)`)だけ。
 *
 * **なぜこの物理量の全レコードを閉じ込めるのか。** 内訳分析は価値概念グループごとに作られるが、
 * Eq.2 は厚生価値(VFnutrition/VFdisease/VFes)と交換価値(VFaccess)を跨いで合成する
 * (`mixesValueConcepts: true`、aop-mapping-v1.md §0)。厚生価値グループの内訳だけでは公式集計値を
 * 再構成できないため、同じ物理量から実際に計算された4本の値を渡す。**推定値で欠損を埋めてはいない**:
 * 4本が揃わない場合は再構成に失敗し、集計値は `null` のままになる。
 */
export function buildDefaultBreakdownSpecs(records: ValuationRecord[]): IntraMethodBreakdownSpec[] {
  const ifviValues: Record<string, number> = {};
  for (const record of records) {
    if (!record.methodId.startsWith(`${IFVI_WATER_PARENT_METHOD_ID}.`)) continue;
    ifviValues[subFactorIdOf(record.methodId)] = record.centralValue as number;
  }
  if (Object.keys(ifviValues).length === 0) return [];

  const merged = (values: Record<string, number>): Record<string, number> => ({ ...ifviValues, ...values });

  return [
    {
      parentMethodId: IFVI_WATER_AGGREGATION.parentMethodId,
      aggregationFormula: IFVI_WATER_AGGREGATION.aggregationFormula,
      mixesValueConcepts: IFVI_WATER_AGGREGATION.mixesValueConcepts,
      reconstruct: (values) => IFVI_WATER_AGGREGATION.reconstruct(merged(values)),
      /**
       * 集計式で採用された内訳。VFaccess は常に加算されるため採用。MAX 側は最大値を取る内訳を返す。
       * 最大値が同点の場合は該当するものをすべて返す(どれが選ばれたかを1つに決めつけない)。
       */
      selected: (values) => {
        const all = merged(values);
        const candidates = IFVI_WATER_MAX_CANDIDATES.filter((id) => all[id] !== undefined);
        if (candidates.length === 0) return "VFaccess" in all ? ["VFaccess"] : [];
        const max = Math.max(...candidates.map((id) => all[id]));
        const selected = candidates.filter((id) => all[id] === max) as string[];
        return "VFaccess" in all ? ["VFaccess", ...selected] : selected;
      },
    },
  ];
}
