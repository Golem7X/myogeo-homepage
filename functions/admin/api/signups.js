/**
 * DELETE /admin/api/signups
 *
 * Deletes a single signup row from the Google Sheet.
 *
 * Body: { app: string, sheetRowIndex: number }
 *   sheetRowIndex — 0-based row index in the sheet (including header)
 */

import { isAuthenticated, unauthorized } from './_auth.js';
import { getAccessToken } from './_sheets.js';

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!await isAuthenticated(request, env)) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const { app, sheetRowIndex } = body;
  if (!app || sheetRowIndex == null) return json({ error: 'app and sheetRowIndex required' }, 400);

  const token = await getAccessToken(env);
  if (!token) return json({ error: 'Google auth failed' }, 503);

  const sheetId = env.GOOGLE_SHEET_ID.trim();

  // Get the numeric sheet tab ID for the app tab
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`;
  const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
  const meta    = await metaRes.json();
  const sheet   = (meta.sheets || []).find(s => s.properties.title === app);

  if (!sheet) return json({ error: `Tab "${app}" not found` }, 404);

  const tabId = sheet.properties.sheetId;

  // Delete the row via batchUpdate
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId:    tabId,
            dimension:  'ROWS',
            startIndex: sheetRowIndex,      // 0-based
            endIndex:   sheetRowIndex + 1,
          },
        },
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return json({ error: 'Sheets API error: ' + err }, 502);
  }

  return json({ ok: true });
}

export const onRequest = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'DELETE' } });

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
