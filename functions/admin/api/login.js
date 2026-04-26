/**
 * POST /admin/api/login
 * Validates the admin password and sets a signed session cookie.
 */

import { makeSessionCookie } from './_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ADMIN_PASSWORD) {
    return json({ error: 'Admin not configured' }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const password = (body.password || '').trim();

  // Constant-time comparison via timing-safe HMAC trick
  const correct = env.ADMIN_PASSWORD;
  let match = password.length === correct.length;
  let diff = 0;
  const len = Math.min(password.length, correct.length);
  for (let i = 0; i < len; i++) diff |= password.charCodeAt(i) ^ correct.charCodeAt(i);
  match = match && diff === 0;

  if (!match) {
    // Artificial 300 ms delay to slow brute-force attempts
    await new Promise(r => setTimeout(r, 300));
    return json({ error: 'Invalid password' }, 401);
  }

  const cookie = await makeSessionCookie(env.ADMIN_PASSWORD);
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
