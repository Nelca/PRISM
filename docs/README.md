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
    m4-divergence-decomposition.md   済(乖離分解)
    m1-target-definition.md          未
    m2-assessment-execution.md       未
    m3-monetization-engine.md        未
    m5-financial-bridge.md           未
    m6-decision-record.md            未
    m7-disclosure-verification.md    未
    m8-ledger-versioning.md          未

  decisions/                     設計判断の記録
    design-rationale-log.md          判断の経緯(実装前に必読)
    0001-....md                      個別ADR(今後追加)

  roadmap/
    build-plan.md                  フェーズ0からMVP完成までの作業指示

  data/                          外部データの調査結果(フェーズ0の成果物)
    aop-mapping-v1.md                未 — AoP正規化対応表
    method-recalculability.md        未 — 手法別の再計算可能性
    cices-v51-notes.md               未 — CICES階層構造
    licensing.md                     未 — ライセンス条件

  business/                      事業側の資料
    (経営会議提案資料をここに置く)

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

- フェーズ0(検証)未着手
- 実装未着手
- 要件定義は M4 のみ完了

次にやることは `roadmap/build-plan.md` §12 のチェックリストを参照。
