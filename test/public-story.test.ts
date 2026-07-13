import { describe, expect, it } from "vitest";
import { publicPage } from "../src/templates/public-story";
import type { DealerPublic, SiteContent } from "../src/types";

const content: SiteContent = {
  eyebrow: "一起創造一個新的市場",
  hero_title: "如果今天，有機會一起創造一個新的市場，你有沒有興趣？",
  hero_description: "我們正在尋找願意一起建立市場的人。",
  about_title: "保留你的會員，擴大你的市場。",
  about_text: "真正的護城河，是共同建立的信任與合作網絡。",
  cta_label: "預約市場對談",
  cta_url: "https://example.com/book",
  company_name: "測試公司",
  company_phone: "02-1234-5678",
  company_email: "hello@example.com",
  company_address: "測試地址",
};

const dealer: DealerPublic = {
  dealer_id: "dealer-1", slug: "test-dealer", photo_key: null, display_name: "王小明",
  title: "市場顧問", brand_name: "共創品牌", bio: "一起建立市場。", city: "台北", industry: "顧問",
  phone: "0912345678", address: "台北市", map_url: "https://maps.example.com", email: "dealer@example.com",
  opening_copy: "", call_to_action: "找小明聊聊", booking_url: "https://example.com/dealer-book",
  field_visibility: "{}", facebook_url: "", line_url: "https://line.me/example",
  instagram_url: "", website_url: "", threads_url: "", youtube_url: "", link_visibility: "{}",
};

describe("original story public page", () => {
  it("keeps the original chapter structure and adds dealer contact details", () => {
    const html = publicPage(content, [{ question: "問題", answer: "答案" }], dealer);
    expect(html).toContain("01｜市場為什麼越來越分散");
    expect(html).toContain("09｜從今天開始");
    expect(html).toContain("slide-17.webp");
    expect(html).toContain("YOUR MARKET PARTNER｜專屬市場夥伴");
    expect(html).toContain("王小明");
    expect(html).toContain("0912345678");
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });
});
