import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { editableTargetCsv } from "@/lib/environment/csv";
export async function GET(request: Request) {
  const tenantId = await getTenantId();
  const template = new URL(request.url).searchParams.get("mode") === "template";
  const records = template ? [] : [...(await loadInteractionState(tenantId)).environmentalTargets.values()].filter((record) => !record.archived);
  return new Response(editableTargetCsv(records), { headers: {
    "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="prism-targets-${template ? "template" : "editable"}.csv"`, "cache-control": "private, no-store",
  } });
}
