import Link from "next/link";
import type { Metadata } from "next";
import { Card, ScreenLead, Tag } from "../components/ui";

/**
 * はじめに(IA-01、docs/information-architecture.md §3.3)。
 *
 * オリエンテーション層の本体。「PRISMは何を出すプロダクトか」「何を入れると
 * 何が得られるか」「最初に何をすべきか」を、ワークフローに入る前の利用者が
 * 1画面で掴めるようにする。ワークフロー外の静的な説明画面なので、
 * TaskBanner・StepNav・パイプライン結果の読み込みは置かない。
 *
 * 文言の規律は業務画面と同じ:投資可否・記載の真偽を断定しない、推奨値を
 * 出さないことを明示する、「結論が変わるか」の言い回しに徹する。
 */

export const metadata: Metadata = {
  title: "PRISMとは・使い方 | PRISM",
};

/** 6ステップの入出力対応(IA §3.4)。ナビ(nav.tsx)・StepNavと同じ順序を保つこと。 */
const FLOW_IO = [
  {
    href: "/sites",
    label: "拠点データの登録",
    input: "拠点の一覧と環境データ(CSV一括、または1件ずつ)",
    output: "拠点ごとの「自然との関わり」の強さ。以後すべての算定の土台",
  },
  {
    href: "/assessment",
    label: "評価対象の絞り込み",
    input: "詳細評価に進める課題の指定(優先度は自動算定)",
    output: "詳細評価の対象一覧。対象外とした課題も理由付きで残る",
  },
  {
    href: "/valuation",
    label: "価値の算定",
    input: "投資判断に使う代表値の選択(変更には理由の入力が必須)",
    output: "複数の算定方法による金額の幅と、差が生じる理由の分解",
  },
  {
    href: "/financial-bridge",
    label: "財務への影響",
    input: "自社の財務データ(営業利益など)",
    output: "自然コスト反映後の営業利益・期待損失と、その大きさの比較先",
  },
  {
    href: "/decision",
    label: "対策と判定",
    input: "投資価値(NPV)・投資の承認ライン・対策と反映先の選択",
    output: "判定:自然コストを織り込むと投資の結論が変わるか",
  },
  {
    href: "/disclosure",
    label: "開示への反映",
    input: "開示物のPDF(任意)",
    output: "開示文の下書きと、既存の記載と根拠の整合確認",
  },
];

/** 年間サイクル(構想書6.3)。四半期ごとの位置づけ。 */
const ANNUAL_CYCLE = [
  { period: "Q1 開示準備", body: "環境データを取り込み、算定と代表値の選択を行い、開示文の下書きと根拠を揃えます。" },
  { period: "Q2 決算・開示", body: "選択と前提の記録が、保証・監査からの質問に答える材料になります。" },
  {
    period: "Q3 予算・投資",
    body: "開示のために作った同じ算定結果を、投資稟議の承認ラインと照らした判定に使います。結論が変わらない案件は、そのことを根拠つきで確定して終えられます。",
  },
  { period: "Q4 中計・方針", body: "対策の投資対効果を比較し、判定結果を社内のどの仕組みに反映するかを見直します。" },
];

/** 数字を信頼できるものにするための決まりごと(IA §1.2)。 */
const DISCIPLINES = [
  {
    title: "推奨値を出しません",
    body: "代表値・対策・結果の反映先は、利用者が自分で選びます。変更には理由の入力が必須で、選択は記録に残ります。",
  },
  {
    title: "分からない値を仮置きしません",
    body: "投資の承認ラインが未入力の間、判定は「保留」のままです。仮の値で判定を出すことはありません。",
  },
  {
    title: "除外や失敗を黙って消しません",
    body: "座標が解決できなかった拠点、評価対象から外した課題は、必ず理由付きで画面と記録に残ります。",
  },
  {
    title: "AIは抽出だけに使います",
    body: "AIの役割は開示PDFから記載を抜き出すことだけです。金額の算定・判定・文章の組み立てには使いません。",
  },
  {
    title: "性質の違う金額を合算しません",
    body: "社会全体への影響(厚生価値)は開示専用の参考値で、投資判断に使う金額(交換価値)と足し合わせられない設計になっています。",
  },
];

export default function GuidePage() {
  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">PRISMとは・使い方</h1>
        </div>
        <ScreenLead>何を入れると、どの業務で使える情報になるかを2分で確認できます</ScreenLead>
      </div>

      {/* 1. 何をするプロダクトか(IAの1文+差別化) */}
      <Card title="何をするプロダクトか">
        <p style={{ margin: 0 }}>
          PRISMは、取水量・GHG排出量などの環境データを金額の幅に換算し、投資判断の結論への影響、開示文の下書き、選択理由の記録につなげるプロダクトです。手元のデータから始められます。複数の算定方法を並べ、結果の差と理由を確認したうえで、使う値を理由とともに選べます。
        </p>
      </Card>

      {/* 2. 得られる3つの成果物(構想書8.1の出力3層) */}
      <Card
        title="得られる3つの成果物"
        subtitle="ホームでそれぞれの現在の状態を確認できます"
        foot="「結論は変わらない」という判定にも価値があります:この論点はこの決定を変えない、と根拠をもって確定でき、追加調査を打ち切れます"
      >
        <div className="outcome-grid">
          <Link href="/decision" className="outcome">
            <span className="outcome__kicker">成果物 1</span>
            <span className="outcome__name">投資判断への判定</span>
            <span className="outcome__desc">
              自然関連のコスト・便益を織り込むと、投資判断の結論が変わるか・変わらないかが確定します。
              変わる可能性がある場合は、結論を左右している前提がどれかまで分かります。
            </span>
            <span className="outcome__link">対策と判定へ →</span>
          </Link>
          <Link href="/disclosure" className="outcome">
            <span className="outcome__kicker">成果物 2</span>
            <span className="outcome__name">開示の記載と根拠</span>
            <span className="outcome__desc">
              判定と同じ算定結果から、開示文の下書きと、既存の開示文言に根拠が足りているかの確認結果が
              得られます。開示用と投資判断用の数字が同じ記録から出ます。
            </span>
            <span className="outcome__link">開示への反映へ →</span>
          </Link>
          <Link href="/ledger" className="outcome">
            <span className="outcome__kicker">成果物 3</span>
            <span className="outcome__name">監査証跡</span>
            <span className="outcome__desc">
              誰がいつどの方法を選び、なぜそうしたかが自動で記録されます。担当者が変わっても、
              監査・保証で問われても、同じ数字を同じ根拠で再現できます。
            </span>
            <span className="outcome__link">記録へ →</span>
          </Link>
        </div>
      </Card>

      {/* 3. 使い方の流れ(入れるもの→得られるもの。IA §3.4の中核表) */}
      <Card
        title="使い方の流れ"
        subtitle="6つの画面を順に進みます。左のメニューと同じ並びです"
        padBody={false}
        foot="各画面の冒頭に、その画面でする操作の順序を書いたガイドがあります。途中でやめても入力と選択は保存されています"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>画面</th>
              <th>入れるもの</th>
              <th>得られるもの</th>
            </tr>
          </thead>
          <tbody>
            {FLOW_IO.map((step, i) => (
              <tr key={step.href}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link href={step.href} className="guide-flow-link">
                    <b>
                      {i + 1}. {step.label}
                    </b>
                  </Link>
                </td>
                <td style={{ fontSize: 12.5 }}>{step.input}</td>
                <td style={{ fontSize: 12.5 }}>{step.output}</td>
              </tr>
            ))}
            <tr>
              <td style={{ whiteSpace: "nowrap" }}>
                <Link href="/ledger" className="guide-flow-link">
                  <b>記録(監査証跡)</b>
                </Link>
              </td>
              <td style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>(操作は不要です)</td>
              <td style={{ fontSize: 12.5 }}>上記すべての選択・前提・版の自動記録</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* 4. 年間サイクルでの位置づけ(構想書6.3) */}
      <Card
        title="年間サイクルでの位置づけ"
        subtitle="一度きりの評価ではなく、毎年・毎四半期の反復利用を前提にしています"
      >
        {ANNUAL_CYCLE.map((entry) => (
          <div key={entry.period} className="kv">
            <span className="kv__k" style={{ whiteSpace: "nowrap" }}>
              {entry.period}
            </span>
            <span className="kv__v" style={{ fontFamily: "var(--font-body)", fontSize: 12.5, textAlign: "left" }}>
              {entry.body}
            </span>
          </div>
        ))}
      </Card>

      {/* 5. 信頼の規律(IA §1.2。機能ではなく「この数字を社内で使える理由」) */}
      <Card
        title="数字を信頼できるものにするための決まりごと"
        subtitle="この決まりごとが、算定結果を社内の説明・監査に耐えるものにします"
      >
        <div className="grid-2">
          {DISCIPLINES.map((d) => (
            <div key={d.title} style={{ padding: "2px 0" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.title}</div>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-soft)" }}>{d.body}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* 6. 最初の一歩 */}
      <Card title="最初の一歩">
        <p style={{ margin: 0 }}>
          いまこの環境には<Tag variant="neutral">架空企業のデモデータ</Tag>が入っています。
          ホームの「進捗」と「次にやること」に沿って進むと、データの登録から判定の確定・開示の確認までを一巡できます。
          自社のデータで始める場合は、「データと拠点の登録」で記入テンプレートをダウンロードして取り込みます。
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Link href="/" className="pill-btn pill-btn--primary" style={{ textDecoration: "none" }}>
            ホームで現在地を見る →
          </Link>
          <Link href="/sites" className="pill-btn" style={{ textDecoration: "none" }}>
            データと拠点の登録へ →
          </Link>
        </div>
      </Card>
    </div>
  );
}
