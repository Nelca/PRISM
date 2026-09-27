/**
 * IFVI Global Value Factor Database V2 の研究用アダプタ。
 * 値は社会への影響額(USD2023)であり、企業の現金支出ではない。自然債務・投資判定へは加算しない。
 */

export const GVFD_TOPICS = {
  "GHG Emissions": "温室効果ガス",
  "Water Consumption": "水消費",
  "Air Pollution": "大気汚染",
  Waste: "廃棄物",
  "Land Use": "土地利用",
  "Land Conversion": "土地転換",
  "Water Pollution": "水質汚染",
} as const;
export type GvfdTopic = keyof typeof GVFD_TOPICS;

export interface GvfdRow {
  row: number;
  topic: string;
  category: string;
  location: string;
  impact: string;
  sourceUnit: string;
  reference: string;
  status: string;
  updatedOn: string;
  priceYear: number;
  currency: string;
  /** geographies と同じ順序の係数。未収録は null。 */
  values: (number | null)[];
}
export interface GvfdGeography {
  id: string;
  name: string;
  region: string | null;
  incomeClass: string | null;
}
export interface GvfdDataset {
  source: {
    version: string;
    versionDate: string;
    acquiredOn: string;
    url: string;
    workbookName: string;
    workbookSha256: string;
    archiveSha256: string;
    sheet: string;
    recordCount: number;
    missingCount: number;
  };
  geographies: GvfdGeography[];
  rows: GvfdRow[];
}
/** 選択した地域の1係数。cell は原本の Global Value Factors シート上のセル番地。 */
export interface GvfdFactor extends Omit<GvfdRow, "values"> {
  value: number | null;
  cell: string;
}

export const GVFD_GUIDANCE: Record<GvfdTopic, string> = {
  "GHG Emissions": "算定済みのtCO2eを使用します。異なるScopeの対象範囲を区別してください。",
  "Water Consumption": "取水量ではなく水消費量を使用します。地域内の水ストレス差は国平均だけでは表せません。",
  "Air Pollution":
    "排出源の条件を選択します。健康影響には選んだ条件だけを適用し、視程・農業等の共通成分を加えます。PM10とPM2.5の同じ排出を重複計上しないでください。",
  Waste:
    "廃棄物の種類と処理方法に対応した量を使用します。V2の単位はトンあたりです。温室効果ガス・大気汚染の成分を含むため、同じ処理の別算定と合算しないでください。",
  "Land Use": "既に転換された土地の年間の利用面積を使用します。表示する影響額は1年分です。生息地面積をそのまま読み替えないでください。",
  "Land Conversion": "自然状態から用途変更した面積を使用します。係数には将来の生態系サービス損失の現在価値が含まれます。毎年の費用として繰り返し計上しません。",
  "Water Pollution": "物質・化学形態と排出先を確認した直接排出量を使用します。総量と個別物質の重複、移動量との混同を避けてください。",
};

/** 統合管理の指標から引き継げるGVFDの評価対象。生物・鉱物資源などには対応する係数がない。 */
export const GVFD_METRIC_TOPICS: Record<string, GvfdTopic[]> = {
  ghg_scope1: ["GHG Emissions"],
  ghg_scope2: ["GHG Emissions"],
  ghg_scope3: ["GHG Emissions"],
  water_consumption: ["Water Consumption"],
  pollutant_release: ["Air Pollution", "Water Pollution"],
  waste_generated: ["Waste"],
  land_converted: ["Land Conversion"],
};

type QuantityUnit = "kg" | "t" | "m³" | "ha" | "tCO2e";
const SOURCE_UNITS: Record<string, QuantityUnit> = {
  "$/kg": "kg",
  "$/metric ton": "t",
  "$/tonne": "t",
  "USD/m3": "m³",
  "$/ha": "ha",
  "$/tCO2e": "tCO2e",
};

export function isGvfdTopic(value: string): value is GvfdTopic {
  return Object.hasOwn(GVFD_TOPICS, value);
}

export function factorsFor(dataset: GvfdDataset, topic: string, geographyId: string): GvfdFactor[] {
  if (!isGvfdTopic(topic)) throw new Error("評価対象を選択してください。");
  const index = dataset.geographies.findIndex((geography) => geography.id === geographyId);
  if (index < 0) throw new Error("原本にない地域です。");
  return dataset.rows
    .filter((row) => row.topic === topic)
    .map(({ values, ...row }) => ({ ...row, value: values[index] ?? null, cell: `${geographyId}${row.row}` }));
}

/** 大気汚染の視程・農業等、排出源条件によらない共通成分(原本の "N/A for ..." 行)。 */
export const commonLocation = (location: string) => location.startsWith("N/A for ");

export function locationsFor(factors: GvfdFactor[], category: string): string[] {
  const locations = [...new Set(factors.filter((row) => row.category === category).map((row) => row.location))];
  const specific = locations.filter((location) => !commonLocation(location));
  return specific.length ? specific : locations;
}

/** 選んだ条件の成分。大気汚染だけは共通成分を一度加える(都市・農村等を重複加算しない)。 */
export function applicableFactors(factors: GvfdFactor[], category: string, location: string): GvfdFactor[] {
  if (!locationsFor(factors, category).includes(location)) throw new Error("物質・用途と適用条件を選択してください。");
  return factors.filter(
    (row) => row.category === category && (row.location === location || (row.topic === "Air Pollution" && commonLocation(row.location)))
  );
}

export function quantityUnit(sourceUnit: string): QuantityUnit {
  const unit = SOURCE_UNITS[sourceUnit];
  if (!unit) throw new Error("未対応の係数単位です。");
  return unit;
}

/** 重量はt・kgの相互換算を許す。それ以外は係数の単位のみ。 */
export function allowedInputUnits(sourceUnit: string): string[] {
  const unit = quantityUnit(sourceUnit);
  if (unit === "t") return ["t", "kg"];
  if (unit === "kg") return ["kg", "t"];
  return [unit];
}

function numeric(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new Error("数量は0以上の有限の数値で入力してください。");
  return value;
}

function conversionFactor(inputUnit: string, unit: QuantityUnit): number {
  if (inputUnit === unit) return 1;
  return inputUnit === "kg" ? 0.001 : 1000;
}

/**
 * 数量×係数を成分ごとに求め、合計する。未収録の成分が一つでもあれば算定しない
 * (別の国や平均値、0で黙って補完しない)。
 */
export function calculateGvfd(factors: GvfdFactor[], category: string, location: string, quantity: number, inputUnit: string) {
  const selected = applicableFactors(factors, category, location);
  if (!selected.length || selected.some((row) => row.value === null)) {
    throw new Error("この地域・条件には未収録の係数があります。別地域の値や0で補完せず、算定対象外とします。");
  }
  const first = selected[0];
  const mixed = selected.some(
    (row) => row.currency !== first.currency || row.priceYear !== first.priceYear || row.sourceUnit !== first.sourceUnit || row.topic !== first.topic
  );
  if (mixed) throw new Error("異なる単位・価格年・対象の係数は合算できません。");
  if (new Set(selected.map((row) => row.impact)).size !== selected.length) throw new Error("同じ影響成分の係数が重複しています。");
  if (!allowedInputUnits(first.sourceUnit).includes(inputUnit)) throw new Error("入力単位が係数に対応していません。");

  const unit = quantityUnit(first.sourceUnit);
  const convertedQuantity = numeric(numeric(quantity) * conversionFactor(inputUnit, unit));
  const components = selected.map((row) => ({ ...row, amount: numeric(convertedQuantity * numeric(row.value!)) }));
  const total = numeric(components.reduce((sum, row) => sum + row.amount, 0));
  return { total, components, convertedQuantity, unit, currency: first.currency, priceYear: first.priceYear };
}
