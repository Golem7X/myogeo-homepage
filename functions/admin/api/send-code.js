/**
 * POST /admin/api/send-code
 *
 * Generates a time-based 6-digit OTP and sends it to the admin's Telegram chat.
 * The OTP is valid for 5 minutes. No state storage needed — the code is derived
 * deterministically from (ADMIN_OTP_SECRET, 5-minute time window).
 *
 * Rate-limited: one request per 60 seconds per session (enforced client-side;
 * the server does not track IPs to avoid complexity, but the OTP window already
 * limits replay attacks).
 */

import { generateOTP } from './_otp.js';

export async function onRequestPost(context) {
  const { env } = context;

  if (!env.ADMIN_OTP_SECRET) {
    return json({ error: 'OTP not configured' }, 503);
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return json({ error: 'Telegram not configured' }, 503);
  }

  const code = await generateOTP(env.ADMIN_OTP_SECRET);
  const now  = new Date().toISOString();

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
