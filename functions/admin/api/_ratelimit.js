/**
 * KV-backed fixed-window rate limiter for /admin/api/* endpoints.
 *
 * Requires a KV namespace bound as `ADMIN_KV` in the Cloudflare Pages
 * project settings (Settings → Functions → KV namespace bindings).
 *
 * Fails OPEN when the binding is missing so login keeps working before
 * the namespace is configured. KV counters are eventually consistent,
 * so limits are approximate — good enough to stop brute force and spam,
 * not a substitute for a Cloudflare WAF rate-limiting rule.
 */

/**
 * Returns true if the request is allowed, false if the bucket is over limit.
 * @param {object} env            Pages env (needs env.ADMIN_KV)
 * @param {string} bucket         Counter name, e.g. `login:1.2.3.4`
 * @param {number} limit          Max requests per window
 * @param {number} windowSeconds  Window length in seconds
 */
export async function rateLimit(env, bucket, limit, windowSeconds) {
  const kv = env.ADMIN_KV;
  if (!kv) return true; // KV not bound yet — fail open

  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `rl:${bucket}:${windowStart}`;

  const current = parseInt((await kv.get(key)) || '0', 10);
  if (current >= limit) return false;

  await kv.put(key, String(current + 1), { expirationTtl: Math.max(60, windowSeconds * 2) });
  return true;
}

/** Returns a 429 JSON response. */
export function tooManyRequests() {
  return new Response(JSON.stringify({ error: 'Too many requests — try again later' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Retry-After': '300',
    },
  });
}

/** Best-effort client IP for per-IP buckets. */
export function clientIP(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}
