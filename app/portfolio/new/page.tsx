import { carryForwardValues } from "@/lib/environment/carry-forward";
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadPipelineView } from "@/lib/views/pipeline";
import { TARGET_CATEGORIES, type TargetCategory } from "@/lib/environment/metrics";
import { Card, ScreenLead } from "../../components/ui";
import { TargetForm } from "../target-form";
export default async function NewTargetPage({ searchParams }: { searchParams: Promise<{ category?: string; from?: string }> }) {
  const { category, from } = await searchParams;
  const initialCategory: TargetCategory = category && Object.hasOwn(TARGET_CATEGORIES, category) ? category as TargetCategory : "biological_resources";
  const result = await loadPipelineView();
  const source = from ? result.environmentalTargets.find((record) => record.id === from && !record.archived && record.reportingYear < 2200) : undefined;
  if (from && !source) notFound();
  return <div className="screen"><div className="screen__head"><h1 className="screen__title">管理する環境指標を追加</h1><ScreenLead>1つの拠点・対象年・測定範囲ごとに登録します。実測値がまだなくても、目標と担当・期限から管理を始められます。</ScreenLead><p className="page-back"><Link href="/portfolio">← 統合管理へ</Link></p></div><Card title="指標と目標"><TargetForm sites={result.assessment.sites.map((site) => ({ id: site.id, name: site.name }))} initialCategory={initialCategory} initial={source ? carryForwardValues(source) : undefined} source={source} /></Card></div>;
}
