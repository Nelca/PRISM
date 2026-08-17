/**
 * 拠点 + ユーザー操作を読み、パイプラインを1回実行して結果を永続化する。
 *
 * ページはここを呼ばない。**ページは最新runを読むだけ**(再計算しない)。
 * runを新しく作るのは、拠点の追加や操作イベントの追記といった「入力が変わった」瞬間だけ。
 *
 * 参照: docs/roadmap/implementation-plan.md T-11、承認済み計画のB-2
 */

import { cache } from "react";
import { runDemoPipeline, DEFAULT_RNG_SEED, RESULT_SCHEMA_VERSION } from "@/lib/demo/run-demo-pipeline";
import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { listSiteEntries } from "@/lib/db/repositories/sites";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { getLatestRun, persistRun } from "@/lib/db/repositories/runs";
import { observedVersionsFromHashInputs, recordObservedVersions } from "@/lib/db/repositories/parameter-versions";

/** 入力を読み直してパイプラインを実行し、新しいrunとして永続化する。 */
export async function executeAndPersistRun(tenantId: string): Promise<DemoPipelineResult> {
  const [userSites, interactions] = await Promise.all([listSiteEntries(tenantId), loadInteractionState(tenantId)]);

  const result = runDemoPipeline({ userSites, interactions, rngSeed: DEFAULT_RNG_SEED });
  return persistComputedRun(tenantId, result);
}

/**
 * 既に計算済みの結果をrunとして永続化する。
 *
 * 「検証してから永続化」(第4版 D-01)の共通ヘルパー
 * (`lib/pipeline/try-run-with-interaction.ts`)が、事前検証で得た結果をそのまま
 * 保存するために使う。パイプラインの実行と永続化を分けておくことで、
 * **成功した計算だけを保存する**という順序を呼び出し側が守れる。
 */
export async function persistComputedRun(tenantId: string, result: DemoPipelineResult): Promise<DemoPipelineResult> {
  await persistRun({ tenantId, rngSeed: DEFAULT_RNG_SEED, result });

  // 実際に使われた版を台帳に取り込む(M8「後から手で入力する設計にしない」)。
  // 変更理由は付けない(自動検出では分からないため。画面が未記録として人間に促す)。
  await recordObservedVersions(
    tenantId,
    new Date().toISOString(),
    observedVersionsFromHashInputs(result.recalculationHash.inputs)
  );

  return result;
}

/**
 * 画面・APIの読み出し口。最新runがあればそれを返す。
 *
 * 再実行するのは次の2つの場合だけ:
 *   1. runがまだ1件もない(初回起動)。「空表示」にすると原因が分かりにくいため
 *   2. **保存済みrunの結果構造が古い**(RESULT_SCHEMA_VERSION が上がった)
 *
 * 2が必要な理由:ページは保存済みrunをそのまま読むため(計画B-2)、結果の構造を変える
 * コード変更をデプロイすると、古い形のrunを新しいコードが読んで壊れる。
 * 古いrunは削除せず残したまま(追記のみ)、新しい版のrunを積む。
 *
 * **同一リクエスト内でのメモ化:** layout.tsx(ナビの状態表示・指示01-4)とpage.tsx双方が
 * 同じrunを読むようになったため、`React.cache` でラップしてリクエスト単位に結果を
 * 共有する(DB読み出し・版台帳への書き込みの重複を避ける)。Next.jsの推奨パターン。
 * 参照: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md
 * 「Sharing data with context and React.cache」。Server Componentのレンダー外
 * (テストからの直接呼び出し等)では`react`パッケージの`cache`は素通し実装になり、
 * 単に毎回実行されるだけで安全。
 */
export const getOrCreateLatestResult = cache(async function getOrCreateLatestResult(
  tenantId: string
): Promise<DemoPipelineResult> {
  const latest = await getLatestRun(tenantId);
  if (latest && latest.resultSchemaVersion === RESULT_SCHEMA_VERSION) {
    // 保存済みrunを返す場合も、そのrunが使った版が台帳にあることを保証する。
    // 版管理を後から導入したため、既存runの分が台帳に載っていないことがある。
    // 追記は冪等(同じsetId・versionは無視される)なので、読み出しのたびに呼んでよい。
    await recordObservedVersions(
      tenantId,
      latest.executedAt,
      observedVersionsFromHashInputs(latest.result.recalculationHash.inputs)
    );
    return latest.result;
  }
  return executeAndPersistRun(tenantId);
});
