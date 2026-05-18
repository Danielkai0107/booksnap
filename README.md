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

| Key                              | 預先填入 | 說明                                                      |
| -------------------------------- | :------: | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       |    ✅    | Supabase 專案 URL                                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  |    ✅    | Supabase anon key                                         |
| `SUPABASE_SERVICE_ROLE_KEY`      |    ✅    | Server-only，bypasses RLS                                 |
| `ANTHROPIC_API_KEY`              |    ❌    | 書封 OCR 辨識（Claude vision）                            |
| `GOOGLE_BOOKS_API_KEY`           |    ❌    | Google Books ISBN 查詢的 quota（沒給走匿名 1000/day）     |
| `BILLING_PROVIDER`               |    ✅    | `instant`（預設）：點擊即升級。改 `ecpay`/`jkopay` 接金流 |
| `NEXT_PUBLIC_SITE_URL`           | 上線建議 | 例如 `https://booksnaplib.com`；註冊／重設密碼信內連結用  |
| `NEXT_PUBLIC_BILLING_RETURN_URL` | 上線建議 | 例如 `https://booksnaplib.com/billing`（訂閱完成回跳）    |

## 計費（Billing）

商業模式很簡單：**核准後免費體驗 N 天（預設 30 天），到期後鎖定升級**。

- **方案只有一個**：Pro，月費 `NT$ 990`（可在 Super Admin → 方案設定線上改）。體驗天數可在 Super Admin → 營運設定改。
- **鎖定邏輯**集中在 [`lib/billing/lock.ts`](lib/billing/lock.ts) 的 `isOrgLocked(org, sub)`：付費中或體驗中 → 不鎖；體驗過期、從未付費、取消後 → 全鎖。
- **鎖時擋兩個入口**：新書入庫（首頁按鈕 + 手機 FAB + `/checkin` server redirect）、借閱連結 toggle / 分享按鈕。其他頁仍可預覽。
- **API 防呆**：`/api/recognize`、`/api/books` 在 lock 時回 `403 { error: "locked" }`，外層 UI 已先擋下，這層僅防呆。
- **訂閱管理頁** `/billing`：體驗中（倒數）／付費中（下個帳單日 + 取消）／已取消但期內（恢復）三狀態。
- **Super Admin** 控制：
  - 新單位註冊時自動寫入 `trial_ends_at`（用全域 `trial_days`）。
  - 單位列：「啟用付費」「取消付費（期末／立即）」「延長體驗 N 天」。
  - 「快速狀態切換」：一鍵把單位切成「剛核准的體驗 / Pro / 體驗已結束」三狀態，測試／支援用。
- **金流抽象**：[`lib/billing/gateway.ts`](lib/billing/gateway.ts) interface，所有 DB 變更走 [`lib/billing/apply.ts`](lib/billing/apply.ts) → `applyGatewayEvent`，instant 與真實 webhook 共用。

要接真實金流：

1. 在 [`lib/billing/`](lib/billing/) 新增 `ecpay.ts`（或 `jkopay.ts`），實作 `PaymentGateway`。
2. 在 [`lib/billing/index.ts`](lib/billing/index.ts) factory 加 `case`。
3. 將 `BILLING_PROVIDER` 環境變數改成新 provider。
4. UI／鎖定邏輯／API 防呆均不需修改。

## 頁面導覽

| 路徑                | 功能                                                      |
| ------------------- | --------------------------------------------------------- |
| `/`                 | 書籍列表 + 搜尋 + 下載 Excel（後台首頁）                  |
| `/checkin`          | 輸入管理員名稱                                            |
| `/checkin/scan`     | 相機拍照 + OCR 批次辨識書封                               |
| `/checkin/result`   | 結算頁：產生 `LIB-YYYYMMDD-NNN`、QR、條碼、列印標籤、送出 |
| `/borrowers`        | 出借人總覽                                                |
| `/categories`       | 分類管理                                                  |
| `/labels`           | 標籤列印                                                  |
| `/settings`         | 設定中心（使用紀錄、單位資料、訂閱管理、登出）            |
| `/settings/profile` | 單位資料（編輯單位名稱／聯絡資訊）                        |
| `/billing`          | 訂閱管理（體驗倒數／升級／取消／帳單記錄）                |
| `/public-link`      | 借還公開連結／QR                                          |

## API

| Method & Path                 | 功能                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| `POST /api/recognize`         | 呼叫 Anthropic Claude vision（`claude-sonnet-4-20250514`）辨識書封 |
| `POST /api/books`             | 批次上傳書封到 Storage bucket，並 insert 到 `books`                |
| `POST /api/return`            | 更新書籍為「已借出」並記錄書架與時間                               |
| `GET /api/export`             | 將 `books` 表匯出為 Excel（xlsx）                                  |
| `GET /api/me`                 | 當前 session 的 org / plan / subscription / locked / 體驗倒數      |
| `POST /api/billing/subscribe` | 訂閱 Pro（恆為 990 月費）；回傳 redirectUrl                        |
| `POST /api/billing/cancel`    | 到期取消                                                           |
| `POST /api/billing/resume`    | 期內恢復                                                           |
| `POST /api/billing/webhook`   | 金流商 webhook 入口（InstantGateway 不會收到）                     |

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
