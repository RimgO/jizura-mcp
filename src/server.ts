import express, { type Request, type Response } from "express";
import cors from "cors";
import multer from "multer";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as tools from "./tools.js";
import {
  getYoutubeMetadata,
  downloadYoutubeVideo,
  trimVideo,
  extractAudio,
  compositeVideos,
  compositePngSequence,
} from "./media.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const uploadsDir = path.join(rootDir, "uploads");
const outputsDir = path.join(rootDir, "outputs");
const publicDir = path.join(rootDir, "public");

[uploadsDir, outputsDir, publicDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// 静的ファイルの提供
app.get("/favicon.ico", (_req, res) => res.status(204).end());
app.use(express.static(publicDir));
app.use("/media/uploads", express.static(uploadsDir));
app.use("/media/outputs", express.static(outputsDir));

// Multer設定（動画・音声アップロード）
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// プリセット情報
const PRESETS = {
  styles: [
    { id: "noir", name: "ノワール・クロマ", desc: "洗練されたモノトーン×アクセントカラー" },
    { id: "darkhud", name: "ダークHUD", desc: "近未来UI・サイバー感のある演出" },
    { id: "crimson", name: "クリムゾン・シグナル", desc: "警告・深紅のインパクト演出" },
    { id: "mint", name: "ミント・ターミナル", desc: "ハッカー/コード風エメラルドグリーン" },
    { id: "mono_rgb", name: "モノ・RGB", desc: "色収差・RGBズレ効果のモダンMV風" },
    { id: "sumi", name: "墨と朱追加和", desc: "和風・毛筆と朱色のコントラスト" },
    { id: "sakura", name: "サクラ追加和", desc: "風情ある桜と繊細なタイポグラフィ" },
    { id: "pop", name: "ポップ・マゼンタ", desc: "ビビッドで鮮やかなリズミカル演出" },
    { id: "blueprint", name: "ブループリント", desc: "設計図・幾何学的なグリッドレイアウト" },
    { id: "synth80s", name: "シンセ80s追加", desc: "レトロフューチャー・ヴェイパーウェイヴ" },
  ],
  syntaxHelpers: [
    { label: "カット区切り", syntax: "フレーズ1 / フレーズ2", desc: "斜線でカットを分割" },
    { label: "強調 (サビ)", syntax: "*強調する言葉*", desc: "大きく手前に表示" },
    { label: "ささやき (Bメロ)", syntax: "~静かな言葉~", desc: "小さく控えめに表示" },
    { label: "フラッシュ演出", syntax: "盛り上がる行末!", desc: "行末の!で画面揺れ＆発光" },
    { label: "重ねて表示", syntax: "{\n一行目\n二行目\n}", desc: "順に重ねて残す" },
    { label: "タイムスタンプ", syntax: "[00:12.50]歌詞フレーズ", desc: "LRC形式で開始秒を同期" },
  ],
};

app.get("/api/presets", (_req, res) => {
  res.json(PRESETS);
});

// YouTubeメタデータ取得
app.post("/api/youtube/info", async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URLが指定されていません" });
  }
  try {
    const meta = await getYoutubeMetadata(url);
    res.json(meta);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "YouTube情報の取得に失敗しました" });
  }
});

// YouTube動画ダウンロード
app.post("/api/youtube/download", async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URLが指定されていません" });
  }
  try {
    const result = await downloadYoutubeVideo(url, uploadsDir);
    res.json({
      ok: true,
      filename: result.filename,
      mediaUrl: `/media/uploads/${result.filename}`,
      filePath: result.filePath,
      metadata: result.metadata,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "動画のダウンロードに失敗しました" });
  }
});

// ローカルファイルアップロード
app.post("/api/upload", upload.single("video"), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: "ファイルが送信されていません" });
  }
  const filename = req.file.filename;
  const filePath = req.file.path;
  res.json({
    ok: true,
    filename,
    mediaUrl: `/media/uploads/${filename}`,
    filePath,
    originalName: req.file.originalname,
    size: req.file.size,
  });
});

// 動画トリミング
app.post("/api/trim", async (req: Request, res: Response) => {
  const { filePath, startSec, durationSec } = req.body;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({ error: "動画ファイルが存在しません" });
  }
  const ext = path.extname(filePath) || ".mp4";
  const trimmedName = `trimmed_${Date.now()}${ext}`;
  const outPath = path.join(uploadsDir, trimmedName);
  try {
    await trimVideo(filePath, outPath, Number(startSec) || 0, durationSec ? Number(durationSec) : undefined);
    res.json({
      ok: true,
      filename: trimmedName,
      mediaUrl: `/media/uploads/${trimmedName}`,
      filePath: outPath,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "トリミングに失敗しました" });
  }
});

// JIZURAプレビュー生成（Playwrightスクリーンショット）
app.post("/api/jizura/preview", async (req: Request, res: Response) => {
  const { lyrics, title, artist, styleName, videoPath } = req.body;
  try {
    // ヘッドレスでJIZURAを開く
    await tools.open(true);

    // 動画/音声がある場合、音声を抽出してJIZURAに読み込ませる（ビート検出・タイミング同期）
    if (videoPath && fs.existsSync(videoPath)) {
      try {
        const audioPath = path.join(uploadsDir, `preview_audio_${Date.now()}.wav`);
        await extractAudio(videoPath, audioPath);
        await tools.loadFile("曲・動画を読み込む", audioPath, false);
        await new Promise((r) => setTimeout(r, 600));
      } catch (e) {
        console.warn("動画音声の読み込みに失敗またはスキップ:", e);
      }
    }

    // 歌詞を流し込む
    if (lyrics && lyrics.trim()) {
      await tools.setLyrics(lyrics.trim());
    }

    // タイトルとアーティスト
    if (title) {
      await tools.fill("曲名", title).catch(() => {});
    }
    if (artist) {
      await tools.fill("アーティスト", artist).catch(() => {});
    }

    // スタイル選択または「おまかせ」
    if (styleName) {
      await tools.click(styleName).catch(() => {});
    } else {
      await tools.click("おまかせで作る").catch(() => {});
    }

    // 枠線を非表示にする
    await tools.setCheckbox("アイテム枠表示", false).catch(() => {});

    // レンダリング待機
    await new Promise((r) => setTimeout(r, 800));

    // スクリーンショット取得
    const ss = await tools.screenshot();
    await tools.close();

    res.json({
      ok: true,
      imageBase64: ss.base64,
      dataUrl: `data:image/png;base64,${ss.base64}`,
    });
  } catch (err: any) {
    await tools.close().catch(() => {});
    res.status(500).json({ error: err.message || "プレビュー生成に失敗しました" });
  }
});

// JIZURA動画書き出し / 合成
app.post("/api/jizura/render", async (req: Request, res: Response) => {
  const { lyrics, title, artist, styleName, videoPath, overlayPosition, overlayScale, overlayYOffset } = req.body;
  const outName = `jizura_${Date.now()}.mp4`;
  const finalPath = path.join(outputsDir, outName);

  try {
    await tools.open(true);

    let audioPath: string | null = null;
    if (videoPath && fs.existsSync(videoPath)) {
      console.log("動画から音声を抽出中...");
      audioPath = path.join(uploadsDir, `audio_${Date.now()}.wav`);
      await extractAudio(videoPath, audioPath);
      console.log("JIZURAに音声を読み込み中...");
      await tools.loadFile("曲・動画を読み込む", audioPath, false);
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (lyrics && lyrics.trim()) {
      await tools.setLyrics(lyrics.trim());
    }

    if (title) await tools.fill("曲名", title).catch(() => {});
    if (artist) await tools.fill("アーティスト", artist).catch(() => {});
    if (styleName) await tools.click(styleName).catch(() => {});

    await tools.setCheckbox("アイテム枠表示", false).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));

    let returnPath = "";
    let returnUrl = "";

    if (videoPath && fs.existsSync(videoPath)) {
      // 元動画がある場合は背景なし透過PNG連番をエクスポートし、完全アルファ合成する
      const zipName = `typo_${Date.now()}.zip`;
      const zipPath = path.join(outputsDir, zipName);
      console.log("JIZURA 透過PNG（背景なし）連番書き出し開始...");
      await tools.exportOutput("透過PNG（ZIP・背景なし）", zipPath);
      console.log("透過PNG連番書き出し完了:", zipPath);
      await tools.close();

      console.log("ffmpeg 完全アルファ透過オーバーレイ合成中... オプション:", {
        position: overlayPosition,
        scale: overlayScale,
        yOffset: overlayYOffset,
      });

      await compositePngSequence(videoPath, zipPath, finalPath, 24, {
        position: overlayPosition || "bottom",
        scale: overlayScale !== undefined ? parseFloat(overlayScale) : 0.65,
        yOffset: overlayYOffset !== undefined ? parseInt(overlayYOffset, 10) : 40,
      });
      returnPath = finalPath;
      returnUrl = `/media/outputs/${outName}`;
      console.log("透過オーバーレイ合成完了:", finalPath);
    } else {
      // 動画がない場合は通常のMP4書き出し
      const typoName = `typo_${Date.now()}.mp4`;
      const typoPath = path.join(outputsDir, typoName);
      console.log("JIZURA タイポグラフィMP4書き出し開始...");
      await tools.exportOutput("MP4 を書き出す", typoPath);
      await tools.close();
      returnPath = typoPath;
      returnUrl = `/media/outputs/${typoName}`;
    }

    res.json({
      ok: true,
      videoUrl: returnUrl,
      filename: path.basename(returnPath),
      filePath: returnPath,
    });
  } catch (err: any) {
    await tools.close().catch(() => {});
    console.error("Render failed:", err);
    res.status(500).json({ error: err.message || "動画のレンダリング・書き出しに失敗しました" });
  }
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`🎬 JIZURA Video Editor WebUI is running!`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`========================================\n`);
});
