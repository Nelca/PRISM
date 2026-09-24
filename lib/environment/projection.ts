import { targetIdentity, type EnvironmentalTarget } from "./metrics";
/** 既存のテナント単位トランザクション内で使い、同時更新・同一対象の重複を防ぐ。 */
export function applyTargetUpdate(state: Map<string, EnvironmentalTarget>, record: EnvironmentalTarget, expectedRevision: string | null) {
  const current = state.get(record.id);
  if (!current && record.carriedFrom && state.get(record.carriedFrom.id)?.revision !== record.carriedFrom.revision) throw new Error("引継ぎ元が更新されました。画面を再読込してください。");
  if ((current?.revision ?? null) !== expectedRevision) throw new Error("指標が別の操作で更新されました。画面を再読込してください。");
  if (!record.archived && [...state.values()].some((other) => other.id !== record.id && !other.archived && targetIdentity(other) === targetIdentity(record))) {
    throw new Error("同じ拠点・指標・対象年・測定範囲は登録済みです。既存の指標を編集してください。");
  }
  state.set(record.id, record);
}
