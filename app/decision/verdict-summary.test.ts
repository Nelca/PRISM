import { expect, it } from "vitest";
import { exchangeAmount } from "@core/types/common";
import { verdictMeaningSentence } from "./verdict-summary";

it("承認ラインの上下と境界を区別し、投資承認や追加調査不要とは断言しない", () => {
  const natureAdjustedNpv = { central: exchangeAmount(150), quantileRange: { p5: 100, p50: 150, p95: 200 } };
  const sentence = (threshold: number) => verdictMeaningSentence({ natureAdjustedNpv, approvalThreshold: { value: exchangeAmount(threshold), source: "manual_entry" } });
  expect(sentence(50)).toContain("上回っています");
  expect(sentence(250)).toContain("下回っています");
  for (const threshold of [100, 150, 200]) expect(sentence(threshold)).toContain("承認ラインにかかっています");
  expect(sentence(250)).not.toContain("追加調査は不要");
  expect(verdictMeaningSentence({ natureAdjustedNpv, approvalThreshold: "pending" })).toContain("保留");
});
