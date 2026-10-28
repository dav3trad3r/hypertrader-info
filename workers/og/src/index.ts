// Per-trader link previews for hypertrader.info.
//
// X, Discord, Telegram and Slack never run the app's JavaScript; they read the
// HTML's og:image and show that. The SPA's index.html names one fixed card, so
// every shared link previewed the same generic image. This Worker:
//
//   /api/og/<address>.png[?market=]   renders that trader's card (1200x630 PNG)
//   /u/<address>[?market=]            the normal page, with preview tags that
//   /share/<address>[?market=]          point at the image above
//
// The numbers come from src/lib/snapshot.ts, the same calculation the Tracker
// page and the /share card use, so a preview always matches the page.
//
// Deploy (wrangler's OAuth login; a stale CLOUDFLARE_API_TOKEN in the shell
// overrides it, so unset that for the command):
//   cd workers/og && npm install && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy

import { ImageResponse } from 'workers-og';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff';
import interSemibold from '@fontsource/inter/files/inter-latin-600-normal.woff';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff';
import { loadTradingSnapshot, parseMarket, shareStats, shortAddress, type TradingSnapshot } from '../../../src/lib/snapshot';
import { resolveBsktsPerpsAccount, verifyBsktsPerpsLink } from '../../../src/lib/bsktsAccount';
import { marketLabel, type MarketType } from '../../../src/lib/hyperliquid';
import { formatCurrency } from '../../../src/lib/utils';

const SITE = 'https://hypertrader.info';
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
/** Previews are cached this long, and the image URL changes once per window. */
const TTL_SECONDS = 600;

const C = {
  bg: '#14191f',
  card: '#1a2129',
  tile: '#212931',
  fg: '#f1f3f5',
  muted: '#7e8c9a',
  teal: '#53cbb2',
  red: '#df3a3a',
  grey: '#2b343d',
};

interface Ctx { waitUntil(p: Promise<unknown>): void }

// ---------------------------------------------------------------------------
// Card

type Node = { type: string; props: Record<string, unknown> };
type Child = Node | string | number | null | false | undefined | Child[];

function h(type: string, style: Record<string, unknown>, ...children: Child[]): Node {
  const kids = (children.flat(Infinity) as Child[]).filter(c => c !== null && c !== false && c !== undefined && c !== '');
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}

function trendIcon(): Node {
  return {
    type: 'svg',
    props: {
      width: 34, height: 34, viewBox: '0 0 24 24', fill: 'none', stroke: C.teal,
      strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round',
      children: [
        { type: 'polyline', props: { points: '22 7 13.5 15.5 8.5 10.5 2 17' } },
        { type: 'polyline', props: { points: '16 7 22 7 22 13' } },
      ],
    },
  };
}

function money(v: number, sign = true): string {
  return formatCurrency(v, true, sign);
}

function tile(label: string, value: string, sub: string, valueColor: string = C.fg): Node {
  return h('div', { flexDirection: 'column', flex: 1, background: C.tile, borderRadius: 16, padding: '18px 22px' },
    h('div', { fontSize: 20, color: C.muted, fontWeight: 400 }, label),
    h('div', { fontSize: 34, color: valueColor, fontWeight: 700, marginTop: 6 }, value),
    h('div', { fontSize: 17, color: C.muted, marginTop: 4 }, sub),
  );
}

function card(opts: {
  address: string;
  market: MarketType;
  snapshot: TradingSnapshot | null;
  linkedFrom?: string;
}): Node {
  const { address, market, snapshot, linkedFrom } = opts;
  const view = snapshot?.view ?? null;
  const header = h('div', { alignItems: 'center', justifyContent: 'space-between' },
    h('div', { alignItems: 'center' },
      h('div', { width: 64, height: 64, borderRadius: 16, background: 'rgba(83,203,178,0.14)', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(83,203,178,0.35)' }, trendIcon()),
      h('div', { flexDirection: 'column', marginLeft: 18 },
        h('div', { fontSize: 40, fontWeight: 700, color: C.fg },
          h('span', {}, 'Hyper'), h('span', { color: C.teal }, 'Trader')),
        h('div', { fontSize: 19, color: C.muted, marginTop: 2 }, 'Hyperliquid PnL Tracker & Ecosystem Analytics'),
      ),
    ),
    h('div', { fontSize: 22, fontWeight: 600, color: C.teal, background: 'rgba(83,203,178,0.14)', borderRadius: 999, padding: '10px 22px' },
      marketLabel(market, 'All markets')),
  );

  const who = h('div', { flexDirection: 'column', marginTop: linkedFrom ? 22 : 30 },
    h('div', { alignItems: 'baseline' },
      h('div', { fontSize: 30, fontWeight: 600, color: C.fg, letterSpacing: 0.5 }, shortAddress(linkedFrom ?? address)),
      linkedFrom ? h('div', { fontSize: 19, color: C.muted, marginLeft: 16 }, `bskts account · perps on ${shortAddress(address)}`) : null,
    ),
  );

  const footer = h('div', { justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: 14 },
    h('div', { fontSize: 28, fontWeight: 700, color: C.teal }, 'hypertrader.info'),
    h('div', { fontSize: 18, color: C.muted },
      `Updated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} · read-only public data`),
  );

  const frame = (...body: Child[]) => h('div', {
    width: 1200, height: 630, flexDirection: 'column', padding: '48px 56px',
    background: `linear-gradient(135deg, ${C.bg} 0%, #18212b 55%, #10151a 100%)`,
    fontFamily: 'Inter', color: C.fg,
  }, header, who, ...body, footer);

  if (!view) {
    return frame(h('div', { flexDirection: 'column', marginTop: 40 },
      h('div', { fontSize: 44, fontWeight: 700, color: C.fg }, 'No trading history yet'),
      h('div', { fontSize: 24, color: C.muted, marginTop: 10 }, `Nothing on ${marketLabel(market, 'Hyperliquid')} for this address.`),
    ));
  }

  const s = view.summary;
  const stats = shareStats(view.dailyPnL);
  const up = s.totalPnl >= 0;
  const decided = s.profitableDays + s.losingDays;
  const maxAbs = Math.max(0.01, ...stats.recent.map(d => Math.abs(d.pnl)));
  const trades = market === 'papertrade' ? 'positions' : 'trades';

  const pnl = h('div', { alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 16 },
    h('div', { flexDirection: 'column' },
      h('div', { fontSize: 22, color: C.muted }, 'Total P&L'),
      h('div', { fontSize: 92, fontWeight: 700, color: up ? C.teal : C.red, lineHeight: 1.05 }, money(s.totalPnl)),
      h('div', { fontSize: 20, color: C.muted, marginTop: 6 },
        `${s.totalTrades.toLocaleString('en-US')} ${trades} · net of fees${market === 'spot' || market === 'papertrade' ? '' : ' & funding'}`),
    ),
    // last 14 days with activity
    h('div', { flexDirection: 'column', alignItems: 'flex-end' },
      h('div', { alignItems: 'flex-end', height: 110 },
        ...stats.recent.map(d => h('div', {
          width: 18, marginLeft: 6, borderRadius: 4,
          height: Math.max(8, Math.round(104 * Math.abs(d.pnl) / maxAbs)),
          background: d.pnl > 0 ? C.teal : d.pnl < 0 ? C.red : C.grey,
        })),
      ),
      h('div', { fontSize: 16, color: C.muted, marginTop: 8 }, `Last ${stats.recent.length} active days`),
    ),
  );

  const tiles = h('div', { marginTop: 22, gap: 16 },
    tile('Win rate', `${s.winRate.toFixed(1)}%`, decided ? `${s.profitableDays} of ${decided} days green` : 'no closed days'),
    tile('Volume', formatCurrency(s.totalVolume), `${s.totalTrades.toLocaleString('en-US')} ${trades}`),
    tile('Best day', s.bestDay && s.bestDay.pnl > 0 ? money(s.bestDay.pnl) : '—', s.bestDay?.date ?? '', s.bestDay && s.bestDay.pnl > 0 ? C.teal : C.fg),
    tile('Account value', s.accountValue != null ? formatCurrency(s.accountValue) : '—',
      stats.currentStreak > 0 ? `${stats.currentStreak}-day green streak` : market === 'papertrade' ? 'Papertrade balance' : 'all dexes, perps + spot'),
  );

  return frame(pnl, tiles);
}

// ---------------------------------------------------------------------------
// Data

/** Server side, Papertrade's API is reachable directly (the CORS proxy is only for browsers). */
const papertradeFetch = (url: string, init?: RequestInit) =>
  fetch(url.replace(`${SITE}/api/papertrade`, 'https://exchange.papertrade.xyz'), init);

/** A bskts account's perps wallet never changes once linked, so a found link is
 *  kept for a day (and a miss for 10 min). Saves the log scan, which the public
 *  Robinhood Chain RPC rate-limits from Workers' shared IPs. */
async function cachedBsktsLink(address: string, via: string | null): Promise<{ perpsAccount: string } | null> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`${SITE}/__cache/bskts-link/${address}`);
  const hit = await cache.match(key);
  if (hit) {
    const cached = (await hit.json()) as { perpsAccount: string } | null;
    if (cached || !via) return cached;
  }
  let link: { perpsAccount: string } | null = null;
  let ok = true;
  try {
    // Share links carry the linking transfer (?via=): one receipt read, verified
    // on-chain. Without it, scan the logs (often refused from Workers' IPs).
    const r = (via ? await verifyBsktsPerpsLink(address, via) : null) ?? (await resolveBsktsPerpsAccount(address));
    link = r ? { perpsAccount: r.perpsAccount } : null;
  } catch (err) {
    ok = false;
    console.warn('bskts account lookup failed', address, String(err));
  }
  if (ok) {
    await cache.put(key, new Response(JSON.stringify(link), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${link ? 86400 : 600}` },
    }));
  }
  return link;
}

async function loadFor(address: string, market: MarketType, via: string | null) {
  let snapshot = await loadTradingSnapshot(address, market, { papertradeFetch });
  let shownAddress = address;
  let linkedFrom: string | undefined;
  // A bskts account has no Hyperliquid history of its own: follow its transfers
  // to the perps wallet, as the page does (lib/bsktsAccount.ts).
  if (!snapshot.view && market !== 'papertrade') {
    const link = await cachedBsktsLink(address, via);
    if (link) {
      linkedFrom = address;
      shownAddress = link.perpsAccount;
      market = market === 'all' ? 'bskts' : market;
      snapshot = await loadTradingSnapshot(shownAddress, market, { papertradeFetch });
    }
  }
  return { snapshot, shownAddress, linkedFrom, market };
}

async function fonts() {
  return [
    { name: 'Inter', data: interRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: interSemibold, weight: 600 as const, style: 'normal' as const },
    { name: 'Inter', data: interBold, weight: 700 as const, style: 'normal' as const },
  ];
}

async function imageResponse(url: URL, ctx: Ctx): Promise<Response> {
  const m = /^\/api\/og\/(0x[0-9a-fA-F]{40})(?:\.png)?$/.exec(url.pathname);
  if (!m) return new Response('Not found', { status: 404 });
  const address = m[1].toLowerCase();
  const requested = parseMarket(url.searchParams.get('market'));
  const via = TX_RE.test(url.searchParams.get('via') ?? '') ? url.searchParams.get('via')! : null;

  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`${SITE}/api/og/${address}.png?market=${requested}&via=${via ?? ''}&v=${url.searchParams.get('v') ?? ''}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  let node: Node;
  let hasData = false;
  try {
    const { snapshot, shownAddress, linkedFrom, market } = await loadFor(address, requested, via);
    hasData = !!snapshot.view;
    node = card({ address: shownAddress, market, snapshot, linkedFrom });
  } catch (err) {
    console.error('og snapshot failed', address, err);
    node = card({ address, market: requested, snapshot: null });
  }
  // An empty card may be a transient upstream failure: keep it only briefly
  const ttl = hasData ? TTL_SECONDS : 60;

  const img = new ImageResponse(node as unknown as string, { width: 1200, height: 630, fonts: await fonts() });
  const res = new Response(img.body, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': `public, max-age=${ttl}`,
      'access-control-allow-origin': '*',
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ---------------------------------------------------------------------------
// Page preview tags

function attr(name: string, value: string) {
  return { element(el: Element) { el.setAttribute(name, value); } };
}

async function pageWithPreview(request: Request, url: URL): Promise<Response> {
  const res = await fetch(request);
  const m = /^\/(?:u|share)\/(0x[0-9a-fA-F]{40})\/?$/.exec(url.pathname);
  if (!m || !res.headers.get('content-type')?.includes('text/html')) return res;

  const address = m[1];
  const market = parseMarket(url.searchParams.get('market'));
  const via = TX_RE.test(url.searchParams.get('via') ?? '') ? url.searchParams.get('via')! : null;
  const short = shortAddress(address);
  const bucket = Math.floor(Date.now() / (TTL_SECONDS * 1000));
  const image = `${SITE}/api/og/${address.toLowerCase()}.png?market=${market}${via ? `&via=${via}` : ''}&v=${bucket}`;
  const q = new URLSearchParams();
  if (market !== 'all') q.set('market', market);
  if (via) q.set('via', via);
  const pageUrl = `${SITE}${url.pathname}${q.toString() ? `?${q}` : ''}`;
  const title = `${short} · Hyperliquid PnL | HyperTrader`;
  const desc = `PnL calendar, win rate and trader scorecard for ${short}${market !== 'all' ? ` (${marketLabel(market, 'all markets')})` : ''} on HyperTrader. Read-only public data.`;

  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[name="title"]', attr('content', title))
    .on('meta[name="description"]', attr('content', desc))
    .on('meta[property="og:title"]', attr('content', title))
    .on('meta[property="og:description"]', attr('content', desc))
    .on('meta[property="og:url"]', attr('content', pageUrl))
    .on('meta[property="og:image"]', attr('content', image))
    .on('meta[property="og:image:alt"]', attr('content', `HyperTrader card for ${short}`))
    .on('meta[name="twitter:title"]', attr('content', title))
    .on('meta[name="twitter:description"]', attr('content', desc))
    .on('meta[name="twitter:url"]', attr('content', pageUrl))
    .on('meta[name="twitter:image"]', attr('content', image))
    .transform(res);
}

export default {
  async fetch(request: Request, _env: unknown, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return fetch(request);
    if (url.pathname.startsWith('/api/og/')) return imageResponse(url, ctx);
    if (/^\/(u|share)\//.test(url.pathname)) {
      const seg = url.pathname.split('/')[2] ?? '';
      if (!ADDRESS_RE.test(seg)) return fetch(request);
      return pageWithPreview(request, url);
    }
    return fetch(request);
  },
};
