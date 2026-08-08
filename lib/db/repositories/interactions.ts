/**
 * ユーザー操作(interaction_event テーブル)の追記と読み出し。
 *
 * このテーブルはアプリ用ロールに UPDATE / DELETE 権限がない(0001_append_only_role.sql)。
 * 「取り消し」は行の削除ではなく、打ち消すイベントを追記して表現する
 * (例:深度の手動指定を戻す場合は mode: "auto" のイベントを追記する)。
 */

import { asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { interactionEvent } from "../schema";
import { projectInteractionState } from "@/lib/demo/interaction-state";
import type { InteractionEvent, InteractionKind, InteractionState } from "@/lib/demo/interaction-state";

export interface AppendInteractionInput {
  actor: string;
  kind: InteractionKind;
  subjectId: string;
  payload: Record<string, unknown>;
}

export async function appendInteractionEvent(tenantId: string, input: AppendInteractionInput): Promise<void> {
  await getDb()
    .insert(interactionEvent)
    .values({
      id: `ie-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      actor: input.actor,
      kind: input.kind,
      subjectId: input.subjectId,
      payload: input.payload,
    });
}

export async function listInteractionEvents(tenantId: string): Promise<InteractionEvent[]> {
  const rows = await getDb()
    .select()
    .from(interactionEvent)
    .where(eq(interactionEvent.tenantId, tenantId))
    .orderBy(asc(interactionEvent.createdAt));

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
    kind: row.kind as InteractionKind,
    subjectId: row.subjectId,
    payload: row.payload as Record<string, unknown>,
  }));
}

/** 追記イベントを畳み込んで現在値を得る(計画B-1:現在値を保存しない)。 */
export async function loadInteractionState(tenantId: string): Promise<InteractionState> {
  return projectInteractionState(await listInteractionEvents(tenantId));
}
