# PRISM ドキュメント構成

**PRISM(旧称:候補ε)** — 自然関連情報の財務判断変換レイヤー

---

## 読む順序

初めてこのリポジトリに入る場合(人・AI問わず):

1. `concept-v2.md` — 何を作るのか、なぜ作るのか。**最初にこれを読む**
2. `roadmap/build-plan.md` — 何をどの順で作るか。作業はここから引く
3. `decisions/design-rationale-log.md` — なぜその設計なのか。**実装前に必ず読む**
4. `requirements/` — 着手するモジュールの要件定義

**`design-rationale-log.md` を飛ばして実装に入らないこと。** 構想書には「何を作るか」しか書かれておらず、「なぜ別の案を採らなかったか」はこちらにしかない。合理的に見える最適化で設計が壊れる箇所が複数ある。

---

## ディレクトリ

```
docs/
  README.md                      本ファイル
  concept-v2.md                  構想書v2。設計の最上位文書
  demo-guide.md                  ダミーデータでのローカルデモ手順書(セットアップ〜画面の見どころ)
  data-intake-guide.md           実データ受け入れガイド(3ファイルの記入方法・記入者・投入方法)

  requirements/                  モジュール単位の要件定義
    m1-target-definition.md          済(対象定義とLocate)
    m2-assessment-execution.md       済(評価実行)
    m3-monetization-engine.md        済(貨幣化エンジン)
    m4-divergence-decomposition.md   済(乖離分解)
    m5-financial-bridge.md           済(財務接続)
    m6-decision-record.md            済(対策評価と意思決定注入)
    m7-disclosure-verification.md    済(開示生成と整合検証)
    m8-ledger-versioning.md          済(記録・版管理基盤)
    mvp-completion-gap.md            MVP完成までのギャップ(実装済みコードの監査結果とGAP-01〜21)

  decisions/                     設計判断の記録
    design-rationale-log.md          判断の経緯(実装前に必読)
    0001-mvp-pilot-category-scope.md            MVP実データ検証の対象カテゴリ
    0002-phase0-continuation-gate.md            フェーズ0末の継続判定(条件2〜4は未完了)
    0003-data-model-review-gate.md               データモデルレビュー(条件付き通過、6件修正済み)

  roadmap/
    build-plan.md                  フェーズ0からMVP完成までの作業指示

  data/                          外部データの調査結果(フェーズ0の成果物)
    aop-mapping-v1.md                初版済 — AoP正規化対応表(IFVI/LIME3確認済、CE Delft未着手)
    method-recalculability.md        初版済 — 手法別の再計算可能性
    cices-v51-notes.md               部分済 — CICES階層構造(5階層・コード体系を確認。Abiotic拡張は未確認。V5.2の存在を発見)
    licensing.md                     初版済 — ライセンス条件(WDPA/ENCORE/ESVD/CE Delft/IFVIの料金・条項を確認済み、契約締結は未)
    calibration-parameters-v1.md     初版済 — 地理較正パラメータの実値と出典(World Bank PPP/所得/デフレータ、η、相対価格上昇率)
    carbon-price-scenarios.md        初版済 — NGFS(未取得)・GX-ETS(二次資料一致)の確認状況
    acquisition-runbook.md           初版済 — コード実装以外に必要なものの一覧と取得手順書

  business/                      事業側の資料
    board-proposal.md                経営会議提案資料
    outreach-action-plan.md          LOI獲得・ライセンス確認の実行計画(問い合わせメール下書き等)

  background/                    参考資料。設計の直接の根拠ではない
    concept-v1.md                    構想書v1。v2で覆った判断の経緯確認用
    regulatory-market-landscape.md   環境規制・市場動向調査
    product-building-guidelines.md   プロダクト構築指針
```

---

## 各文書の位置づけ

| 文書 | 権威性 | 更新頻度 |
|---|---|---|
| `concept-v2.md` | **最上位。**他文書と矛盾したらこちらが正 | 低。変更時は版を切る |
| `requirements/*.md` | 構想書を実装粒度に落としたもの | 中 |
| `decisions/design-rationale-log.md` | 判断の記録。仕様そのものではない | 判断が発生するたび追記 |
| `roadmap/build-plan.md` | 作業指示。仕様ではない | 高 |
| `data/*.md` | フェーズ0の調査結果。事実の記録 | 調査のたび |
| `background/*.md` | 参考。**設計判断の根拠として引用しない** | 更新しない |

**`background/concept-v1.md` について:** v2 で覆された判断(中立性をmoatとする、M8を製品本体とする等)が含まれる。**現行仕様として読まないこと。** v2 の判断がなぜそうなったかを追う目的でのみ参照する。

---

## 運用ルール

- PR の description に、対応する要件定義 / ADR のパスを明記する
- `build-plan.md` の [GATE] の判定結果は、通過・不通過にかかわらず `decisions/` にADRとして残す
- 判断を伴う対応付け(AoPマッピング等)は、根拠を書かずにコミットしない
- 設計変更時は、変更前の判断がどの前提に基づいていたかを追えるようにする

---

## 現在地

- フェーズ0(検証)進行中。AoP正規化対応表・手法別再計算可能性・ライセンス条件(WDPA/ENCORE/ESVD/CE Delft/IFVIの料金・条項確認)は初版完了
- **[GATE] フェーズ0末の継続判定(ADR-0002)を実施。乖離分解の技術検証(文書レベル)は通過。支払意思検証(C-1)はユーザー判断により充足扱い。LOI獲得(0件)・主要係数の商用契約締結は未完了だが、実行計画(ターゲット企業リスト・問い合わせメール下書き等)は`docs/business/outreach-action-plan.md`に準備済みで、残るは人間による送信・交渉のみ(design-rationale-log D-72)。**
- **[P1] データモデル確定が完了。** `packages/core/src/types/`にM1〜M8の型定義を実装済み(共通の branded type による価値概念ガード込み)。`tsc --noEmit`・ESLintとも通過、型ガードが実際にコンパイルエラーを起こすことも検証済み
- **[GATE] データモデルレビューを実施(ADR-0003)。条件付き通過。** 構想書との突き合わせで6件の齟齬(地理較正の計算式に1項目欠落、`DisclosureView`型の完全な欠如等)を発見し、すべて修正済み
- **実装順序を見直し、M3→M4→M6→M1→M2→M5→M7→M8に変更(design-rationale-log D-76)。** 当初のM1先頭という順序は型定義の作り直し回避が理由だったが、データモデルレビュー通過により解消
- **[P2] M3(貨幣化エンジン)の実装が完了。** `packages/core/src/monetization/`(地理較正・適合度ティア・モンテカルロ不確実性合成・代替費用法/LIME3/IFVIの3プラグイン・集計整合性検証・統合パイプライン)。テストランナー(vitest)を新規導入し、35件のテストすべて通過、`tsc --noEmit`・ESLintも通過(design-rationale-log D-77〜D-82)
- **[P2] M4(乖離分解)の実装が完了。** `packages/core/src/divergence/`(価値概念分割・F-0〜F-3/F-8のペア単位事前条件チェック・F-4/F-5の要因別再計算可能性判定・対数空間Shapley分解エンジン・F-9表示規則とテンプレート読み下し文・トップレベル組み立て関数)。実装検討の結果、「差し替えて再計算する」を実式として持てるのは地理較正のみと判明し(design-rationale-log D-83)、M3の水パイロット実データで要件定義書§7.3.1の「乖離の100%が残差になる」ケースを再現するテストを追加した。テスト44件追加すべて通過
- **[P2] M6(対策評価と意思決定注入)の実装が完了。** `packages/core/src/decision/`(自然調整後NPVの中心値+レンジ算出・深掘り推奨の特定・拘束方式の出力整形と変更履歴・判定カウント判定・トップレベル組み立て関数)。実装検討の結果、M6 D-3が前提とする「M3のトルネード図」がM3実装に存在しないことが判明し、`ValuationRecord`に`parameterUncertainty`フィールドを追加した上で、トルネード図自体(層i・層iiの要因ランキング)は本来の持ち場であるM3に`monetization/tornado.ts`として実装し、M6側はそれを消費するだけの薄い実装に修正した(初回実装ではM6側に直接ロジックを書いてしまい、レビュー指摘により訂正。design-rationale-log D-86〜D-88)。M3の実データ(代替費用法・VFaccess)でpending/crosses/does_not_crossの3ケースを検証するテストを追加した。テスト32件追加すべて通過
- **[P2] M1(対象定義とLocate)の実装が完了。** `packages/core/src/site/`(座標解決・拠点データ取込・Locate(注入可能なレイヤ照会)・TNFD LEAP L3の5基準判定・MaterialIssue組み立て)。実際のジオコーディング・WDPA/IBAT/Aqueduct/ENCORE照会はライセンス契約未締結のため注入可能な関数として外出しし、コアはオーケストレーションのみとした。`NatureInterface.layerType`(5値)と`CriteriaMet`の5基準が1:1に対応しないことが判明し、`resolveCriterion`として対応関係を外出しした上で、データソースが存在しない`rapidIntegrityDecline`は既定でfalseのままとした(design-rationale-log D-89〜D-91)。要件定義書§2の具体例(化学工場・sensitivityScore=3)を通しで再現するテストを追加した。テスト27件追加すべて通過
- **[P2] M2(評価実行・深度可変)の実装が完了。** `packages/core/src/assessment/`(汎用パーセンタイル順位・開示必須性対応表・優先度算定(PriorityScore)・深掘り昇格判定(DepthDecision))。優先度算定の4項目はすべてM1・M3の既存出力の再利用で構成し、新しい財務データソースも独自の重み付けも追加していない。要件定義書§2.2の数値例のうち、タイを含む列(開示必須性)の記載値が標準的なパーセンタイル順位の計算と整合しないことが判明し、標準的な定義(タイは平均順位)を採用した上で不整合をdesign-rationale-logに記録した(D-92)。要件定義書の結論(「最上位の1件のみ深掘りに昇格する」)はM1・M3の実データで再現するテストで別途確認済み。テスト17件追加すべて通過
- **[P2] M5(財務接続)の実装が完了。** `packages/core/src/financial-bridge/`(非GAAPラベル共通ヘルパー・ブリッジ1(自然調整後利益)・ブリッジ2(社会的費用ビュー)・未内部化コスト/内部化率・自然債務・比較先)。2つのブリッジは共通の親インターフェースを持たず、合算しようとするとコンパイルエラーになることを型テストで確認した(design-rationale-log D-24の実装確認)。要件定義書D-4が定義する「自然債務」の型が存在しなかったため`NatureDebt`を追加し、算出式が炭素価格の実軌道(未確認・推定禁止)を直接使わない設計であることを確認した上で実装した(D-93〜D-94)。格付・資本コストの定性記述はAIを使わず固定テンプレート+機械的な数値埋め込みで構成。テスト19件追加すべて通過
- **[P2] M7(開示生成と整合検証)の実装が完了。** `packages/core/src/disclosure/`(EvidenceCandidate射影型・G1〜G4の優先順位判定・推奨アクション3種の組み立て・意図的判断記録)。build-planの最重要制約(段階3・4にLLMを使わない)に従い、PDF抽出・主張分類(段階1・2、AI使用)はスコープ外とし、構造化済みDisclosureClaim[]を入力とするルールベース判定(段階3・4)のみを実装した。段階3の照合対象(MaterialIssue・ValuationRecord)に「対象期間」「対象範囲」に相当するフィールドが存在しないことが判明し、M1・M3の型を変更せず呼び出し側が構築するM7専用の射影型で解決した(D-95)。要件定義書§1の具体例(3拠点中1拠点のみ根拠→G3)をM3の実データも交えて再現するテストを追加した。テスト21件追加すべて通過
- **[P2] M8(記録・版管理基盤)の実装が完了。build-planの実装順序(M3→M4→M6→M1→M2→M5→M7→M8)がすべて完了。** `packages/core/src/ledger/`(AssumptionEntry組み立て+モジュール別payload導出10種・パイプライン全体のRecalculationHash・版管理レジストリ(追記のみ・旧版保持)・ライセンスゲーティングを考慮した感応度スコア再計算)。「自動生成」の実装範囲を、各モジュールの既存出力からpayloadを導出する関数の提供までとし、M1〜M7ソースへの実配線(M1〜M7を連結するアプリケーション層が今のところ存在しない)は今回のスコープ外とした(D-96)。`VersionedParameterSet`はパラメータ値そのものではなく版のメタデータ台帳として実装し、旧版係数での再計算はM3の既存計算関数にそのまま値を渡せば実現できることを実証した(D-97)。テスト36件追加(リポジトリ全体で232件)すべて通過、`tsc --noEmit`・ESLintも通過
- **全モジュール横断レビューを実施。** 4組(各2モジュール)の並列レビューで要件充足度・コード品質・可読性を確認し、8件の実修正を行った(M7のG1〜G4判定バグ(高深刻度)、M2/M4/M5の未検証エッジケース、M8のハッシュ強度・型の緩さ、M1の未使用フィールド等)。詳細はdesign-rationale-log D-98〜D-99
- **[P3の一部]統合パイプライン層の実装が完了。** `packages/core/src/pipeline/`(M1→M2の評価パイプライン・M3深掘り→M4の貨幣化パイプライン・M6の意思決定パイプライン・M7の開示検証パイプライン)。M8実装時に積み残していたAssumptionEntryの実配線(D-96)を、各モジュールの関数を変更せず不変な後処理として実装した(D-100〜D-101)。架空だが現実的な1社分のデータでM1→M8を通しで検証する統合テストを追加し、build-plan §7.1のGATEの技術的な前提を満たした。テスト11件追加(リポジトリ全体で251件)すべて通過、`tsc --noEmit`・ESLintも通過
- **[P3]統合・横断機能が完了。ダミーデータによるbuild-plan §7.1 GATEの技術検証も実施。** 架空企業「東海化成株式会社(架空)」1社分のダミーデータ(`lib/demo/`)を作成し、M1→M8を通しで検証するGATE検証テスト・最小限のUIシェル(`/`・`/sites`・`/assessment`・`/valuation`・`/decision`・`/disclosure`・`/ledger`)・出力API(`/api/pipeline-result`)・IBM Plex Monoによる数値表示の統一を実装した。認証・テナント分離はDB・実デプロイが存在しない現段階では実装対象がないと判断し、ユーザー確認の上で見送った(design-rationale-log D-102)。M3のモンテカルロ乱数はデモ層限定でシード固定にし(packages/core自体は変更しない、D-103)、ページ間で一貫した数値を表示できるようにした。build-plan §10のX1〜X7ガード+実装で起きやすい違反4点を監査し、違反は発見されなかった(D-104)。実データそのものの投入・パイロットは引き続きデザインパートナーとの調整が必要
- **ローカルデモ手順書(`demo-guide.md`)を作成。** セットアップ・自動テスト・UI各画面の見どころ・出力APIの確認方法・ダミーデータの注意事項をまとめた。デザインパートナー候補への説明・社内共有に使う想定
- **実データ受け入れテンプレートを実装。** `lib/intake/`(引用符対応の最小限CSVパーサ・拠点一覧CSVテンプレート・NatureInterface調査結果CSVテンプレート・エンゲージメント設定JSONテンプレート・統合ローダー)。実データが「①顧客提供・②PRISM運用チーム調査・③顧客財務部門」という由来の異なる3種のデータの合流であることを整理し、ファイルを分けた(design-rationale-log D-105)。M1実装時に「スコープ外」としていたCSV文字列パースを、実データ投入という別の関心事のために`lib/intake/`限定で追加した(D-106)。`lib/intake/templates/`の記入例が実際にM1〜M7を通しで実行できることをテストで検証済み。`docs/data-intake-guide.md`に非エンジニア向けの記入ガイドを作成した。テスト31件追加(リポジトリ全体で289件)すべて通過、`tsc --noEmit`・ESLintも通過
- 次は実データでの[GATE]検証・パイロット(build-plan §7、デザインパートナーとの調整が必要)。並行して現在の実装(ダミーデータ上で動く一連の機能)をブラッシュアップしていくフェーズ

次にやることは `roadmap/build-plan.md` §12 のチェックリストを参照。
