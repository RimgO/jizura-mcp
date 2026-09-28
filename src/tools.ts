import type { Page } from "playwright";
import { getPage, closeBrowser as _closeBrowser } from "./browser.js";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * このファイルは「JIZURAのDOM構造を細かく知らなくても操作できる」ことを狙った
 * 汎用ヘルパー群です。JIZURAは公開ページの見た目のテキスト（ボタン名・チェック
 * ボックスのラベルなど）から機能を探す設計になっているため、Playwrightの
 * アクセシブルロール検索（getByRole / getByLabel / getByText）を軸にしています。
 *
 * 初回実行時にラベル文言が一致せず失敗する場合は jizura_snapshot で実際の
 * コントロール一覧を取得し、name引数を微調整してください。
 */

export async function open(headless = false) {
  await getPage(headless);
  return { ok: true, message: "JIZURAを開きました。" };
}

export async function close() {
  await _closeBrowser();
  return { ok: true, message: "ブラウザを閉じました。" };
}

/** 画面上のボタン・チェックボックス・テキスト入力・見出しなど、操作可能な要素の一覧を返す */
export async function snapshot(limit = 400) {
  const page = await getPage();
  const items = await page.evaluate((limit) => {
    const out: { role: string; name: string; checked?: boolean; value?: string }[] = [];
    const push = (role: string, name: string, extra: Partial<{ checked: boolean; value: string }> = {}) => {
      if (name && name.trim()) out.push({ role, name: name.trim(), ...extra });
    };

    // テキストエリア（歌詞等）
    document.querySelectorAll("textarea").forEach((el, i) => {
      const ta = el as HTMLTextAreaElement;
      const label =
        ta.getAttribute("placeholder") ||
        ta.getAttribute("aria-label") ||
        ta.closest("label")?.textContent ||
        `textarea#${i}`;
      push("textarea", label, { value: ta.value.slice(0, 80) });
    });

    // テキスト入力
    document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])').forEach((el) => {
      const input = el as HTMLInputElement;
      const label =
        input.getAttribute("placeholder") ||
        input.getAttribute("aria-label") ||
        input.closest("label")?.textContent ||
        "";
      push("textbox", label, { value: input.value });
    });

    // ボタン（重複を除いて見通しを良くする）
    const seenButtons = new Set<string>();
    document.querySelectorAll("button").forEach((el) => {
      const name = (el.textContent || "").trim();
      if (name && !seenButtons.has(name)) {
        seenButtons.add(name);
        push("button", name);
      }
    });

    // セレクト
    document.querySelectorAll("select").forEach((el) => {
      const sel = el as HTMLSelectElement;
      push("select", sel.getAttribute("aria-label") || sel.closest("label")?.textContent || "", {
        value: sel.value,
      });
    });

    // ラジオボタン
    document.querySelectorAll('input[type="radio"]').forEach((el) => {
      const input = el as HTMLInputElement;
      const label = input.closest("label")?.textContent || input.getAttribute("aria-label") || "";
      push("radio", label, { checked: input.checked });
    });

    // チェックボックス
    document.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      const input = el as HTMLInputElement;
      const label =
        input.closest("label")?.textContent ||
        document.querySelector(`label[for="${input.id}"]`)?.textContent ||
        input.getAttribute("aria-label") ||
        "";
      push("checkbox", label, { checked: input.checked });
    });

    return out.slice(0, limit);
  }, limit);
  return { ok: true, controls: items };
}

/** 表示テキストでボタン等をクリックする。exact指定がなければ部分一致優先。 */
export async function click(name: string, exact = false) {
  const page = await getPage();
  const byRole = page.getByRole("button", { name, exact });
  if (await byRole.count()) {
    await byRole.first().click();
    return { ok: true, clicked: name };
  }
  const byText = page.getByText(name, { exact });
  if (await byText.count()) {
    await byText.first().click();
    return { ok: true, clicked: name };
  }
  throw new Error(`「${name}」に一致する要素が見つかりませんでした。jizura_snapshot で候補を確認してください。`);
}

/** チェックボックス／トグルをラベル名で指定のON/OFFにする */
export async function setCheckbox(name: string, checked: boolean) {
  const page = await getPage();
  const box = page.getByLabel(name, { exact: false });
  if (await box.count()) {
    const el = box.first();
    const isChecked = await el.isChecked().catch(() => null);
    if (isChecked === null || isChecked !== checked) {
      await el.setChecked(checked).catch(async () => {
        // ラベルがinputを内包しない構造の場合はクリックでトグル
        await el.click();
      });
    }
    return { ok: true, name, checked };
  }
  // ラベルテキストに近い要素をクリックしてトグルするフォールバック
  const textEl = page.getByText(name, { exact: false });
  if (await textEl.count()) {
    await textEl.first().click();
    return { ok: true, name, checked, note: "テキストクリックでトグルしました（状態は未検証）" };
  }
  throw new Error(`チェックボックス「${name}」が見つかりませんでした。`);
}

/** テキストエリア／入力欄にラベル・placeholderで検索して値を入れる */
export async function fill(name: string, value: string) {
  const page = await getPage();
  const byLabel = page.getByLabel(name, { exact: false });
  if (await byLabel.count()) {
    await byLabel.first().fill(value);
    return { ok: true, name };
  }
  const byPlaceholder = page.getByPlaceholder(name, { exact: false });
  if (await byPlaceholder.count()) {
    await byPlaceholder.first().fill(value);
    return { ok: true, name };
  }
  throw new Error(`入力欄「${name}」が見つかりませんでした。jizura_snapshot で確認してください。`);
}

/**
 * 歌詞テキストエリア（最初の大きなtextarea）に、JIZURA記法済みの歌詞を流し込む。
 * 記法はツール説明（index.ts側）を参照。
 */
export async function setLyrics(text: string) {
  const page = await getPage();
  const areas = page.locator("textarea");
  const count = await areas.count();
  if (count === 0) throw new Error("歌詞用のtextareaが見つかりませんでした。");
  // 最も文字数上限が大きい（=主要な歌詞入力欄である可能性が高い）textareaを選ぶ
  let bestIndex = 0;
  let bestLen = -1;
  for (let i = 0; i < count; i++) {
    const box = areas.nth(i);
    const box2: number = await box.evaluate((el: HTMLTextAreaElement) => el.clientHeight * el.clientWidth);
    if (box2 > bestLen) {
      bestLen = box2;
      bestIndex = i;
    }
  }
  await areas.nth(bestIndex).fill(text);
  return { ok: true, textareaIndex: bestIndex };
}

/** 「曲を読み込む」等のファイル選択ボタンを押し、ローカルファイルを割り当てる */
export async function loadFile(buttonName: string, filePath: string, asBackground = true) {
  const page = await getPage();
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) throw new Error(`ファイルが見つかりません: ${absolute}`);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    click(buttonName),
  ]);
  await chooser.setFiles(absolute);

  // 音声・動画インポートダイアログ（#audioImportDialog）が表示された場合の処理
  await page.waitForTimeout(600);
  const dialog = page.locator("#audioImportDialog");
  if (await dialog.count()) {
    const isVisible = await dialog.evaluate((d: HTMLDialogElement) => d.open).catch(() => false);
    if (isVisible) {
      if (asBackground) {
        // 「背景としても取り込む」チェックボックスをONに
        const checkboxes = dialog.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        if (count >= 2) {
          await checkboxes.nth(1).check().catch(() => {});
        }
      }
      const confirmBtn = dialog.locator('button:has-text("読み込む")');
      if (await confirmBtn.count()) {
        await confirmBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  }

  return { ok: true, buttonName, file: absolute };
}

/** 現在のプレビュー画面をPNGスクリーンショットとして返す（base64） */
export async function screenshot(): Promise<{ ok: true; base64: string }> {
  const page = await getPage();
  const buf = await page.screenshot({ type: "png" });
  return { ok: true, base64: buf.toString("base64") };
}

/**
 * 書き出しボタンを押してダウンロードを待ち、指定パスに保存する。
 * buttonName例: "MP4 を書き出す" / "連番PNG（ZIP）" / "透過PNG（ZIP・背景なし）"
 */
export async function exportOutput(buttonName: string, savePath: string) {
  const page = await getPage();
  const absolute = path.resolve(savePath);

  const isTransparentPng = buttonName.includes("透過PNG") || buttonName.includes("pnga");

  // 1. 書き出しメニューボタンを確実にクリック
  if (isTransparentPng) {
    await page.evaluate(() => {
      const btn = (document.querySelector("#menuPNGA") ||
        document.querySelector('[data-export-dialog="pnga"]')) as HTMLElement;
      if (btn) btn.click();
      else {
        const anyBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent?.includes("透過PNG")
        );
        anyBtn?.click();
      }
    });
  } else {
    // MP4書き出し
    await page.evaluate(() => {
      const btn = (document.querySelector("#menuMP4") ||
        document.querySelector('[data-export-dialog="mp4"]')) as HTMLElement;
      if (btn) btn.click();
      else {
        const anyBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent?.includes("MP4 を書き出す")
        );
        anyBtn?.click();
      }
    });
  }

  // 2. 出力ダイアログ（#exportDlg）が開くのを待機
  try {
    await page.waitForSelector("#exportDlg[open]", { timeout: 4000 });
  } catch {
    // ダイアログが開かない場合はそのまま進む
  }

  const exportDlg = page.locator("#exportDlg");
  const isDlgOpen = await exportDlg.evaluate((d: HTMLDialogElement) => d.open).catch(() => false);

  const downloadPromise = page.waitForEvent("download", { timeout: 5 * 60 * 1000 });

  if (isDlgOpen) {
    if (isTransparentPng) {
      await page.evaluate(() => {
        const btn = (document.querySelector("#btnPNGA") ||
          document.querySelector('#exportDlg button[value="pnga"]') ||
          document.querySelector('#exportDlg button.primary')) as HTMLElement;
        btn?.click();
      });
    } else {
      await page.evaluate(() => {
        const btn = (document.querySelector("#btnMP4") ||
          document.querySelector("#eMP4") ||
          document.querySelector('#exportDlg button[value="mp4"]') ||
          document.querySelector('#exportDlg button.primary')) as HTMLElement;
        btn?.click();
      });
    }
  }

  const download = await downloadPromise;
  await download.saveAs(absolute);
  return { ok: true, savedTo: absolute };
}
