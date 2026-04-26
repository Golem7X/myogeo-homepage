/**
 * Cloudflare Pages Function — receives email-capture signups from the homepage.
 *
 * Endpoint: POST /api/notify
 * Body:    { email: string, website?: string (honeypot), app?: string }
 *
 * Server-side defenses:
 *  - Origin allowlist (rejects cross-site posts)
 *  - Body size cap
 *  - Honeypot: silent success for bots
 *  - Strict email regex + length cap
 *  - Method allowlist (POST only)
 *
 * Outputs (all non-blocking — failure of any does not break signup):
 *  1. Telegram notification  (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
 *  2. Google Sheets logging  (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
 *                             + GOOGLE_SHEET_ID)
 *     Appends a row to the tab named after the app (e.g. "Geonify").
 *     Creates a "Default" tab row if no app name is given.
 *     Row format: [Timestamp, Email, App, Country, IP]
 */

const ALLOWED_ORIGINS = [
  'https://myogeo.org',
  'https://www.myogeo.org',
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 120;
const MAX_BODY_BYTES = 1024;
const DEFAULT_APP = 'Geonify';

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

  // App name — sanitised, max 50 chars, alphanumeric + spaces + hyphens only
  const rawApp = typeof body?.app === 'string' ? body.app.trim() : DEFAULT_APP;
  const appName = rawApp.replace(/[^a-zA-Z0-9 \-_]/g, '').slice(0, 50) || DEFAULT_APP;

  const ip      = request.headers.get('CF-Connecting-IP') || 'unknown';
  const country = (request.cf && request.cf.country) || '?';
  const ua      = (request.headers.get('User-Agent') || '?').slice(0, 80);
  const timestamp = new Date().toISOString();

  // 1. Notify Telegram (non-blocking on failure)
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const text =
      '📧 <b>New ' + esc(appName) + ' launch signup</b>\n\n' +
      '<b>Email:</b> ' + esc(email) + '\n' +
      '<b>From:</b> ' + esc(country) + ' · ' + esc(ip) + '\n' +
      '<b>UA:</b> ' + esc(ua) + '\n' +
      '<b>Time:</b> ' + timestamp;

    fetch(
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
    ).catch(() => { /* swallow — Telegram outage must not break signup */ });
  }

  // 2. Log to Google Sheets (non-blocking on failure). waitUntil keeps the
  //    worker alive long enough for the API call to complete after we've
  //    already returned the response to the user.
  if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.GOOGLE_SHEET_ID) {
    const sheetsPromise = appendToSheet({
      email,
      appName,
      country,
      ip,
      timestamp,
      serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL.trim(),
      privateKey: env.GOOGLE_PRIVATE_KEY,
      sheetId: env.GOOGLE_SHEET_ID.trim(),
    }).catch(() => { /* swallow — Sheets outage must not break signup */ });

    if (context.waitUntil) context.waitUntil(sheetsPromise);
  }

  return json({ ok: true });
}

// ── Google Sheets helpers ────────────────────────────────────────────────────

async function appendToSheet({ email, appName, country, ip, timestamp,
                                serviceAccountEmail, privateKey, sheetId }) {
  const token = await getGoogleAccessToken(serviceAccountEmail, privateKey);
  if (!token) return;

  // Tab name = app name (e.g. "Geonify"). Sheets API uses !A:E range notation.
  const range = encodeURIComponent(appName + '!A:E');
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' +
    sheetId + '/values/' + range + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({
      values: [[timestamp, email, appName, country, ip]],
    }),
  });
}

async function getGoogleAccessToken(serviceAccountEmail, rawPrivateKey) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const header  = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss:   serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud:   'https://oauth2.googleapis.com/token',
      exp:   now + 3600,
      iat:   now,
    };

    const b64url = obj =>
      btoa(JSON.stringify(obj))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const signingInput = b64url(header) + '.' + b64url(payload);

    // Import the RSA private key (PEM → PKCS8 DER) — robust to common paste mistakes
    let pem = rawPrivateKey.replace(/\\n/g, '\n').trim();
    // Strip header/footer if present, then strip ALL whitespace and any stray
    // characters that aren't valid base64. This recovers from missing BEGIN/END
    // markers or accidental leading/trailing characters from copy-paste errors.
    const pemBody = pem
      .replace(/-----BEGIN [A-Z ]+-----/g, '')
      .replace(/-----END [A-Z ]+-----/g, '')
      .replace(/[^A-Za-z0-9+/=]/g, '');
    const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', der.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    );

    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5', cryptoKey,
      new TextEncoder().encode(signingInput)
    );

    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const jwt = signingInput + '.' + sigB64;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
    });

    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────

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
