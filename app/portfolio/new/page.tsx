import Link from "next/link";
import { notFound } from "next/navigation";
import { carryForwardValues } from "@/lib/environment/carry-forward";
import { MAX_REPORTING_YEAR, TARGET_CATEGORIES, type TargetCategory } from "@/lib/environment/metrics";
import { loadPipelineView } from "@/lib/views/pipeline";
import { Card, ScreenLead } from "../../components/ui";
import { TargetForm } from "../target-form";

function isTargetCategory(value: string | undefined): value is TargetCategory {
  return value !== undefined && Object.hasOwn(TARGET_CATEGORIES, value);
}

/** `?from=` は翌年への引継ぎ、`?category=` は種類の初期選択。 */
export default async function NewTargetPage({ searchParams }: { searchParams: Promise<{ category?: string; from?: string }> }) {
  const { category, from } = await searchParams;
  const result = await loadPipelineView();
  const source = from
    ? result.environmentalTargets.find((record) => record.id === from && !record.archived && record.reportingYear < MAX_REPORTING_YEAR)
    : undefined;
  if (from && !source) notFound();

  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">管理する環境指標を追加</h1>
        <ScreenLead>1つの拠点・対象年・測定範囲ごとに登録します。実測値がまだなくても、目標と担当・期限から管理を始められます。</ScreenLead>
        <p className="page-back"><Link href="/portfolio">← 統合管理へ</Link></p>
      </div>
      <Card title="指標と目標">
        <TargetForm
          sites={result.assessment.sites.map((site) => ({ id: site.id, name: site.name }))}
          initialCategory={isTargetCategory(category) ? category : "biological_resources"}
          initial={source ? carryForwardValues(source) : undefined}
          source={source}
        />
      </Card>
    </div>
  );
}
