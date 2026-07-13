import type { Env, SiteContent } from "../types";
import { bodyJson, error, json } from "../http";
import { audit, getFaqs, getSiteContent } from "../services/db";
import { getSession, hashPassword, requireCsrf, secureEqual } from "../services/security";
import { validSlug } from "../services/validation";

async function adminSession(request: Request, env: Env, csrf = false) {
  const session = await getSession(request, env, "admin");
  if (!session || (csrf && !requireCsrf(request, session))) return null;
  return session;
}

export async function setup(request: Request, env: Env): Promise<Response> {
  if (!env.SETUP_TOKEN || !secureEqual(request.headers.get("X-Setup-Token") ?? "", env.SETUP_TOKEN)) return error("禁止存取", 403);
  if (await env.DB.prepare("SELECT 1 found FROM admin_users LIMIT 1").first()) return error("Admin 已初始化", 409);
  const b = await bodyJson(request), email = String(b.email ?? "").trim().toLowerCase(), password = String(b.password ?? ""), name = String(b.display_name ?? "管理員").trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return error("請提供有效 Email，密碼至少 12 碼且包含英文與數字");
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO admin_users(admin_id,email,display_name,password_hash,role) VALUES(?,?,?,?, 'super_admin')").bind(id, email, name, await hashPassword(password, env.PASSWORD_PEPPER)).run();
  await audit(env, "admin", id, "admin.initialized", "admin", id);
  return json({ ok: true }, 201);
}

export async function dashboard(request: Request, env: Env): Promise<Response> {
  if (!(await adminSession(request, env))) return error("未登入", 401);
  const counts = await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active,SUM(CASE WHEN status!='active' THEN 1 ELSE 0 END) disabled FROM dealers").first<{total:number;active:number;disabled:number}>();
  const pending = await env.DB.prepare("SELECT COUNT(*) count FROM dealer_applications WHERE status='pending'").first<{count:number}>();
  const recent = (await env.DB.prepare("SELECT application_id,real_name,desired_slug,status,created_at FROM dealer_applications ORDER BY created_at DESC LIMIT 8").all()).results;
  return json({ total: counts?.total ?? 0, active: counts?.active ?? 0, disabled: counts?.disabled ?? 0, pending: pending?.count ?? 0, recent });
}

export async function applications(request: Request, env: Env): Promise<Response> {
  if (!(await adminSession(request, env))) return error("未登入", 401);
  const items = (await env.DB.prepare("SELECT * FROM dealer_applications ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'returned' THEN 1 ELSE 2 END,created_at DESC LIMIT 200").all()).results;
  return json({ items });
}

export async function reviewApplication(request: Request, env: Env, applicationId: string): Promise<Response> {
  const session = await adminSession(request, env, true); if (!session) return error("未登入或安全驗證失敗", 403);
  const b = await bodyJson(request), action = String(b.action ?? ""), note = String(b.note ?? "").slice(0, 1000);
  if (!new Set(["approve","return","reject"]).has(action)) return error("審核動作不正確");
  const app = await env.DB.prepare("SELECT * FROM dealer_applications WHERE application_id=?").bind(applicationId).first<Record<string, string>>();
  if (!app || !new Set(["pending","returned"]).has(app.status)) return error("申請不存在或已完成審核", 409);
  if (action !== "approve") {
    const status = action === "return" ? "returned" : "rejected";
    await env.DB.prepare("UPDATE dealer_applications SET status=?,review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE application_id=?").bind(status,note,session.actor_id,applicationId).run();
    await audit(env,"admin",session.actor_id,`application.${status}`,"application",applicationId,{note}); return json({ok:true});
  }
  const slug = String(b.slug ?? app.desired_slug).trim().toLowerCase(); if (!validSlug(slug)) return error("網址代碼格式不正確或為保留字");
  if (await env.DB.prepare("SELECT 1 found FROM dealers WHERE slug=? OR mobile_normalized=?").bind(slug,app.mobile_normalized).first()) return error("網址代碼或電話已存在",409);
  let referrerId: string | null = null;
  if (app.referrer_code) referrerId = (await env.DB.prepare("SELECT dealer_id FROM dealers WHERE slug=?").bind(app.referrer_code).first<{dealer_id:string}>())?.dealer_id ?? null;
  const dealerId=crypto.randomUUID(), initial=app.birth_date.replaceAll("-","");
  const statements = [
    env.DB.prepare("INSERT INTO dealers(dealer_id,application_id,slug,mobile_normalized,password_hash,referrer_dealer_id) VALUES(?,?,?,?,?,?)").bind(dealerId,applicationId,slug,app.mobile_normalized,await hashPassword(initial, env.PASSWORD_PEPPER),referrerId),
    env.DB.prepare("INSERT INTO dealer_profiles(dealer_id,display_name,city,industry,phone,field_visibility) VALUES(?,?,?,?,?,?)").bind(dealerId,app.real_name,app.city,app.industry,app.mobile_normalized,JSON.stringify({phone:true,email:true,address:true,map_url:true,booking_url:true})),
    env.DB.prepare("INSERT INTO dealer_social_links(dealer_id,link_visibility) VALUES(?,?)").bind(dealerId,JSON.stringify({facebook_url:true,line_url:true,instagram_url:true,website_url:true,threads_url:true,youtube_url:true})),
    env.DB.prepare("UPDATE dealer_applications SET status='approved',review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE application_id=?").bind(note,session.actor_id,applicationId),
  ];
  await env.DB.batch(statements); await audit(env,"admin",session.actor_id,"application.approved","dealer",dealerId,{slug,application_id:applicationId});
  return json({ok:true,dealer_id:dealerId,slug});
}

export async function dealers(request: Request, env: Env): Promise<Response> {
  if (!(await adminSession(request, env))) return error("未登入",401);
  const q=`%${new URL(request.url).searchParams.get("q")?.slice(0,100) ?? ""}%`;
  const items=(await env.DB.prepare("SELECT d.dealer_id,d.slug,d.mobile_normalized,d.status,d.expires_at,d.created_at,p.display_name,p.brand_name FROM dealers d JOIN dealer_profiles p ON p.dealer_id=d.dealer_id WHERE p.display_name LIKE ? OR d.mobile_normalized LIKE ? OR d.slug LIKE ? ORDER BY d.created_at DESC LIMIT 200").bind(q,q,q).all()).results;
  return json({items});
}

export async function updateDealer(request: Request, env: Env, dealerId: string): Promise<Response> {
  const session=await adminSession(request,env,true); if(!session)return error("未登入或安全驗證失敗",403);
  const b=await bodyJson(request), current=await env.DB.prepare("SELECT slug FROM dealers WHERE dealer_id=?").bind(dealerId).first<{slug:string}>(); if(!current)return error("找不到經銷商",404);
  const status=String(b.status??""); if(status&&!["active","disabled","expired"].includes(status))return error("狀態不正確");
  const slug=String(b.slug??current.slug).trim().toLowerCase(); if(!validSlug(slug))return error("網址代碼不正確");
  const refCode=String(b.referrer_code??"").trim().toLowerCase(); let refId:string|null=null;if(refCode)refId=(await env.DB.prepare("SELECT dealer_id FROM dealers WHERE slug=? AND dealer_id!=?").bind(refCode,dealerId).first<{dealer_id:string}>())?.dealer_id??null;
  if(refCode&&!refId)return error("找不到推薦人代碼");
  if(slug!==current.slug)await env.DB.prepare("INSERT OR IGNORE INTO slug_history(old_slug,dealer_id) VALUES(?,?)").bind(current.slug,dealerId).run();
  try{await env.DB.prepare("UPDATE dealers SET slug=?,status=COALESCE(NULLIF(?,''),status),expires_at=?,referrer_dealer_id=COALESCE(?,referrer_dealer_id),updated_at=CURRENT_TIMESTAMP WHERE dealer_id=?").bind(slug,status,b.expires_at?String(b.expires_at):null,refId,dealerId).run()}catch{return error("網址代碼已被使用",409)}
  await audit(env,"admin",session.actor_id,"dealer.updated","dealer",dealerId,{slug,status:status||undefined,expires_at:b.expires_at??null});return json({ok:true});
}

export async function resetPassword(request: Request,env:Env,dealerId:string):Promise<Response>{
  const session=await adminSession(request,env,true);if(!session)return error("未登入或安全驗證失敗",403);
  const row=await env.DB.prepare("SELECT a.birth_date FROM dealers d JOIN dealer_applications a ON a.application_id=d.application_id WHERE d.dealer_id=?").bind(dealerId).first<{birth_date:string}>();if(!row)return error("找不到原始申請資料",404);
  await env.DB.prepare("UPDATE dealers SET password_hash=?,must_change_password=1,failed_login_count=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE dealer_id=?").bind(await hashPassword(row.birth_date.replaceAll("-",""), env.PASSWORD_PEPPER),dealerId).run();
  await env.DB.prepare("DELETE FROM sessions WHERE actor_type='dealer' AND actor_id=?").bind(dealerId).run();await audit(env,"admin",session.actor_id,"dealer.password_reset","dealer",dealerId);return json({ok:true});
}

export async function contentGet(request:Request,env:Env):Promise<Response>{if(!(await adminSession(request,env)))return error("未登入",401);return json({content:await getSiteContent(env),faqs:await getFaqs(env,true)});}
export async function contentPut(request:Request,env:Env):Promise<Response>{
  const session=await adminSession(request,env,true);if(!session)return error("未登入或安全驗證失敗",403);const b=await bodyJson(request),content=b.content as Partial<SiteContent>,faqs=Array.isArray(b.faqs)?b.faqs as Array<Record<string,unknown>>:[];
  const required=["eyebrow","hero_title","hero_description","about_title","about_text","cta_label","cta_url","company_name","company_phone","company_email","company_address"] as const;const clean=Object.fromEntries(required.map(k=>[k,String(content?.[k]??"").trim().slice(0,3000)])) as unknown as SiteContent;if(!clean.hero_title||!clean.company_name)return error("主標題與公司名稱不可空白");
  const cleanFaqs=faqs.slice(0,100).map((f,i)=>({faq_id:String(f.faq_id||crypto.randomUUID()),question:String(f.question??"").trim().slice(0,500),answer:String(f.answer??"").trim().slice(0,3000),sort_order:i,is_visible:f.is_visible?1:0})).filter(f=>f.question&&f.answer);
  await env.DB.prepare("INSERT INTO site_content_versions(version_id,settings_json,faqs_json,created_by) VALUES(?,?,?,?)").bind(crypto.randomUUID(),JSON.stringify(clean),JSON.stringify(cleanFaqs),session.actor_id).run();
  const statements=[env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_by,updated_at) VALUES('site_content',?,?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(clean),session.actor_id),env.DB.prepare("DELETE FROM faqs"),...cleanFaqs.map(f=>env.DB.prepare("INSERT INTO faqs(faq_id,question,answer,sort_order,is_visible) VALUES(?,?,?,?,?)").bind(f.faq_id,f.question,f.answer,f.sort_order,f.is_visible))];await env.DB.batch(statements);await env.DB.prepare("DELETE FROM site_content_versions WHERE version_id NOT IN (SELECT version_id FROM site_content_versions ORDER BY created_at DESC LIMIT 10)").run();await audit(env,"admin",session.actor_id,"content.published","site","global");return json({ok:true});
}
export async function auditList(request:Request,env:Env):Promise<Response>{if(!(await adminSession(request,env)))return error("未登入",401);return json({items:(await env.DB.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200").all()).results});}
