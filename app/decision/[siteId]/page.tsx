import DecisionPage from "../page";
import { notFound } from "next/navigation";
import { loadPipelineView } from "@/lib/views/pipeline";

export default async function DecisionSitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const result = await loadPipelineView();
  if (!result.decisions.some((decision) => decision.siteId === siteId)) notFound();
  return <DecisionPage searchParams={Promise.resolve({ site: siteId })} detailOnly />;
}
