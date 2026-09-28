import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export const JIZURA_URL = "https://hirazisora.github.io/JIZURA/";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

/**
 * 既存セッションがあれば再利用し、なければ新規にブラウザを起動してJIZURAを開く。
 * headless: falseにすると実際の画面を見ながら操作できる（初回の選択子調整時に推奨）。
 */
export async function getPage(headless = false): Promise<Page> {
  if (page && !page.isClosed()) return page;

  browser = await chromium.launch({ headless });
  context = await browser.newContext({
    // 出力ファイルのダウンロードを受け取れるようにする
    acceptDownloads: true,
  });
  await context.addInitScript("globalThis.__name = (fn, name) => fn;");
  page = await context.newPage();
  page.on("console", (msg) => console.log("[JIZURA CONSOLE]", msg.text()));
  page.on("pageerror", (err) => console.error("[JIZURA ERROR]", err));
  await page.goto(JIZURA_URL, { waitUntil: "networkidle" });
  return page;
}

export function getContext(): BrowserContext {
  if (!context) throw new Error("ブラウザが開始されていません。先に jizura_open を呼んでください。");
  return context;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
  context = null;
  page = null;
}
