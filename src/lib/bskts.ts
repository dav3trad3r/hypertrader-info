// bskts.xyz perps: index baskets executed as batched Hyperliquid perp orders.
// Every order bskts sends carries a client order id (cloid) laid out as
//   0x | b5 (tag) | basket id (1 byte) | kind (01 open, 02 close, 03 tp, 04 sl) | 24 hex random | leg (1 byte)
// per bskts' src/lib/perps/wire.ts (2026-10-01). Hyperliquid nets positions per
// asset, so the cloid is the only thing that says a fill belonged to a basket,
// and which one. Anything else on the account is ordinary Hyperliquid trading.

import type { Fill } from './hyperliquid';
import { feeInUsd } from './pnl';

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

// ---------------------------------------------------------------------------
// Per-basket positions, rebuilt from the account's fills.
//
// Port of bskts' src/lib/perps/ledger.ts (2026-10-01). Hyperliquid keeps ONE net
// position per asset per account, so a user long MAG6 and long OPUS has one
// NVDA position there and the exchange cannot say how much belongs to which
// basket. Replaying the cloid-tagged fills at average cost per basket per coin
// recovers the split, the same bookkeeping the exchange does per coin.


export interface BasketLeg {
  coin: string;
  /** signed: long > 0 */
  size: number;
  entryPx: number;
  /** Fees paid to open what is still held; a partial close takes its share away. */
  entryFeeUsd: number;
  /** Everything this leg has ever traded, in USD, for ordering the logo stack. */
  tradedUsd: number;
}

export interface BasketPosition {
  ticker: string;
  basketId: number;
  legs: Record<string, BasketLeg>;
  /** closed profit and loss, before fees */
  realizedUsd: number;
  /** every fee the basket's orders paid, bskts' builder fee included */
  feesUsd: number;
  /** the part of feesUsd that went to bskts */
  builderFeesUsd: number;
  /** first fill of the position now open; 0 when flat */
  openedAt: number;
  /** last fill of any kind */
  lastFillAt: number;
  fills: number;
  /** basket orders (open / close / tp / sl), each counted once across its legs */
  orders: number;
}

/** Sizes this small are float dust from adding and subtracting lots. */
const DUST = 1e-9;

/** Apply a fill to a signed position at average cost. Returns the profit closed (before fees). */
export function applyBasketFill(
  leg: BasketLeg,
  f: { isBuy: boolean; size: number; px: number; feeUsd: number },
): number {
  const delta = f.isBuy ? f.size : -f.size;
  const adding = leg.size === 0 || Math.sign(delta) === Math.sign(leg.size);
  leg.tradedUsd += f.size * f.px;
  if (adding) {
    const total = Math.abs(leg.size) + f.size;
    leg.entryPx = (Math.abs(leg.size) * leg.entryPx + f.size * f.px) / total;
    leg.size += delta;
    leg.entryFeeUsd += f.feeUsd;
    return 0;
  }
  const before = Math.abs(leg.size);
  const closed = Math.min(f.size, before);
  const realized = closed * (f.px - leg.entryPx) * Math.sign(leg.size);
  leg.size += delta;
  if (Math.abs(leg.size) < DUST) {
    leg.size = 0;
    leg.entryPx = 0;
    leg.entryFeeUsd = 0;
  } else if (f.size > closed) {
    // through zero: what is left was opened by this fill, with its share of the fee
    leg.entryPx = f.px;
    leg.entryFeeUsd = f.feeUsd * ((f.size - closed) / f.size);
  } else {
    leg.entryFeeUsd *= (before - closed) / before;
  }
  return realized;
}

export function isBasketOpen(pos: BasketPosition): boolean {
  return Object.values(pos.legs).some(l => l.size !== 0);
}

/** Every basket's position from the account's fills. Fills without a bskts
 *  client order id are ignored: nothing can place them in a basket. */
export function reduceBsktsFills(fills: Fill[]): BasketPosition[] {
  const out = new Map<string, BasketPosition>();
  const seenOrders = new Set<string>();
  for (const f of [...fills].sort((a, b) => a.time - b.time)) {
    const id = parseBsktsCloid(f.cloid);
    if (!id) continue;
    let pos = out.get(id.ticker);
    if (!pos) {
      pos = {
        ticker: id.ticker,
        basketId: id.basketId,
        legs: {},
        realizedUsd: 0,
        feesUsd: 0,
        builderFeesUsd: 0,
        openedAt: 0,
        lastFillAt: 0,
        fills: 0,
        orders: 0,
      };
      out.set(id.ticker, pos);
    }
    const wasOpen = isBasketOpen(pos);
    const leg = (pos.legs[f.coin] ??= { coin: f.coin, size: 0, entryPx: 0, entryFeeUsd: 0, tradedUsd: 0 });
    const feeUsd = feeInUsd(f);
    pos.realizedUsd += applyBasketFill(leg, {
      isBuy: f.side === 'B',
      size: parseFloat(f.sz) || 0,
      px: parseFloat(f.px) || 0,
      feeUsd,
    });
    pos.feesUsd += feeUsd;
    pos.builderFeesUsd += parseFloat(f.builderFee ?? '0') || 0;
    pos.fills += 1;
    pos.lastFillAt = Math.max(pos.lastFillAt, f.time);
    if (!seenOrders.has(id.orderId)) {
      seenOrders.add(id.orderId);
      pos.orders += 1;
    }
    if (!wasOpen && isBasketOpen(pos)) pos.openedAt = f.time;
    if (!isBasketOpen(pos)) pos.openedAt = 0;
  }
  return [...out.values()].sort((a, b) => b.lastFillAt - a.lastFillAt);
}

/** A basket's coins, heaviest first: by what is held now, then by what was traded. */
export function basketSymbols(pos: BasketPosition): string[] {
  return Object.values(pos.legs)
    .sort((a, b) => {
      const held = Math.abs(b.size) * b.entryPx - Math.abs(a.size) * a.entryPx;
      return held !== 0 ? held : b.tradedUsd - a.tradedUsd;
    })
    .map(l => l.coin);
}

export interface BasketValuation {
  /** Σ |size| × mark over open legs */
  valueUsd: number;
  /** Σ |size| × entry over open legs */
  costUsd: number;
  /** Σ size × (mark − entry); legs without a mark contribute 0 and set `partial` */
  unrealizedUsd: number;
  partial: boolean;
}

export function valueBasket(pos: BasketPosition, marks: Map<string, number>): BasketValuation {
  let valueUsd = 0, costUsd = 0, unrealizedUsd = 0, partial = false;
  for (const l of Object.values(pos.legs)) {
    if (l.size === 0) continue;
    const mark = marks.get(l.coin);
    costUsd += Math.abs(l.size) * l.entryPx;
    if (mark === undefined) { partial = true; continue; }
    valueUsd += Math.abs(l.size) * mark;
    unrealizedUsd += l.size * (mark - l.entryPx);
  }
  return { valueUsd, costUsd, unrealizedUsd, partial };
}

/** Mid prices for the given coins. Hyperliquid serves each builder dex's mids
 *  separately ("xyz:NVDA" lives under dex "xyz"), so one call per dex touched. */
export async function fetchMarks(coins: Iterable<string>, signal?: AbortSignal): Promise<Map<string, number>> {
  const dexes = new Set<string>();
  for (const c of coins) dexes.add(c.includes(':') ? c.slice(0, c.indexOf(':')) : '');
  const marks = new Map<string, number>();
  await Promise.all([...dexes].map(async dex => {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(dex ? { type: 'allMids', dex } : { type: 'allMids' }),
      signal,
    });
    if (!res.ok) return;
    const mids = (await res.json()) as Record<string, string>;
    for (const [coin, px] of Object.entries(mids)) {
      const n = parseFloat(px);
      if (Number.isFinite(n)) marks.set(coin, n);
    }
  }));
  return marks;
}

// ---------------------------------------------------------------------------
// Logos. bskts has no artwork per basket; its mark is the constituents' logos
// stacked, heaviest first (src/components/basket-logo.tsx). The files live at
// bskts.xyz/logos/<SYMBOL>.<ext>; nearly all are SVG.

const LOGO_EXT: Record<string, string> = { META: 'png', PONS: 'jpg', cbBTC: 'webp', UP: 'avif' };

/** "xyz:NVDA" -> "NVDA" */
export function coinSymbol(coin: string): string {
  return coin.includes(':') ? coin.slice(coin.indexOf(':') + 1) : coin;
}

export function bsktsLogoUrl(coin: string): string {
  const sym = coinSymbol(coin);
  return `${BSKTS_SITE}/logos/${sym}.${LOGO_EXT[sym] ?? 'svg'}`;
}
