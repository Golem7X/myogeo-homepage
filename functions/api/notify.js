/**
 * Cloudflare Pages Function — receives email-capture signups from the homepage.
 *
 * Endpoint: POST /api/notify
 * Body:    { email: string, website?: string (honeypot) }
 *
 * Server-side defenses:
 *  - Origin allowlist (rejects cross-site posts)
 *  - Body size cap
 *  - Honeypot: silent success for bots
 *  - Strict email regex + length cap
 *  - Method allowlist (POST only)
 *
 * Notification: forwards to Telegram bot if TELEGRAM_BOT_TOKEN +
 * TELEGRAM_CHAT_ID env vars are set in Cloudflare Pages settings. The
 * signup succeeds even if Telegram is down (fire-and-forget).
 */

const ALLOWED_ORIGINS = [
  'https://myogeo.org',
  'https://www.myogeo.org',
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 120;
const MAX_BODY_BYTES = 1024;

export async function onRequestPost(context) {
  const { request, env } = context;

  // Same-origin only (skip check when there's no Origin header — direct API tests)
  const origin = request.headers.get('Origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: 'Forbidden' }, 403);
  }

  // Body-size cap
  const len = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (len > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413);

  // Parse JSON
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Honeypot: bots fill the hidden field. Pretend success so they don't retry.
  if (body && typeof body.website === 'string' && body.website.length > 0) {
    return json({ ok: true });
  }

  // Email validation
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return json({ error: 'Invalid email' }, 400);
  }

  // Notify Telegram if configured (non-blocking on failure)
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const ip      = request.headers.get('CF-Connecting-IP') || 'unknown';
    const country = (request.cf && request.cf.country) || '?';
    const ua      = (request.headers.get('User-Agent') || '?').slice(0, 80);

    const text =
      '📧 <b>New Geonify launch signup</b>\n\n' +
      '<b>Email:</b> ' + esc(email) + '\n' +
      '<b>From:</b> ' + esc(country) + ' · ' + esc(ip) + '\n' +
      '<b>UA:</b> ' + esc(ua) + '\n' +
      '<b>Time:</b> ' + new Date().toISOString();

    try {
      await fetch(
        'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        }
      );
    } catch {
      /* swallow — Telegram outage must not break user signup */
    }
  }

  return json({ ok: true });
}

// Reject non-POST so curl/method scanners get a clean 405
export const onRequest = () =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST', 'Content-Type': 'text/plain' },
  });

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
