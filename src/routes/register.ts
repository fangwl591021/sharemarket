import type { Env } from "../types";
import { bodyJson, error, json } from "../http";
import { normalizePhone, validSlug, validTaiwanMobile } from "../services/validation";

async function verifyTurnstile(env: Env, token: string, request: Request): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return env.ENVIRONMENT === "development";
  if (!token) return false;
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: request.headers.get("CF-Connecting-IP") }) });
  return Boolean((await result.json<{ success: boolean }>()).success);
}

export async function register(request: Request, env: Env): Promise<Response> {
  const b = await bodyJson(request), phone = normalizePhone(b.mobile), slug = String(b.desired_slug ?? "").trim().toLowerCase();
  if (!b.consent) return error("必須同意個資與使用條款");
  if (!validTaiwanMobile(phone)) return error("請輸入正確的台灣行動電話");
  if (!validSlug(slug)) return error("網址代碼格式不正確或為保留字");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.birth_date ?? ""))) return error("出生年月日格式不正確");
  for (const key of ["real_name","line_name","city","industry"]) if (!String(b[key] ?? "").trim()) return error("請填寫所有必填欄位");
  if (!(await verifyTurnstile(env, String(b.turnstile_token ?? ""), request))) return error("機器人驗證失敗", 403);
  const exists = await env.DB.prepare("SELECT 1 found FROM dealers WHERE slug=? OR mobile_normalized=? UNION SELECT 1 FROM dealer_applications WHERE (desired_slug=? OR mobile_normalized=?) AND status IN ('pending','approved') LIMIT 1").bind(slug, phone, slug, phone).first();
  if (exists) return error("此行動電話或網址代碼已被使用", 409);
  await env.DB.prepare("INSERT INTO dealer_applications(application_id,real_name,mobile_normalized,birth_date,email,line_name,city,industry,referrer_code,desired_slug,privacy_consent_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), String(b.real_name).trim(), phone, String(b.birth_date), String(b.email ?? "").trim() || null, String(b.line_name).trim(), String(b.city).trim(), String(b.industry).trim(), String(b.referrer_code ?? "").trim().toLowerCase() || null, slug, new Date().toISOString()).run();
  return json({ ok: true }, 201);
}
