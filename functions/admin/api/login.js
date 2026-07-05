/**
 * POST /admin/api/login
 *
 * Verifies a 6-digit OTP (sent to Telegram by /admin/api/send-code).
 * On success, sets a signed session cookie (TTL in _auth.js).
 *
 * Brute-force defenses (KV-backed, see _ratelimit.js):
 *  - 5 attempts per 5 minutes per IP, 30 per 5 minutes globally
 *  - With ADMIN_KV: codes are random, stored hashed, and deleted on
 *    successful use — truly single-use, fresh code available any time
 *  - Without KV: falls back to stateless TOTP verification
 */

import { verifyOTP, sha256hex, timingSafeEqual } from './_otp.js';
import { makeSessionCookie } from './_auth.js';
import { rateLimit, tooManyRequests, clientIP } from './_ratelimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ADMIN_OTP_SECRET) {
    return json({ error: 'Admin not configured' }, 503);
  }

  const ip = clientIP(request);
  if (!await rateLimit(env, 'login:' + ip, 5, 300) ||
      !await rateLimit(env, 'login:global', 30, 300)) {
    return tooManyRequests();
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const code = String(body.code || '').trim();

  let valid = false;
  if (env.ADMIN_KV) {
    // KV mode: compare against the stored hash of the last sent code,
    // then delete it so the code can never be reused
    const storedHash = await env.ADMIN_KV.get('otp:current');
    if (storedHash && /^\d{6}$/.test(code) &&
        timingSafeEqual(await sha256hex(code), storedHash)) {
      valid = true;
      await env.ADMIN_KV.delete('otp:current');
    }
  } else {
    // Fallback: stateless TOTP (not single-use — KV unavailable)
    valid = await verifyOTP(code, env.ADMIN_OTP_SECRET);
  }

  if (!valid) {
    // Artificial delay to slow brute-force attempts
    await new Promise(r => setTimeout(r, 400));
    return json({ error: 'Invalid or expired code' }, 401);
  }

  const cookie = await makeSessionCookie(env.ADMIN_OTP_SECRET);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': cookie,
    },
  });
}

export const onRequest = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
