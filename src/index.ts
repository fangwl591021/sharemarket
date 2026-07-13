import type { Env } from "./types";
import { error, html, json } from "./http";
import { adminPage, publicPage } from "./templates/admin-public";
import { dashboardPage, loginPage, registerPage } from "./templates/pages";
import { adminLogin, changePassword, dealerLogin, logout, sessionInfo } from "./routes/auth";
import { register } from "./routes/register";
import { profileGet, publish, uploadPhoto } from "./routes/dealer";
import { profilePatchSafe } from "./routes/dealer-update";
import { applications, auditList, contentGet, contentPut, dashboard, dealers, resetPassword, reviewApplication, setup, updateDealer } from "./routes/admin";
import { getDealerBySlug, getFaqs, getSiteContent } from "./services/db";
import { getSession } from "./services/security";

const RESERVED_PAGES = new Set(["admin","login","dashboard","register","privacy","terms","help","favicon.ico"]);
const events = new Set(["page_view","phone_click","line_click","booking_click","social_click"]);

function withHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff"); headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin"); headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (response.headers.get("Content-Type")?.includes("text/html")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function publicResponse(env: Env, dealerSlug: string | null, ctx: ExecutionContext): Promise<Response> {
  const [content, faqs, dealer] = await Promise.all([getSiteContent(env), getFaqs(env), dealerSlug ? getDealerBySlug(env,dealerSlug) : Promise.resolve(null)]);
  if (dealerSlug && !dealer) {
    const old = await env.DB.prepare("SELECT d.slug FROM slug_history h JOIN dealers d ON d.dealer_id=h.dealer_id WHERE h.old_slug=? AND d.status='active'").bind(dealerSlug).first<{slug:string}>();
    if (old) return Response.redirect(new URL(`/${old.slug}`, "https://sharemarket.invalid"), 301);
    return html("<h1>找不到此經銷商頁面</h1><p><a href='/'>返回首頁</a></p>",404);
  }
  if (dealer) ctx.waitUntil(env.DB.prepare("INSERT INTO page_events(event_id,dealer_id,slug,event_type) VALUES(?,?,?,'page_view')").bind(crypto.randomUUID(),dealer.dealer_id,dealer.slug).run().then(()=>undefined));
  return html(publicPage(content,faqs,dealer));
}

async function apiEvent(request:Request,env:Env):Promise<Response>{
  let b:Record<string,unknown>;try{b=await request.json()}catch{return error("格式不正確")};const slug=String(b.slug??"").toLowerCase(),type=String(b.event_type??"");if(!events.has(type)||type==="page_view")return error("事件不正確");const dealer=await getDealerBySlug(env,slug);if(!dealer)return error("找不到經銷商",404);await env.DB.prepare("INSERT INTO page_events(event_id,dealer_id,slug,event_type) VALUES(?,?,?,?)").bind(crypto.randomUUID(),dealer.dealer_id,slug,type).run();return json({ok:true},202);
}

async function media(env:Env,key:string):Promise<Response>{const obj=await env.MEDIA.get(key);if(!obj)return error("找不到圖片",404);const h=new Headers();obj.writeHttpMetadata(h);h.set("ETag",obj.httpEtag);h.set("Cache-Control","public, max-age=86400");return new Response(obj.body,{headers:h});}

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url=new URL(request.url), path=decodeURIComponent(url.pathname), method=request.method;
  if(method==="GET"&&path==="/favicon.ico")return new Response(null,{status:204,headers:{"Cache-Control":"public, max-age=86400"}});
  if(method==="GET"&&path==="/health")return json({ok:true,service:"sharemarket"});
  if(method==="GET"&&path==="/")return publicResponse(env,null,ctx);
  if(method==="GET"&&path==="/register")return html(registerPage(env.TURNSTILE_SITE_KEY));
  if(method==="GET"&&path==="/login")return html(loginPage(false));
  if(method==="GET"&&path==="/admin/login")return html(loginPage(true));
  if(method==="GET"&&path==="/dashboard"){
    if(!(await getSession(request,env,"dealer")))return Response.redirect(new URL("/login",url),302);
    const page=dashboardPage().replace('<canvas id="qr" class="qr" width="210" height="210"></canvas>','<img id="qr" class="qr" alt="專屬網址 QR Code">').replace("</body>",`<script>drawQR=t=>document.querySelector('#qr').src='https://api.qrserver.com/v1/create-qr-code/?size=210x210&data='+encodeURIComponent(t)</script></body>`);return html(page);
  }
  if(method==="GET"&&path==="/admin")return html(adminPage());
  if(method==="GET"&&path.startsWith("/media/"))return media(env,path.slice(7));
  if(method==="POST"&&path==="/api/register")return register(request,env);
  if(method==="POST"&&path==="/api/auth/login")return dealerLogin(request,env);
  if(method==="POST"&&path==="/api/admin/login")return adminLogin(request,env);
  if(method==="POST"&&path==="/api/auth/logout")return logout(request,env);
  if(method==="POST"&&path==="/api/auth/change-password")return changePassword(request,env);
  if(method==="GET"&&path==="/api/session")return sessionInfo(request,env);
  if(method==="GET"&&path==="/api/dealer/profile")return profileGet(request,env);
  if(method==="PATCH"&&path==="/api/dealer/profile")return profilePatchSafe(request,env);
  if(method==="POST"&&path==="/api/dealer/publish")return publish(request,env);
  if(method==="POST"&&path==="/api/dealer/photo")return uploadPhoto(request,env);
  if(method==="POST"&&path==="/api/admin/setup")return setup(request,env);
  if(method==="GET"&&path==="/api/admin/dashboard")return dashboard(request,env);
  if(method==="GET"&&path==="/api/admin/applications")return applications(request,env);
  if(method==="GET"&&path==="/api/admin/dealers")return dealers(request,env);
  if(method==="GET"&&path==="/api/admin/content")return contentGet(request,env);
  if(method==="PUT"&&path==="/api/admin/content")return contentPut(request,env);
  if(method==="GET"&&path==="/api/admin/audit")return auditList(request,env);
  if(method==="POST"&&path==="/api/events")return apiEvent(request,env);
  let match=path.match(/^\/api\/admin\/applications\/([^/]+)\/review$/);if(method==="POST"&&match?.[1])return reviewApplication(request,env,match[1]);
  match=path.match(/^\/api\/admin\/dealers\/([^/]+)$/);if(method==="PATCH"&&match?.[1])return updateDealer(request,env,match[1]);
  match=path.match(/^\/api\/admin\/dealers\/([^/]+)\/reset-password$/);if(method==="POST"&&match?.[1])return resetPassword(request,env,match[1]);
  if(method==="GET"&&path.split("/").length===2){const slug=path.slice(1).toLowerCase();if(!RESERVED_PAGES.has(slug))return publicResponse(env,slug,ctx)}
  return error("找不到頁面",404);
}

export default { async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{try{return withHeaders(await handle(request,env,ctx))}catch(cause){console.error(JSON.stringify({event:"request_error",path:new URL(request.url).pathname,error:cause instanceof Error?cause.message:String(cause)}));return withHeaders(error("系統暫時無法處理，請稍後再試",500))}} } satisfies ExportedHandler<Env>;
