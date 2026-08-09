/**
 * 係数セット・パラメータの版管理レジストリ(M8 D-3)の永続化。
 *
 * 追記のみ。**旧版は削除しない。**版を更新するときは、
 *   1. 現在有効な版に supersededBy を設定する
 *   2. 新しい版を追記する
 * の2手順を1トランザクションで行う。1のUPDATEは `versioned_parameter_set` に
 * UPDATE権限がないため実行できない —— そこで**「supersededByを持つ行」を新たに追記する**
 * のではなく、有効な版の判定を「同じsetIdで最も新しいeffectiveFromの行」に委ねる。
 *
 * つまりDB上は純粋な追記で、supersedeの意味は読み出し側で導出する(§D-118)。
 */

import { asc, eq } from "drizzle-orm";
import type { VersionedParameterSet } from "@core/types/ledger";
import { ChangeReasonRequiredError } from "@core/ledger/versioned-parameter-set";
import { getDb } from "../client";
import { versionedParameterSet } from "../schema";

export async function listParameterVersions(tenantId: string): Promise<VersionedParameterSet[]> {
  const rows = await getDb()
    .select()
    .from(versionedParameterSet)
    .where(eq(versionedParameterSet.tenantId, tenantId))
    .orderBy(asc(versionedParameterSet.setId), asc(versionedParameterSet.effectiveFrom));

  return rows.map((row) => ({
    setId: row.setId,
    version: row.version,
    effectiveFrom: row.effectiveFrom,
    ...(row.supersededBy !== null ? { supersededBy: row.supersededBy } : {}),
    ...(row.changeReason !== null ? { changeReason: row.changeReason } : {}),
  }));
}

/**
 * 版の履歴を「どれが現在有効か」まで含めて返す。
 * `supersededBy` 列は追記時点では埋められないため(UPDATE権限がない)、
 * 同じsetIdの中で次の版が存在するかどうかから導出する。
 */
export interface ParameterVersionView extends VersionedParameterSet {
  active: boolean;
  /** 次の版(存在すれば)。`supersededBy` の導出値。 */
  supersededByDerived?: string;
}

export async function listParameterVersionsWithStatus(tenantId: string): Promise<ParameterVersionView[]> {
  const versions = await listParameterVersions(tenantId);

  return versions.map((version, index) => {
    const next = versions
      .slice(index + 1)
      .find((candidate) => candidate.setId === version.setId);
    return {
      ...version,
      active: next === undefined,
      ...(next ? { supersededByDerived: next.version } : {}),
    };
  });
}

export interface RegisterParameterVersionInput {
  tenantId: string;
  setId: string;
  version: string;
  effectiveFrom: string;
  /** 初版以外は必須(M8 D-3)。 */
  changeReason?: string;
}

/**
 * 版を追記する。初版でない場合、変更理由がなければ拒否する
 * (coreの `supersedeVersion` と同じ規律。デフォルトの理由を作らない)。
 */
export async function registerParameterVersion(input: RegisterParameterVersionInput): Promise<void> {
  const existing = await listParameterVersions(input.tenantId);
  const isFirst = !existing.some((v) => v.setId === input.setId);

  if (!isFirst && !input.changeReason?.trim()) {
    throw new ChangeReasonRequiredError("M8 D-3: 版を更新する場合、変更理由の入力は必須です。");
  }

  await getDb()
    .insert(versionedParameterSet)
    .values({
      tenantId: input.tenantId,
      setId: input.setId,
      version: input.version,
      effectiveFrom: input.effectiveFrom,
      changeReason: input.changeReason?.trim() || null,
    })
    .onConflictDoNothing();
}

/**
 * パイプラインが実際に使った版を台帳に取り込む(M8「後から手で入力する設計にしない」)。
 *
 * **変更理由は付けない。**自動検出では理由が分からず、システムが理由を捏造してはならない
 * (D-15)。既存setIdに新しい版が現れた場合は `changeReason: null` のまま記録し、
 * 画面が「変更理由が未記録」として人間の入力を促す。
 * 記録しないという選択はしない —— 版が変わった事実自体は監査証跡として必要だから。
 */
export async function recordObservedVersions(
  tenantId: string,
  observedAt: string,
  versions: { setId: string; version: string }[]
): Promise<void> {
  if (versions.length === 0) {
    return;
  }

  await getDb()
    .insert(versionedParameterSet)
    .values(
      versions.map((v) => ({
        tenantId,
        setId: v.setId,
        version: v.version,
        effectiveFrom: observedAt,
        changeReason: null,
      }))
    )
    .onConflictDoNothing();
}

/** 再計算ハッシュの入力(M8 D-2)から、台帳に載せるべき (setId, version) の組を取り出す。 */
export function observedVersionsFromHashInputs(inputs: {
  m1_sensitivityCriteriaVersion: string;
  m2_priorityFormulaVersion: string;
  m3_methodPluginVersions: Record<string, string>;
  m3_geoCalibrationVersion: string;
  m3_fitnessTierThresholdVersion: string;
  m4_decompositionAlgorithmVersion: string;
  m4_aopMappingVersion: string;
  m5_carbonPriceScenarioSetVersion: string;
  m6_bindingMechanismDefinitionVersion: string;
  m7_gapDetectionRuleVersion: string;
}): { setId: string; version: string }[] {
  return [
    { setId: "m1-sensitivity-criteria", version: inputs.m1_sensitivityCriteriaVersion },
    { setId: "m2-priority-formula", version: inputs.m2_priorityFormulaVersion },
    ...Object.entries(inputs.m3_methodPluginVersions).map(([methodId, version]) => ({ setId: methodId, version })),
    { setId: "m3-geo-calibration", version: inputs.m3_geoCalibrationVersion },
    { setId: "m3-fitness-tier-threshold", version: inputs.m3_fitnessTierThresholdVersion },
    { setId: "m4-decomposition-algorithm", version: inputs.m4_decompositionAlgorithmVersion },
    { setId: "aop-mapping", version: inputs.m4_aopMappingVersion },
    { setId: "carbon-price-scenarios", version: inputs.m5_carbonPriceScenarioSetVersion },
    { setId: "m6-binding-mechanism-definition", version: inputs.m6_bindingMechanismDefinitionVersion },
    { setId: "m7-gap-detection-rule", version: inputs.m7_gapDetectionRuleVersion },
  ];
}
