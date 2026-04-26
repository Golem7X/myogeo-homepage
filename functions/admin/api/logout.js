/**
 * POST /admin/api/logout
 * Clears the admin session cookie.
 */

import { clearSessionCookie } from './_auth.js';

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}

export const onRequest = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
