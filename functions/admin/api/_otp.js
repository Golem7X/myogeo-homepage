/**
 * OTP helpers.
 *
 * Primary mode (ADMIN_KV bound): random 6-digit codes, stored hashed in KV
 * for 5 minutes and deleted on successful use. Every send-code request
 * produces a fresh code, so logout → login works immediately.
 *
 * Fallback mode (no KV): stateless TOTP-style codes derived from
 * HMAC-SHA256(secret, floor(epoch_seconds / 300)) mod 1_000_000, checking
 * windows [-1, 0, +1] for clock skew.
 */

const WINDOW_SECONDS = 300; // 5 minutes

/** Cryptographically random 6-digit code. */
export function randomOTP() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

/** SHA-256 hex digest of a string. */
export async function sha256hex(s) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateOTP(secret, windowOffset = 0) {
  const counter = Math.floor(Date.now() / 1000 / WINDOW_SECONDS) + windowOffset;
  return hotp(secret, counter);
}

export async function verifyOTP(inputCode, secret) {
  if (!inputCode || !/^\d{6}$/.test(inputCode)) return false;
  for (const offset of [-1, 0, 1]) {
    const expected = await generateOTP(secret, offset);
    if (timingSafeEqual(inputCode, expected)) return true;
  }
  return false;
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC', key,
    new TextEncoder().encode(String(counter))
  );
  const view = new DataView(sig);
  const code = view.getUint32(0) % 1_000_000;
  return String(code).padStart(6, '0');
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
