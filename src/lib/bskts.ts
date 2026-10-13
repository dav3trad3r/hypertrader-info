// bskts.xyz perps: index baskets executed as batched Hyperliquid perp orders.
// Every order bskts sends carries a client order id (cloid) laid out as
//   0x | b5 (tag) | basket id (1 byte) | kind (01 open, 02 close, 03 tp, 04 sl) | 24 hex random | leg (1 byte)
// per bskts' src/lib/perps/wire.ts (2026-10-01). Hyperliquid nets positions per
// asset, so the cloid is the only thing that says a fill belonged to a basket,
// and which one. Anything else on the account is ordinary Hyperliquid trading.

import type { Fill } from './hyperliquid';

export const BSKTS_SITE = 'https://bskts.xyz';

export type BsktsOrderKind = 'open' | 'close' | 'tp' | 'sl';

export interface BsktsCloid {
  basketId: number;
  /** Basket ticker, when the id is one we know; otherwise `#<id>`. */
  ticker: string;
  kind: BsktsOrderKind;
  /** The 30 hex chars every leg of one basket order shares. */
  orderId: string;
  leg: number;
}

// bskts src/lib/perps/legs.ts PERP_BASKET_ID (2026-10-11). New baskets get new ids;
// an unknown id still counts as bskts, it just shows as "#<id>".
const BASKET_TICKERS: Record<number, string> = {
  1: 'DIGI64',
  2: 'MAG6',
  3: 'INDEX2',
  4: 'FRONTIER',
  5: 'CRYPTOEQ',
  6: 'OPUS',
  7: 'FABLE',
  8: 'ORBIT',
  9: 'MAXBETA',
  10: 'SILICON',
  11: 'ETHSTACK',
  12: 'NATIVE',
  13: 'HARD',
  14: 'BEDROCK',
  15: 'TURBO',
  16: 'USCORE',
  17: 'METALS',
  18: 'ENERGY',
  19: 'MEMORY',
  20: 'BUILDOUT',
  21: 'RETAIL',
  22: 'CIRCUIT',
};

const KINDS: Record<string, BsktsOrderKind> = { '01': 'open', '02': 'close', '03': 'tp', '04': 'sl' };

const CLOID_RE = /^0x(b5([0-9a-f]{2})(0[1-4])[0-9a-f]{24})([0-9a-f]{2})$/;

/** Decode a bskts client order id. Undefined for anything that is not bskts'. */
export function parseBsktsCloid(cloid: string | null | undefined): BsktsCloid | undefined {
  const m = CLOID_RE.exec((cloid ?? '').toLowerCase());
  if (!m) return undefined;
  const basketId = parseInt(m[2], 16);
  return {
    basketId,
    ticker: BASKET_TICKERS[basketId] ?? `#${basketId}`,
    kind: KINDS[m[3]],
    orderId: m[1],
    leg: parseInt(m[4], 16),
  };
}

export function isBsktsFill(fill: Pick<Fill, 'cloid'>): boolean {
  return parseBsktsCloid(fill.cloid) !== undefined;
}

/** The perp coins bskts orders have traded on this account, e.g. for scoping
 *  a netted positions view to the assets those baskets hold. */
export function bsktsCoins(fills: Fill[]): Set<string> {
  const coins = new Set<string>();
  for (const f of fills) if (isBsktsFill(f)) coins.add(f.coin);
  return coins;
}

/** Fill counts per basket ticker, most active first. */
export function bsktsBasketCounts(fills: Fill[]): { ticker: string; fills: number }[] {
  const counts = new Map<string, number>();
  for (const f of fills) {
    const id = parseBsktsCloid(f.cloid);
    if (id) counts.set(id.ticker, (counts.get(id.ticker) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([ticker, n]) => ({ ticker, fills: n }))
    .sort((a, b) => b.fills - a.fills);
}
