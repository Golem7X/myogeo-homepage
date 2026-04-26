/**
 * Time-based OTP helpers (TOTP-style, 5-minute window).
 *
 * Code = HMAC-SHA256(secret, floor(epoch_seconds / 300)) mod 1_000_000
 * padded to 6 digits.
 *
 * Verification checks windows [-1, 0, +1] to tolerate up to 5 minutes of
 * clock skew between client and server.
 */

const WINDOW_SECONDS = 300; // 5 minutes

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

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
