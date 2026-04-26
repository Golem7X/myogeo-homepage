/**
 * GET /admin/api/data
 *
 * Returns signup stats per app and recent signups, read from Google Sheets.
 *
 * Response shape:
 * {
 *   apps: [{ name, total, recent: [{timestamp,email,country,ip}] }],
 *   config: [{ app, status, beta, playUrl, updated }]
 * }
 */

import { isAuthenticated, unauthorized } from './_auth.js';
import { getAccessToken, readSheet, getSheetMeta } from './_sheets.js';

const SKIP_TABS   = ['Config'];  // non-signup tabs
const RECENT_ROWS = 5;

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!await isAuthenticated(request, env)) return unauthorized();

  if (!env.GOOGLE_SHEET_ID) return json({ error: 'Sheet not configured' }, 503);

  const token = await getAccessToken(env);
  if (!token) return json({ error: 'Google auth failed' }, 503);

  const sheetId = env.GOOGLE_SHEET_ID.trim();

  // Get all tab names
  const tabs = await getSheetMeta(token, sheetId);
  const appTabs = tabs.filter(t => !SKIP_TABS.includes(t));

  // Read signup data per app tab
  const apps = await Promise.all(appTabs.map(async name => {
    const rows = await readSheet(token, sheetId, `${name}!A:E`);
    const dataRows = rows.slice(1); // skip header
    const total = dataRows.length;
    const recent = dataRows.slice(-RECENT_ROWS).reverse().map(r => ({
      timestamp: r[0] || '',
      email:     r[1] || '',
      app:       r[2] || name,
      country:   r[3] || '?',
      ip:        r[4] || '?',
    }));
    return { name, total, recent };
  }));

  // Read Config tab
  let config = [];
  if (tabs.includes('Config')) {
    const rows = await readSheet(token, sheetId, 'Config!A:E');
    config = rows.slice(1).map(r => ({
      app:     r[0] || '',
      status:  r[1] || 'Coming Soon',
      beta:    r[2] === 'true',
      playUrl: r[3] || '',
      updated: r[4] || '',
    }));
  }

  return json({ apps, config });
}

export const onRequest = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
