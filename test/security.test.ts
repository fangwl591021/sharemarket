import { describe, expect, it } from "vitest";
import { hashPassword, secureEqual, verifyPassword } from "../src/services/security";
import { normalizePhone, strongPassword, validSlug } from "../src/services/validation";

describe("password security", () => {
  const pepper = "test-pepper-value-that-is-at-least-32-characters";

  it("uses a random salt and a server-side pepper without storing plaintext", async () => {
    const first = await hashPassword("SecurePass123", pepper);
    const second = await hashPassword("SecurePass123", pepper);
    expect(first).not.toBe(second);
    expect(first).not.toContain("SecurePass123");
    expect(await verifyPassword("SecurePass123", first, pepper)).toBe(true);
    expect(await verifyPassword("wrong", first, pepper)).toBe(false);
    expect(await verifyPassword("SecurePass123", first, "wrong-pepper-value-that-is-at-least-32-characters")).toBe(false);
  });

  it("compares setup tokens and validates strong passwords", () => {
    expect(secureEqual("same-token", "same-token")).toBe(true);
    expect(secureEqual("same-token", "other-token")).toBe(false);
    expect(strongPassword("longpassword")).toBe(false);
    expect(strongPassword("SecurePass123")).toBe(true);
  });
});

describe("tenant identifiers", () => {
  it("normalizes Taiwan mobile numbers", () => expect(normalizePhone("+886 912-345-678")).toBe("0912345678"));
  it("accepts valid slugs and rejects reserved or malformed slugs", () => {
    expect(validSlug("amy168")).toBe(true);
    expect(validSlug("admin")).toBe(false);
    expect(validSlug("Abcd")).toBe(false);
    expect(validSlug("abc")).toBe(false);
  });
});
