import FinancialBridgePage from "../page";
import { notFound } from "next/navigation";
import { loadPipelineView } from "@/lib/views/pipeline";

export default async function FinancialBridgeSitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const result = await loadPipelineView();
  if (!result.decisions.some((decision) => decision.siteId === siteId)) notFound();
  return <FinancialBridgePage searchParams={Promise.resolve({ site: siteId })} detailOnly />;
}
