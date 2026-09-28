import * as tools from "./src/tools.js";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  const headless = process.argv.includes("--headless");
  try {
    console.log(`=== 1. ブラウザ起動 (headless: ${headless}) ===`);
    const openRes = await tools.open(headless);
    console.log("jizura_open:", openRes);

    console.log("\n=== 2. コントロールの snapshot 取得 ===");
    const snapRes = await tools.snapshot();
    console.log("Total controls found:", snapRes.controls.length);
    const checkboxes = snapRes.controls.filter(c => c.role === "checkbox");
    const textboxes = snapRes.controls.filter(c => c.role === "textbox");
    const buttons = snapRes.controls.filter(c => c.role === "button");
    console.log("Checkboxes:", checkboxes);
    console.log("Textboxes:", textboxes);
    console.log("Buttons sample:", buttons.map(b => b.name).slice(0, 15));

    console.log("\n=== 3. 歌詞の設定 (jizura_set_lyrics) ===");
    const lyrics = "夜明けの色を/覚えてる\nほどけた声が遠くで鳴った\n*透明なままじゃ終われない!*";
    const lyricRes = await tools.setLyrics(lyrics);
    console.log("jizura_set_lyrics:", lyricRes);

    console.log("\n=== 4. 入力欄への入力 (jizura_fill) ===");
    // 曲名やアーティスト欄を探して入力
    const fillTitle = await tools.fill("曲名", "テストソング");
    console.log("fill 曲名:", fillTitle);
    const fillArtist = await tools.fill("アーティスト", "AI Artist");
    console.log("fill アーティスト:", fillArtist);

    console.log("\n=== 5. チェックボックスの操作 (jizura_set_checkbox) ===");
    console.log("アイテム枠表示を OFF に設定...");
    const checkRes = await tools.setCheckbox("アイテム枠表示", false);
    console.log("setCheckbox:", checkRes);

    console.log("\n=== 6. ボタンクリックの操作 (jizura_click) ===");
    console.log("「おまかせで作る」をクリック...");
    const clickRes = await tools.click("おまかせで作る");
    console.log("click:", clickRes);

    // 画面の変化を待機
    await new Promise(r => setTimeout(r, 1000));

    console.log("\n=== 7. スクリーンショットの取得 (jizura_screenshot) ===");
    const ss = await tools.screenshot();
    const workDir = path.resolve("./work");
    if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });
    const ssPath = path.join(workDir, "preview_verified.png");
    fs.writeFileSync(ssPath, Buffer.from(ss.base64, "base64"));
    console.log("Screenshot saved to:", ssPath);

    console.log("\n=== 全操作確認完了 ===");
  } finally {
    await tools.close();
    console.log("ブラウザを終了しました。");
  }
}

main().catch(console.error);
