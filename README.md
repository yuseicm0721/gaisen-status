# ガイセンNOW 稼働状況

公開URL: https://gaisen.1mr.jp/status

本体と配信元を分離した、日本語のステータスページです。

## 構成

- GitHub Actionsの標準Linuxランナーで、Upptime v1.46.5を約5分ごとに実行。
- 接続先はガイセンNOWのトップページとニュース。HTTP 200と本文の「ガイセンNOW」を確認。
- Upptimeが接続障害のIssueを作成し、復旧時に閉じます。検知時は再試行します。
- `scripts/export-status.mjs` が監視結果とIssueから `status-data.json` を生成。直近91日の測定結果を `history/checks.json` に保持します。
- GitHub Pagesが `main` ブランチの `docs` を配信。
- Cloudflare Workerが `/status` と関連リソースを配信。画面・フォントはGitHub Pages、監視結果は公開リポジトリから取得。本体のRaspberry Piへの接続は不要です。
- 本体と同じロゴ、LINE Seed JP、配色、ヘッダーとフッターを使用。必要なアセットをこのリポジトリ内に保持します。

## 無料枠

このリポジトリはpublicで、標準ランナーとGitHub Pagesを使用します。Cloudflare WorkersはFreeプランで運用し、有料ストレージや外部APIは使用しません。Workerのリクエスト数はアカウント共通で1日100,000回まで。上限到達時は停止し、有料プランには自動変更しません。

GitHub Actionsの定期実行は混雑時に遅延・欠落する場合があります。最終確認が20分を超えた結果は「最新の状態を確認できていません」と表示します。

## 集計と表示

- 稼働率は測定結果間の時間で重み付け。監視開始前と、15分を超える測定間隔は除外します。初回測定時は「集計中」です。
- 日別履歴は日本時間。データのない日は灰色、計測範囲内で正常なら緑、障害検知があれば赤で表示。
- 通信失敗や不正なデータを正常扱いしません。Workerが前回結果を返す場合も、元の確認日時を保持します。
- 監視画面は60秒ごとに表示を更新。閲覧によって監視処理を実行することはありません。

## 運用

- 手動確認: Actionsの「ガイセンNOW 稼働監視」からRun workflow。
- 障害の詳細: Upptimeが生成するIssueに運用メモを残せます。
- メンテナンスのお知らせ: このリポジトリにIssueを作成し `maintenance` ラベルを付けると、タイトルと状態を公開画面に表示します。公開してよい内容のみを記入してください。
- 画面変更: `docs` を更新してmainへpush。GitHub Pagesの反映後、Workerのキャッシュは最大1時間で更新。
- Worker変更: `src/worker.js` を更新し、Cloudflareダッシュボードのコード編集または認証済みのWranglerでデプロイ。
- ルート: `gaisen.1mr.jp/status*`。Worker内で許可したファイルのみを配信します。
- 切り戻し: Cloudflareで `gaisen-status` のルートを削除し、本体のフッターリンクを以前のUptimeRobotのURLへ戻します。既存のUptimeRobot監視は変更していません。

## 検証

`npm test` で、初回データ・監視途切れ・時間による重み付け・日本時間の日付境界・配信ルート・本体を経由しない取得・上流障害の扱いを検証します。

## ライセンス・表示物

LINE Seed JPはSIL Open Font License 1.1。ライセンスは `docs/assets/fonts/OFL.txt`。ガイセンNOWのロゴはガイセンNOWの表示に使用しています。UpptimeはMITライセンスの外部GitHub Actionとして利用しています。
