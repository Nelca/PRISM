# CICES V5.1 階層構造・コード体系

**目的:** build-plan §3.5(フェーズ0 [PARALLEL])の成果物。M4 §6.3「CICESの一致階層」の実装前提を一次資料で確認する。
**参照元:** `docs/roadmap/build-plan.md` §3.5、`docs/requirements/m4-divergence-decomposition.md` §6.3
**一次資料:** `docs/data/external/Finalised-V5.1_18032018.xlsx`、`docs/data/external/CICES_V5.2_29042025_Final.xlsx`、`CICES-V5.2_Guidance_final-_-29042025.pdf`
**取得日:** 2026-08-08(Web調査)/ **一次資料での確認日:** 2026-08-10
**status:** **確認完了。**当初「部分確認」としていた未確認事項(U-1〜U-3)はすべて解消した。

---

## 0. 判定サマリ

| 確認事項 | 結果 | 確度 |
|---|---|---|
| 階層の数 | **4層**(Section > Division > Group > Class)。**当初「5層」としていたのは誤り**(§1) | 高(公式スプレッドシート本文) |
| Class type の位置づけ | 階層ではなく、**利用者がClassの下に追加できる任意の細分**(§1) | 高 |
| コードが階層を数字で連結した形式か | **その通り。**`a.b.c.d` = Section.Division.Group.Class(§2) | 高 |
| Group階層での一致判定が実用的か(M4 §6.3の当初設定) | **成立する。**前方3桁で切ればよい | 高 |
| Abiotic拡張のSection番号 | **4/5/6**(§3.1) | 高 |
| 水がどこに属するか | 取水は Section 4「Provisioning (Abiotic)」、水質は Section 2(§3.2) | 高 |
| V5.2 に追随すべきか(E-6) | **追随しないことを推奨。**理由は§4 | — |

**M4 §6.3への含意:** 「データを最も細かい階層で保持し、一致階層を実行時パラメータとする限り、データ移行なしで後から変更できる」という M4 の設計前提は成立する。実装が既定値として使っている `m4_cicesMatchLevel: "group"` は、根拠のないまま先行していた状態から、**一次資料で裏づけられた設定**になった。

---

## 1. 階層構造(確度:高・一次資料)

> 出典: `Finalised-V5.1_18032018.xlsx` シート1(説明)項目1
> "CICES V5.1 retains **four level hierarchical structure** of V4.3, and the facility for users to add class-types below the class level is retained."

```
Section > Division > Group > Class      ← 4層。これが階層
   └ Class type                          ← 階層ではない。利用者が任意に追加できる細分
```

**2026-08-10訂正:** 本書の初版は cices.eu のウェブページの記述をもとに「5階層(Section > Division > Group > Class > Class type)」としていたが、**公式スプレッドシートの本文は明確に「four level」と書いている。**Class type はスプレッドシート上では列として存在するが、それは各Classの例示(例:「Crops by type (e.g. cereals)」)であり、階層の1段ではない。一次資料を正とする。

**実装との整合:** `packages/core/src/types/valuation.ts` の `SpecifiedLevel` は `"section" | "division" | "group" | "class"` の4値で、**もともと4層前提の実装になっていた。**訂正が必要だったのは本書の記述だけで、コードは正しい。

### Sectionの一覧(第1桁)

| コード | Section |
|---|---|
| 1 | Provisioning (Biotic) |
| 2 | Regulation & Maintenance (Biotic) |
| 3 | Cultural (Biotic) |
| 4 | Provisioning (Abiotic) |
| 5 | Regulation & Maintenance (Abiotic) |
| 6 | Cultural (Abiotic) |

生物的/非生物的は**Section名の接尾辞**((Biotic) / (Abiotic))と**第1桁が1〜3か4〜6か**の両方で区別できる。

---

## 2. コード体系(確度:高・一次資料)

```
a . b . c . d
│   │   │   └ Class
│   │   └──── Group
│   └──────── Division
└──────────── Section
```

**M4 §6.3が想定した文字列切り出しはそのまま成立する。**

```
"2.2.5.1" → Group一致判定なら "2.2.5" で切る
          → Division一致判定なら "2.2"
```

**実装時の注意(一次資料で確認):**

- 下位階層が「該当なし/未特定」の場合、**`X` が入る**(例:`4.2.X.X`「Other aqueous ecosystem outputs」)。**コード文字列を数値としてパースしない。**`.` 区切りの文字列として扱う
- スプレッドシートの列構成は `Filter | Section | Division | Group | Class | Code | Class type | V4.3 Equivalent | …`。`Filter` 列は `CICES`(生物的のみ)/`CICES extended`(非生物的を含む)の切り替え用

---

## 3. 水(water)の所在(確度:高・一次資料)

### 3.1 取水は Section 4(Provisioning (Abiotic))

| コード | Division | Group | Class |
|---|---|---|---|
| 4.2.1.1 | Water | Surface water used for nutrition, materials or energy | Surface water for drinking |
| 4.2.1.2 | Water | 同上 | Surface water used as a material (non-drinking) |
| 4.2.1.3 | Water | 同上 | Freshwater surface water used as an energy source |
| 4.2.1.4 | Water | 同上 | Coastal and marine water used as energy source |
| 4.2.2.1 | Water | Ground water for used for nutrition, materials or energy | Ground (and subsurface) water for drinking |
| 4.2.2.2 | Water | 同上 | Ground water used as a material (non-drinking) |
| 4.2.2.3 | Water | 同上 | Ground water used as an energy source |
| 4.2.X.X | Water | Other aqueous ecosystem outputs | Other |

**MVPの水パイロット(取水量)が対応するのは `4.2.1.x` / `4.2.2.x`、Group一致判定では `4.2.1` / `4.2.2`。**

**注記(スプレッドシート説明項目16):** 水を栄養・材料・エネルギー源として使う場合、本来は非生物側だが、**V4.3との一貫性のためCICES本体に残されている。**Section名に `(Abiotic)` の限定子が付くのはこのため。

### 3.2 水質・水量の調整は Section 2(Regulation & Maintenance (Biotic))

| コード | Group | Class |
|---|---|---|
| 2.2.1.3 | Regulation of baseline flows and extreme events | Hydrological cycle and water flow regulation |
| 2.2.5.1 | Water conditions | Regulation of the chemical condition of freshwaters |
| 2.2.5.2 | Water conditions | Regulation of the chemical condition of salt waters |
| 5.1.1.1 | Mediation of waste, toxics and other nuisances | Dilution by freshwater and marine ecosystems |

**取水(4.2.x)と水質浄化(2.2.5.x)は別のSectionに属する。**同じ「水」でも依存側の対象が違うため、Group一致判定では別グループになる。M4の再グループ化がこれを正しく分けることを確認済み。

---

## 4. V5.2 との差分と、追随の判断(E-6)

**結論:V5.1 に留まることを推奨する。**

### 4.1 差分の実態(V5.2 の "Comparison to V5.1 Equivalent" 列と、Group単位の突き合わせ)

| 観点 | 結果 |
|---|---|
| Group数 | V5.1 = 38 → V5.2 = 43 |
| V5.2 で消えたGroupコード | 12件(`2.2.4` `2.2.5` `2.2.6` `2.3.X` `3.1.2` `3.2.2` `3.3.X` `4.3.1` `4.3.2` `6.1.2` `6.2.2` `6.3.X`) |
| V5.2 で増えたGroupコード | 17件(`2.3.2`〜`2.3.6` `2.4.X` `3.3.1` `3.4.1` `3.4.2` `3.5.X` `4.1.1` `4.1.2` `4.1.X` `6.3.1` `6.4.1` `6.4.2` `6.5.X`) |
| **同じコードで指す対象が変わったGroup** | **16件** |

### 4.2 最も重い問題:同じコードが別の意味になる

| コード | V5.1 の意味 | V5.2 の意味 |
|---|---|---|
| `4.2.1` | Surface water used for nutrition, materials or energy | **Mineral substances** used for nutrition, materials or energy |
| `4.2.2` | Ground water for used for nutrition, materials or energy | **Non-mineral substances** or ecosystem properties |
| `2.2.1` | Regulation of baseline flows and extreme events | **Erosion control** |
| `2.2.2` | Lifecycle maintenance, habitat and gene pool protection | **Hydrological cycle and water flow regulation** |
| `2.2.3` | Pest and disease control | **Hazard mitigation** |

**水はV5.2で `4.2.x` → `4.1.x` に移動している。**水質条件も `2.2.5.x` → `2.3.5.x` に移動している。

つまり **V5.1 で保存したコードを V5.2 の表で読むと、エラーにならずに別のサービスとして解釈される。**「飲用の表流水」が「鉱物性物質」として読まれる。これは検出できない誤りであり、**版を混ぜた時点で静かに壊れる**種類の問題である。

### 4.3 判断の根拠

1. **MVPでPRISM側がCICESコードを割り当てる場面がない。**水パイロットでコードが付く対象はESVD由来のVFesのみで、その値は**ESVDのレコードが持つCICES参照をそのまま転記する。**したがって従うべき版はESVD側が使っている版であり、PRISMが独自に選ぶ話ではない
2. **追随には M4 §6.3の制約2がそのまま当てはまる。**一致階層を変えると再グループ化の結果が変わり、再計算ハッシュと期間比較の一貫性に影響する。V5.2 はそれより強く、**コードの意味自体が変わる**
3. **追随の利益が現時点でない。**V5.2 の変更は主に生物側の Group 再編で、MVPが扱う水カテゴリでは「コードが動いただけ」で情報量は増えていない

### 4.4 追随する場合に必要になること(将来のために記録)

- `VersionedParameterSet`(setId: `"cices-version"`)として版を切り、`changeReason` を記録する(M8 D-3)
- **旧版での再計算値を並記する。**M4の「手法変更時は前年度手法での再計算値を並記」と同じ扱い
- 過去に保存した `CicesReference` を一括で読み替えない。**版ごとに解釈する**

### 4.5 この確認で判明した実装上の不足(対応済み)

**`CicesReference` が版を持っていなかった。**`{ cicesCode, specifiedLevel }` だけでは、V5.2 が存在する以上コードの解釈が定まらない。`cicesVersion` を**必須フィールド**として追加した(`packages/core/src/types/valuation.ts`)。現時点でこの参照を設定しているプラグインはないため、既存データへの影響はない。

---

## 5. 出典一覧

- CICES V5.1 公式スプレッドシート — `docs/data/external/Finalised-V5.1_18032018.xlsx`(シート1=説明、シート2=本体、シート4=Abiotic拡張)
- CICES V5.2 公式スプレッドシート — `docs/data/external/CICES_V5.2_29042025_Final.xlsx`(シート2に "Comparison to V5.1 Equivalent" 列)
- CICES V5.2 ガイダンス — `docs/data/external/CICES-V5.2_Guidance_final-_-29042025.pdf`
- Haines-Young, R. and M.B. Potschin (2018): *Common International Classification of Ecosystem Services (CICES) V5.1 and Guidance on the Application of the Revised Structure*(スプレッドシートが参照を指示している併読文書)
