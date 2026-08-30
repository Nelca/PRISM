# PRTRデモ取込ファイル

完全に架空の事業所・数量を使った動作確認用サンプルで、実在企業の届出値ではない。

`/sites`の「PRTR排出量を取り込む」で、次の値を指定して4ファイルを同時に選択する。

- 排出年度: `2023`
- 対象物質リスト版: `2023`
- 本紙: `honshi.txt`（CP932、23列、ヘッダーなし）
- 別紙: `besshi.txt`（CP932、41列、ヘッダーなし）
- 他業種: `other-industries.txt`（CP932、3列、ヘッダーなし）
- crosswalk: `facility-crosswalk.csv`（UTF-8）

別紙にはPRTRコード009（アクリロニトリル）の大気排出120kgと、事業所外移動量1,000kgを収録している。現在のレビュー済みLIME3対応表では大気排出が算定され、事業所外移動量は`transfer_only`として保存される。

続けて廃棄物サンプルを取り込む場合、`linked_prtr_transfer_input_id`の`DEMO-FAC-001:1:offsite_waste`がこの移動量を媒体まで含めて参照する。
