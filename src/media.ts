import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

export const FFMPEG_PATH = fs.existsSync("/opt/homebrew/bin/ffmpeg")
  ? "/opt/homebrew/bin/ffmpeg"
  : "ffmpeg";

export const YTDLP_PATH = fs.existsSync("/opt/homebrew/bin/yt-dlp")
  ? "/opt/homebrew/bin/yt-dlp"
  : "yt-dlp";

export interface VideoMetadata {
  title: string;
  duration: number; // in seconds
  thumbnail?: string;
  uploader?: string;
  webpage_url?: string;
  width?: number;
  height?: number;
}

/**
 * YouTube動画のメタデータ（タイトル、長さ、サムネイルなど）を取得
 */
export async function getYoutubeMetadata(url: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, ["--dump-json", "--no-playlist", url]);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp failed (code ${code}): ${stderr.slice(0, 300)}`));
      }
      try {
        const json = JSON.parse(stdout);
        resolve({
          title: json.title || "YouTube Video",
          duration: json.duration || 0,
          thumbnail: json.thumbnail || (json.thumbnails && json.thumbnails[0]?.url) || "",
          uploader: json.uploader || json.channel || "",
          webpage_url: json.webpage_url || url,
          width: json.width,
          height: json.height,
        });
      } catch (err: any) {
        reject(new Error(`Failed to parse yt-dlp output: ${err.message}`));
      }
    });
  });
}

/**
 * YouTube動画をダウンロード（MP4、解像度最大1080p）
 */
export async function downloadYoutubeVideo(
  url: string,
  outputDir: string,
  onProgress?: (msg: string) => void
): Promise<{ filePath: string; filename: string; metadata: VideoMetadata }> {
  const meta = await getYoutubeMetadata(url);
  const safeId = Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  const outTemplate = path.join(outputDir, `yt_${safeId}.%(ext)s`);

  return new Promise((resolve, reject) => {
    // 1080p以下のMP4形式でダウンロード（H.264 + AAC推奨）
    const args = [
      "-f",
      "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "-o",
      outTemplate,
      url,
    ];

    const proc = spawn(YTDLP_PATH, args);
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      const line = chunk.toString();
      if (onProgress) onProgress(line.trim());
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ダウンロードに失敗しました (code ${code}): ${stderr.slice(0, 300)}`));
      }
      const expectedFile = path.join(outputDir, `yt_${safeId}.mp4`);
      if (fs.existsSync(expectedFile)) {
        resolve({
          filePath: expectedFile,
          filename: `yt_${safeId}.mp4`,
          metadata: meta,
        });
      } else {
        // 拡張子がmkvなどの場合を検索
        const files = fs.readdirSync(outputDir).filter((f) => f.startsWith(`yt_${safeId}`));
        if (files.length > 0) {
          const found = path.join(outputDir, files[0]);
          resolve({
            filePath: found,
            filename: files[0],
            metadata: meta,
          });
        } else {
          reject(new Error("ダウンロードファイルが見つかりませんでした。"));
        }
      }
    });
  });
}

/**
 * 動画のトリミング（切り出し）
 */
export async function trimVideo(
  inputPath: string,
  outputPath: string,
  startSec = 0,
  durationSec?: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-ss", startSec.toString(), "-i", inputPath];
    if (durationSec && durationSec > 0) {
      args.push("-t", durationSec.toString());
    }
    // 再エンコードなし（高速コピー）または再エンコード
    args.push("-c", "copy", outputPath);

    const proc = spawn(FFMPEG_PATH, args);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`動画切り出しに失敗しました: ${stderr.slice(0, 300)}`));
      } else {
        resolve(outputPath);
      }
    });
  });
}

/**
 * 動画から音声をWAV形式で抽出（JIZURAのビート解析・タイミング同期用）
 */
export async function extractAudio(videoPath: string, outputWavPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, ["-y", "-i", videoPath, "-vn", "-acodec", "pcm_s16le", outputWavPath]);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`音声抽出に失敗しました: ${stderr.slice(0, 300)}`));
      } else {
        resolve(outputWavPath);
      }
    });
  });
}

export interface CompositeOptions {
  position?: "bottom" | "center" | "top";
  scale?: number;
  yOffset?: number;
}

/**
 * JIZURAの透過PNG連番ZIPを展開し、元動画の上にアルファ透過オーバーレイ合成
 */
export async function compositePngSequence(
  sourceVideoPath: string,
  pngZipPath: string,
  outputPath: string,
  fps = 24,
  options?: CompositeOptions
): Promise<string> {
  const extractDir = path.join(path.dirname(pngZipPath), `frames_${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    // 1. ZIP解凍
    await new Promise<void>((resolve, reject) => {
      const unzipProc = spawn("unzip", ["-q", "-o", pngZipPath, "-d", extractDir]);
      let stderr = "";
      unzipProc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      unzipProc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ZIP展開に失敗しました: ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    // 連番ファイルパターンの確認 (jizura_%05d.png)
    const files = fs.readdirSync(extractDir).filter((f) => f.endsWith(".png"));
    if (files.length === 0) {
      throw new Error("透過PNGフレームが見つかりませんでした。");
    }

    // 2. レイアウト・スケール計算
    const scaleVal = Math.max(0.3, Math.min(1.0, options?.scale ?? 1.0));
    const pos = options?.position ?? "center";
    const yOff = options?.yOffset ?? (pos === "bottom" ? 30 : pos === "top" ? 30 : 0);

    let filterComplex = "";
    if (scaleVal < 0.99 || pos !== "center" || yOff !== 0) {
      const scaledW = Math.round((1920 * scaleVal) / 2) * 2;
      const scaledH = Math.round((1080 * scaleVal) / 2) * 2;
      let overlayCoord = "(W-w)/2:(H-h)/2";
      if (pos === "bottom") {
        overlayCoord = `(W-w)/2:H-h-${yOff}`;
      } else if (pos === "top") {
        overlayCoord = `(W-w)/2:${yOff}`;
      } else {
        overlayCoord = `(W-w)/2:(H-h)/2+${yOff}`;
      }
      filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[bg];[1:v]scale=${scaledW}:${scaledH}[fg];[bg][fg]overlay=${overlayCoord}:shortest=1[outv]`;
    } else {
      filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[bg];[bg][1:v]overlay=0:0:shortest=1[outv]`;
    }

    // 3. FFmpegで完全透過オーバーレイ合成
    return await new Promise<string>((resolve, reject) => {
      const inputPattern = path.join(extractDir, "jizura_%05d.png");
      const args = [
        "-y",
        "-i",
        sourceVideoPath,
        "-framerate",
        fps.toString(),
        "-i",
        inputPattern,
        "-filter_complex",
        filterComplex,
        "-map",
        "[outv]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        outputPath,
      ];

      const proc = spawn(FFMPEG_PATH, args);
      let stderr = "";
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`透過オーバーレイ合成に失敗しました: ${stderr.slice(-600)}`));
        } else {
          resolve(outputPath);
        }
      });
    });
  } finally {
    // 一時フレームディレクトリを削除
    try {
      fs.rmSync(extractDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * 元動画とJIZURA生成タイポグラフィ動画をffmpegで高画質合成
 */
export async function compositeVideos(
  sourceVideoPath: string,
  overlayVideoPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // JIZURAの黒背景タイポグラフィをcolorkeyで透過し、元動画の上にオーバーレイ合成
    const args = [
      "-y",
      "-i",
      sourceVideoPath,
      "-i",
      overlayVideoPath,
      "-filter_complex",
      "[1:v]colorkey=0x000000:0.15:0.1[typo];[0:v][typo]overlay=0:0:shortest=1[outv]",
      "-map",
      "[outv]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    ];

    const proc = spawn(FFMPEG_PATH, args);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`合成処理に失敗しました: ${stderr.slice(0, 400)}`));
      } else {
        resolve(outputPath);
      }
    });
  });
}
