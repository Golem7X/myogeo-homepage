/**
 * Shared Google Sheets helpers for admin API endpoints.
 * Reuses the same service-account JWT approach as /api/notify.js.
 */

export async function getAccessToken(env) {
  const email = (env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const rawKey = env.GOOGLE_PRIVATE_KEY || '';
  if (!email || !rawKey) return null;

  try {
    const now = Math.floor(Date.now() / 1000);
    const header  = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss:   email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud:   'https://oauth2.googleapis.com/token',
      exp:   now + 3600,
      iat:   now,
    };

    const b64url = obj =>
      btoa(JSON.stringify(obj))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const signingInput = b64url(header) + '.' + b64url(payload);

    let pem = rawKey.replace(/\\n/g, '\n').trim();
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

/** Reads all values from a sheet tab. Returns 2D array of rows. */
export async function readSheet(token, sheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.values || [];
}

/** Gets spreadsheet metadata (list of sheet tab names). */
export async function getSheetMeta(token, sheetId) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return (data.sheets || []).map(s => s.properties.title);
}

/** Appends rows to a sheet tab. */
export async function appendRows(token, sheetId, tabName, rows) {
  const range = encodeURIComponent(tabName + '!A:Z');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ values: rows }),
  });
  return res.ok;
}

/** Updates a specific range. */
export async function updateRange(token, sheetId, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ range, values }),
  });
  return res.ok;
}
