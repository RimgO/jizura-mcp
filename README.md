# JIZURA MCP & Video Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Author](https://img.shields.io/badge/Author-RimgO-cyan.svg)](https://github.com/RimgO)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![Engine](https://img.shields.io/badge/Playwright-Chromium-orange.svg)](https://playwright.dev)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-8.0-red.svg)](https://ffmpeg.org)

[字面一 JIZURA ONE STOP EDITION](https://hirazisora.github.io/JIZURA/)（hirazisora氏によるfork版）をPlaywright経由で自動制御する**MCP（Model Context Protocol）サーバー**、およびYouTubeやローカル動画を取り込んでキネティックタイポグラフィ（リリック演出）をリアルタイムに重ねて編集・書き出せる**専用WebUIアプリケーション**です。

---

## 📖 HTML 利用ガイド（ビジュアル解説）

より詳細な図解・ステップ解説付きの HTML 形式ガイドを用意しています。ブラウザでそのまま閲覧できます：

* **WebUI起動中:** [`http://localhost:3000/guide.html`](http://localhost:3000/guide.html)
* **ローカルファイル:** [`docs/index.html`](file:///Users/rimgo/jizura-mcp/docs/index.html) または [`public/guide.html`](file:///Users/rimgo/jizura-mcp/public/guide.html) をブラウザで開く

---

## 🌟 主な機能と特徴

1. **JIZURA Video Studio (WebUI)**
   - **YouTube動画自動ダウンロード:** URLを入力するだけで `yt-dlp` により動画を取得・配置
   - **ローカル動画/音声対応:** MP4, MOV, WebM, MP3等をドラッグ＆ドロップで即座に読み込み
   - **プレイヤートリマー & タイムスタンプ同期:** 動画を再生しながら `[mm:ss.ss]` 形式のタイムスタンプを歌詞にワンクリック挿入
   - **🎬 テロップ配置 & スケール調整（被写体・顔避け機能）:**
     - 「👇 下部テロップ（字幕風）」「🎯 中央（全画面）」「👆 上部」の配置切替
     - 50%〜100%のスケール調整と、縦オフセット微調整スライダー
     - 実写動画やキャラクター動画で「顔が文字や装飾パネルで隠れてしまう」問題を完全に防止
   - **完全透過アルファオーバーレイ合成:** JIZURA公式の「透過PNG（ZIP・背景なし）」とFFmpegを連携させ、背景を完全に抜いた高品質な文字演出を動画の上に合成

2. **AIエージェント連携（MCPサーバー）**
   - Claude Desktopや各種MCPクライアントから自然言語でJIZURAのUIを全自動操作
   - 歌詞の流し込み、演出スタイル選択、BPM設定、チェックボックス切替、プレビュー取得、動画エクスポートに対応

---

## 🚀 クイックスタート

### 必要環境
- Node.js (v18以降)
- FFmpeg (macOS: `brew install ffmpeg`)
- yt-dlp (macOS: `brew install yt-dlp` ※YouTube取得時に使用)

### インストール

```bash
git clone https://github.com/RimgO/jizura-mcp.git
cd jizura-mcp
npm install
npm run build
```

### WebUIの起動

```bash
npm run ui
# ブラウザで開く: http://localhost:3000
```

### 動作確認テスト

```bash
npm run verify
```

---

## 🎬 WebUI の基本操作フロー

1. **動画の読み込み**
   - 「YouTubeから取得」でURLを入力、または「ローカル動画をアップロード」にMP4ファイルをドラッグ＆ドロップします。
2. **タイムライン同期**
   - 動画を再生し、歌い出しのタイミングで「⏱️ タイムスタンプ挿入」を押すと、再生位置が `[00:12.50]` のように歌詞へ自動挿入されます。
3. **スタイルとテロップ配置の選択**
   - 演出スタイル（ノワール・クロマ、ダークHUD、墨と朱、モノ・RGBなど）を選択します。
   - **被写体の顔を遮らないために、「👇 下部テロップ (推奨)」および「標準 (65%)」がデフォルトで有効になっています。**
4. **プレビュー & 書き出し**
   - 「プレビュー生成」で静止画を確認できます。
   - 「動画を書き出す」をクリックすると、JIZURAで透過PNG連番が書き出され、FFmpegで元動画とアルファ合成された完成MP4が生成・ダウンロードされます。

---

## 🤖 MCPクライアントへの登録（Claude Desktop等）

`claude_desktop_config.json`（macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`）に以下を追加します：

```json
{
  "mcpServers": {
    "jizura": {
      "command": "node",
      "args": ["/絶対パス/to/jizura-mcp/dist/index.js"]
    }
  }
}
```

開発中はビルドなしで実行可能：

```json
{
  "mcpServers": {
    "jizura": {
      "command": "npx",
      "args": ["tsx", "/絶対パス/to/jizura-mcp/src/index.ts"]
    }
  }
}
```

### チャットでの指示例
* 「この曲に合う歌詞を書いて、JIZURAでダークHUD風のタイポグラフィにしてプレビューを見せて」
* 「サビの部分だけ大きく強調して、BPM 120で動画を書き出して」

---

## 🛠️ 提供MCPツール一覧

| ツール | 説明 | 主な引数 |
|---|---|---|
| `jizura_open` | ブラウザ（Playwright Chromium）を起動してJIZURAを開く | `headless`: boolean |
| `jizura_snapshot` | 画面上の操作可能なボタン/チェックボックス/入力欄一覧を取得 | - |
| `jizura_set_lyrics` | JIZURA記法の歌詞テキストを入力欄に流し込む | `lyrics`: string |
| `jizura_click` | 表示ラベル名でボタンをクリック（「おまかせで作る」「シャッフル」等） | `buttonName`: string |
| `jizura_set_checkbox` | チェックボックスをON/OFF（「アイテム枠表示」等） | `label`: string, `checked`: boolean |
| `jizura_fill` | 入力欄に値を設定（曲名、アーティスト、BPM等） | `label`: string, `value`: string |
| `jizura_screenshot` | 現在のプレビュー画面をBase64 PNGで取得 | - |
| `jizura_export` | MP4または透過PNG(ZIP)を書き出して指定パスに保存 | `buttonName`: string, `savePath`: string |
| `jizura_close` | ブラウザを終了してリソースを解放 | - |

---

## 📝 JIZURA 歌詞記法リファレンス

| 記法 | 効果 | 例 |
|---|---|---|
| `1行 ＝ 1フレーズ` | 改行ごとに次の演出カットへ切り替え | `夜明けの色を`<br>`覚えてる` |
| `/` | 1行の中でカットを分割 | `夜明けの色を / 覚えてる` |
| `*強調*` | サビ用・文字と装飾プレートを巨大化して強調 | `*透明なままじゃ終われない!*` |
| `~ささやき~` | 控えめに小さく表示（動画の邪魔をしない） | `~静かな夜の終わり~` |
| 行末 `!` | 画面揺れ（シェイク）やフラッシュ演出 | `走り出せ!` |
| `{ }` | 複数行を画面に残したまま順に重ねて表示 | `{\n一行目\n二行目\n}` |
| `[mm:ss.ss]` | LRC形式タイムスタンプ（ビート同期） | `[00:04.20]サビのフレーズ` |

> **💡 被写体（顔など）を邪魔しないコツ**
> 歌詞に `*強調歌詞*` を入れると、JIZURAはサビ演出として画面中央に巨大なパズルピースや帯プレートを出します。スッキリした文字だけの演出にしたい場合は `*` を外し、通常の改行や `/` で書くか、WebUIの「下部テロップ」モードをご利用ください。

---

## 📄 ライセンス & 著作権

* **Author:** RimgO
* **License:** [MIT License](LICENSE)

```
Copyright (c) 2026 RimgO
```

### クレジット
* **字面一 JIZURA ONE STOP EDITION (hirazisora fork):** [https://hirazisora.github.io/JIZURA/](https://hirazisora.github.io/JIZURA/)
* **JIZURA 原案・オリジナル:** hirano 氏
