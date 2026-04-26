/**
 * Temporary debug endpoint — returns the EXACT error from the Google Sheets
 * integration so we can find why rows aren't being written.
 *
 * DELETE THIS FILE after debugging is done.
 */

export async function onRequestGet(context) {
  const { env } = context;
  const debug = {};

  debug.has_email = !!env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  debug.has_key = !!env.GOOGLE_PRIVATE_KEY;
  debug.has_sheet_id = !!env.GOOGLE_SHEET_ID;
  debug.email_value = env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null;
  debug.sheet_id_value = env.GOOGLE_SHEET_ID || null;
  debug.key_starts_with = env.GOOGLE_PRIVATE_KEY
    ? env.GOOGLE_PRIVATE_KEY.slice(0, 30)
    : null;
  debug.key_has_literal_backslash_n = env.GOOGLE_PRIVATE_KEY
    ? env.GOOGLE_PRIVATE_KEY.includes('\\n')
    : null;
  debug.key_has_real_newline = env.GOOGLE_PRIVATE_KEY
    ? env.GOOGLE_PRIVATE_KEY.includes('\n')
    : null;

  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_SHEET_ID) {
    return json(debug);
  }

  // Try to get an access token
  try {
    const token = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_EMAIL.trim(), env.GOOGLE_PRIVATE_KEY);
    debug.token_obtained = !!token;
    debug.token_first_chars = token ? token.slice(0, 20) : null;

    if (!token) {
      debug.token_error = 'returned null';
      return json(debug);
    }

    // Try to append a row
    const range = encodeURIComponent('Geonify!A:E');
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/' +
      env.GOOGLE_SHEET_ID.trim() + '/values/' + range +
      ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({
        values: [[new Date().toISOString(), 'debug@test.com', 'Geonify', 'XX', '0.0.0.0']],
      }),
    });

    debug.sheets_status = res.status;
    debug.sheets_response = await res.text();
  } catch (e) {
    debug.error = e.message || String(e);
    debug.error_stack = e.stack || null;
  }

  return json(debug);
}

async function getGoogleAccessToken(serviceAccountEmail, rawPrivateKey) {
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

  let pem = rawPrivateKey.replace(/\\n/g, '\n').trim();
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
  if (!data.access_token) {
    throw new Error('Token endpoint: ' + JSON.stringify(data));
  }
  return data.access_token;
}

function json(data) {
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
