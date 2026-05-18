#!/usr/bin/env node
/**
 * 一次性下載 OpenCV.js 與 jscanify.min.js 到 public/vendor/jscanify/。
 *
 * 為什麼自架而不 npm i jscanify：
 *   - jscanify 1.4.x 把 canvas + jsdom 列為一般 deps（Node-only），
 *     在 Next.js client build 上會炸（canvas 還要原生編譯）。
 *   - OpenCV.js ~8.6 MB 也不適合進 JS bundle，當靜態資源讓瀏覽器
 *     獨立快取效率最高。
 *
 * 為什麼自架而不 CDN：
 *   - 同 origin 沒有 DNS / TLS / 區域封鎖風險，是「最穩定」的選擇。
 *   - 一次下載寫死版號，未來不會被 CDN 切換版本搞掛。
 *
 * 由 predev / prebuild 自動觸發；檔案存在就 skip，不會拖慢冷啟動。
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = resolve(__dirname, "..", "public", "vendor", "jscanify");

const ASSETS = [
  {
    name: "opencv.js",
    url: "https://docs.opencv.org/4.7.0/opencv.js",
    minBytes: 1_000_000,
  },
  {
    // 從 jsdelivr 的 npm mirror 拿；以前 wiki 給的 gh/ColonelParrot 路徑
    // 在 jsdelivr 上已 404（repo 改隸 puffinsoft），npm@1.4.2 才是穩定 tag。
    name: "jscanify.min.js",
    url: "https://cdn.jsdelivr.net/npm/jscanify@1.4.2/src/jscanify.min.js",
    minBytes: 1_500,
  },
];

async function fileExists(path, minBytes) {
  try {
    const s = await stat(path);
    return s.isFile() && s.size >= minBytes;
  } catch {
    return false;
  }
}

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function main() {
  await mkdir(VENDOR_DIR, { recursive: true });
  let downloaded = 0;
  for (const { name, url, minBytes } of ASSETS) {
    const out = resolve(VENDOR_DIR, name);
    if (await fileExists(out, minBytes)) {
      continue;
    }
    process.stdout.write(`[fetch-jscanify] downloading ${name}… `);
    try {
      const buf = await download(url);
      if (buf.length < minBytes) {
        throw new Error(
          `unexpected size ${buf.length} bytes (< ${minBytes})`,
        );
      }
      await writeFile(out, buf);
      downloaded += 1;
      process.stdout.write(`${(buf.length / 1024 / 1024).toFixed(2)} MB\n`);
    } catch (err) {
      process.stdout.write("FAILED\n");
      console.error(`[fetch-jscanify] ${name} failed:`, err);
      process.exitCode = 1;
      return;
    }
  }
  if (downloaded === 0) {
    console.log("[fetch-jscanify] all assets already present, skipping");
  } else {
    console.log(`[fetch-jscanify] wrote ${downloaded} file(s) to ${VENDOR_DIR}`);
  }
}

main().catch((err) => {
  console.error("[fetch-jscanify] fatal:", err);
  process.exitCode = 1;
});
