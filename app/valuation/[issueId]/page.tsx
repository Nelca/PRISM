import ValuationPage from "../page";
import { notFound } from "next/navigation";
import { loadPipelineView } from "@/lib/views/pipeline";

export default async function ValuationIssuePage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  const result = await loadPipelineView();
  if (!Object.hasOwn(result.valuation.valuationRecordsByMaterialIssue, issueId)) notFound();
  return <ValuationPage searchParams={Promise.resolve({ issue: issueId })} />;
}
