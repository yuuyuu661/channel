# Discord 転送VCボット（ギルド即時同期対応）

転送用のボイスチャンネル（ロビー）に入室すると、自動で新しいVCを作り、ロビー在室者を一括移動。生成VCは空で自動削除。  
**複数サーバーにギルドコマンドを即時同期**できるようにしました。

## コマンド
- `/create-transfer name:<文字列> limit:<0~99>` … 転送ロビーVCを作成
- `/sync-commands` … 実行したサーバーのみ即時再登録

> 実行者制限: ユーザーID `716667546241335328` または ロールID `1419701562460344362`。

## 必要権限
- `チャンネルの管理 (MANAGE_CHANNELS)`
- `メンバーを移動 (MOVE_MEMBERS)`

## 環境変数（Railway）
- `DISCORD_TOKEN`, `APPLICATION_ID`
- `GUILD_IDS` に `1419701322441162844,1420918259187712093` のように設定（複数可）  
  もしくは単一なら `GUILD_ID`。

## デプロイ手順
1. Railway にアップロード
2. Variables 設定（`DISCORD_TOKEN`, `APPLICATION_ID`, `GUILD_IDS`）
3. 起動後、各サーバーで `/sync-commands` を実行するとその場で反映されます（起動時にも自動登録）。


### トラブルシュート: DiscordAPIError[10002] Unknown Application
- `APPLICATION_ID` が **ボットのアプリケーションID(Client ID)** になっているか確認（ユーザーIDやギルドIDではありません）。
- Botトークンが同じアプリケーションのものか確認。
- Bot を対象サーバーに **applications.commands** と **bot** スコープで招待済みか確認。
