# booksnap — 小型圖書館入庫管理系統

Next.js 14 (App Router) + Supabase + Anthropic Claude vision OCR。
支援批次拍照入庫、QR/條碼產生與列印、QR 掃描歸還、後台管理與 Excel 匯出。

## 快速開始

> Supabase 後端、資料表、預設書架、`book-covers` Storage bucket 已透過 MCP 預先建立並寫入 `.env.local`。

```bash
# 1. 安裝依賴（已執行）
npm install

# 2. 在 .env.local 補上 Anthropic API key（可選；不填則僅用 Tesseract 辨識）
#    ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

# 3. 啟動開發伺服器
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000) 即可使用。

## 環境變數（`.env.local`）

| Key                             | 預先填入 | 說明                           |
| ------------------------------- | :------: | ------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      |    ✅    | Supabase 專案 URL              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` |    ✅    | Supabase anon key              |
| `ANTHROPIC_API_KEY`             |    ❌    | 書封 OCR 辨識（Claude vision） |

## 頁面導覽

| 路徑              | 功能                                                      |
| ----------------- | --------------------------------------------------------- |
| `/`               | 首頁（入庫 / 歸還 / 後台入口）                            |
| `/checkin`        | 輸入管理員名稱                                            |
| `/checkin/scan`   | 相機拍照 + OCR 批次辨識書封                               |
| `/checkin/result` | 結算頁：產生 `LIB-YYYYMMDD-NNN`、QR、條碼、列印標籤、送出 |
| `/return`         | 兩階段 QR 掃描歸還（先書架、後書本）                      |
| `/admin`          | 書籍列表 + 搜尋 + 下載 Excel                              |

## API

| Method & Path         | 功能                                                               |
| --------------------- | ------------------------------------------------------------------ |
| `POST /api/recognize` | 呼叫 Anthropic Claude vision（`claude-sonnet-4-20250514`）辨識書封 |
| `POST /api/books`     | 批次上傳書封到 Storage bucket，並 insert 到 `books`                |
| `POST /api/return`    | 更新書籍為「已借出」並記錄書架與時間                               |
| `GET /api/export`     | 將 `books` 表匯出為 Excel（xlsx）                                  |

## Supabase 結構

兩張 table：

- `books` — 主資料表（PK `id`，唯一鍵 `book_id`）
- `shelves` — 書架字典表，預設四筆：`A1 / A2 / B1 / B2`

Storage bucket `book-covers`（public），上傳路徑 `{book_id}.jpg`。

> 目前 RLS 為 demo 用，全部 policy 開放讀寫。正式環境請改為 service role + 私有 bucket。

## 注意事項

- **HTTPS**：手機相機僅在 `https://` 或 `localhost` 環境下可用，部署到 Vercel 會自動 HTTPS。
- **OCR**：每次拍照都會送一張 base64 圖片到 `/api/recognize` 由 Claude 辨識，回傳書名 string，使用者可在送出前再次編輯。
- **列印標籤**：`/checkin/result` 的「列印標籤」按鈕透過 `window.print()`，CSS `@media print` 只顯示標籤卡。
- **書架 QR**：請自行用任何 QR 工具產生 `A1` / `A2` / `B1` / `B2` 字串的 QR Code 貼在實體書架上。
- **書本 QR**：在 `/checkin/result` 頁列印的標籤卡，QR 內容就是 `book_id`，可直接掃描歸還。

## 技術棧

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- `@supabase/supabase-js`
- Anthropic Claude vision（書封 OCR）
- `qrcode`、`jsbarcode`
- `@zxing/browser`（QR 掃描）
- `xlsx`（Excel 匯出）

## NPM scripts

```bash
npm run dev    # 開發伺服器
npm run build  # 產生 production build
npm run start  # 跑 production server
npm run lint   # ESLint 檢查
```

# booksnap
