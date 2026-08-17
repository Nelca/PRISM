/**
 * 算定方法(M3のプラグインID)の表示名(指示03・06)。
 *
 * 以前は valuation/page.tsx と decomposition/page.tsx に同じ定数が二重に定義されていた。
 * 画面統合にあわせて1箇所に集約する。
 */

export const METHOD_LABEL: Record<string, string> = {
  "replacement-cost": "代替費用法(浄水コスト)",
  "lime3-water": "LIME3(水消費統合指標)",
  "ifvi-water-consumption": "IFVI 水ストレス係数",
  "ghg-carbon-price-conversion.ghg-social-cost": "炭素の社会的費用(IFVI GHG方法論)",
  "ghg-carbon-price-conversion.ghg-gx-ets-price": "GX-ETS調整基準取引価格",
};

/**
 * サブ係数(内訳値)の表示名(第4版 D-03)。
 *
 * IFVI Water Consumption Topic Methodology は1本の集計値ではなく4本の内訳値として
 * 取り込まれ(M3 D-1)、methodIdは `{親手法ID}.{内訳ID}` の形になる
 * (M4要件定義書 §3.2の2026-08-01追記)。辞書が親IDしか持っていなかったため、
 * `ifvi-water-consumption.VFaccess` のような内部IDが画面にそのまま出ていた。
 *
 * 和名の出典(推測で命名しない):
 *   - `docs/data/aop-mapping-v1.md` §1.3 の対応表(方法論全文を確認済みと明記)
 *   - `docs/requirements/m3-monetization-engine.md` §0 の集計式の和訳
 *     「VF(水) = MAX(栄養不良の健康影響, 感染症の健康影響, 生態系サービス毀損)
 *              + 将来の水アクセス費用」
 *   - プラグイン実装 `packages/core/src/monetization/plugins/ifvi-water-consumption.ts`
 *     の `aopSourceLabel`(Affected health from malnutrition / from water-borne disease /
 *     Altered ecosystem services / Financial costs to access future water)
 */
export const SUB_FACTOR_LABEL: Record<string, string> = {
  VFnutrition: "栄養不良の健康影響",
  VFdisease: "感染症の健康影響",
  VFes: "生態系サービス毀損",
  VFaccess: "将来の水アクセス費用",
};

/**
 * 手法IDの表示名。サブ係数付きIDは「親手法名(サブ係数の和名)」の形で返す。
 *
 * **未知のサブ係数でも生のIDは出さない。**親手法名が分かっていれば
 * 「親手法名(コード)」まで縮め、親手法も未知の場合に限りIDをそのまま返す
 * (黙って消すと何の行か分からなくなるため)。
 */
export function methodLabel(methodId: string | undefined | null): string {
  if (!methodId) return "—";

  const known = METHOD_LABEL[methodId];
  if (known) return known;

  const separator = methodId.indexOf(".");
  if (separator > 0) {
    const baseLabel = METHOD_LABEL[methodId.slice(0, separator)];
    const subFactorId = methodId.slice(separator + 1);
    if (baseLabel) {
      return `${baseLabel}(${SUB_FACTOR_LABEL[subFactorId] ?? subFactorId})`;
    }
  }

  return methodId;
}

/**
 * 短縮表示名(第4版 D-07)。比較ペアのピルやウォーターフォールの軸ラベルのように
 * 幅が限られる場所で使う。正式名称は title 属性等で必ず併記すること。
 */
const METHOD_SHORT_LABEL: Record<string, string> = {
  "replacement-cost": "代替費用法",
  "lime3-water": "LIME3",
  "ifvi-water-consumption": "IFVI",
  "ghg-carbon-price-conversion.ghg-social-cost": "炭素の社会的費用",
  "ghg-carbon-price-conversion.ghg-gx-ets-price": "GX-ETS価格",
};

const SUB_FACTOR_SHORT_LABEL: Record<string, string> = {
  VFnutrition: "栄養",
  VFdisease: "感染症",
  VFes: "生態系",
  VFaccess: "水アクセス",
};

/** 手法IDの短縮表示名。未知のIDは methodLabel と同じ規則でフォールバックする(生IDは出さない)。 */
export function methodShortLabel(methodId: string | undefined | null): string {
  if (!methodId) return "—";

  const known = METHOD_SHORT_LABEL[methodId];
  if (known) return known;

  const separator = methodId.indexOf(".");
  if (separator > 0) {
    const base = METHOD_SHORT_LABEL[methodId.slice(0, separator)];
    const subFactorId = methodId.slice(separator + 1);
    if (base) {
      return `${base}(${SUB_FACTOR_SHORT_LABEL[subFactorId] ?? subFactorId})`;
    }
  }

  return methodLabel(methodId);
}

/** 手法ID(サブ係数付きを含む)を文中から拾うためのパターン。辞書のキーから機械的に組み立てる。 */
const METHOD_ID_IN_TEXT = new RegExp(
  `(?:${Object.keys(METHOD_LABEL)
    .map((id) => id.split(".")[0])
    .filter((id, index, all) => all.indexOf(id) === index)
    .join("|")})(?:\\.[A-Za-z0-9_-]+)?`,
  "g"
);

/**
 * 記録済みの文の中に残っている手法IDを、表示のときだけ日本語ラベルに置き換える(第4版 D-03)。
 *
 * 変更履歴(`/ledger` の操作ログ)は追記のみのイベントの射影であり、**過去の記録は
 * 書き換えない。**辞書が内訳値に対応していなかった時期に記録された文には
 * `ifvi-water-consumption.VFaccess` のような内部IDがそのまま残っているため、
 * 記録そのものは保ったまま、画面に出す瞬間だけ読める名前に置き換える。
 */
export function withMethodLabelsInText(text: string): string {
  return text.replace(METHOD_ID_IN_TEXT, (matched) => methodLabel(matched));
}
