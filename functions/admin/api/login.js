/**
 * POST /admin/api/login
 *
 * Verifies a 6-digit OTP (sent to Telegram by /admin/api/send-code).
 * On success, sets a signed session cookie (TTL in _auth.js).
 *
 * Brute-force defenses (KV-backed, see _ratelimit.js):
 *  - 5 attempts per 5 minutes per IP, 30 per 5 minutes globally
 *  - Codes are single-use: a successfully used code is stored in KV
 *    and rejected on replay for 15 minutes (covers the ±1 skew window)
 */

import { verifyOTP } from './_otp.js';
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

  // Reject codes that were already used for a successful login
  const used = env.ADMIN_KV ? await env.ADMIN_KV.get('otp_used:' + code) : null;

  const valid = !used && await verifyOTP(code, env.ADMIN_OTP_SECRET);

  if (!valid) {
    // Artificial delay to slow brute-force attempts
    await new Promise(r => setTimeout(r, 400));
    return json({ error: 'Invalid or expired code' }, 401);
  }

  // Mark the code as consumed (single-use)
  if (env.ADMIN_KV) {
    await env.ADMIN_KV.put('otp_used:' + code, '1', { expirationTtl: 900 });
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
