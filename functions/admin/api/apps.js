/**
 * GET  /admin/api/apps — list app configs from Config tab
 * POST /admin/api/apps — upsert an app config row
 *
 * POST body: { app, status, beta, playUrl }
 */

import { isAuthenticated, unauthorized } from './_auth.js';
import { getAccessToken, readSheet, updateRange, appendRows, getSheetMeta } from './_sheets.js';

const CONFIG_TAB = 'Config';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!await isAuthenticated(request, env)) return unauthorized();

  const token = await getAccessToken(env);
  if (!token) return json({ error: 'Google auth failed' }, 503);

  const sheetId = env.GOOGLE_SHEET_ID.trim();
  const tabs = await getSheetMeta(token, sheetId);

  if (!tabs.includes(CONFIG_TAB)) return json({ config: [] });

  const rows = await readSheet(token, sheetId, `${CONFIG_TAB}!A:E`);
  const config = rows.slice(1).map(r => ({
    app:     r[0] || '',
    status:  r[1] || 'Coming Soon',
    beta:    r[2] === 'true',
    playUrl: r[3] || '',
    updated: r[4] || '',
  }));
  return json({ config });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!await isAuthenticated(request, env)) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const { app, status, beta, playUrl } = body;
  if (!app) return json({ error: 'app required' }, 400);

  const token = await getAccessToken(env);
  if (!token) return json({ error: 'Google auth failed' }, 503);

  const sheetId = env.GOOGLE_SHEET_ID.trim();
  const tabs = await getSheetMeta(token, sheetId);
  const updated = new Date().toISOString();
  const newRow = [app, status || 'Coming Soon', String(!!beta), playUrl || '', updated];

  if (!tabs.includes(CONFIG_TAB)) {
    // Create header row + first data row
    await appendRows(token, sheetId, CONFIG_TAB, [
      ['App', 'Status', 'Beta', 'PlayURL', 'Updated'],
      newRow,
    ]);
    return json({ ok: true, created: true });
  }

  // Find existing row for this app
  const rows = await readSheet(token, sheetId, `${CONFIG_TAB}!A:E`);
  const idx = rows.findIndex((r, i) => i > 0 && r[0] === app);

  if (idx === -1) {
    await appendRows(token, sheetId, CONFIG_TAB, [newRow]);
  } else {
    const rowNum = idx + 1; // 1-indexed
    await updateRange(token, sheetId, `${CONFIG_TAB}!A${rowNum}:E${rowNum}`, [newRow]);
  }

  return json({ ok: true });
}

export const onRequest = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST' } });

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
