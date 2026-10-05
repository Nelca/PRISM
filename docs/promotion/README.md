# PRISM プロモーション一式

**正解のない環境の評価額を、投資の根拠に変える。**

サブコピー：算出方法で、変わる金額。  
プロダクト説明：環境財務評価プラットフォーム

2026-10-04追加改訂：製品説明を幅広い財務影響の算定・評価・判定へ変更。取水量・節水設備は具体例に限定。

2026-10-04改訂：指定のメインコピー・サブコピー・プロダクト説明を全媒体へ反映。

2026-09-27改訂：コピーを入力・試算・業務用途が伝わる内容に変更し、現行製品のモノトーン＋青（#2864DC）に統一しました。

日本の製造業におけるサステナビリティ担当と経営企画・財務を想定した、デザインパートナー獲得用の制作一式です。

## 見る

- [LP](../../public/promotion/index.html)：スマートフォン対応、３ケースの判断体験、動画、資料取得、FAQ。
- [45秒・横型動画](../../public/promotion/video/prism-brand-45s.mp4)：1920×1080、BGM・画面内コピー付き。
- [15秒・縦型動画](../../public/promotion/video/prism-social-15s.mp4)：1080×1920、SNS用。
- [営業用１枚PDF](../../public/promotion/assets/prism-overview.pdf)：A4、日本語テキストを保持。
- [横型画像](../../public/promotion/assets/social-landscape.png) / [正方形画像](../../public/promotion/assets/social-square.png) / [縦型画像](../../public/promotion/assets/social-vertical.png)
- [案件整理シート](../../public/promotion/assets/project-brief.txt)

## 使う

1. [ターゲット・競合・訴求・30日間の運用案](01-strategy.md)
2. [キャッチコピー、広告、SNSの原稿](02-copy-library.md)
3. [紹介メール、商談の台本、想定問答](03-sales-playbook.md)
4. [動画仕様、絵コンテ、デザインルール](04-film-and-art-direction.md)
5. [訴求と実装の裏付け](05-evidence-and-claims.md)
6. [公開・運用・再編集の手順](06-launch.md)
7. [検証記録](07-quality-report.md)
8. [LPデザインレビューと改善記録](08-ui-design-review.md)
9. [LP訴求とCVR検証の設計](09-message-and-conversion-review.md)

## 開く方法

```sh
node tools/promotion/preview.cjs
```

[ローカルLP](http://127.0.0.1:4173/index.html) を開く。本体のDBは不要です。

主CTAは概要PDFの取得です。実在の相談窓口が未設定のため、案件を検討する方向けには案件整理シートの取得を案内しています。`public/promotion/config.js` にHTTPSの窓口を設定すると相談CTAへ切り替わります。公開・投稿・送信は実施していません。
