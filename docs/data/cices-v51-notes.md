# CICES V5.1 階層構造・コード体系

**目的:** build-plan §3.5(フェーズ0 [PARALLEL])の成果物。M4 §6.3「CICESの一致階層」の実装前提を一次資料で確認する。
**参照元:** `docs/roadmap/build-plan.md` §3.5、`docs/requirements/m4-divergence-decomposition.md` §6.3
**取得日:** 2026-08-08
**status:** **部分確認。**階層構造とコード体系の骨格は確認済み。Abiotic拡張のコード体系と水の所属コードは**未確認**。

---

## 0. 判定サマリ

| 確認事項 | 結果 | 確度 |
|---|---|---|
| 階層は5層で Section > Division > Group > Class > Class type か | **その通り** | 高 |
| コードが階層を数字で連結した形式か(前方一致で上位階層を切り出せるか) | **その通り** | 高 |
| Group階層での一致判定が実用的か(M4 §6.3の当初設定) | **成立する** | 中〜高 |
| Abiotic拡張のSection番号と水の所属コード | **未確認** | — |
| V5.1が最新版か | **否。V5.2が2025年4月に公開済み**(§4) | 高 |

**M4 §6.3への含意:** 「データを最も細かい階層で保持し、一致階層を実行時パラメータとする限り、データ移行なしで後から変更できる」という M4 の設計前提は、コード体系が階層連結である以上**成立する**。実装が既定値として使っている `m4_cicesMatchLevel: "group"` は、根拠のないまま先行していた状態から、根拠のある設定に昇格した。

---

## 1. 階層構造(確度:高)

> 出典: https://cices.eu/cices-structure/ (2026-08-08取得)

CICESは**5階層**の厳密な階層構造を持つ。

```
Section > Division > Group > Class > Class type
```

生物的(biotic)構成要素については**3つのSection**が区別される。

| Section | 名称 |
|---|---|
| 1 | Provisioning(供給) |
| 2 | Regulation & Maintenance(調整・維持) |
| 3 | Cultural(文化的) |

※ Section番号 1/2/3 の割り当ては、§2のコード例(Provisioning系のGroupが `1.1.1.X`)から導出した。ガイダンス文書原文での明示的な確認は取れていない(確度:中)。

**公式の例(穀物):**

| 階層 | 値 |
|---|---|
| Section | Provisioning |
| Division | Biomass |
| Group | Cultivated terrestrial plants for nutrition, materials or energy |
| Class | 栽培食用陸生植物 |
| Class type | 穀類 |

階層構造は排他的ではなく、新しい応用の出現に応じて項目を追加できるよう設計されている(原文記述)。

---

## 2. コード体系(確度:中〜高)

> 出典: CICES V5.1 Guidance(https://cices.eu/content/uploads/sites/8/2018/01/Guidance-V51-01012018.pdf)の内容を参照する二次的記述、および cices.eu

コードは**階層を数字で連結する形式**で、第1桁がSection、以降が Division / Group / Class / Class type に対応する。

**確認できた原文由来の例:**

```
1.1.1.X    Group「Cultivated terrestrial plants for nutrition, materials or energy」
           第1桁の 1 = Section レベル。X は「Class レベルでは割り当てなし」を示す

4.1.[1,2].1  水の例。表流水/地下水の区別が不要な場合、Group 水準で報告し
             このように符号化する
```

**M4実装への含意:** M4 §6.3が想定した文字列切り出し

```
"2.2.5.1" → Group一致判定なら "2.2.5" で切る
          → Division一致判定なら "2.2"
```

は、コードが階層連結である以上**そのまま成立する。**ただし上記の `1.1.1.X` の例が示すとおり、**下位階層が「割り当てなし」を意味する `X` を含みうる。**M4 §6.3の制約1(出典側の粒度が粗い場合)が想定した `specifiedLevel` フィールドは、この `X` 表記に対応するために必要であり、設計は妥当だった。

**実装時の注意:** コード文字列を数値としてパースしない(`X` を含みうるため)。`.` 区切りの文字列配列として扱い、`specifiedLevel` までの要素のみを比較する。

---

## 3. 未確認事項(取得失敗の記録)

| # | 内容 | 取得を試みた方法 | 失敗理由 |
|---|---|---|---|
| U-1 | Abiotic(非生物)拡張のSection番号と、biotic側との区別規則 | cices.eu ガイダンスPDF・cices-structure ページ・SEEA配布版PDF・BASINドキュメント | PDFのテキスト抽出に失敗(圧縮ストリームのまま)。HTMLページには記載なし |
| U-2 | 水(water)が属するSection/Division/Group のコードと名称の一覧 | 同上 | 同上。`4.1.[1,2].1` という例のみ二次的に確認 |
| U-3 | 公式スプレッドシートの列構成と全Class一覧 | `https://cices.eu/content/uploads/sites/8/2018/03/Finalised-V5.1_18032018.xlsx` | xlsxバイナリのため取得ツールで解析不可 |

**U-1〜U-3の取得手順は `docs/data/acquisition-runbook.md` §3.1 に記載。**

**推定で埋めない(D-15):** MVPの水パイロットで実際にCICESコードを付与する対象は、ESVDに由来するVFes(生態系サービス毀損)のみである。そのコード値は**ESVD側のレコードが持つCICES参照をそのまま転記する**のであって、PRISM側が階層表から探して割り当てるものではない。したがってU-1〜U-3が未確認のままでも、MVPの実装は「ESVDの記載をそのまま保持し、一致判定は前方一致で行う」という形で成立する。**PRISM側で独自にコードを割り当てる必要が生じた時点で、U-1〜U-3の確認を必須とする。**

---

## 4. 版に関する発見(新規・要判断)

**CICES V5.2 が 2025年4月29日に公開されている。**

| ファイル | URL |
|---|---|
| V5.2 スプレッドシート(最終版) | `https://cices.eu/content/uploads/sites/8/2025/04/CICES_V5.2_29042025_Final.xlsx` |
| V5.2 ガイダンス | `https://cices.eu/content/uploads/sites/8/2025/04/CICES-V5.2_Guidance_final-_-29042025.pdf` |
| V5.1 スプレッドシート | `https://cices.eu/content/uploads/sites/8/2018/03/Finalised-V5.1_18032018.xlsx` |
| V5.1 ガイダンス | `https://cices.eu/content/uploads/sites/8/2018/01/Guidance-V51-01012018.pdf` |

**含意:** リポジトリの実装・要件定義はすべてV5.1を前提にしている(`m4_cicesMatchLevel`・M4 §6.3・M3 §3.1の `cicesRef`)。V5.2でコード体系または階層が変更されている場合、**M4 §6.3の制約2(一致階層を変えると再グループ化の結果が変わり、再計算ハッシュと期間比較の一貫性に影響する)がそのまま当てはまる。**

**判断が必要:** V5.1のまま進めるか、V5.2に追随するか。追随する場合は `VersionedParameterSet`(setId: "cices-version")として版を切り、`changeReason` を記録する(M8 D-3)。**V5.1とV5.2の差分を確認するまで、この判断は行わない。**

---

## 5. 出典一覧

- Structure of CICES — https://cices.eu/cices-structure/ (2026-08-08取得)
- CICES 公式トップ(V5.2配布) — https://cices.eu/ (2026-08-08取得)
- CICES V5.1 Guidance — https://cices.eu/content/uploads/sites/8/2018/01/Guidance-V51-01012018.pdf (取得したがテキスト抽出不可)
- SEEA配布のV5.1ガイダンス — https://seea.un.org/sites/seea.un.org/files/lg23_cices_v5.1_final_revised_guidance_03-10-2017.pdf (接続失敗)
