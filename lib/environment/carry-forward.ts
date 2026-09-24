import type { EnvironmentalTarget } from "./metrics";
import type { TargetValues } from "./csv";
/** 昨年の実績は今年の実績にしない。昨年の値は根拠付き比較基準としてのみ使う。 */
export function carryForwardValues(source: EnvironmentalTarget): TargetValues {
  return {
    siteId: source.siteId, metricId: source.metricId, reportingYear: source.reportingYear + 1, boundary: source.boundary,
    direction: source.direction, owner: source.owner, archived: false,
    current: null, target: null, baseline: source.current,
    measuredOn: source.current === null ? "" : source.measuredOn,
    evidence: source.current === null ? "" : `比較基準: ${source.reportingYear}年の実測値。\n${source.evidence}`,
    targetBasis: "", dueDate: "", actionPlan: "",
  };
}
