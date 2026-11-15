# ガイセン NOW 稼働状況

公開 URL: https://gaisen.1mr.jp/status

本体と配信元を分離した、日本語のステータスページです。

## 構成

- GitHub Actions の標準 Linux ランナーで、Upptime v1.46.5 を約 5 分ごとに実行。
- 接続先はガイセン NOW のトップページとニュース。HTTP 200 と本文の「ガイセン NOW」を確認。
- Upptime が接続障害の Issue を作成し、復旧時に閉じます。検知時は再試行します。
- `scripts/export-status.mjs` が監視結果と Issue から `status-data.json` を生成。直近 91 日の測定結果を `history/checks.json` に保持します。
- GitHub Pages は専用の公開ワークフローで `docs` を配信。画面変更時だけ実行し、監視データの更新時は再公開しません。
- Cloudflare Worker が `/status` と関連リソースを配信。画面・フォントは GitHub Pages、監視結果は公開リポジトリから取得。本体の Raspberry Pi への接続は不要です。
- 本体と同じロゴ、LINE Seed JP、配色、ヘッダーとフッターを使用。必要なアセットをこのリポジトリ内に保持します。

## 無料枠

このリポジトリは public で、標準ランナーと GitHub Pages を使用します。Cloudflare Workers は Free プランで運用し、有料ストレージや外部 API は使用しません。Worker のリクエスト数はアカウント共通で 1 日 100,000 回まで。上限到達時は停止し、有料プランには自動変更しません。

GitHub Actions の定期実行は混雑時に遅延・欠落する場合があります。最終確認が 20 分を超えた結果は「最新の状態を確認できていません」と表示します。

## 集計と表示

- 稼働率は測定結果間の時間で重み付け。監視開始前と、15 分を超える測定間隔は除外します。初回測定時は「集計中」です。
- 日別履歴は日本時間。データのない日は灰色、計測範囲内で正常なら緑、障害検知があれば赤で表示。
- 通信失敗や不正なデータを正常扱いしません。Worker が前回結果を返す場合も、元の確認日時を保持します。
- 監視画面は 60 秒ごとに表示を更新。閲覧によって監視処理を実行することはありません。

## 運用

- 手動確認: Actions の「ガイセン NOW 稼働監視」から Run workflow。
- 障害の詳細: Upptime が生成する Issue に運用メモを残せます。
- メンテナンスのお知らせ: このリポジトリに Issue を作成し `maintenance` ラベルを付けると、タイトルと状態を公開画面に表示します。公開してよい内容のみを記入してください。
- 画面変更: `docs` を更新して main へ push。GitHub Pages の反映後、Worker のキャッシュは最大 1 時間で更新。即時反映が必要な場合は `src/worker.js` のキャッシュキーのバージョンを更新し再デプロイします。
- Worker 変更: `src/worker.js` を更新し、Cloudflare ダッシュボードのコード編集または認証済みの Wrangler でデプロイ。
- ルート: `gaisen.1mr.jp/status*`。Worker 内で許可したファイルのみを配信します。
- 切り戻し: Cloudflare で `gaisen-status` のルートを削除し、本体のフッターリンクを以前の UptimeRobot の URL へ戻します。既存の UptimeRobot 監視は変更していません。

## 検証

`npm test` で、初回データ・監視途切れ・時間による重み付け・日本時間の日付境界・配信ルート・本体を経由しない取得・上流障害の扱いを検証します。

## ライセンス・表示物

LINE Seed JP は SIL Open Font License 1.1。ライセンスは `docs/assets/fonts/OFL.txt`。ガイセン NOW のロゴはガイセン NOW の表示に使用しています。Upptime は MIT ライセンスの外部 GitHub Action として利用しています。
