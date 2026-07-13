import { describe, expect, it } from "vitest";
import { adminPage } from "../src/templates/admin-public";

describe("admin frontend links", () => {
  it("shows approved dealer URLs and preserves the approval result", () => {
    const html = adminPage();

    expect(html).toContain("approved_slug");
    expect(html).toContain("核准完成，前端網址：");
    expect(html).toContain("location.origin+'/'+result.slug");
    expect(html).toContain('target="_blank" rel="noopener"');
  });
});
