# 共享會員市場｜多經銷商官網 MVP

單一 Cloudflare Worker、單一 D1 資料庫的多租戶官網平台。每位經銷商使用 `/:slug` 公開頁面，共用總公司市場理念，但只能修改自己的個人資料與聯絡方式。

## 介面與 API

- `/`：總公司公開官網
- `/:slug`：經銷商公開手機官網
- `/register`：經銷商申請
- `/login`、`/dashboard`：經銷商登入與手機後台
- `/admin/login`、`/admin`：總管理後台
- `/api/*`：角色與 `dealer_id` 隔離的 JSON API
- `/media/*`：R2 個人照片

MVP 包含申請審核、帳號啟停與到期日、推薦人、網址代碼與歷史轉址資料、PBKDF2 密碼、首次登入強制改密碼、HttpOnly Session、CSRF、登入失敗鎖定、個人內容草稿／預覽／發布、欄位公開開關、統一內容與 FAQ、最近 10 版內容、稽核紀錄與匿名點擊事件。

## 本機啟動

需要 Node.js 20+。

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
# 編輯 .dev.vars，設定一個長且隨機的 SETUP_TOKEN
npm run db:migrate
npm run dev
```

Wrangler 本機 D1 與 R2 存在 `.wrangler/state`，不會連到正式資料。開啟 `http://localhost:8787`。

## 初始化 Admin

正式與本機都不會寫死帳密。先把 `SETUP_TOKEN` 存成 Worker secret，再只執行一次初始化 API：

```powershell
npx wrangler secret put SETUP_TOKEN
```

初始化要求 `X-Setup-Token` header，body 為：

```json
{
  "email": "admin@example.com",
  "display_name": "平台管理員",
  "password": "至少12碼並包含英文與數字"
}
```

成功後第二次呼叫會回傳 `409 Admin 已初始化`。不要把 token、實際 Email 或密碼提交到 Git。

## Cloudflare 資源設定

1. 建立 D1：`npx wrangler d1 create sharemarket-db`。
2. 將回傳的 `database_id` 填入 `wrangler.jsonc`；staging 與 production 建議各自使用獨立 D1。
3. 建立 R2：`npx wrangler r2 bucket create sharemarket-media`。
4. 建立 Turnstile widget，將 site key 放入環境 `vars.TURNSTILE_SITE_KEY`。
5. `npx wrangler secret put TURNSTILE_SECRET_KEY --env staging`（production 同理）。
6. `npx wrangler secret put SETUP_TOKEN --env staging`（production 同理）。
7. 遠端 migration：`npx wrangler d1 migrations apply DB --env staging --remote`。

Turnstile 在 `ENVIRONMENT=development` 且沒有 secret 時可略過，staging／production 未設定 secret 會拒絕註冊。Turnstile client token 一律由 Worker 呼叫 Siteverify 驗證。

## 測試與驗證

```powershell
npm run typecheck
npm test
npx wrangler deploy --dry-run
npm run check
```

人工 MVP 驗證順序：

1. 執行 local migration 並啟動 Worker。
2. 用 setup API 建立 Admin，登入 `/admin/login`。
3. 從 `/register` 送出申請，確認狀態為 `pending`。
4. Admin 核准，確認 D1 同時建立 `dealers`、`dealer_profiles`、`dealer_social_links`。
5. 使用電話＋生日 `YYYYMMDD` 登入，確認先導向帳號設定並強制改密碼。
6. 儲存個人資料與公開開關，發布後檢查 `/:slug`。
7. 以另一位經銷商 session 呼叫第一位的資料；API 不接受 client 傳入的 `dealer_id`，只使用 session actor ID。
8. Admin 停用帳號，確認登入與公開頁皆不可用。

## 部署安全

- `wrangler.jsonc` 只含非機密設定；secrets 使用 `wrangler secret put`。
- 先部署 staging，完成 migration 與驗收後才可部署 production。
- 本專案不會自動執行正式 deploy。
- Session Cookie 使用 `Secure; HttpOnly; SameSite=Lax`；變更 API 另檢查 CSRF token。
- 頁面事件只保存 `dealer_id`、`slug`、事件種類與時間，不保存 IP、電話或瀏覽內容。

## 已刻意延後

簡訊 OTP、多層組織獎金、購物金交易、自訂網域、AI 文案、自由拖曳編輯器不在第一版範圍。
