import type { CountermeasureType } from "@core/types/decision";
import type { PipelineWarning } from "./run-demo-pipeline";
import type { CountermeasurePreview } from "./build-countermeasure-previews";

export function selectCountermeasure(input: {
  siteId: string;
  siteName: string;
  previews: CountermeasurePreview[];
  requestedKey?: CountermeasureType;
}): { selectedKey: CountermeasureType; warning?: PipelineWarning } {
  const selectedKey = input.previews.some((candidate) => candidate.key === input.requestedKey)
    ? input.requestedKey!
    : input.previews[0].key;
  return {
    selectedKey,
    ...(input.requestedKey && input.requestedKey !== selectedKey
      ? {
          warning: {
            id: `countermeasure-selection-unavailable-${input.siteId}`,
            screen: "/decision",
            message: `${input.siteName}で選択されていた対策案は今回計算できなかったため、既定の対策案で計算しています。`,
          },
        }
      : {}),
  };
}
