export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ENVIRONMENT: string;
  SETUP_TOKEN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  PASSWORD_PEPPER?: string;
}

export type ActorType = "admin" | "dealer";
export interface Session {
  session_id: string;
  actor_type: ActorType;
  actor_id: string;
  csrf_token: string;
  expires_at: string;
}

export interface SiteContent {
  eyebrow: string; hero_title: string; hero_description: string;
  about_title: string; about_text: string; cta_label: string; cta_url: string;
  company_name: string; company_phone: string; company_email: string; company_address: string;
}

export interface DealerPublic {
  dealer_id: string; slug: string; photo_key: string | null; display_name: string;
  title: string; brand_name: string; bio: string; city: string; industry: string;
  phone: string; address: string; map_url: string; email: string;
  opening_copy: string; call_to_action: string; booking_url: string;
  field_visibility: string; facebook_url: string; line_url: string;
  instagram_url: string; website_url: string; threads_url: string; youtube_url: string;
  link_visibility: string;
}
