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

  requirements/                  モジュール単位の要件定義
    m1-target-definition.md          済(対象定義とLocate)
    m2-assessment-execution.md       済(評価実行)
    m3-monetization-engine.md        済(貨幣化エンジン)
    m4-divergence-decomposition.md   済(乖離分解)
    m5-financial-bridge.md           済(財務接続)
    m6-decision-record.md            済(対策評価と意思決定注入)
    m7-disclosure-verification.md    済(開示生成と整合検証)
    m8-ledger-versioning.md          済(記録・版管理基盤)

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
    cices-v51-notes.md               未 — CICES階層構造
    licensing.md                     初版済 — ライセンス条件(WDPA/ENCORE/ESVD/CE Delft/IFVIの料金・条項を確認済み、契約締結は未)

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
- **[P2] M6(対策評価と意思決定注入)の実装が完了。** `packages/core/src/decision/`(自然調整後NPVの中心値+レンジ算出・深掘り推奨の特定・拘束方式の出力整形と変更履歴・判定カウント判定・トップレベル組み立て関数)。実装検討の結果、M6 D-3が前提とする「M3のトルネード図」がM3実装に存在しないことが判明し、`ValuationRecord`に`parameterUncertainty`フィールドを追加して代替した(design-rationale-log D-86〜D-88)。M3の実データ(代替費用法・VFaccess)でpending/crosses/does_not_crossの3ケースを検証するテストを追加した。テスト29件追加(リポジトリ全体で108件)すべて通過、`tsc --noEmit`・ESLintも通過
- 次はM1(対象定義とLocate)の実装

次にやることは `roadmap/build-plan.md` §12 のチェックリストを参照。
