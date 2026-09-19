# ChatGPT Avatar MVP (Web 2D)

ChatGPT連携の2DアバターWebアプリです。  
このREADMEでは「どう実行するか」を中心に、設定・運用・細かい使い方までまとめています。

## 機能概要

- テキスト入力で会話（`/api/chat`）
- マイク入力（Web Speech API）で会話
- 音声合成（Web Speech API）で返答読み上げ
- 擬似口パク（`SpeechSynthesisUtterance#onboundary`）
- 感情表現（happy / neutral / troubled）
- 会話履歴のセッション記憶（メモリ上）
- ユーザー名の簡易長期記憶（メモリ上）
- 外部URLのアバター画像読み込み（環境変数で指定）

## ディレクトリ構成

- `avatar-mvp/server.js`  
  APIと静的配信サーバー
- `avatar-mvp/public/index.html`  
  UI構造
- `avatar-mvp/public/styles.css`  
  見た目・感情カラー・口パク表示
- `avatar-mvp/public/app.js`  
  UI制御（送信、音声、割り込み、設定反映）

## 動作要件

- Node.js 18以上（`fetch`を利用）
- npm
- 音声機能を使う場合は対応ブラウザ（Chrome系推奨）

## 実行手順（ローカル）

1. 作業ディレクトリへ移動（Linux / macOS / Windows共通）

```bash
cd avatar-mvp
```

2. 環境変数ファイルを作成

Linux / macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Windows コマンドプロンプト (cmd):

```cmd
copy .env.example .env
```

3. `.env` を編集

最低限:

- `OPENAI_API_KEY` を設定（未設定ならモック応答）

任意:

- `OPENAI_MODEL`（デフォルト: `gpt-4.1-mini`）
- `PORT`（デフォルト: `3000`）
- `AVATAR_IMAGE_URL`（外部アバター画像URL）

4. サーバー起動

```bash
npm start
```

5. ブラウザでアクセス

- `http://localhost:3000`

## 外部アバター画像の使い方

`.env` に以下を設定します。

```env
AVATAR_IMAGE_URL=https://example.com/avatar.png
```

- URL指定時: 指定画像を円形にトリミングして表示
- 未指定時: デフォルトのシンプル2Dアバター表示
- 感情・口パクUIはそのまま機能

## 使い方

- テキスト入力欄に文章を入れて「送信」
- 「🎙️ マイク」で音声入力開始
- 音声入力開始時は再生中TTSを停止（割り込み）
- 「⏹ 停止」で音声再生を手動停止

## APIエンドポイント

- `GET /api/config`  
  クライアント設定を返却（音声方式、アバター設定など）
- `POST /api/chat`  
  会話API
  - input: `message`, `sessionId`, `userId`
  - output: `reply`, `emotion`, `fallbackTextOnly`

## ガードレール/運用上の注意

- IP単位の簡易レート制限あり
- 禁止語・長文の簡易入力制限あり
- ログは本文ではなく文字数ベースで記録
- `.env` はGit管理しない（秘密情報を含むため）

## トラブルシュート

- **音声が動かない**  
  ブラウザがWeb Speech API非対応の可能性があります。テキスト会話は継続可能です。
- **OpenAI応答が来ない**  
  `OPENAI_API_KEY` の未設定・無効・権限不足を確認してください。未設定時はモック応答になります。
- **画像が表示されない**  
  `AVATAR_IMAGE_URL` のURLが直接画像配信可能か（403/CORS/期限切れ）を確認してください。
