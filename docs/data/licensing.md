# ライセンス条件

**目的:** build-plan §3.4が定めるフェーズ0のライセンス確認作業の成果物。外部データ・係数の商用利用条件を、確認日・確認先・原文該当箇所とともに記録する。
**最終更新:** 2026-08-02
**確認済み:** WDPA、ENCORE
**未確認:** ESVD日本カバレッジ・再配布条件の詳細確認(`method-recalculability.md`・`aop-mapping-v1.md`で言及済み、本ファイルへの正式な転記は未)、CE Delft、IFVI(方法論文書自体は`aop-mapping-v1.md`で確認済みだが、係数利用条件そのものの確認は別途必要)

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

---

## 次のアクション

**2026-08-02更新:** WDPA・ESVD・CE Delft・IFVIそれぞれの料金体系・条項を調査し、送信可能な問い合わせメール下書きを`docs/business/outreach-action-plan.md`に用意した。残るのは人間による実際の送信・交渉・契約締結のみ。

| # | 内容 | 優先度 | 状態 |
|---|---|---|---|
| 1 | WDPA:IBAT Alliance経由の商用ライセンス契約交渉。料金体系確認済み(API連携はEnterprise Plus $35,000/年)。メール下書き準備済み | 高 | 人間による送信・交渉待ち |
| ~~2~~ | ~~ENCORE:法務確認、または運営元への直接照会~~ | — | **解消(D-48。そのまま利用、留意事項として記録のみ)** |
| 3 | ESVD:商用利用は「ストラテジックパートナー」化が必要と判明。日本カバレッジは未確認(データベース直接検索が必要)。メール下書き準備済み | 中 | 人間による送信・交渉待ち |
| 4 | CE Delft・IFVI:IFVIは有償ライセンス必須と条項が明確(優先的に連絡すべき)。CE Delftは条件不透明、書面確認が必要。メール下書き準備済み | 中 | 人間による送信・交渉待ち |
