/**
 * Shared auth helpers for /admin/api/* endpoints.
 *
 * Session token format: `${ts}.${hmac}`
 *   ts   — Unix seconds of issue time
 *   hmac — HMAC-SHA256(ts, ADMIN_PASSWORD), hex-encoded
 *
 * Tokens expire after 24 hours.
 */

const SESSION_TTL = 86400; // 24 h
const COOKIE_NAME = 'admin_session';

// ── Public helpers ───────────────────────────────────────────────────────────

/** Returns true if the request carries a valid session cookie. */
export async function isAuthenticated(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return false;
  return verifyToken(token, env.ADMIN_PASSWORD);
}

/** Returns a 401 JSON response. */
export function unauthorized() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Creates a signed session cookie string. */
export async function makeSessionCookie(password) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const hmac = await sign(ts, password);
  const token = `${ts}.${hmac}`;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}; Path=/admin`;
}

/** Returns a Set-Cookie header that clears the session. */
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/admin`;
}

// ── Internal ─────────────────────────────────────────────────────────────────

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === name) return v;
  }
  return null;
}

async function verifyToken(token, password) {
  if (!password) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const ts = token.slice(0, dot);
  const hmac = token.slice(dot + 1);
  const now = Math.floor(Date.now() / 1000);
  if (now - parseInt(ts, 10) > SESSION_TTL) return false;
  const expected = await sign(ts, password);
  return timingSafeEqual(expected, hmac);
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
