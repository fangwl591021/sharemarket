export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}
export function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
export async function bodyJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 1_000_000) throw new Error("資料過大");
  return await request.json<Record<string, unknown>>();
}
export function error(message: string, status = 400): Response { return json({ error: message }, status); }
