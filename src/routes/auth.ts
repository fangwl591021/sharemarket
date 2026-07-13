import type { Env } from "../types";
import { bodyJson, error, json } from "../http";
import { clearSessionCookie, createSession, getSession, hashPassword, requireCsrf, verifyPassword } from "../services/security";
import { normalizePhone, strongPassword } from "../services/validation";
import { audit } from "../services/db";

type LoginRow = { id: string; password_hash: string; status: string; failed_login_count: number; locked_until: string | null; must_change_password?: number; expires_at?: string | null };

async function attemptLogin(env: Env, table: "dealers" | "admin_users", lookup: string, password: string): Promise<LoginRow | null> {
  const idCol = table === "dealers" ? "dealer_id" : "admin_id";
  const where = table === "dealers" ? "mobile_normalized=?" : "email=? COLLATE NOCASE";
  const extra = table === "dealers" ? ",must_change_password,expires_at" : "";
  const row = await env.DB.prepare(`SELECT ${idCol} id,password_hash,status,failed_login_count,locked_until${extra} FROM ${table} WHERE ${where}`).bind(lookup).first<LoginRow>();
  if (!row || row.status !== "active" || (row.expires_at && row.expires_at <= new Date().toISOString())) return null;
  if (row.locked_until && row.locked_until > new Date().toISOString()) throw new Error("登入暫時鎖定，請稍後再試");
  if (!(await verifyPassword(password, row.password_hash, env.PASSWORD_PEPPER))) {
    const failures = row.failed_login_count + 1;
    const locked = failures >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await env.DB.prepare(`UPDATE ${table} SET failed_login_count=?,locked_until=? WHERE ${idCol}=?`).bind(failures >= 5 ? 0 : failures, locked, row.id).run();
    return null;
  }
  await env.DB.prepare(`UPDATE ${table} SET failed_login_count=0,locked_until=NULL${table === "dealers" ? ",last_login_at=CURRENT_TIMESTAMP" : ""} WHERE ${idCol}=?`).bind(row.id).run();
  return row;
}

export async function dealerLogin(request: Request, env: Env): Promise<Response> {
  const body = await bodyJson(request); const phone = normalizePhone(body.phone); const password = String(body.password ?? "");
  const row = await attemptLogin(env, "dealers", phone, password);
  if (!row) return error("帳號或密碼錯誤", 401);
  const { session, cookie } = await createSession(env, "dealer", row.id);
  await audit(env, "dealer", row.id, "dealer.login");
  return json({ ok: true, csrf: session.csrf_token, redirect: "/dashboard", must_change_password: Boolean(row.must_change_password) }, 200, { "Set-Cookie": cookie });
}

export async function adminLogin(request: Request, env: Env): Promise<Response> {
  const body = await bodyJson(request); const email = String(body.email ?? "").trim().toLowerCase(); const password = String(body.password ?? "");
  const row = await attemptLogin(env, "admin_users", email, password);
  if (!row) return error("帳號或密碼錯誤", 401);
  const { session, cookie } = await createSession(env, "admin", row.id);
  await audit(env, "admin", row.id, "admin.login");
  return json({ ok: true, csrf: session.csrf_token, redirect: "/admin" }, 200, { "Set-Cookie": cookie });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (session && requireCsrf(request, session)) await env.DB.prepare("DELETE FROM sessions WHERE session_id=?").bind(session.session_id).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

export async function sessionInfo(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env); if (!session) return error("未登入", 401);
  return json({ actor_type: session.actor_type, actor_id: session.actor_id, csrf: session.csrf_token });
}

export async function changePassword(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env, "dealer"); if (!session) return error("未登入", 401);
  if (!requireCsrf(request, session)) return error("安全驗證失敗", 403);
  const body = await bodyJson(request), current = String(body.current_password ?? ""), next = String(body.new_password ?? "");
  if (!strongPassword(next)) return error("新密碼至少 10 碼，且需包含英文字母與數字");
  const row = await env.DB.prepare("SELECT password_hash FROM dealers WHERE dealer_id=?").bind(session.actor_id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current, row.password_hash, env.PASSWORD_PEPPER))) return error("目前密碼錯誤", 403);
  await env.DB.prepare("UPDATE dealers SET password_hash=?,must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE dealer_id=?").bind(await hashPassword(next, env.PASSWORD_PEPPER), session.actor_id).run();
  await audit(env, "dealer", session.actor_id, "dealer.password_changed");
  return json({ ok: true });
}
