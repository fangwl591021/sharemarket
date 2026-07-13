import type { DealerPublic, Env, SiteContent } from "../types";

export async function getSiteContent(env: Env): Promise<SiteContent> {
  const row = await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='site_content'").first<{ setting_value: string }>();
  return JSON.parse(row?.setting_value ?? "{}") as SiteContent;
}

export async function getFaqs(env: Env, all = false): Promise<Array<{ faq_id: string; question: string; answer: string; sort_order: number; is_visible: number }>> {
  const query = `SELECT faq_id,question,answer,sort_order,is_visible FROM faqs ${all ? "" : "WHERE is_visible=1"} ORDER BY sort_order,created_at`;
  return (await env.DB.prepare(query).all()).results as Array<{ faq_id: string; question: string; answer: string; sort_order: number; is_visible: number }>;
}

export async function getDealerBySlug(env: Env, slug: string): Promise<DealerPublic | null> {
  const row = await env.DB.prepare(`SELECT d.dealer_id,d.slug,p.photo_key,p.display_name,p.title,p.brand_name,p.bio,p.city,p.industry,p.phone,p.address,p.map_url,p.email,p.opening_copy,p.call_to_action,p.booking_url,p.field_visibility,s.facebook_url,s.line_url,s.instagram_url,s.website_url,s.threads_url,s.youtube_url,s.link_visibility FROM dealers d JOIN dealer_profiles p ON p.dealer_id=d.dealer_id JOIN dealer_social_links s ON s.dealer_id=d.dealer_id WHERE d.slug=? AND d.status='active' AND (d.expires_at IS NULL OR d.expires_at>CURRENT_TIMESTAMP)`)
    .bind(slug).first<DealerPublic>();
  return row ?? null;
}

export async function audit(env: Env, actorType: string, actorId: string, action: string, targetType?: string, targetId?: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await env.DB.prepare("INSERT INTO audit_logs(audit_id,actor_type,actor_id,action,target_type,target_id,metadata_json) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), actorType, actorId, action, targetType ?? null, targetId ?? null, JSON.stringify(metadata)).run();
}
