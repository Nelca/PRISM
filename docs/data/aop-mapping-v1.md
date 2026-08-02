# AoP正規化対応表 v1

**目的:** `docs/requirements/m4-divergence-decomposition.md` §0.2/§6.2 が要求する、手法横断の共通語彙(正規化AoPコード)への対応付け。M4の乖離分解(エンドポイント被覆要因)が機能するかどうかの前提データ。
**対象:** フェーズ0技術検証(C-3b)。MVP水パイロット(IFVI / 代替費用法 / LIME3)を最優先。
**原則:** 対応付け不能なものは `unmapped` のまま残す。推定で埋めない(build-plan §3.1 / M4要件定義書 §0.2)。
**最終更新:** 2026-08-01(v2:IFVI Water Consumption最終版・LIME3一次資料を反映)
**調査方法:** 一次資料(公式方法論文書・査読論文)の直接参照。アクセスできなかった資料は明記する。

**正規化コード:** `human_health` / `ecosystem_quality` / `resource_availability` / `social_assets` / `unmapped`

---

## 0. 重要な留保 — 先に読むこと

**MVPの水パイロット(build-plan §5.2)が対象とする物理量は「取水量」であり、対応するIFVI方法論は "Water Consumption Topic Methodology"(最終版・VTPC承認済み、2026年3月)である。全文を入手・確認済み(§1.3参照)。**

**最重要の構造的発見(v2で追加):** IFVIのWater Consumption方法論は、単一の集計式の中に**厚生価値(WTPベース)の要素と交換価値(費用ベース)の要素を内部で混在させている。**

```
VF(水) = MAX(栄養不良の健康影響, 感染症の健康影響, 生態系サービス毀損)   ← 3つはWTPベース(厚生価値寄り)
       + 将来の水アクセス費用(代替費用モデル・2%割引・2080年まで)      ← 費用ベース(交換価値寄り)
```

構想書8.2/design-rationale-log D-11の最重要規律(「異なる価値概念の合算をシステムが物理的に禁止する」)は、**PRISM内部の分解ロジックだけでなく、入力データ(IFVIの公式集計値そのもの)の時点で既に抵触しかねない構造**であることが判明した。M3の要件定義で、IFVIの公式集計値をそのまま1本のValuationRecordとして扱うか、4つの内訳値に分解して別々のValuationRecordとして取り込むかを判断する必要がある(詳細は§1.3および`method-recalculability.md`§2.3)。

---

## 1. IFVI

### 1.1 構造上の注記(確度:高)

IFVIは自身の一般方法論(General Methodology 1)において、古典的なLCAの「Areas of Protection」(人間健康/生態系品質/資源)という語彙を自らの概念枠組みとしては採用していない。IFVIのネイティブな枠組みは「ウェルビーイングの次元(健康・所得資産・社会的つながり)」と「資本(人的・社会・自然・経済・製造資本)」である(Capitals Coalitionの資本フレームワークを引用)。

> 出典: General Methodology 1: Conceptual Framework for Impact Accounting(IFVI/VBA, 2024年2月) https://ifvi.org/wp-content/uploads/2024/02/IFVI_VBA_General-Methodology-1_Letter.pdf

**ただし、個別トピック方法論が既存のLCIAモデル(LC Impact / USEtox等)を内部で利用する場合、そのLCIAモデルのAoP語彙をそのまま借用している。** したがって「IFVIのAoP」は方法論全体で統一されたものではなく、トピックごとに個別確認が必要。

### 1.2 Water Pollution(暫定版・VTPC未承認)— 確度:高

> 出典: Interim Water Pollution Topic Methodology(IFVI, 2024年10月) https://ifvi.org/wp-content/uploads/2024/10/IFVI_Environmental-Methodology_Interim-Water-Pollution-Topic-Methodology.pdf

計算式: `WP Value = EUT Impact + HEALTH Impact` (Eq. 1–3)。2つのインパクトが分離して算出・報告される。

| 手法内の呼称(原文) | 正規化コード | 確度 | 根拠 |
|---|---|---|---|
| "the area of protection 'Ecosystem quality'"(富栄養化=EUT Impact) | `ecosystem_quality` | 高 | Appendix B12にAoP語彙として明記 |
| HEALTH Impact(DALY・VSLベース) | `human_health` | 高 | 人間健康への影響として明記、DALY換算 |

**注:** この文書はMVPの直接の対象(取水量)ではなく、M2「汚染」カテゴリの参考情報として保持する。

### 1.3 Water Consumption(最終版・VTPC承認済み 2026年3月)— 確度:高(全文確認済み)

> 出典: IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf(79頁、最終承認版) https://ifvi.org/wp-content/uploads/2026/03/IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf
> Basis for Conclusions: https://ifvi.org/wp-content/uploads/2026/03/WaterConsumption_Basis-for-Conclusions_vFINAL.pdf

集計式(Eq. 2): `VFH2O-site = VFaccess-site + MAX(VFes-site, VFnutrition-site, VFdisease-site)`

4つの経路(Value Factor)がそれぞれ個別に算出・公開されている(Appendix D, Table D1)。3つの「近接期の機会費用」経路(nutrition/disease/es)は**合算せず最大値のみ**採用し(同一の水量を3通りに使うと過大評価になるため)、そこに独立した長期費用(VFaccess)を**加算**する。

| 手法内の呼称(原文) | 内容 | 正規化コード | 確度 | 根拠 |
|---|---|---|---|---|
| VFnutrition(Affected health from malnutrition) | 農業への取水制限→地域の栄養不良→DALY損失。VSLで評価。出典元データはLC-Impact | `human_health` | 高 | 健康影響として明記、DALY/VSL使用 |
| VFdisease(Affected health from water-borne disease) | 家庭用淡水利用・上下水道接続・GDP・気温からDALYを推定。VSLで評価。Motoshita et al. 2011に依拠 | `human_health` | 高 | 同上 |
| VFes(Altered ecosystem services) | 水の可用性と生態系サービスの関係。ESVD(Brander et al. 2024)・実蒸発散量(AET)をバイオームの水要求量の代理指標として使用。食料供給サービスは栄養不良との二重計上回避のため除外 | `resource_availability` | 中〜高 | 生態系の**状態**(種の絶滅リスク等)ではなく、生態系が提供する**サービス供給力**の毀損を扱うため、`ecosystem_quality`ではなく`resource_availability`と判断。LIME3の一次生産(§2参照)と同型の概念 |
| VFaccess(Financial costs to access future water) | 水ストレス(需要/供給比)が1を超える分の抽出について、将来の水供給単価(IBnetベンチマーク)を用いて2080年まで割引現在価値化する代替費用モデル。他の3経路とは異なり近接期の機会費用ではなく世代間費用 | **`unmapped`(AoP体系の対象外)** | — | 損害到達先(AoP)の分類ではなく、代替費用法(§3)と同型の直接費用モデル。エンドポイントモデルを用いないため、本表の正規化コードのいずれにも該当しない |

**価値概念の内訳(重要・§0参照):** VFnutrition・VFdisease・VFesはWTPベース(厚生価値寄り)、VFaccessは代替費用ベース(交換価値寄り)。IFVIの公式集計値1本には両方が混在している。

**幾何・PPP較正(確度:高、確認済み):** 3つの「視点」を規定(Appendix B §7, Table B1)。①Local(現地価格そのまま)②Global(GNI PPP per capitaの比率で$YLL・ESVD値・IBnet費用を調整、所得起因の価格差を除去)③Utility-weighted(低所得国への衡平配慮の重み付け、**公式方法論の対象外と明記**)。欠測値補完はWorld Bank地域・所得階層の階層平均、外れ値はIQRベースで除外。

**割引率(確度:高、確認済み):** VFaccessのみ2%で2080年まで割引。VFnutrition・VFdiseaseのDALYには割引・年齢重み付けを適用しない(Global Burden of Disease方式に整合、「生涯のどの年も等しく評価する」)。詳細は`method-recalculability.md`§2.3参照。

---

## 2. LIME3

> 出典: LCA日本フォーラム LIME公式ページ(https://lca-forum.org/english/lime/)、*Int J LCA* 特集号序文(doi:10.1007/s11367-018-1545-6)、Yamasaki, Ikaga & Itsubo (2020)『国際対応型LCIA手法LIME3の枠組みに基づく世界42カ国の行政区域の年間環境影響評価』日本建築学会環境系論文集85(767) doi:10.3130/aije.85.67、Kaneko et al. (2022)『LIME3を用いたインドネシアにおけるオンサイト型排水処理システムのライフサイクル影響評価』人間と環境38(2)

LIME1/LIME2から引き継がれる4つのAoPを持つ。

| 手法内の呼称(原文・和文) | 定義 | 正規化コード | 確度 | 根拠 |
|---|---|---|---|---|
| 人間健康(Human health) | 大気汚染物質・有害化学物質等が人の健康に与える影響。DALY型で測定 | `human_health` | 高 | 明確に健康影響として定義 |
| 社会資産(Social assets) | 酸性雨による構造物劣化、海面上昇による土地水没等、構築資産への損害 | `social_assets` | 高 | 資産損害として明確に定義 |
| **一次生産(Primary production)** | **「森林や農作物、漁業資源など、自然の光合成によって生み出される生産力」** | `resource_availability` | 中〜高 | **M4要件定義書§0.2で「対応先不明」としていた項目。今回、自然の生産力(資源可用性)概念であり、生物多様性(種の絶滅リスク)とは明確に区別されることを確認。資源可用性への対応付けが妥当と判断** |
| 生物多様性(Biodiversity) | 種の絶滅リスク(EINES / E/MSY:百万種年あたりの絶滅種数)で測定 | `ecosystem_quality` | 高 | ReCiPe/IMPACT World+の「Ecosystems」AoPと同型の生態系状態指標であるため。既存対応表(M4要件定義書§0.2)の判定(中〜高)を確認・格上げ |

**一次生産の対応付けが解消したことで、M4要件定義書§0.2で「既知の難所」としていたLIME3側の課題は解消した。** CE Delftの「建造物・材料」は本調査では未着手(§4参照)。

### 2.1 水資源との接続(確度:高、確認済み)

Yamasaki, Ikaga & Itsubo (2020) Table 2(42カ国の影響カテゴリ×保護対象のクロス集計)により、**LIME3における「水消費(Water consumption)」の損害額は100%人間健康エンドポイントに配分され、社会資産・生物多様性・一次生産への配分はゼロ(欄が空白)**であることを確認した。42カ国合計で1.36×10¹²ドル(人間健康合計の71.1%)。

これは土地利用・森林資源消費(生物多様性・一次生産に分割配分され、人間健康には配分されない)とは対照的なパターンである。**Motoshita et al. (2018)の一次生産接続の特性化係数は、LIME3の標準実装(Itsuboグループによる42カ国評価)では採用されていないか、少なくとも主要な集計には反映されていない。** 一次生産への分岐可能性という以前の記述は撤回する。

---

## 3. 代替費用法(自社定義・外部方法論ではない)

M4要件定義書§6.1で既に整理済み: 「自社の代替水源調達コスト」のみを含み、生態系劣化・下流の健康影響は含まない。

**AoP体系への対応付けは対象外(N/A)とする。** 代替費用法はエンドポイント被覆モデル(損害の到達先を分類する枠組み)を用いず、直接的な代替調達コストを算出する交換価値ベースの手法であるため、本表の正規化コードのいずれにも該当しない。この判断自体を「対応付け不能」ではなく「モデル構造上、対応付けの対象にならない」として記録する。

---

## 4. 未着手(MVP水パイロットのスコープ外・参考記載のみ)

M4要件定義書§0.2に既にある内容を転記。今回の調査では追加検証していない。

| 手法 | 呼称 | 対応 | 確度 |
|---|---|---|---|
| ReCiPe 2016 | Human health / Ecosystems / Resource scarcity | `human_health` / `ecosystem_quality` / `resource_availability` | 中〜高 |
| IMPACT World+ | Human health / Ecosystem quality | `human_health` / `ecosystem_quality` | 中〜高 |
| CE Delft 環境価格 | 人間健康/生態系サービス/建造物・材料/資源/厚生 | 「建造物・材料」が4分類に収まらない | 中 |

---

## 5. C-3b 判定への示唆(更新)

**IFVI Water Consumption × LIME3のペアで、AoP対応付けは実質的に完了した。**

- LIME3の水消費損害は100%人間健康(§2.1)
- IFVIの水消費損害は、VFnutrition/VFdisease(いずれも`human_health`)がMAXの対象になりやすく(生態系サービス毀損VFesが上回るケースを除く)、加えてVFaccess(AoP対象外の代替費用モデル)が別建てで加算される

**両手法とも「水」の主要な損害配分は人間健康エンドポイントに収斂する可能性が高い。** ただしIFVIには LIME3にない第4の要素(VFaccess:将来アクセス費用)が存在し、これは**エンドポイント被覆の違いというより、価値概念の違う費用モデルの追加**として扱う必要がある(§0参照)。

**この設計判断は完了した。** M3要件定義(D-1、`docs/requirements/m3-monetization-engine.md`)で、IFVIの水消費集計値は4本の内訳(VFnutrition/VFdisease/VFes/VFaccess)に分解して取り込むことが確定した。理由と整合性検証の仕組みはM3要件定義書D-1・D-2を参照。

---

## 6. 未確認事項(次のアクション)

| # | 内容 | 優先度 | 状態 |
|---|---|---|---|
| ~~1~~ | ~~IFVI Water Consumption(最終版)の全文入手と定義文確認~~ | — | **解消(§1.3)** |
| ~~2~~ | ~~LIME3の一次資料アクセス確保~~ | — | **解消(J-STAGE公開論文2本を確認、§2参照)** |
| 3 | CE Delft「建造物・材料」の対応付け(M2「汚染」カテゴリで必要になった際に着手) | 中(MVPスコープ外) | 未着手 |
| 4 | IFVI Water Pollutionの「Interim・VTPC未承認」というステータスが係数の信頼性・ライセンス上どう扱われるか(`licensing.md`で確認) | 中 | 未着手(M2汚染カテゴリ用) |
| ~~5~~ | ~~IFVIの水消費集計値を公式集計値のまま使うか、内訳に分解して取り込むかのM3設計判断~~ | — | **解消(M3要件定義D-1、4本に分解)** |

**本ファイルの未確認事項は、CE Delft(M2汚染カテゴリ着手時)とライセンス確認(licensing.md待ち)を除き解消した。**
