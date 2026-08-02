# M1:対象定義とLocate — 要件定義

**対象モジュール:** M1(対象定義とLocate)
**参照元:** `docs/concept-v2.md` 9.1 / 9.2、`docs/roadmap/build-plan.md` §5.1
**status:** 確定(D-1〜D-4ですべての論点が決定済み)
**最終更新:** 2026-08-02

---

## 0. 位置づけ

薄く実装。既存プレイヤー(Natcap、シンク・ネイチャー等)と機能が重複するため、自前構築を最小化する(build-plan §5.1)。

**薄くしてよい:** UI、レイヤ数、ジオコーディング精度
**薄くしてはいけない:** MaterialIssueが課金・監査・開示の共通単位である構造

**MVP範囲:** 拠点・サプライヤーの取込(CSV/スプレッドシート)、空間突合(Locate:拠点座標×保護区・生態系レイヤ)、感応度スコアの算出。

**完了条件:** 拠点CSVを投入するとMaterialIssue群が生成され、各々に感応度スコアが付く。

---

## 1. 決定事項 D-1:Site / NatureInterface / MaterialIssueの粒度と関係

構想書9.1の定義をそのまま型に落とす。

```typescript
interface Site {
  id: string;
  name: string;
  siteType: "own_site" | "supplier_site";
  location:
    | { kind: "coordinates"; lat: number; lng: number }
    | { kind: "address"; address: string; geocoded: boolean };  // §3参照
  industrySector: string;   // 業種。依存・影響ドライバーの参照キーになる
}

interface NatureInterface {
  id: string;
  siteId: string;
  layerType: "protected_area" | "kba" | "water_stress" | "ecosystem_integrity" | "dependency_impact";
  rawResult: boolean | number;   // レイヤの生の結果(重み付け前)。例:保護区重複=true/false、STARスコア=数値
  dataSource: string;            // WDPA / IBAT / Aqueduct / ENCORE 等
  licenseMode: "embedded" | "reference_only" | "bring_your_own_license" | "pending_review";  // §4参照
}

interface MaterialIssue {
  id: string;
  siteId: string;
  impactCategory: ImpactCategory;         // M2のカテゴリ(気候・水・汚染)
  sensitivityScore: number;               // 0〜5。§2参照
  criteriaMet: {                          // TNFD LEAP L3の5基準。個別に保持し、スコアはこの数の合計
    highEcosystemIntegrity: boolean;
    rapidIntegrityDecline: boolean;
    highBiodiversityImportance: boolean;  // KBA・保護区・STARベース
    waterStress: boolean;
    likelySignificantDependencyImpact: boolean;  // ENCORE(業種別依存・影響レーティング)を判定に使う。§4のD-4参照
  };
  excluded: boolean;
  exclusionReason?: string;               // 除外した場合は必須(M2の除外理由記録と同じ原則)
}
```

**関係:** 1つのSiteは複数のNatureInterface(レイヤごとに1件)を持つ。NatureInterfaceの結果を集約したものがMaterialIssue(拠点×影響カテゴリの組)であり、これが課金・監査・開示の共通単位になる(構想書9.1)。

---

## 2. 決定事項 D-2:感応度スコアはTNFD LEAP L3の5基準の充足数(0〜5)とする。独自の加重合成式は作らない

### 調査結果

TNFD LEAP・WWF Biodiversity Risk Filter・ENCORE・IBAT・PBAFのいずれも、複数の空間データレイヤ(保護区・KBA・生物多様性・水ストレス等)を1つの加重スコアに統合する業界標準の計算式は持っていない。

> 出典: TNFD "Additional Guidance – LEAP (L3)" (2023年3月, tnfd.global)、WWF Biodiversity Risk Filter Interpretation Guidance (2023年5月)、encorenature.org materiality page、ibat-alliance.org

存在するパターンは2つのみ:
1. **OR論理/閾値スクリーニング**(TNFD LEAP、IBAT):いずれか1つの基準を満たせば「優先地点」と判定する二値的な仕組み
2. **指標ごとの(依存度×地点の状態)の掛け合わせ、指標間は合成しない**(WWF BRF、ENCORE):単一の統合スコアを作らず、内訳を並べて利用者の解釈に委ねる

**「業界に確立された加重スコアは存在しない」という結論自体は、M3の適合度ティア調査(design-rationale-log D-26)と同型の発見である。**

### 採用する設計

独自の加重式を発明せず、**TNFD LEAP L3が公式に定義する5基準**(生態系の完全性が高い/急速に劣化している/生物多様性の重要性が高い(KBA・保護区・STARベース)/水ストレスが高い/依存・影響が大きい可能性がある)のうち、**満たした基準の数(0〜5の整数)を感応度スコアとする。**

```
sensitivityScore = count(criteriaMet のうち true の数)
```

### 理由

1. TNFDは構想書7.1で既にPRISMの分類軸そのものとして採用されている標準設定主体であり、その公式基準をそのまま使うことは、design-rationale-log D-10(独自手法ではなく標準手法の適用として説明する)と同じ監査防御の理屈が使える
2. 加重ではなく「充足数のカウント」であるため、恣意的な重み付けを一切加えていないと説明できる
3. M2の優先度算定式(感応度+財務エクスポージャ+不確実性の大きさ+開示必須性、build-plan §5.5)が数値入力を要求するため、TNFDの二値スクリーニング(OR論理)をそのまま使うのではなく、基準の充足数という数値に変換する必要があった。この変換(カウント)自体はPRISM独自の選択だが、**基になる5基準そのものは独自発明ではない**という点を監査説明で区別する(design-rationale-log D-26「境界の引き方はPRISM独自、誤差幅は実証研究に基づく」と同じ構造の説明)

### 具体例(2026-08-02追記)

ある拠点(化学工場、供給先が水ストレスの高い地域)を評価する場合:

```
highEcosystemIntegrity: false        (対象地域の生態系は既に改変済み)
rapidIntegrityDecline: false
highBiodiversityImportance: true     (KBAから5km圏内)
waterStress: true                    (Aqueduct水ストレス指標で「高」)
likelySignificantDependencyImpact: true  (ENCOREで化学業種×水は「高」評価)

sensitivityScore = count(true) = 3
```

この「3」が、そのままM2の優先度算定式(§2参照)に感応度の値として渡される。

---

## 3. 決定事項 D-3:座標がない拠点は住所ジオコーディングを試み、それでも不能な場合は除外理由を記録して除外する

```
1. 拠点データに座標があれば、そのまま使う
2. 座標がなく住所がある場合、標準的なジオコーディングサービスで座標を推定する
   (精度はMVPでは重視しない。build-plan §5.1「薄くしてよい」に明記済み)
3. 住所もない場合、MaterialIssueを生成せず、excluded=true・exclusionReasonに
   「座標・住所ともに不明」を記録する
```

**理由:** ジオコーディングは「推定で埋めない」原則(design-rationale-log D-15)の対象ではない。これは価値評価上の推定ではなく、既知の住所から座標を導出する標準的技術であり、精度の粗さは除外事項リスト(層iii)と同じ発想で許容範囲として扱ってよい。座標も住所もない場合のみ、除外理由の記録を必須とする(M2の除外理由記録の原則をM1にも一貫して適用)。

---

## 4. 決定事項 D-4:ENCOREはそのまま利用する。内部ロジックの改変は行わず、リスクは留意事項として記録する

### 論点の再整理(CC BY-SA 4.0の条文確認後)

CC BY-SA 4.0のLegal Code(creativecommons.org/licenses/by-sa/4.0/legalcode)とCreative Commons公式ガイダンス(wiki "ShareAlike interpretation")を確認した結果、当初の懸念は過大であったことが判明した。

**継承条項(Section 3(b))が発動するのは「Adapted Material(改変物)を公衆にShare(頒布)した場合」のみ。**

> "Share means to provide material to the public..."(Section 1)

社内での計算利用だけでは"Share"に該当しない。また、**発動した場合でも影響が及ぶのは改変物の該当部分のみであり、プロダクト全体・ソースコード全体には及ばない**(Adapter's Licenseは「改変物への貢献分」に適用されるという定義、Section 1)。加えて、**CC BY-SAには非営利限定(NC)の要素がなく、有償提供そのものは一切制限されない。**

残る唯一の真の論点は「ENCOREのレーティングを他のデータと合成してスコアを出すことが、著作権法上の"改変(adaptation)"に該当するか、それとも単なる"併存(mere aggregation)"か」であり、これはCC自身のガイダンスも「通常の著作権法の判断に委ねる」としており、断定できない。

### 採用する対応

**ENCOREをそのまま利用し、TNFD基準5(依存・影響)の判定ロジックのために、内部設計を大きく変更しない。**

**理由(ユーザー判断):**
- 上記のリスクは外部から検知されにくく、仮に指摘が入った場合も、その時点で対処(帰属表示の追加、出力表現の調整、ENCORE運営元との協議等)すれば大きな問題にならないと判断した
- 継承条項が発動しても影響範囲はENCORE由来の特定コンポーネントに限定され(§4冒頭の再整理を参照)、事業モデル全体への影響は限定的である

**ただし以下は最低限のコンプライアンス事項として実装する(コストが低いため):**
- ENCOREの帰属表示(attribution)は、継承条項の発動有無にかかわらずCC BY-SA 4.0が無条件に要求する義務であり、ENCOREデータを参照する画面・ドキュメントに規定の表記(`docs/data/licensing.md`記載の書式)を含める

### 留意事項として記録する内容(将来の参照用)

1. **「単なる併存」か「改変」かの境界は、CCの公式ガイダンスでも断定されておらず、最終的な安全性は個別の著作権法判断に依存する。** 指摘を受けた場合の一次対応窓口・エスカレーション先を、パイロット開始前までに社内で明確にしておくことを推奨する
2. **万一の対処オプション:** (a) ENCORE由来の該当コンポーネントの表現をより多くのデータと混ぜ合わせ、識別困難にする、(b) 該当コンポーネントのみをCC BY-SAで公開する、(c) ENCORE運営元(Global Canopy等)に直接使用方法を照会し書面での見解を得る、(d) 代替データソースへの切替。**これらは事後対応の選択肢として保持し、今は実施しない**
3. 本項目はM1のみならず、将来ENCOREデータを参照しうる他モジュール(M2の優先度算定、M7の開示生成等)にも共通する留意事項である

---

## 5. ライセンス調査結果(licensing.mdへの反映)

今回の調査でWDPA・ENCOREの一次資料を確認した。詳細は`docs/data/licensing.md`に記録する。

**WDPA:** 商用利用にはUNEP-WCMCまたはIBAT Allianceとの有償契約が必須(内部分析用途であっても、有償プロダクトの判断材料にする時点で"Commercial Use"に該当するため)。生データの再配布・埋込は契約なしに一切不可。**これはbuild-plan §3.4が既に想定していたライセンス確認作業の一部であり、フェーズ0で契約交渉を進める必要がある(新しい論点ではなくアクションアイテム)。**
