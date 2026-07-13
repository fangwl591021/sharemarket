PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_users (
  admin_id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','super_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  failed_login_count INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dealer_applications (
  application_id TEXT PRIMARY KEY, real_name TEXT NOT NULL, mobile_normalized TEXT NOT NULL,
  birth_date TEXT NOT NULL, email TEXT, line_name TEXT NOT NULL, city TEXT NOT NULL,
  industry TEXT NOT NULL, referrer_code TEXT, desired_slug TEXT NOT NULL,
  privacy_consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','returned','rejected','approved')),
  review_note TEXT, reviewed_by TEXT REFERENCES admin_users(admin_id), reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_applications_status ON dealer_applications(status, created_at DESC);

CREATE TABLE IF NOT EXISTS dealers (
  dealer_id TEXT PRIMARY KEY, application_id TEXT UNIQUE REFERENCES dealer_applications(application_id),
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE, mobile_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','expired')),
  referrer_dealer_id TEXT REFERENCES dealers(dealer_id), expires_at TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0, locked_until TEXT, last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dealers_status ON dealers(status);

CREATE TABLE IF NOT EXISTS dealer_profiles (
  dealer_id TEXT PRIMARY KEY REFERENCES dealers(dealer_id) ON DELETE CASCADE,
  photo_key TEXT, display_name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
  brand_name TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
  map_url TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', opening_copy TEXT NOT NULL DEFAULT '',
  call_to_action TEXT NOT NULL DEFAULT '', booking_url TEXT NOT NULL DEFAULT '',
  field_visibility TEXT NOT NULL DEFAULT '{}', draft_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dealer_social_links (
  dealer_id TEXT PRIMARY KEY REFERENCES dealers(dealer_id) ON DELETE CASCADE,
  facebook_url TEXT NOT NULL DEFAULT '', line_url TEXT NOT NULL DEFAULT '',
  instagram_url TEXT NOT NULL DEFAULT '', website_url TEXT NOT NULL DEFAULT '',
  threads_url TEXT NOT NULL DEFAULT '', youtube_url TEXT NOT NULL DEFAULT '',
  link_visibility TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faqs (
  faq_id TEXT PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY, actor_type TEXT NOT NULL CHECK (actor_type IN ('admin','dealer')),
  actor_id TEXT NOT NULL, csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_actor ON sessions(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS page_events (
  event_id TEXT PRIMARY KEY, dealer_id TEXT NOT NULL REFERENCES dealers(dealer_id),
  slug TEXT NOT NULL, event_type TEXT NOT NULL CHECK (event_type IN ('page_view','phone_click','line_click','booking_click','social_click')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_events_dealer_time ON page_events(dealer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id TEXT PRIMARY KEY, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL,
  action TEXT NOT NULL, target_type TEXT, target_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS slug_history (
  old_slug TEXT PRIMARY KEY COLLATE NOCASE, dealer_id TEXT NOT NULL REFERENCES dealers(dealer_id),
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_content_versions (
  version_id TEXT PRIMARY KEY, settings_json TEXT NOT NULL, faqs_json TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_settings(setting_key, setting_value) VALUES
('site_content', '{"eyebrow":"一起創造一個新的市場","hero_title":"如果今天，有機會一起創造一個新的市場，你有沒有興趣？","hero_description":"我們不是在賣系統，也不是在賣AI工具，更不是在找加盟商。我們正在尋找願意一起建立市場的人。","about_title":"保留自己的會員，一起擴大市場。","about_text":"共享會員市場不是共享會員資料。每一家企業仍然保有自己的品牌、LINE官方帳號、會員與客戶關係。我們改變的是合作方式，讓分散的企業開始互相推薦、互相導流、互相合作。","cta_label":"預約30分鐘市場對談","cta_url":"https://lihi2.me/VczIr","company_name":"米樂數位行銷股份有限公司","company_phone":"02-6637-4988","company_email":"a0935155680@gmail.com","company_address":"新北市板橋區文化路二段486號3樓之二"}');

INSERT OR IGNORE INTO faqs(faq_id, question, answer, sort_order) VALUES
('faq-member-data','我的會員資料會被共享嗎？','不會。會員仍然屬於原本的企業與LINE官方帳號，平台共享的是合作機會，不是會員資料。',1),
('faq-non-store','我不是實體店家，可以加入嗎？','可以。只要你擁有品牌、客戶、人脈、服務或影響力，都能成為市場的一部分。',2),
('faq-partner','共創夥伴需要做什麼？','分享理念、邀請市場對談、陪伴合作夥伴了解模式，並協助建立合作市場。',3);
