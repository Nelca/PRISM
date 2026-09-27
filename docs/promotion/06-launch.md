# PRISM 制作物の利用・公開手順

## すぐ見られるもの

`public/promotion/index.html` がLP。独立した静的ファイルで、PRISM本体のDBは不要。外部フォント・解析タグ・フォーム送信先への依存もない。

```sh
node tools/promotion/preview.cjs
```

ブラウザで `http://127.0.0.1:4173/index.html`。ファイルを直接開くこともできるが、字幕やダウンロードの検証はHTTP経由を推奨。

既存Next.jsで配信するときのパスは `/promotion/index.html`。`/promotion/` への自動ルーティングは追加していない。Next.jsの public フォルダ仕様を確認して構成した。

**既存の `proxy.ts` のBasic認証は変更していない。** 本体の機密性を維持したまま、一般公開する場合はこの静的フォルダを別の公開ホストへ配置する方法が簡潔。既存ホストを使うなら、認証境界を意図して決めること。

## 公開前に確定する３点

1. **実在の相談窓口**：`config.js` の `contactUrl` にHTTPS URLを設定。空のままではシート取得の導線。送信済み・予約完了を装う処理はない。
2. **運営者・公開URL**：会社等の正式名、問い合わせ先、必要なプライバシー説明を追加。公開後のURLをOG画像の絶対URL・canonical・og:urlに反映。現在の `noindex,nofollow` は公開を決めたときに変更。
3. **募集条件**：提供主体、対象範囲、検証の費用・条件を確認。実証待ち・利用条件待ちの機能を無条件で提供できるように書き換えない。

素材制作とローカル検証は完了対象。今回、外部への公開、メール送信、広告出稿、契約、外部フォームへの個人情報送信は実施していない。

## 配信先別の使い分け

| 場面 | 使うもの | 次の行動 |
|---|---|---|
| 相手に初めて紹介 | １枚PDF + 紹介文 | 担当者への社内共有 |
| LinkedIn投稿 | 15秒縦型または1200×630画像 + 投稿原稿 | LPの判断体験 |
| 商談冒頭 | 45秒横型動画 | 実際の案件・基準のヒアリング |
| 検証の相談 | LPの３ケース + 整理シート | 対象・データ・承認条件を整理 |

動画の配信画面ではプラットフォームの見切れ・自動字幕位置を確認する。VTTは必要に応じて別トラックで登録。外部プラットフォームの入稿仕様は変わるため、素材の寸法を出稿可能性の保証と解釈しない。

## 計測設計案（未接続）

| イベント | 記録する属性 | 判断したいこと |
|---|---|---|
| lp_view | 許可したutm_source / utm_campaign | どの紹介・投稿から来たか |
| scenario_select | cross / above / below | 概念体験に進んだか |
| overview_download | 素材版 | 社内共有の意図がありそうか |
| brief_download | 素材版 | 自社案件に当てはめようとしたか |
| contact_click | 流入経路 | 相談への移動があったか |
| qualified_meeting | 手動で案件・データ・期限の有無 | 実務上適合する会話に至ったか |

クリックを面談や受注とみなさない。企業名や個人情報をURL・イベントへ載せない。今回のLPは計測タグを送信せず、外部サービスに訪問情報を渡さない。

UTM命名例：`utm_source=linkedin&utm_medium=organic&utm_campaign=design_partner_202609&utm_content=question_15s`。紹介メールなら medium=referral。リンク末尾のハッシュより前にクエリを置く。

## 編集と検証

- 文章・構成：`public/promotion/index.html`
- 見た目：`public/promotion/style.css`
- ３ケースとCTA：`public/promotion/site.js` / `config.js`
- 映像・画像：`tools/promotion/render_media.py`
- １枚資料の元：`tools/promotion/overview.html`
- ブラウザ検証とPDF出力：`tools/promotion/check-and-export.cjs`

検証スクリプトはPlaywrightとChromeが必要。HTTPのプレビューURLを指定して実行する。

```sh
PRISM_PREVIEW_URL=http://127.0.0.1:4173/index.html node tools/promotion/check-and-export.cjs
```

Playwrightが別ディレクトリにある場合は `NODE_PATH` を設定。Pythonも必要に応じてPillow・numpyを含む実行環境を選ぶ。動画再生成用ffmpegは環境に合わせて明示する。制作時の一時フォルダを恒久的な依存先にしない。

## 制作物に含めないもの

開発中の本体ファイル、DB、顧客情報、APIキー、.env、既存の社内資料を配布ZIPに混ぜない。ZIPに入れる戦略・コピー・営業資料は今回新規作成したもの。戦略・証拠表・ローンチ手順は運営用であり、そのまま公開サイトへ載せない。
