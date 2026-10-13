// hypertrader.info/api/papertrade/* -> https://exchange.papertrade.xyz/*
//
// Papertrade's query API is open JSON but sends no CORS headers, so a browser on
// hypertrader.info cannot read it directly. This Worker forwards GET requests for
// an allow-listed set of read-only routes and adds the CORS headers. Nothing is
// signed or written; no credentials pass through.

const UPSTREAM = 'https://exchange.papertrade.xyz';
const PREFIX = '/api/papertrade';

// Only the per-account and protocol reads the Tracker uses.
const ALLOWED = [
  /^\/query\/accounts\/0x[0-9a-f]{40}\/(trades|funding|queue-ring|portfolio-history)$/,
  /^\/state\/leaderboard\/accounts\/0x[0-9a-f]{40}$/,
  /^\/query\/protocol\/(summary|market-stats)$/,
  /^\/state\/trading$/,
];

const ORIGINS = new Set([
  'https://hypertrader.info',
  'https://www.hypertrader.info',
  'http://localhost:8080',
  'http://localhost:5173',
]);

// Upstream data is block-indexed; a short shared cache keeps a burst of viewers
// from hammering it while staying fresh enough for a 30s-refresh dashboard.
const CACHE_TTL = 10;

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ORIGINS.has(origin) ? origin : 'https://hypertrader.info';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'GET') return json(405, { error: 'GET only' }, origin);

    const url = new URL(request.url);
    if (!url.pathname.startsWith(PREFIX)) return json(404, { error: 'not found' }, origin);
    const path = url.pathname.slice(PREFIX.length) || '/';
    if (!ALLOWED.some(re => re.test(path))) return json(404, { error: 'route not proxied' }, origin);

    const upstream = new URL(UPSTREAM + path);
    // Pass the query through as-is; Papertrade validates its own parameters.
    upstream.search = url.search;

    const res = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'hypertrader.info papertrade-proxy' },
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
    });

    const headers = new Headers(corsHeaders(origin));
    headers.set('Content-Type', res.headers.get('Content-Type') ?? 'application/json');
    headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
    return new Response(res.body, { status: res.status, headers });
  },
};
