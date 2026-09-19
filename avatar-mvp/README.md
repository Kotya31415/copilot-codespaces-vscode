# ChatGPT Avatar MVP (Web 2D)

この実装は、要件定義〜MVP〜運用要件までを最小構成で動く形に落とし込んだサンプルです。

## 1) 要件の固定

- Avatar: **2D**
- Platform: **Webアプリ**
- Lip sync: **音声境界イベントで擬似口パク**
- Emotion: **happy / neutral / troubled**
- Language: **日本語中心（ja/en想定）**
- Latency budget: **~2秒目標**

## 2) ChatGPT拡張方式

- 実装方針は **Custom GPT + Actions/API連携** を前提
- 本MVPではサーバーから OpenAI API を直接呼び出す構成

## 3) レイヤー分離

- 会話層: `/api/chat`（OpenAI応答 + 履歴）
- 音声層: ブラウザ Web Speech API（STT/TTS）
- アバター層: `public/index.html` + `public/styles.css`
- 制御層: `public/app.js`（感情反映・口パク・割り込み）

## 4) MVP機能

- テキスト送信で応答取得
- TTS再生
- 口パク（onboundaryベース）
- 感情タグで表情切り替え

## 5) 双方向会話

- マイク入力（STT）→ `/api/chat`
- 応答を即時再生
- ユーザー発話開始時に `speechSynthesis.cancel()` で割り込み

## 6) キャラクター体験

- 固定人格プロンプト（`server.js`）
- セッション記憶（会話履歴）
- 長期記憶の最小例（ユーザー名保存）

## 7) 運用要件

- APIキーは環境変数（`.env.example`）
- IP単位の簡易レート制限
- ログは本文を保存せず長さのみ出力
- 簡易ガードレール（禁止語/長文制限）
- 音声失敗時はテキスト継続

## 8) 配布形態

この構成はそのまま以下へ展開しやすいです。

- Web: そのまま静的配信 + APIホスト
- Electron: `public` をラップ
- OBS: ブラウザソースとして重ね表示

## 起動

```bash
cd /home/runner/work/copilot-codespaces-vscode/copilot-codespaces-vscode/avatar-mvp
cp .env.example .env
# .env に OPENAI_API_KEY を設定（未設定時はモック応答）
npm start
```

ブラウザで `http://localhost:3000` を開いて利用します。
