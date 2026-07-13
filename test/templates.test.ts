import { describe, expect, it } from "vitest";
import { loginPage } from "../src/templates/pages";

describe("login page scripts", () => {
  it.each([false, true])("emits one valid script block (admin=%s)", (admin) => {
    const html = loginPage(admin);
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toContain("<script></script>");
    expect(html).toContain("addEventListener");
  });
});
