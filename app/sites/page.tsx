import type { Metadata } from "next";
import Link from "next/link";
import { isUserSiteId } from "@/lib/db/repositories/sites";
import { loadSitesView } from "@/lib/views/pipeline";
import { Card, GuideBox, GuideButton, ScreenLead, Tag } from "../components/ui";
import { industrySectorLabel, siteTypeLabel } from "../components/labels";
import { StepNav } from "../components/step-nav";
import { DataSourceAttribution } from "../components/attribution";
import { EditSiteButton } from "./add-site-form";
import { RemoveSiteButton } from "./remove-site-button";
import { TaskBanner } from "../components/task-banner";
import { IntakeReference } from "./intake-reference";

/** 操作列に出す「なぜ編集できないのか」。空欄のまま放置しない(指示B-03)。 */
const LOCKED_REASON = {
  demo: {
    tag: "デモ既定",
    title: "架空企業のデモ既定拠点のため編集できません",
  },
  imported: {
    tag: "CSV取込",
    title: "CSVで取り込んだ拠点です。修正はCSVを直してから取り込みなおしてください",
  },
} as const;

export const metadata: Metadata = {
  title: "拠点データ | PRISM",
};

export default async function SitesPage() {
  const { result, storedEntries } = await loadSitesView();
  const { sites, ingestionErrors } = result.assessment;

  /*
   * 一覧に出る拠点は「DBに登録された拠点」と「デモ既定拠点(lib/demo/company.ts の固定データ)」の
   * 合成なので、編集できるかどうかは表示用の結果からは分からない。DBの行を引き当てて判定する。
   *   - DBに行がない            → デモ既定拠点。DB操作の対象が存在しないので編集できない
   *   - DBにあり site-user-*    → 画面から登録した拠点。編集・削除できる
   *   - DBにあるがそれ以外のID  → CSV取込。取込のやり直しが正規の修正経路
   */
  const storedById = new Map(storedEntries.map((entry) => [entry.row.id, entry]));

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">拠点データの登録</h1>
          <GuideButton />
        </div>
        <ScreenLead>まずは拠点名・所在地と、取水量や排出量を登録。自然との関わりを評価する土台を作ります。</ScreenLead>
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        <GuideBox>
          拠点を登録し、必要なデータを取り込みます。住所か座標がない拠点は評価できません。
        </GuideBox>
      </div>

      {/* D-11-1:残タスクの頭出しバナー(全6画面共通。残タスクがある時だけ出る)。 */}
      <TaskBanner current="/sites" result={result} />

      <div className="grid-2">
        <Card title="登録・取込" subtitle="作業の種類ごとに画面を分けています">
          <div className="action-list">
            <Link href="/sites/register" className="action-link">
              <b>拠点データを登録する</b>
              <span>CSV一括登録、または1件ずつ追加します</span>
            </Link>
            <Link href="/sites/import/prtr" className="action-link">
              <b>PRTR排出量を取り込む</b>
              <span>汚染物質算定に使う4ファイルを検証します</span>
            </Link>
            <Link href="/sites/import/waste" className="action-link">
              <b>廃棄物データを取り込む</b>
              <span>廃棄物カテゴリの追加入力を反映します</span>
            </Link>
            <Link href="/sites/import/land-use" className="action-link">
              <b>土地利用データを取り込む</b>
              <span>土地利用・改変の追加入力を反映します</span>
            </Link>
          </div>
        </Card>

        <IntakeReference />
      </div>

      <Card
        title="拠点一覧"
        subtitle={`登録拠点 ${sites.length}件`}
        padBody={false}
        foot="画面から登録した拠点は編集・削除できます。削除しても過去の計算結果・監査証跡は残ります"
      >
        {sites.length === 0 ? (
          <p style={{ padding: "12px 18px", color: "var(--ink-faint)" }}>まだ拠点が登録されていません。</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>種別</th>
                <th>業種</th>
                <th>座標解決</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const stored = storedById.get(site.id);
                const editable = stored !== undefined && isUserSiteId(site.id);
                const locked = stored === undefined ? LOCKED_REASON.demo : LOCKED_REASON.imported;
                return (
                  <tr key={site.id} id={`site-${site.id}`}>
                    <td>
                      {/* 拠点IDは照合用の内部IDなので、本文からは小書きに退避する(指示06)。 */}
                      <b>{site.name}</b>
                      <span className="id-note">{site.id}</span>
                    </td>
                    <td>{siteTypeLabel(site.siteType)}</td>
                    <td>{industrySectorLabel(site.industrySector)}</td>
                    <td>
                      {/*
                        B-06:素テキストだった座標解決状態をTag化する。「未解決」はその帰結
                        (評価対象外になる)がその場で分からなかったため、titleに明記する。
                        ユーザー登録拠点であれば、B-03で追加された操作列の「編集」で直せることも
                        titleに含める(行内にボタンを増やさず、既存の操作列と関連付ける)。
                      */}
                      {site.location.kind === "coordinates" ? (
                        <Tag variant="neutral">座標あり</Tag>
                      ) : site.location.geocoded ? (
                        <Tag variant="neutral">住所→解決済み</Tag>
                      ) : (
                        <Tag
                          variant="warn"
                          title={
                            editable
                              ? "座標が解決できないため評価対象外になります。操作列の「編集」から修正できます"
                              : "座標が解決できないため評価対象外になります"
                          }
                        >
                          未解決
                        </Tag>
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <EditSiteButton entry={stored} />
                          <RemoveSiteButton siteId={site.id} siteName={site.name} />
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Tag variant="neutral">{locked.tag}</Tag>
                          <span style={{ color: "var(--ink-faint)", fontSize: 11.5 }} title={locked.title}>
                            編集不可
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/*
        build-plan §6「データ取込のエラーハンドリング:実データは汚れている前提。
        どこで落ちたかが分かること」。M1が返すingestionErrorsは従来どこにも
        表示されていなかった(GAP-02)。
      */}
      {/*
        B-09:0件でも本文+注記で大きな面積を占めていた。「黙って消えない」原則は維持しつつ、
        0件のときは見出し+1行のコンパクト表示にし、注記は1件以上のときだけ出す。
      */}
      {ingestionErrors.length === 0 ? (
        <Card title="取込時に除外された行">
          <p style={{ margin: 0, color: "var(--ink-faint)", fontSize: 12.5 }}>0件 — 除外された行はありません</p>
        </Card>
      ) : (
        <Card title="取込時に除外された行" subtitle={`${ingestionErrors.length}件`}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {ingestionErrors.map((error) => (
              <li key={error.rowId} style={{ fontSize: 12.5 }}>
                <b>{error.rowId}</b>: {error.reason}
              </li>
            ))}
          </ul>
          <p className="tooltip-note">
            座標も住所もない拠点は評価に進めません。除外した事実と理由は記録され、監査時に説明できます。
          </p>
        </Card>
      )}

      <DataSourceAttribution sources={["WRI Aqueduct 4.0", "ENCORE"]} />
      <StepNav current="/sites" result={result} />
    </div>
  );
}
