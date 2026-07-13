export const RESERVED_SLUGS = new Set(["admin","login","logout","dashboard","register","join","api","assets","privacy","terms","help","favicon.ico","media"]);

export function normalizePhone(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/[\s()-]/g, "");
  if (raw.startsWith("+886")) return `0${raw.slice(4)}`;
  return raw;
}

export function validTaiwanMobile(phone: string): boolean { return /^09\d{8}$/.test(phone); }
export function validSlug(slug: string): boolean { return /^[a-z0-9](?:[a-z0-9-]{2,18}[a-z0-9])$/.test(slug) && !RESERVED_SLUGS.has(slug); }
export function validUrl(value: unknown): string {
  const text = String(value ?? "").trim(); if (!text) return "";
  try { const url = new URL(text); return ["https:", "http:"].includes(url.protocol) ? url.toString() : ""; } catch { return ""; }
}
export function strongPassword(value: string): boolean { return value.length >= 10 && /[A-Za-z]/.test(value) && /\d/.test(value); }

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}
