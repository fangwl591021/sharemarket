import type { Env, Session, ActorType } from "../types";

const encoder = new TextEncoder();
type CfSubtle = SubtleCrypto & { timingSafeEqual?(a: BufferSource, b: BufferSource): boolean };

function b64(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function bytes(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function buffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function safeEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const subtle = crypto.subtle as CfSubtle;
  if (typeof subtle.timingSafeEqual === "function") return subtle.timingSafeEqual(left, right);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function hmac(password: string, salt: string, pepper: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, encoder.encode(`${salt}:${password}`));
}

export async function hashPassword(password: string, pepper?: string): Promise<string> {
  if (!pepper || pepper.length < 32) throw new Error("PASSWORD_PEPPER is not configured");
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return `hmac-sha256$v1$${salt}$${b64(new Uint8Array(await hmac(password, salt, pepper)))}`;
}

export async function verifyPassword(password: string, stored: string, pepper?: string): Promise<boolean> {
  const [algorithm, versionOrIterations, salt, expectedText] = stored.split("$");
  if (!salt || !expectedText) return false;
  if (algorithm === "hmac-sha256" && versionOrIterations === "v1") {
    if (!pepper || pepper.length < 32) return false;
    return safeEqual(await hmac(password, salt, pepper), buffer(bytes(expectedText)));
  }
  if (algorithm === "pbkdf2-sha256") {
    const iterations = Number(versionOrIterations);
    if (!Number.isSafeInteger(iterations) || iterations < 100_000) return false;
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const actual = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: buffer(bytes(salt)), iterations }, key, 256);
    return safeEqual(actual, buffer(bytes(expectedText)));
  }
  return false;
}

export function secureEqual(left: string, right: string): boolean {
  return safeEqual(buffer(encoder.encode(left)), buffer(encoder.encode(right)));
}

export function randomToken(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function createSession(env: Env, actorType: ActorType, actorId: string): Promise<{ session: Session; cookie: string }> {
  const session: Session = { session_id: randomToken(), actor_type: actorType, actor_id: actorId, csrf_token: randomToken(), expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() };
  await env.DB.prepare("INSERT INTO sessions(session_id,actor_type,actor_id,csrf_token,expires_at) VALUES(?,?,?,?,?)").bind(session.session_id, actorType, actorId, session.csrf_token, session.expires_at).run();
  return { session, cookie: `sm_session=${session.session_id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` };
}

export async function getSession(request: Request, env: Env, expected?: ActorType): Promise<Session | null> {
  const match = request.headers.get("Cookie")?.match(/(?:^|;\s*)sm_session=([^;]+)/);
  if (!match?.[1]) return null;
  const session = await env.DB.prepare("SELECT session_id,actor_type,actor_id,csrf_token,expires_at FROM sessions WHERE session_id=? AND expires_at>CURRENT_TIMESTAMP").bind(match[1]).first<Session>();
  return !session || (expected && session.actor_type !== expected) ? null : session;
}

export function requireCsrf(request: Request, session: Session): boolean { return request.headers.get("X-CSRF-Token") === session.csrf_token; }
export function clearSessionCookie(): string { return "sm_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"; }
