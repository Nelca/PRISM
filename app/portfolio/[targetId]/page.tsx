import { TargetReviewPanels } from "../review-panels";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadInteractivePipelineView } from "@/lib/views/pipeline";
import { listInteractionEvents } from "@/lib/db/repositories/interactions";
import { METRIC_BY_ID, TARGET_CATEGORIES, TARGET_STATUS, evaluateTarget, targetDelta } from "@/lib/environment/metrics";
import type { EnvironmentalTarget } from "@/lib/environment/metrics";
import { Card, ScreenLead, Tag } from "../../components/ui";
import { TargetForm } from "../target-form";
import { researchEnabled } from "@/lib/research/access";
import { GVFD_METRIC_TOPICS } from "@/lib/research/gvfd";
export default async function TargetPage({ params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params;
  const { tenantId, result, interactions } = await loadInteractivePipelineView();
  const record = interactions.environmentalTargets.get(targetId);
  if (!record) notFound();
  const metric = METRIC_BY_ID.get(record.metricId)!;
  const site = result.assessment.sites.find((item) => item.id === record.siteId);
  const history = (await listInteractionEvents(tenantId)).filter((event) => event.kind === "environmental_target_update" && event.subjectId === targetId).reverse();
  const delta = targetDelta(record);
  const status = evaluateTarget(record);
  const fmt = (value: number | null, unit = metric.unit) => value === null ? "未入力" : `${new Intl.NumberFormat("ja-JP", { maximumSignificantDigits: 10 }).format(value)} ${unit}`;
  return <div className="screen"><div className="screen__head"><h1 className="screen__title">{metric.label}</h1><ScreenLead>{site?.name ?? "拠点を確認してください"} · {TARGET_CATEGORIES[metric.category]} · {record.reportingYear}年 · {record.boundary}</ScreenLead><p className="page-back"><Link href="/portfolio">← 統合管理へ</Link></p></div>
    {!record.archived && record.reportingYear < 2200 && <p className="portfolio-detail-actions"><Link className="pill-btn" href={`/portfolio/new?from=${encodeURIComponent(record.id)}`}>翌年の管理へ引き継ぐ →</Link></p>}
    {record.carriedFrom && <p className="field-hint"><Link href={`/portfolio/${record.carriedFrom.id}`}>{record.carriedFrom.year}年の指標</Link>から引き継いだ対象です。引継ぎ元の版は更新履歴に記録しています。</p>}
    <Card title="目標との関係" headExtra={<Tag variant={status === "met" ? "neutral" : "warn"}>{record.archived ? "保管中" : TARGET_STATUS[status]}</Tag>}>
      <div className="portfolio-detail-values"><div><span>実測値</span><strong>{fmt(record.current)}</strong></div><div><span>目標（{record.direction === "at_most" ? "以下" : "以上"}）</span><strong>{fmt(record.target)}</strong></div><div><span>比較基準値からの差</span><strong>{delta === null ? "比較基準値・実測値が必要" : `${delta > 0 ? "+" : ""}${fmt(delta, metric.unit === "%" ? "ポイント" : metric.unit)}`}</strong></div></div>
      <p className="field-hint">入力された範囲・対象年の目標との比較です。生態系全体の健全性や、法令への適合、投資の可否を保証する判定ではありません。</p>
    </Card>
    <Card title="実測値・目標・対応"><p>担当: {record.owner || "未設定"} / 対応期限: {record.dueDate || "未設定"}</p><details className="foldout"><summary>実測値・目標・根拠を確認・更新する</summary><TargetForm key={record.revision} sites={site ? result.assessment.sites.map((item) => ({ id: item.id, name: item.name })) : [{ id: record.siteId, name: "削除済みの拠点（保管のみ可能）" }]} record={record} /></details></Card>
    {researchEnabled() && !record.archived && GVFD_METRIC_TOPICS[record.metricId] && <Card title="地域別の環境影響を比較"><p>この指標の実測値・目標値を引き継ぎ、IFVI GVFDの研究用算定で社会への影響額を比較します。物質や処理方法、地域の対応を次の画面で確認してください。</p><Link className="pill-btn" href={`/research/gvfd?target=${encodeURIComponent(record.id)}`}>GVFDで実測値と目標を比較する →</Link></Card>}
    <TargetReviewPanels key={`review-${record.revision}`} record={record} siteName={site?.name ?? record.siteId} claims={result.disclosureClaims} decisions={result.decisions.filter((entry) => entry.siteId === record.siteId).map((entry) => entry.decision.decisionRecord)} />
    <Card title="この指標の更新履歴"><p className="field-hint">変更前の値と根拠は履歴に残ります。保管した指標も復帰できます。</p>{history.map((event) => {
      const snapshot = event.payload.record as EnvironmentalTarget;
      return <details className="foldout" key={event.id}><summary>{new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(event.createdAt))}（日本時間）· {event.actor} · {snapshot.archived ? "保管" : TARGET_STATUS[evaluateTarget(snapshot)]}</summary><p>実測 {fmt(snapshot.current)} / 目標 {fmt(snapshot.target)}（{snapshot.direction === "at_most" ? "以下" : "以上"}）</p><p>変更理由: {String(event.payload.reason)}</p>{snapshot.carriedFrom && <p>引継ぎ元: {snapshot.carriedFrom.id} / 版: {snapshot.carriedFrom.revision}</p>}<p>確認日: {snapshot.measuredOn || "未入力"} / 比較基準値: {fmt(snapshot.baseline)}</p>{snapshot.costCase && <p>対策案: {snapshot.costCase.name} / 現在単価: {snapshot.costCase.baselineUnitCost}円/t / 対策後: {snapshot.costCase.alternativeQuantity}t × {snapshot.costCase.alternativeUnitCost}円/t / 追加年間費用: {snapshot.costCase.additionalAnnualCost}円 / 初期費用: {snapshot.costCase.initialInvestment}円 / 根拠: {snapshot.costCase.evidence}</p>}{snapshot.costCase?.investment && <p>投資前提: {snapshot.costCase.investment.horizon}年 / 割引率{snapshot.costCase.investment.discountRatePercent}% / 承認ライン{snapshot.costCase.investment.approvalThreshold}円 / 根拠: {snapshot.costCase.investment.rationale} / 関連案件: {snapshot.costCase.investment.linkedDecision?.id ?? "なし"}</p>}{snapshot.disclosureNote?.linkedClaim && <p>関連主張: {snapshot.disclosureNote.linkedClaim.sourceDocument} / {snapshot.disclosureNote.linkedClaim.sourcePageOrSection} / {snapshot.disclosureNote.linkedClaim.id}</p>}{snapshot.disclosureNote && <p>確認した文案: {snapshot.disclosureNote.text} / 理由: {snapshot.disclosureNote.reason}</p>}<p>実測根拠: {snapshot.evidence || "未入力"}</p><p>目標根拠: {snapshot.targetBasis || "未入力"}</p><p>担当: {snapshot.owner || "未設定"} / 期限: {snapshot.dueDate || "未設定"}</p><p>対応: {snapshot.actionPlan || "未入力"}</p></details>;
    })}</Card>
  </div>;
}
