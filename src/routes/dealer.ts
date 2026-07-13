import type { Env } from "../types";
import { bodyJson, error, json } from "../http";
import { audit } from "../services/db";
import { getSession, requireCsrf } from "../services/security";
import { validUrl } from "../services/validation";

const profileFields = ["display_name","title","brand_name","bio","city","industry","phone","address","email","opening_copy","call_to_action"] as const;
const urlFields = ["map_url","booking_url"] as const;
const socialFields = ["facebook_url","line_url","instagram_url","website_url","threads_url","youtube_url"] as const;

async function dealerSession(request: Request, env: Env, csrf = false) {
  const session = await getSession(request, env, "dealer");
  if (!session || (csrf && !requireCsrf(request, session))) return null;
  return session;
}

export async function profileGet(request: Request, env: Env): Promise<Response> {
  const session = await dealerSession(request, env); if (!session) return error("未登入", 401);
  const dealer = await env.DB.prepare("SELECT slug,must_change_password,status FROM dealers WHERE dealer_id=?").bind(session.actor_id).first<{slug:string;must_change_password:number;status:string}>();
  if (!dealer || dealer.status !== "active") return error("帳號已停用", 403);
  const profile = await env.DB.prepare("SELECT * FROM dealer_profiles WHERE dealer_id=?").bind(session.actor_id).first();
  const socials = await env.DB.prepare("SELECT * FROM dealer_social_links WHERE dealer_id=?").bind(session.actor_id).first();
  return json({ slug: dealer.slug, must_change_password: Boolean(dealer.must_change_password), csrf: session.csrf_token, profile, socials });
}

export async function profilePatch(request: Request, env: Env): Promise<Response> {
  const session = await dealerSession(request, env, true); if (!session) return error("未登入或安全驗證失敗", 403);
  const body = await bodyJson(request);
  const values = profileFields.map((key) => String(body[key] ?? "").trim().slice(0, key === "bio" || key === "opening_copy" ? 2000 : 300));
  const urls = urlFields.map((key) => validUrl(body[key]));
  const visibility = JSON.stringify(body.field_visibility && typeof body.field_visibility === "object" ? body.field_visibility : {});
  await env.DB.prepare(`UPDATE dealer_profiles SET ${profileFields.map(k=>`${k}=?`).join(",")},map_url=?,booking_url=?,field_visibility=?,draft_json=?,updated_at=CURRENT_TIMESTAMP WHERE dealer_id=?`)
    .bind(...values, ...urls, visibility, JSON.stringify(body), session.actor_id).run();
  const socialValues = socialFields.map((key) => validUrl(body[key]));
  if (socialValues.some(Boolean) || body.link_visibility) {
    await env.DB.prepare(`UPDATE dealer_social_links SET ${socialFields.map(k=>`${k}=?`).join(",")},link_visibility=?,updated_at=CURRENT_TIMESTAMP WHERE dealer_id=?`)
      .bind(...socialValues, JSON.stringify(body.link_visibility && typeof body.link_visibility === "object" ? body.link_visibility : {}), session.actor_id).run();
  }
  await audit(env, "dealer", session.actor_id, "dealer.profile_saved", "dealer", session.actor_id);
  return json({ ok: true });
}

export async function publish(request: Request, env: Env): Promise<Response> {
  const session = await dealerSession(request, env, true); if (!session) return error("未登入或安全驗證失敗", 403);
  const row = await env.DB.prepare("SELECT display_name FROM dealer_profiles WHERE dealer_id=?").bind(session.actor_id).first<{ display_name: string }>();
  if (!row?.display_name) return error("發布前請先填寫顯示姓名");
  await env.DB.prepare("UPDATE dealer_profiles SET published_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE dealer_id=?").bind(session.actor_id).run();
  await audit(env, "dealer", session.actor_id, "dealer.site_published", "dealer", session.actor_id);
  return json({ ok: true });
}

export async function uploadPhoto(request: Request, env: Env): Promise<Response> {
  const session = await dealerSession(request, env, true); if (!session) return error("未登入或安全驗證失敗", 403);
  const form = await request.formData(), file = form.get("photo");
  if (!(file instanceof File)) return error("找不到照片");
  if (!new Set(["image/jpeg","image/png","image/webp"]).has(file.type) || file.size > 5_000_000) return error("僅支援 5MB 以下 JPG、PNG、WebP");
  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const key = `dealers/${session.actor_id}/profile-${crypto.randomUUID()}.${ext}`;
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { dealer_id: session.actor_id } });
  const old = await env.DB.prepare("SELECT photo_key FROM dealer_profiles WHERE dealer_id=?").bind(session.actor_id).first<{photo_key:string|null}>();
  await env.DB.prepare("UPDATE dealer_profiles SET photo_key=?,updated_at=CURRENT_TIMESTAMP WHERE dealer_id=?").bind(key, session.actor_id).run();
  if (old?.photo_key) await env.MEDIA.delete(old.photo_key);
  await audit(env, "dealer", session.actor_id, "dealer.photo_uploaded", "dealer", session.actor_id);
  return json({ ok: true, url: `/media/${key}` });
}
