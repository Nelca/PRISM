/**
 * M7段階1・2(PDF抽出後のテキストからDisclosureClaimを構造化抽出・claimTypeを分類する)。
 * 参照元: docs/requirements/mvp-completion-gap.md GAP-05、build-plan §5.7
 *
 * **必須制約(build-plan §5.7、変更しないこと):**
 * AIの役割は抽出に限定する。判定はルールで行う。段階3・段階4(gap-finding.ts・
 * disclosure-pipeline.ts)にLLMを使わない。この関数の戻り値(DisclosureClaim[])を
 * 既存の段階3・4にそのまま渡すことで、段階3・4のコードは1行も変更しない。
 *
 * **提供者の契約上の扱い(要件定義書 E-3):** Anthropic Claude APIを使う。個人のClaude.ai
 * コンシューマー契約ではなく、事業体名義のAPIキー(ANTHROPIC_API_KEY)を前提とする。
 * 顧客の未公表開示PDFを外部APIに送信するため、Anthropicとのデータ処理契約(DPA)の確認と
 * 顧客への同意取得が別途必要(この関数の実装だけでは完了しない。運用開始前の人間の作業)。
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildDisclosureClaimsFromExtraction } from "@core/disclosure/claim-extraction";
import type { RawExtractedClaim } from "@core/disclosure/claim-extraction";
import type { DisclosureClaim } from "@core/types/disclosure";

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourcePageOrSection: { type: "string", description: "例 'p.18'。抽出元のページまたは節。" },
          rawText: { type: "string", description: "原文をそのまま抜き出す。要約・言い換えをしない。" },
          claimType: {
            type: "string",
            enum: ["state", "quantitative", "trend", "comparative", "net_amount", "future_commitment"],
          },
          category: {
            type: ["string", "null"],
            enum: ["climate", "water", "pollution", null],
            description: "本文から明確に読み取れない場合はnull。推測しない。",
          },
          quantityMentioned: {
            type: ["object", "null"],
            properties: {
              value: { type: "number" },
              unit: { type: "string" },
            },
            required: ["value", "unit"],
            additionalProperties: false,
          },
          periodMentioned: {
            type: ["object", "null"],
            properties: {
              startYear: { type: "integer" },
              endYear: { type: "integer" },
            },
            required: ["startYear", "endYear"],
            additionalProperties: false,
          },
          scopeMentioned: { type: ["string", "null"], description: "例 '本社工場'、'Scope1・2'。" },
          extractionConfidence: { type: "string", enum: ["high", "low"] },
        },
        required: [
          "sourcePageOrSection",
          "rawText",
          "claimType",
          "category",
          "quantityMentioned",
          "periodMentioned",
          "scopeMentioned",
          "extractionConfidence",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `あなたはTNFD/SSBJ開示レビューのための抽出専用アシスタントです。
役割は抽出に限定されます。証拠の十分性やギャップの有無といった判定は行いません。判定は別のルールベースの処理が行います。

入力された統合報告書等のテキストから、自然環境(気候・水・汚染)に関する定量的・定性的な主張(claim)をすべて抽出してください。

各主張について:
- category・quantityMentioned・periodMentioned・scopeMentionedの4フィールドは、本文から明確に読み取れる場合のみ値を入れてください。読み取れない場合は必ずnullにしてください。推測で埋めないこと。
- rawTextは原文をそのまま抜き出してください(要約・言い換えをしないこと)。
- 抽出結果に自信が持てない主張(文脈が曖昧、数値の対象が不明確等)は extractionConfidence を "low" としてください。`;

/**
 * PDFから抽出したテキストを渡し、DisclosureClaim[]を得る。
 * ANTHROPIC_API_KEYが未設定の場合は推定・スキップせず例外を投げる(D-15)。
 */
export async function extractDisclosureClaims(
  sourceDocument: string,
  idPrefix: string,
  pdfText: string
): Promise<DisclosureClaim[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY が設定されていません。M7段階1・2(PDF抽出・AI分類)にはAnthropic Claude APIの" +
        "APIキーが必要です(.env.example を参照)。個人のClaude.aiコンシューマー契約は使えません" +
        "(プログラムからの呼び出しができる契約形態ではないため)。"
    );
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `以下は「${sourceDocument}」の本文です。この文書から自然環境関連の主張を抽出してください。\n\n${pdfText}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("AIが抽出処理を拒否しました(安全性フィルタによる判定)。文書の内容を確認してください。");
  }

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  if (!textBlock) {
    throw new Error("AIの抽出結果が空でした(想定外の応答形式)。");
  }

  const parsed = JSON.parse(textBlock.text) as { claims: RawExtractedClaim[] };
  return buildDisclosureClaimsFromExtraction(sourceDocument, idPrefix, parsed.claims);
}
