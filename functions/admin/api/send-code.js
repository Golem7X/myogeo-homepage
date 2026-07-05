/**
 * POST /admin/api/send-code
 *
 * Generates a 6-digit OTP and sends it to the admin's Telegram chat.
 * The OTP is valid for 5 minutes.
 *
 * With ADMIN_KV bound: the code is random and stored hashed in KV, so every
 * request yields a fresh single-use code (logout → login works immediately).
 * Without KV: falls back to stateless TOTP derived from ADMIN_OTP_SECRET.
 *
 * Rate-limited server-side via KV (see _ratelimit.js): 3 requests per
 * 5 minutes per IP, 10 per 5 minutes globally — prevents Telegram spam.
 * The client-side 60-second cooldown is UX only, not a security control.
 */

import { generateOTP, randomOTP, sha256hex } from './_otp.js';
import { rateLimit, tooManyRequests, clientIP } from './_ratelimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ADMIN_OTP_SECRET) {
    return json({ error: 'OTP not configured' }, 503);
  }

  const ip = clientIP(request);
  if (!await rateLimit(env, 'sendcode:' + ip, 3, 300) ||
      !await rateLimit(env, 'sendcode:global', 10, 300)) {
    return tooManyRequests();
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return json({ error: 'Telegram not configured' }, 503);
  }

  let code;
  if (env.ADMIN_KV) {
    // Fresh random code on every request; newest one wins
    code = randomOTP();
    await env.ADMIN_KV.put('otp:current', await sha256hex(code), { expirationTtl: 300 });
  } else {
    // KV not bound — stateless TOTP fallback
    code = await generateOTP(env.ADMIN_OTP_SECRET);
  }
  const now = new Date().toISOString();

  const text =
    '🔐 <b>MYO_Geo_Orgs Admin Login</b>\n\n' +
    '<b>Your code:</b> <code>' + code + '</code>\n' +
    '⏱ Valid for <b>5 minutes</b>\n' +
    '🕐 ' + now + '\n\n' +
    '<i>If you did not request this, ignore it.</i>';

  try {
    const res = await fetch(
      'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('Telegram error:', err);
      return json({ error: 'Failed to send code — check Telegram config' }, 502);
    }
  } catch (e) {
    return json({ error: 'Network error sending code' }, 502);
  }

  return json({ ok: true });
}

export const onRequest = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
