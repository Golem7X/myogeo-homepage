/**
 * POST /admin/api/login
 *
 * Verifies a 6-digit OTP (sent to Telegram by /admin/api/send-code).
 * On success, sets a signed 24-hour session cookie.
 */

import { verifyOTP } from './_otp.js';
import { makeSessionCookie } from './_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ADMIN_OTP_SECRET) {
    return json({ error: 'Admin not configured' }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const code = String(body.code || '').trim();

  const valid = await verifyOTP(code, env.ADMIN_OTP_SECRET);

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
