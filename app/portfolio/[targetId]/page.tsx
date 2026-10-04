import Link from "next/link";
import { notFound } from "next/navigation";
import type { InteractionEvent } from "@/lib/demo/interaction-state";
import { listInteractionEvents } from "@/lib/db/repositories/interactions";
import { formatJstDateTime, todayInJst } from "@/lib/datetime";
import {
  DIRECTION_LABEL,
  MAX_REPORTING_YEAR,
  METRIC_BY_ID,
  TARGET_CATEGORIES,
  TARGET_STATUS,
  evaluateTarget,
  isOverdue,
  targetDelta,
  type EnvironmentalTarget,
} from "@/lib/environment/metrics";
import { researchEnabled } from "@/lib/research/access";
import { GVFD_METRIC_TOPICS } from "@/lib/research/gvfd";
import { loadInteractivePipelineView } from "@/lib/views/pipeline";
import { formatExactNumber, formatQuantity } from "../../components/numeric";
import { Card, ScreenLead, Tag } from "../../components/ui";
import { ActionRow, StatGrid, StatTile, TargetBar } from "../../components/viz";
import { TargetForm } from "../target-form";
import { TargetReviewPanels } from "../review-panels";

export default async function TargetPage({ params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params;
  const { tenantId, result, interactions } = await loadInteractivePipelineView();
  const record = interactions.environmentalTargets.get(targetId);
  if (!record) notFound();
  const metric = METRIC_BY_ID.get(record.metricId)!;
  const site = result.assessment.sites.find((item) => item.id === record.siteId);
  const history = (await listInteractionEvents(tenantId))
    .filter((event) => event.kind === "environmental_target_update" && event.subjectId === targetId)
    .reverse();
  const delta = targetDelta(record);
  const status = evaluateTarget(record);
  const overdue = isOverdue(record, todayInJst());
  const quantity = (value: number | null) => formatQuantity(value, metric.unit);
  // 割合の差は増減率ではなくポイントで示す。
  const deltaUnit = metric.unit === "%" ? "ポイント" : metric.unit;
  const formSites = site ? result.assessment.sites.map((item) => ({ id: item.id, name: item.name })) : [{ id: record.siteId, name: "削除済みの拠点（保管のみ可能）" }];

  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">{metric.label}</h1>
        <ScreenLead>
          {site?.name ?? "拠点を確認してください"} · {TARGET_CATEGORIES[metric.category]} · {record.reportingYear}年 · {record.boundary}
        </ScreenLead>
        <p className="page-back"><Link href="/portfolio">← 統合管理へ</Link></p>
      </div>

      {!record.archived && record.reportingYear < MAX_REPORTING_YEAR && (
        <ActionRow>
          <Link className="pill-btn" href={`/portfolio/new?from=${encodeURIComponent(record.id)}`}>翌年の管理へ引き継ぐ →</Link>
        </ActionRow>
      )}
      {record.carriedFrom && (
        <p className="field-hint">
          <Link href={`/portfolio/${record.carriedFrom.id}`}>{record.carriedFrom.year}年の指標</Link>から引き継いだ対象です。引継ぎ元の版は更新履歴に記録しています。
        </p>
      )}

      <Card
        title="目標との関係"
        headExtra={<Tag variant={status === "met" ? "neutral" : "warn"}>{record.archived ? "保管中" : TARGET_STATUS[status]}</Tag>}
        foot="入力された範囲・対象年の目標との比較です。生態系全体の健全性や、法令への適合、投資の可否を保証する判定ではありません。"
      >
        <StatGrid columns={4}>
          <StatTile label="実測値" value={quantity(record.current)} tone="neutral" />
          <StatTile label={`目標（${DIRECTION_LABEL[record.direction]}）`} value={quantity(record.target)} tone="neutral" />
          <StatTile
            label="比較基準値からの差"
            value={delta === null ? "比較基準値・実測値が必要" : `${delta > 0 ? "+" : ""}${formatQuantity(delta, deltaUnit)}`}
            tone={delta === null ? "neutral" : status === "met" ? "ok" : "warn"}
          />
          <StatTile
            label="対応期限"
            value={record.dueDate || "未設定"}
            tone={overdue ? "warn" : "neutral"}
            note={overdue ? "期限超過" : undefined}
          />
        </StatGrid>
        <TargetBar
          current={record.current}
          target={record.target}
          baseline={record.baseline}
          direction={record.direction === "at_least" ? "up" : "down"}
          unit={metric.unit}
          label={`${site?.name ?? record.siteId}・${metric.label}`}
          format={formatExactNumber}
        />
      </Card>

      <Card title="実測値・目標・対応">
        <p>担当: {record.owner || "未設定"} / 対応期限: {record.dueDate || "未設定"}</p>
        <details className="foldout">
          <summary>実測値・目標・根拠を確認・更新する</summary>
          <TargetForm key={record.revision} sites={formSites} record={record} />
        </details>
      </Card>

      {researchEnabled() && !record.archived && GVFD_METRIC_TOPICS[record.metricId] && (
        <Card title="地域別の環境影響を比較">
          <p>この指標の実測値・目標値を引き継ぎ、IFVI GVFDの研究用算定で社会への影響額を比較します。物質や処理方法、地域の対応を次の画面で確認してください。</p>
          <ActionRow>
            <Link className="pill-btn" href={`/research/gvfd?target=${encodeURIComponent(record.id)}`}>GVFDで実測値と目標を比較する →</Link>
          </ActionRow>
        </Card>
      )}

      <TargetReviewPanels
        key={`review-${record.revision}`}
        record={record}
        siteName={site?.name ?? record.siteId}
        claims={result.disclosureClaims}
        decisions={result.decisions.filter((entry) => entry.siteId === record.siteId).map((entry) => entry.decision.decisionRecord)}
      />

      <Card title="この指標の更新履歴">
        <p className="field-hint">変更前の値と根拠は履歴に残ります。保管した指標も復帰できます。</p>
        {history.map((event) => <HistoryEntry key={event.id} event={event} quantity={quantity} />)}
      </Card>
    </div>
  );
}

function HistoryEntry({ event, quantity }: { event: InteractionEvent; quantity: (value: number | null) => string }) {
  const snapshot = event.payload.record as EnvironmentalTarget;
  const { costCase, disclosureNote } = snapshot;
  return (
    <details className="foldout">
      <summary>
        {formatJstDateTime(event.createdAt)}（日本時間）· {event.actor} · {snapshot.archived ? "保管" : TARGET_STATUS[evaluateTarget(snapshot)]}
      </summary>
      <p>実測 {quantity(snapshot.current)} / 目標 {quantity(snapshot.target)}（{DIRECTION_LABEL[snapshot.direction]}）</p>
      <p>変更理由: {String(event.payload.reason)}</p>
      {snapshot.carriedFrom && <p>引継ぎ元: {snapshot.carriedFrom.id} / 版: {snapshot.carriedFrom.revision}</p>}
      <p>確認日: {snapshot.measuredOn || "未入力"} / 比較基準値: {quantity(snapshot.baseline)}</p>
      {costCase && (
        <p>
          対策案: {costCase.name} / 現在単価: {costCase.baselineUnitCost}円/t / 対策後: {costCase.alternativeQuantity}t × {costCase.alternativeUnitCost}円/t / 追加年間費用: {costCase.additionalAnnualCost}円 / 初期費用: {costCase.initialInvestment}円 / 根拠: {costCase.evidence}
        </p>
      )}
      {costCase?.investment && (
        <p>
          投資前提: {costCase.investment.horizon}年 / 割引率{costCase.investment.discountRatePercent}% / 承認ライン{costCase.investment.approvalThreshold}円 / 根拠: {costCase.investment.rationale} / 関連案件: {costCase.investment.linkedDecision?.id ?? "なし"}
        </p>
      )}
      {disclosureNote?.linkedClaim && (
        <p>関連主張: {disclosureNote.linkedClaim.sourceDocument} / {disclosureNote.linkedClaim.sourcePageOrSection} / {disclosureNote.linkedClaim.id}</p>
      )}
      {disclosureNote && <p>確認した文案: {disclosureNote.text} / 理由: {disclosureNote.reason}</p>}
      <p>実測根拠: {snapshot.evidence || "未入力"}</p>
      <p>目標根拠: {snapshot.targetBasis || "未入力"}</p>
      <p>担当: {snapshot.owner || "未設定"} / 期限: {snapshot.dueDate || "未設定"}</p>
      <p>対応: {snapshot.actionPlan || "未入力"}</p>
    </details>
  );
}
