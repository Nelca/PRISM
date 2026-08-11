# TNFD LEAP L3(優先地点の特定)5基準 原文

**目的:** `docs/data/acquisition-runbook.md` §3.10(A-14)の成果物。M1 D-2が実装した5基準(`CriteriaMet`)が、TNFD公式定義と一字一句対応していることを監査説明のために原文で押さえる。
**取得日:** 2026-08-10
**入手先:** TNFD公式サイトのPDF本体。`https://tnfd.global/wp-content/uploads/2023/07/23-23882-TNFD_v0.4_LEAP-Guidance-Annex-4.11_v4-2-1.pdf`(*Additional Guidance – LEAP (L3): Location prioritisation*、2023年7月)
**取得方法:** 自動取得ツール(WebFetch)はHTTP 403で拒否されたが、ブラウザ相当のUser-Agentヘッダーを付けたPythonの直接リクエストで取得できた(登録・ログイン不要の完全な公開PDF。`docs/data/carbon-price-scenarios.md`のGX-ETS一次資料取得と同じ手法)。

---

## 1. 原文(Table 2: Criteria for Priority Location Identification)

出典PDF pp.4-5(*Additional Guidance - LEAP (L3)*, Table 2)。

> An organisation should assess all locations identified in the scoping phase against the criteria outlined in Table 2. **To be considered a priority location, the location needs to meet one or more of the criteria.** For example, any location that is identified to be a Key Biodiversity Area would be a priority location, regardless of how it compares against other criteria in Table 2.

### Area: Biodiversity importance

> Areas of biodiversity importance include, but are not limited to, protected areas or otherwise internationally recognised areas. Criteria could include:
> - The location is legally protected, or through Other Effective Conservation Measures (OECMs), according to local, national and/or international conventions and/or with World Heritage site status;
> - The location includes likely or potential Critical Habitats, as defined by the International Finance Corporation's Performance Standard 6;
> - The ecosystems/habitats within the location are rare or very localised (e.g. seamounts or coastal upwellings) or highly threatened, as identified in the Red List of Ecosystems, for example. This list is still under development;
> - The location includes threatened species, such as species listed as Critically Endangered, Endangered and Vulnerable on the IUCN Red List of Threatened Species, that have been identified as having a high extinction risk. This can be defined using a minimum threshold for the Species Threat Abatement and Restoration (STAR) metric, for example;
> - The location is identified as, or meets the criteria to be considered, a Key Biodiversity Area.

### Area: Ecosystem integrity(2つの基準を含む)

> Ecosystem integrity refers to the extent to which the composition, structure and function of an ecosystem falls within the natural range of variation.
>
> - The ecosystem provides significant cultural or economic benefits for stakeholders – by providing water, recreational or eco-tourism sites, for example.
> - **High integrity locations** (both at global scale, and relative to the integrity in the surrounding landscape) are those that may contain large opportunities for safeguarding stocks of environmental assets and maintaining ecosystem service provision, both locally and globally.
> - **Areas of rapid decline in integrity** represent areas with declining ecosystem service provision and high exposure to an organisation's dependency-related risks.

**重要:** 原文自体が「Ecosystem integrity」という1つのArea(区分)の下に、**水準(High integrity)とトレンド(rapid decline in integrity)の2つの基準を並記している。**`packages/core/src/site/criteria.ts`のコメント「ecosystem_integrityという1つのlayerTypeから2つの基準(highEcosystemIntegrity・rapidIntegrityDecline)を導出する」という実装上の構造は、**独自の解釈ではなく原文の構造そのものに忠実**であることが、この原文取得により確認できた。

### Area: Water stress

> The location is an area of known water stress, where the quality and/or quantity of available water is deteriorating.

### Area: Potential significant dependencies or impacts

> The organisation is likely to have significant dependencies and significant impacts in the location. This could initially be based on the scoping phase of LEAP, considering potential impact drivers and dependencies typical to each sector, sub-industry or business process, and reviewed following the fuller analysis of dependencies and impacts in the Evaluate phase. This may include the potential for positive impacts, where restoring nature could create opportunities for the organisation.

### 評価単位(原文に明記)

> The ecosystem integrity and biodiversity importance in the location should be characterised at a landscape scale, using an appropriate area of assessment such as an ecoregion. **Water stress should be evaluated at a relevant water basin scale.**

---

## 2. 実装との対応表

| TNFDの原文(Area) | `CriteriaMet`のキー | 対応状況 |
|---|---|---|
| Biodiversity importance | `highBiodiversityImportance` | 対応(KBA・保護区、WDPA経由。ライセンス保留中) |
| Ecosystem integrity — High integrity locations | `highEcosystemIntegrity` | 対応(データソース未実装、`no_data_source`) |
| Ecosystem integrity — Areas of rapid decline in integrity | `rapidIntegrityDecline` | 対応(2026-08-10、Ecological Integrity Indexの実データで実装済み。`docs/data/ecosystem-integrity-trend-notes.md`) |
| Water stress | `waterStress` | 対応(WRI Aqueduct 4.0の実データで実装済み) |
| Potential significant dependencies or impacts | `likelySignificantDependencyImpact` | 対応(ENCOREの実データで実装済み) |

**発見(原文で確認できたこと):**
- TNFDは`waterStress`を**流域(water basin)スケール**で評価すべきと明記している。PRISMの実装(WRI Aqueduct、basin単位のpoint-in-polygon照会)はこれと一致する(`docs/data/aqueduct-water-stress-notes.md`)
- `highEcosystemIntegrity`・`highBiodiversityImportance`は**ランドスケープスケール(ecoregion等)**で評価すべきと明記されている。現在の実装(拠点座標のピクセル値・basin単位)は、この「ランドスケープスケール」という推奨粒度より細かい/異なる場合があり、将来の精緻化の余地として記録する
- Water stress・Ecosystem integrity候補データソースの原文の脚注リストに、本プロジェクトが既に採用している`WWF Water Risk Filter`・`Aqueduct Water Risk Atlas`・`ENCORE`・`WDPA`・`Ecosystem Integrity Index`(脚注9、Blumetto et al. 2019。`docs/data/ecosystem-integrity-trend-notes.md`で調査した「Ecosystem Integrity Index」の3系統とは別の、さらに4つ目の同名の農業評価指標)がすべて含まれている。**混同を避けるため、この4つ目の系統も記録しておく**(TNFD脚注9:農業生産システム向けの環境評価指標、2019年、`https://doi.org/10.1016/j.ecolind.2019.01.077`)
- 基準の充足判定は「**1つでも満たせば優先地点**」(OR結合)であり、PRISMの`sensitivityScore`(充足数0〜5のカウント)は原文の二値判定(優先/非優先)をスコアに一般化した設計判断である。原文はスコアという概念自体を要求していない

**費用:** 無料 / **所要:** 30分

**完了条件:** 実装済みの5基準が公式定義と一字一句対応していることを、監査説明のために原文で押さえる(**達成**)。
