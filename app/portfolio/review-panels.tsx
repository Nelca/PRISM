import Link from "next/link";
import type { DecisionRecord } from "@core/types/decision";
import type { DisclosureClaim } from "@core/types/disclosure";
import type { EnvironmentalTarget } from "@/lib/environment/metrics";
import {
  costCaseCurrent,
  disclosureNoteCurrent,
  resourceCostComparison,
  resourceInvestmentComparison,
  supportsResourceCosts,
} from "@/lib/environment/review";
import { formatExactNumber } from "../components/numeric";
import { Card } from "../components/ui";
import { CostReviewForm, DisclosureReviewForm } from "./review-forms";

const yen = (value: number) => `${formatExactNumber(value)}円`;

function CostPanel({ record, decisions }: { record: EnvironmentalTarget; decisions: DecisionRecord[] }) {
  const costCase = record.costCase;
  const costs = costCase && costCaseCurrent(record) ? resourceCostComparison(record, costCase) : null;
  const investment = costCase ? resourceInvestmentComparison(record, costCase, decisions) : null;
  const editable = !record.archived && record.current !== null;
  return (
    <Card title="資源の対策案と費用差">
      <p>調達量・投入量と自社の単価を使って、現在と対策後の年間費用を比較します。評価期間・割引率を追加すると、この対策単体のNPVも確認できます。</p>
      {costs ? (
        <div className="portfolio-detail-values">
          <div><span>現在の年間費用</span><strong>{yen(costs.currentAnnualCost)}</strong></div>
          <div><span>対策後の年間費用</span><strong>{yen(costs.alternativeAnnualCost)}</strong></div>
          <div><span>年間の費用削減（マイナスは増額）</span><strong>{yen(costs.annualSavings)}</strong></div>
          <div><span>初期費用を含む初年度の差</span><strong>{yen(costs.firstYearSavings)}</strong></div>
        </div>
      ) : (
        costCase && <p role="status">実測値・根拠が更新されています。以前の費用前提を再確認してください。</p>
      )}
      {costCase?.investment?.linkedDecision && !investment && (
        <p role="status">関連案件または入力が変更されています。投資の前提と案件との対応を再確認してください。</p>
      )}
      {costCase?.investment && investment && (
        <div>
          <p><strong>対策単体のNPV: {yen(investment.npv)} · {investment.meetsThreshold ? "承認ライン以上" : "承認ライン未満"}</strong></p>
          <p>{costCase.investment.horizon}年間・割引率{costCase.investment.discountRatePercent}% / 承認ライン{yen(costCase.investment.approvalThreshold)}</p>
          <details className="foldout">
            <summary>各年の費用削減と現在価値</summary>
            <p>開始時: −{yen(costCase.initialInvestment)}</p>
            <ul>
              {investment.cashflows.map((row) => <li key={row.year}>{row.year}年後: {yen(row.savings)} / 現在価値 {yen(row.presentValue)}</li>)}
            </ul>
          </details>
          <p><Link href="/decision">対策と判定で他の対策も確認する →</Link></p>
        </div>
      )}
      <p className="field-hint">現在＝実測数量×現在単価。対策後＝対策後数量×対策後単価＋追加年間費用。年間費用差には割引を適用しません。自然債務・既存案件のNPVには自動合算しません。</p>
      {editable ? (
        <details className="foldout">
          <summary>{costCase ? "費用前提と根拠を確認・更新" : "対策案の数量・単価を入力"}</summary>
          <CostReviewForm record={record} decisions={decisions} />
        </details>
      ) : (
        <p>有効な指標に実測値を登録すると試算できます。</p>
      )}
    </Card>
  );
}

function DisclosurePanel({ record, siteName, claims }: { record: EnvironmentalTarget; siteName: string; claims: DisclosureClaim[] }) {
  const status = !record.disclosureNote
    ? "文案を確認して保存すると、根拠と一緒に開示の下書きへ反映されます。"
    : disclosureNoteCurrent(record, siteName, claims)
      ? "現在の入力値との対応を確認済みです。"
      : "入力値・目標・根拠・拠点名または既存主張が変わりました。文案を再確認するまで下書きへの出力を止めています。";
  return (
    <Card title="開示文案と根拠の関連付け">
      <p>{status}</p>
      {!record.archived && record.current !== null ? (
        <details className="foldout">
          <summary>文案と根拠を確認・更新</summary>
          <DisclosureReviewForm record={record} siteName={siteName} claims={claims} />
        </details>
      ) : (
        <p>有効な指標に実測値を登録してから、文案を確認してください。</p>
      )}
      <p><Link href="/disclosure/draft">開示文の下書きで確認する →</Link></p>
    </Card>
  );
}

/** 指標詳細の「人の確認」欄。費用前提は生物資源の調達量・一次鉱物投入量だけで使う。 */
export function TargetReviewPanels({
  record,
  siteName,
  claims,
  decisions,
}: {
  record: EnvironmentalTarget;
  siteName: string;
  claims: DisclosureClaim[];
  decisions: DecisionRecord[];
}) {
  return (
    <>
      {supportsResourceCosts(record) && <CostPanel record={record} decisions={decisions} />}
      <DisclosurePanel record={record} siteName={siteName} claims={claims} />
    </>
  );
}
