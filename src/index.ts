import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as tools from "./tools.js";

const server = new McpServer({
  name: "jizura-mcp",
  version: "0.1.0",
});

const NOTATION_GUIDE = `
JIZURA歌詞記法（jizura_set_lyricsのtextに使う）:
- 1行が1フレーズ。空行はやや間を空ける。
- "/" でカットの切れ目を指定（例: 夜明けの色を/覚えてる）
- "｜｜"（全角縦線で囲んだ空白）… 文字なし・演出のみのカット
- "{" と "}" で囲んだ複数行 … 最後のカットが消えるまで順に重ねて表示
- "{-" と "-}" で囲んだ複数行 … 順に残して表示し、歌詞同士の重なりを避ける
- "\\n" … 1カット内の改行（文字として\\nを書きたい場合は "\\\\n"）
- "*強調したい歌詞*" … 強調（自動表示エリアを大きくし前景より手前に表示。サビなどに）
- "~ささやきたい歌詞~" … 抑制（表示・動きを小さく。Bメロや静かな部分に）
- 行末の "!" … フラッシュと揺れ（盛り上がる瞬間に）
- "歌詞|ルビや注釈" … 対応演出時の小さい注釈文字
- "[01:23.45]歌詞" … LRC形式のタイムスタンプをそのまま使用可能
- "#" で始まる行 … コメント（無視される）
- 記法文字自体を歌詞として出したい場合は直前に "\\\\" を置く（例: \\\\* \\\\~ \\\\{ \\\\} \\\\/ \\\\| \\\\! \\\\# \\\\[）
`.trim();

server.registerTool(
  "jizura_open",
  {
    title: "JIZURAを開く",
    description:
      "https://hirazisora.github.io/JIZURA/ をPlaywrightのChromiumで開き、操作可能なセッションを開始する。他のjizura_*ツールを使う前に一度呼ぶ。",
    inputSchema: { headless: z.boolean().optional().describe("trueでヘッドレス起動（既定はfalse＝画面表示あり）") },
  },
  async ({ headless }) => {
    const r = await tools.open(headless ?? false);
    return { content: [{ type: "text", text: r.message }] };
  }
);

server.registerTool(
  "jizura_close",
  {
    title: "ブラウザを閉じる",
    description: "開いているJIZURAのブラウザセッションを終了する。",
    inputSchema: {},
  },
  async () => {
    const r = await tools.close();
    return { content: [{ type: "text", text: r.message }] };
  }
);

server.registerTool(
  "jizura_snapshot",
  {
    title: "画面上の操作可能要素を一覧取得",
    description:
      "現在表示されているボタン・チェックボックス・テキスト入力欄などの名前（ラベル）一覧を返す。jizura_click / jizura_set_checkbox / jizura_fill に渡すnameの確認・調整に使う。",
    inputSchema: { limit: z.number().int().positive().max(1000).optional() },
  },
  async ({ limit }) => {
    const r = await tools.snapshot(limit ?? 400);
    return { content: [{ type: "text", text: JSON.stringify(r.controls, null, 2) }] };
  }
);

server.registerTool(
  "jizura_click",
  {
    title: "ボタン等をクリック",
    description:
      "表示テキストでボタンを探してクリックする。例: 'おまかせで作る'、'シャッフル'、'次の案'、'MP4 を書き出す'、'テーマ設定'、'適用'。",
    inputSchema: {
      name: z.string().describe("ボタンの表示テキスト（部分一致）"),
      exact: z.boolean().optional().describe("trueで完全一致のみ"),
    },
  },
  async ({ name, exact }) => {
    const r = await tools.click(name, exact ?? false);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  }
);

server.registerTool(
  "jizura_set_checkbox",
  {
    title: "チェックボックス／トグルを設定",
    description:
      "ラベル名を指定してチェックボックスのON/OFFを設定する。例: '和風の演出も使う', '追加分の演出も使う', '前景との重なりを避ける'。",
    inputSchema: {
      name: z.string(),
      checked: z.boolean(),
    },
  },
  async ({ name, checked }) => {
    const r = await tools.setCheckbox(name, checked);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  }
);

server.registerTool(
  "jizura_fill",
  {
    title: "テキスト入力欄に値を入れる",
    description: "ラベルまたはplaceholderで入力欄を探して値を入れる（BPM、開始秒、ファイル名など）。",
    inputSchema: { name: z.string(), value: z.string() },
  },
  async ({ name, value }) => {
    const r = await tools.fill(name, value);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  }
);

server.registerTool(
  "jizura_set_lyrics",
  {
    title: "歌詞を設定",
    description: `歌詞入力欄にJIZURA記法のテキストを流し込む。\n\n${NOTATION_GUIDE}\n\n自然文の指示（例:「サビは強調して、Bメロはささやくように」）は、この記法に沿ってテキストを組み立ててから渡すこと。`,
    inputSchema: { text: z.string().describe("JIZURA記法済みの歌詞テキスト") },
  },
  async ({ text }) => {
    const r = await tools.setLyrics(text);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  }
);

server.registerTool(
  "jizura_load_audio",
  {
    title: "曲を読み込む",
    description: "「曲を読み込む」ボタンからローカルの音声ファイルを読み込ませる。",
    inputSchema: {
      filePath: z.string().describe("ローカルの音声ファイルパス（mp3/wav等）"),
      buttonName: z.string().optional().describe("既定は「曲を読み込む」"),
    },
  },
  async ({ filePath, buttonName }) => {
    const r = await tools.loadFile(buttonName ?? "曲を読み込む", filePath);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  }
);

server.registerTool(
  "jizura_screenshot",
  {
    title: "プレビューのスクリーンショット",
    description: "現在の画面をPNG画像として取得する。アレンジ結果を目視確認したいときに使う。",
    inputSchema: {},
  },
  async () => {
    const r = await tools.screenshot();
    return { content: [{ type: "image", data: r.base64, mimeType: "image/png" }] };
  }
);

server.registerTool(
  "jizura_export",
  {
    title: "動画・画像を書き出す",
    description:
      "書き出しボタンを押してダウンロードを待ち、ローカルに保存する。buttonNameは 'MP4 を書き出す' / '連番PNG（ZIP）' / '透過PNG（ZIP・背景なし）' のいずれか。",
    inputSchema: {
      buttonName: z.string(),
      savePath: z.string().describe("保存先のローカルパス"),
    },
  },
  async ({ buttonName, savePath }) => {
    const r = await tools.exportOutput(buttonName, savePath);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
