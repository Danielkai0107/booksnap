# Supabase 驗證信模板（繁中）

程式觸發的信件類型與 Dashboard 模板對照：

| 流程 | API | Dashboard 模板 | 主旨建議（含驗證碼，通知預覽較清楚） |
|------|-----|----------------|----------------------------------|
| **登入**（密碼通過後） | `signInWithOtp` | **Magic Link** | `booksnap 登入驗證碼 {{ .Token }}` |
| 註冊 | `signUp` | **Confirm signup** | `booksnap 註冊驗證碼 {{ .Token }}` |
| 忘記密碼 | `resetPasswordForEmail` | **Reset Password** | `booksnap 重設密碼 {{ .Token }}` |

內文第一行皆為 `驗證碼 {{ .Token }}`，方便手機通知預覽與長按複製。

## 如何套用

1. [Supabase Dashboard](https://supabase.com/dashboard) → 專案 → **Authentication** → **Email Templates**
2. 選上表對應的模板名稱
3. **Subject** 貼上建議主旨
4. **Body** 貼上本資料夾內對應的 `.html` 全文
5. Save

登入改為 Email OTP 後，若只更新「註冊／重設密碼」模板、**未更新 Magic Link**，登入信仍會是 Supabase 預設英文內容。

## 變數

- `{{ .Token }}` — 數字驗證碼（長度依 Authentication → Email → OTP length）
- `{{ .ConfirmationURL }}` — 點擊連結（註冊／重設密碼用；登入信以驗證碼為主即可）
- `{{ .Email }}` — 收件人 Email

## 多裝置登入與寄信頻率

- **多裝置**：應用程式登入流程不會再對「全部裝置」執行 `signOut`；密碼僅在無 cookie 的客戶端驗證，不影響已登入的平板／手機。
- **登入驗證信間隔**：前端已移除 60 秒重寄倒數。若仍出現「操作太頻繁」，請到 **Authentication → Rate Limits** 調高 Email OTP／Magic Link 寄送上限（或縮短 `email_sent` 間隔）。

## Redirect URLs

**Authentication → URL Configuration → Redirect URLs** 須包含：

- `https://你的網域/auth/callback`（重設密碼連結）
- 本機開發：`http://localhost:3000/auth/callback`
