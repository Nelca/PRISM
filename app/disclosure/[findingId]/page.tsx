import DisclosurePage from "../page";
import { notFound } from "next/navigation";
import { loadPipelineView } from "@/lib/views/pipeline";

export default async function DisclosureFindingPage({ params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params;
  const result = await loadPipelineView();
  if (!result.disclosure.gapFindings.some((finding) => finding.id === findingId)) notFound();
  return <DisclosurePage searchParams={Promise.resolve({ finding: findingId })} detailOnly />;
}
