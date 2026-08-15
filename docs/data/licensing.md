# ライセンス条件

**目的:** build-plan §3.4が定めるフェーズ0のライセンス確認作業の成果物。外部データ・係数の商用利用条件を、確認日・確認先・原文該当箇所とともに記録する。
**最終更新:** 2026-08-15
**確認済み:** WDPA、ENCORE、IFVI(方法論PDF自体のContent Terms。Global Value Factor Database側の利用規約は別途未確認)、World Bank(World Development Indicators)、WRI Aqueduct 4.0、LIME3(AIST-IDEA、既存社内ライセンス)
**未確認:** ESVD日本カバレッジ・再配布条件の詳細確認(`method-recalculability.md`・`aop-mapping-v1.md`で言及済み、本ファイルへの正式な転記は未)、CE Delft

---

## WDPA(World Database on Protected Areas)

**運営元:** UNEP-WCMC・IUCN
**確認日:** 2026-08-02
**確認先:** https://www.protectedplanet.net/en/legal 、https://www.unep-wcmc.org/en/wdpa-data-license

**ライセンス種別:** UNEP-WCMC/IUCN独自の利用規約(オープンライセンス・CC等ではない)

**商用利用:** **原則不可・要個別許諾。**

> "Neither the WDPA Materials... nor any work derived from or based upon [them] may be put to Commercial Use without the prior written permission of UNEP-WCMC."

"Commercial Use"の定義は広く、営利団体による利用全般、または収益化を目的とした利用(非営利団体であっても)を含む。

**内部分析用途との区別:** 利用規約は「内部分析なら適用除外」という区分を設けていない。有償プロダクトの判断材料として使う時点で"Commercial Use"に該当しうる。

**再配布・埋込:** **契約なしには一切不可。**

> データは「サブライセンスされてはならない」「ダウンロードアクセスを許可する手段(Web配信・Webサービス・インタラクティブマップ等)によるいかなる再配布も行ってはならない」

**商用ライセンスの取得先:** UNEP-WCMC(business-support@unep-wcmc.org)または IBAT Alliance(ibat-alliance.org)経由。

**帰属表示:** 必須。書式例:"UNEP-WCMC and IUCN (year), Protected Planet: [database name] [On-line], [month/year], Cambridge, UK: UNEP-WCMC and IUCN."

**PRISMへの含意:** 埋込/参照のみという選択の余地はなく、**IBAT Allianceを通じた商用契約の締結がフェーズ0〜1のアクションアイテムとして必須。** `docs/requirements/m1-target-definition.md` §1の`licenseMode`は、契約締結までは`"pending_review"`とする。

---

## ENCORE(Exploring Natural Capital Opportunities, Risks and Exposure)

**運営元:** Global Canopy・UNEP FI・UNEP-WCMC
**確認日:** 2026-08-02
**確認先:** https://encorenature.org/legal

**ライセンス種別:** CC BY-SA 4.0(表示 - 継承)

**商用利用:** **許可される。**

> "Textual content, data and PDF downloads can be reproduced for all purposes, including commercial purposes, if and only if attribution is provided to the ENCORE Partners alongside original sources, and you provide a link to the licence and indicate if any changes were made."

**帰属表示:** 必須。書式例:"ENCORE Partners (Global Canopy, UNEP FI, and UNEP-WCMC) (year). ENCORE: Exploring Natural Capital Opportunities, Risks and Exposure. [On-line], [month/year], Cambridge, UK: the ENCORE Partners. Available at: https://encorenature.org."

**継承条項(要注意・最重要):**

> "If you remix, transform or build upon the Materials you must distribute your contribution under the same original license terms"

素材を改変・加工して構築した場合、その派生物も同じライセンス条件(CC BY-SA 4.0)で頒布しなければならない。

**条文確認による補足(2026-08-02):** CC BY-SA 4.0のLegal Code(Section 1・3(b))を確認した結果、この継承義務が発動するのは「Adapted Materialを公衆にShare(頒布)した場合」に限られ、社内利用のみでは発動しない。発動した場合も影響範囲は改変物の該当部分に限定され、プロダクト全体には及ばない。CC BY-SAに非営利限定はなく、有償提供自体は制限されない。残る論点は「ENCOREレーティングを他データと合成する行為が著作権法上の"改変"か"単なる併存(mere aggregation)"か」のみで、CC自身のガイダンスもこれを断定していない(通常の著作権法の判断に委ねている)。

**留意点:** ENCOREのData/Mapページに表示される第三者データは、CC BY-SA 4.0とは別の条件下にある場合がある。動画コンテンツはCC BY-SA 4.0の対象外で、UNEPの別途書面許可が必要。

**PRISMへの対応(2026-08-02確定):** ENCOREをそのまま利用し、内部ロジックの改変は行わない(design-rationale-log D-48)。帰属表示は無条件の義務として実装する。「改変か併存か」の境界の最終判断・指摘時の対処オプションは留意事項として`docs/requirements/m1-target-definition.md` §4に記録済み。

**2026-08-10追記(業種別データの取得完了):** `Updated ENCORE knowledge base May 2026`(業種別の依存度・圧力レーティング、`06. Dependency mat ratings.csv`・`07. Pressure mat ratings.csv`)を取得した。ライセンスは同一のCC BY-SA 4.0であることを`01. Overview - IMPORTANT (READ ME).xlsx`・FAQ Q17で再確認済み。詳細は`docs/data/encore-materiality-notes.md`。`lib/demo/company.ts`の依存・影響判定(`likelySignificantDependencyImpact`)に実データを反映した(§3.8完了)。**帰属表示は2026-08-10に実装済み**(`app/components/attribution.tsx`の`DataSourceAttribution`、`app/sites/page.tsx`・`app/assessment/page.tsx`に表示)。

---

## IFVI(International Foundation for Valuing Impacts)

**運営元:** IFVI(Value Balancing Allianceと共同発行)
**確認日:** 2026-08-10
**確認先:** `IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf` p.3-4「Terms of Use for Available Content」(方法論PDF自体に記載の規約。IFVI本体の一般規約 https://ifvi.org/terms-of-use/ は本規約が優先するが、本規約に定めがない事項については一般規約が適用されるため未確認のまま)

**ライセンス種別:** IFVI独自の"Content Terms"(登録制。方法論PDFやGlobal Value Factor Databaseなど"Available Content"全般に適用)

**商用利用:** **不可。個人・非営利目的限定。**

> "you may use the Available Content solely for your personal, non-commercial purposes"

"Non-commercial purposes"には、営利企業が自社の環境影響の理解・報告に使う行為や、アドバイザリー事業者が(有償無償を問わず)顧客の報告支援に使う行為が含まれると明記されている(§1.2)。ただし直後の§1.3(Additional Use Restrictions)で以下が明確に禁止されている。

> "(a) for any commercial or for-profit purpose, including selling or promoting any products or services, including without limitation in any public reporting or in connection with any financial or commercial transaction"

**PRISMへの含意:** PRISMは有償SaaSとして係数を製品に組み込み顧客に提供する形態であり、§1.3(a)の禁止(製品・サービスの販売・宣伝への利用)に直接該当する可能性が高い。build-plan/data-acquisition-runbook §3.4が「係数の商用利用は有償ライセンスと明記」としていた判断はこの条項によって裏付けられる。§1.2の非営利例外(アドバイザリー事業者としての利用)に当たるかは事業モデルの説明次第で解釈の余地があるため、**書面での個別確認(IFVIへの直接照会)が必要**(下書きは`docs/business/outreach-action-plan.md`)。

**再配布:** 不可。

> "You agree that you will not give any third party access to the Available Content."

**登録:** ダウンロード・利用にはIFVIへの氏名・メールアドレス登録が必須(§3)。

**保証・責任の否認:** Available Contentは"AS IS"提供。IFVI/VBAは正確性・信頼性等について一切の保証をしない(§5-6)。

**未確認:** Global Value Factor Database(フォーム登録が別途必要)にも同じContent Termsが適用されるかは、ダウンロードフォーム到達後に規約表示を確認する必要がある。IFVI本体の一般利用規約(https://ifvi.org/terms-of-use/)は未読(本規約に定めのない事項に適用されるため)。

**現状の運用判断(2026-08-10):** 事業判断として、「本プロダクトは現時点で個人利用のみであり、§1.3(a)の商用・営利目的での提供に該当しない」と確認済みのため、日本の水消費VF4本(`docs/data/acquisition-runbook.md` §3.4)をコード(`lib/demo/company.ts`・`lib/demo/user-site-defaults.ts`)に反映した。**この判断は現在の利用状況に基づくものであり、恒久的な許諾ではない。** 顧客への商用提供・SaaS化・有償契約を開始する前には、必ずこのセクションを再確認し、IFVIへの個別照会(§1.2の非営利アドバイザリー例外に当たるか)または有償ライセンスの締結を先に完了させること。

---

## WRI Aqueduct 4.0(Baseline Water Stress)

**運営元:** World Resources Institute(WRI)
**確認日:** 2026-08-10
**確認先:** https://www.wri.org/aqueduct/faq 、`docs/data/aqueduct-water-stress-notes.md`

**ライセンス種別:** Creative Commons Attribution 4.0 International(CC BY 4.0)。従来「Creative Commonsとのみ表記、版不明」としていたが確定した。

> "Aqueduct's data, products, and methodologies are all available for use under the Creative Commons Attribution International 4.0 License."

**商用利用:** **許可される。**

**再配布・改変:** CC BY 4.0の一般要件どおり、帰属表示と変更点の明示があれば許可される。著作権はWRIに留まり、他組織へ譲渡されない。

**帰属表示:** 必須。WRI公式FAQが示す書式:

> "Source: WRI Aqueduct, accessed on [insert date]"

可能な場合は aqueduct.wri.org へのリンクを付す。

**PRISMへの含意:** 契約・個別許諾は不要。`lib/demo/company.ts`の`licenseMode: "reference_only"`はこのまま継続してよい。Baseline Water Stressのカテゴリ区分・boolean化閾値の詳細は`docs/data/aqueduct-water-stress-notes.md`に記録済み。**帰属表示は2026-08-10に実装済み**(`app/components/attribution.tsx`の`DataSourceAttribution`、`app/sites/page.tsx`・`app/assessment/page.tsx`に表示)。

---

## World Bank(World Development Indicators)

**運営元:** World Bank
**確認日:** 2026-08-10
**確認先:** https://datacatalog.worldbank.org/public-licenses 、https://datacatalog.worldbank.org/search/dataset/0037712 (World Development Indicators)、https://data.worldbank.org/indicator/PA.NUS.PPP

**対象:** `docs/data/calibration-parameters-v1.md` で使用した3指標(`PA.NUS.PPP`(PPP換算係数)/ `NY.GNP.PCAP.PP.CD`(GNI per capita PPP)/ `NY.GDP.DEFL.ZS`(GDPデフレータ))。いずれも World Development Indicators(WDI)に属する。

**ライセンス種別:** CC BY 4.0(Creative Commons Attribution 4.0 International)

> "CC-BY 4.0, with the additional terms below, is the default license for all Datasets produced by the World Bank itself"

World Development Indicators データセット自体のページにも明記:

> "This dataset is licensed under Creative Commons Attribution 4.0"

**商用利用:** **許可される。**

> "allows users to copy, modify and distribute data in any format for any purpose, including commercial use"

**帰属表示:** 必須。ページ上には固定の文言テンプレートは示されておらず、要件は以下のみ:

> "Users are only obligated to give appropriate credit (attribution) and indicate if they have made any changes"

CC BY 4.0の一般要件に従い、以下の書式で表示する:

> Data source: World Bank, World Development Indicators. License: CC BY-4.0 (https://creativecommons.org/licenses/by/4.0/). Indicators used: PA.NUS.PPP, NY.GNP.PCAP.PP.CD, NY.GDP.DEFL.ZS.

**再配布:** 制限なし(改変・再配布ともに許可、商用含む)。

**PRISMへの含意:** WDPA・IFVIと異なり契約・個別許諾は不要。`docs/data/calibration-parameters-v1.md` および地理較正パラメータを参照する画面・ドキュメントに上記の帰属表示を付す。

---

## LIME3(AIST-IDEA、産業技術総合研究所)

**運営元:** 国立研究開発法人 産業技術総合研究所(AIST)安全科学研究部門 IDEAラボ
**確認日:** 2026-08-15
**確認先:** `AIST-IDEA_Ver.4.0_標準版_Excel形式_LIME3_日本語.xlsx`(人間が提供)内のライセンス表示・著作権表示

**ライセンス種別:** AIST独自のライセンス(登録制・有償の「標準版」)。CC等のオープンライセンスではない。

**商用利用:** **アスエネ株式会社が「標準版」ユーザーライセンスを既に保有しているため、契約上は利用可能。** ライセンス有効期限は **2027-06-30**(更新確認が必要)。

**再配布:** 「公表を含め、当データベースの一部もしくは全部を複製して第三者に提供すること」は著作権侵害にあたると明記されている。**社内での利用・製品への係数組み込みは可能だが、データベース自体(元ファイルや抽出データ)を第三者に配布・公開してはならない。**

**帰属表示:** ファイル内に定型の帰属表示文言の指定は無し。他データと同様、出典(AIST-IDEA、版番号)を明記する運用が無難。

**保証・責任の否認:** AISTは数値の正確性・妥当性についていかなる保証もしない(免責事項に明記)。

**PRISMへの含意:** `docs/data/lime3-coefficients-notes.md`にて水消費(取水)の統合化スコアを抽出し、`packages/core/src/monetization/plugins/lime3-water.ts`の`externalValueFactors["lime3-water"]`に反映済み(2026-08-15)。抽出したCSV(`docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv`)は係数データのみで、ライセンス担当者名等の個人情報は含まない。**リポジトリの公開範囲(社外公開の有無)には注意すること。**

---

## 次のアクション

**2026-08-02更新:** WDPA・ESVD・CE Delft・IFVIそれぞれの料金体系・条項を調査し、送信可能な問い合わせメール下書きを`docs/business/outreach-action-plan.md`に用意した。残るのは人間による実際の送信・交渉・契約締結のみ。

| # | 内容 | 優先度 | 状態 |
|---|---|---|---|
| 1 | WDPA:IBAT Alliance経由の商用ライセンス契約交渉。料金体系確認済み(API連携はEnterprise Plus $35,000/年)。メール下書き準備済み | 高 | 人間による送信・交渉待ち |
| ~~2~~ | ~~ENCORE:法務確認、または運営元への直接照会~~ | — | **解消(D-48。そのまま利用、留意事項として記録のみ)** |
| 3 | ESVD:商用利用は「ストラテジックパートナー」化が必要と判明。日本カバレッジは**確認完了**(67件、2026-08-14、`docs/data/acquisition-runbook.md` §3.5a)。商用契約自体は未着手 | 中 | 人間による送信・交渉待ち |
| 4 | CE Delft・IFVI:IFVIは方法論PDF自体のContent Termsで商用利用(製品への組込・販売促進)が明確に禁止と確認済み(2026-08-10)。非営利アドバイザリー例外に当たるかの個別照会が必要。CE Delftは条件不透明、書面確認が必要。メール下書き準備済み | 中 | 人間による送信・交渉待ち |
| ~~5~~ | ~~LIME3:商用利用条件の確認~~ | — | **解消(2026-08-15。アスエネ社が既存の標準版ライセンスを保有していることが判明。`docs/data/lime3-coefficients-notes.md`)** |
