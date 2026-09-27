import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { editableTargetCsv } from "@/lib/environment/csv";

/** 再取込用の編集用CSV(`?mode=template` は列見出しだけの空テンプレート)。保管中の指標は含めない。 */
export async function GET(request: Request) {
  const template = new URL(request.url).searchParams.get("mode") === "template";
  const records = template
    ? []
    : [...(await loadInteractionState(await getTenantId())).environmentalTargets.values()].filter((record) => !record.archived);
  return new Response(editableTargetCsv(records), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="prism-targets-${template ? "template" : "editable"}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
