import type { Env } from "../types";
import { bodyJson, error, json } from "../http";
import { audit } from "../services/db";
import { getSession, requireCsrf } from "../services/security";
import { validUrl } from "../services/validation";

const profileFields = ["display_name","title","brand_name","bio","city","industry","phone","address","email","opening_copy","call_to_action"] as const;
const urlFields = ["map_url","booking_url"] as const;
const socialFields = ["facebook_url","line_url","instagram_url","website_url","threads_url","youtube_url"] as const;

export async function profilePatchSafe(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env, "dealer");
  if (!session || !requireCsrf(request, session)) return error("未登入或安全驗證失敗", 403);
  const body = await bodyJson(request), statements: D1PreparedStatement[] = [];
  if (profileFields.some((key) => Object.hasOwn(body, key)) || urlFields.some((key) => Object.hasOwn(body, key))) {
    const current = await env.DB.prepare("SELECT * FROM dealer_profiles WHERE dealer_id=?").bind(session.actor_id).first<Record<string, unknown>>();
    if (!current) return error("找不到經銷商資料", 404);
    const values = profileFields.map((key) => String(Object.hasOwn(body, key) ? body[key] : current[key] ?? "").trim().slice(0, ["bio","opening_copy"].includes(key) ? 2000 : 300));
    const urls = urlFields.map((key) => Object.hasOwn(body, key) ? validUrl(body[key]) : String(current[key] ?? ""));
    const visibility = body.field_visibility && typeof body.field_visibility === "object" ? JSON.stringify(body.field_visibility) : String(current.field_visibility ?? "{}");
    statements.push(env.DB.prepare(`UPDATE dealer_profiles SET ${profileFields.map(k=>`${k}=?`).join(",")},map_url=?,booking_url=?,field_visibility=?,draft_json=?,updated_at=CURRENT_TIMESTAMP WHERE dealer_id=?`).bind(...values,...urls,visibility,JSON.stringify(body),session.actor_id));
  }
  if (socialFields.some((key) => Object.hasOwn(body, key)) || body.link_visibility) {
    const current = await env.DB.prepare("SELECT * FROM dealer_social_links WHERE dealer_id=?").bind(session.actor_id).first<Record<string, unknown>>();
    if (!current) return error("找不到社群資料", 404);
    const values = socialFields.map((key) => Object.hasOwn(body,key) ? validUrl(body[key]) : String(current[key] ?? ""));
    const visibility = body.link_visibility && typeof body.link_visibility === "object" ? JSON.stringify(body.link_visibility) : String(current.link_visibility ?? "{}");
    statements.push(env.DB.prepare(`UPDATE dealer_social_links SET ${socialFields.map(k=>`${k}=?`).join(",")},link_visibility=?,updated_at=CURRENT_TIMESTAMP WHERE dealer_id=?`).bind(...values,visibility,session.actor_id));
  }
  if (!statements.length) return error("沒有可更新的欄位");
  await env.DB.batch(statements); await audit(env,"dealer",session.actor_id,"dealer.profile_saved","dealer",session.actor_id); return json({ok:true});
}
