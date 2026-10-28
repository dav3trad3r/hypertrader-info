// papertrade.xyz: synthetic perpetuals settled against an LP in a HyperEVM
// contract, priced off Hyperliquid's BBO mid. Nothing trades on Hyperliquid's
// book, so an account's Papertrade history is NOT in its Hyperliquid fills; it
// comes from Papertrade's own query API (exchange.papertrade.xyz), reached via
// our CORS proxy (workers/papertrade-proxy) because that API sends no CORS
// headers. Closed positions are mapped onto the Tracker's Fill shape as an
// open + close pair so the calendar, summary and scorecard run unchanged.

import { formatLocalDateKey, processWeeklyPnL, type Fill } from './hyperliquid';
import type { EquityPoint } from './pnl';
import { buildTradingView, type TradingView } from './view';

export const PAPERTRADE_SITE = 'https://papertrade.xyz';
export const PAPERTRADE_EXCHANGE = 'https://exchange.papertrade.xyz';
export const PAPERTRADE_API: string =
  (import.meta.env?.VITE_PAPERTRADE_API as string | undefined) ?? 'https://hypertrader.info/api/papertrade';

/** One closed or liquidated position, as /query/accounts/{a}/trades returns it.
 *  *Raw fields are integer strings: USD amounts in 1e18, prices in priceScaleRaw. */
export interface PapertradeTrade {
  timestampMs: number;
  txHash: string;
  positionId: string;
  instrumentId: number;
  symbol: string;
  assetIndex: number;
  priceScaleRaw: string;
  terminal: boolean;
  retired: boolean;
  isLong: boolean;
  entryPriceRaw: string;
  marginRaw: string;
  leverage: number;
  kind: 'PositionClosed' | 'Liquidated';
  openedAtMs: number;
  exitPriceRaw: string;
  adjustedPnlRaw: string;
  userPaidFeeRaw: string;
  paperMintedRaw: string;
  paperMintBasisRaw: string;
  paperMintBatchTotalRaw: string | null;
}

export interface PapertradeAccountSummary {
  /** all-time realized PnL, net */
  realizedPnl: number;
  totalVolume: number;
  balance: number;
  queued: number;
  openNotional: number;
  unrealizedPnl: number;
  /** PAPER held (18 decimals) */
  paper: number;
  stakingRewards: number;
  rank: number | null;
  lastActiveMs: number;
}

const E18 = 1e18;
export const fromRaw18 = (raw: string | null | undefined): number => (raw ? Number(raw) / E18 : 0);
export const priceOf = (raw: string, scaleRaw: string): number => Number(raw) / Number(scaleRaw);

/** Net result of a closed position, the way Papertrade's own history shows it:
 *  a liquidation forfeits the whole isolated margin; otherwise PnL less the fee. */
export function tradeNet(t: PapertradeTrade): number {
  if (t.kind === 'Liquidated') return -fromRaw18(t.marginRaw);
  return fromRaw18(t.adjustedPnlRaw) - fromRaw18(t.userPaidFeeRaw);
}

export function tradeNotional(t: PapertradeTrade): number {
  return fromRaw18(t.marginRaw) * t.leverage;
}

/** Closed positions as Hyperliquid-shaped fills: an opening fill at entry and a
 *  closing fill at exit carrying the realized PnL and fee, so the existing PnL
 *  pipeline (costs, round trips, calendar) treats each position as one trade.
 *  tid is derived from the position id so the two legs stay unique and stable. */
export function papertradeTradesToFills(trades: PapertradeTrade[]): Fill[] {
  const fills: Fill[] = [];
  for (const t of trades) {
    const entry = priceOf(t.entryPriceRaw, t.priceScaleRaw);
    const exit = priceOf(t.exitPriceRaw, t.priceScaleRaw);
    if (!(entry > 0)) continue;
    const size = tradeNotional(t) / entry;
    if (!(size > 0)) continue;
    const pid = Number(t.positionId);
    const sz = size.toString();
    const liquidated = t.kind === 'Liquidated';
    // closedPnl is gross; the pipeline nets the fee off it. A liquidation's loss
    // is the margin itself, with no separate fee.
    const gross = liquidated ? -fromRaw18(t.marginRaw) : fromRaw18(t.adjustedPnlRaw);
    const fee = liquidated ? 0 : fromRaw18(t.userPaidFeeRaw);
    const side = t.isLong ? 'Long' : 'Short';
    fills.push({
      coin: t.symbol,
      px: entry.toString(),
      sz,
      side: t.isLong ? 'B' : 'A',
      time: t.openedAtMs,
      startPosition: '0',
      dir: `Open ${side}`,
      closedPnl: '0',
      hash: t.txHash,
      oid: pid,
      crossed: true,
      fee: '0',
      feeToken: 'USDC',
      tid: pid * 2,
    });
    fills.push({
      coin: t.symbol,
      px: exit.toString(),
      sz,
      side: t.isLong ? 'A' : 'B',
      time: Math.max(t.timestampMs, t.openedAtMs + 1),
      startPosition: t.isLong ? sz : `-${sz}`,
      dir: liquidated ? `Liquidated ${side}` : `Close ${side}`,
      closedPnl: gross.toString(),
      hash: t.txHash,
      oid: pid,
      crossed: true,
      fee: fee.toString(),
      feeToken: 'USDC',
      tid: pid * 2 + 1,
    });
  }
  return fills.sort((a, b) => a.time - b.time || a.tid - b.tid);
}

/** 'YYYY-MM' keys (local time) for every month a fill lands in. */
export function monthKeysOf(fills: Fill[]): Set<string> {
  const keys = new Set<string>();
  for (const f of fills) {
    const d = new Date(f.time);
    keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson<T>(path: string, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<T> {
  const res = await fetcher(`${PAPERTRADE_API}${path}`, { signal });
  if (!res.ok) throw new Error(`papertrade ${path} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const PAGE = 75; // the only page size the trades route accepts
const MAX_PAGES = 40;

/** Every closed position for an address, newest first. */
export async function fetchPapertradeTrades(
  address: string,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<PapertradeTrade[]> {
  const a = address.toLowerCase();
  const out: PapertradeTrade[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    // The API only accepts each route's canonical URL: the first page takes
    // `limit`, later pages take `cursor` alone (adding limit is a 400, which
    // broke every trader with more than one page, found 2026-10-29).
    const q = cursor ? new URLSearchParams({ cursor }) : new URLSearchParams({ limit: String(PAGE) });
    const res: { items: PapertradeTrade[]; nextCursor: string | null } = await getJson(
      `/query/accounts/${a}/trades?${q}`,
      signal,
      fetcher,
    );
    out.push(...(res.items ?? []));
    if (!res.nextCursor || res.nextCursor === cursor) break;
    cursor = res.nextCursor;
  }
  return out;
}

interface LeaderboardRow {
  address: string;
  realizedPnl: string;
  totalWindowedPnl: string;
  totalVolume: string;
  lastActiveTs: number;
  currentBalance: string;
  currentQueued: string;
  currentOpenNotional: string;
  currentUnrealizedPnl: string;
  paperTotal: string;
  stakingRewards?: string;
  _leaderboardRank?: number;
}

/** Account figures from the leaderboard's self row (window "all"). Null when the
 *  address has never traded on Papertrade. */
export async function fetchPapertradeAccount(
  address: string,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<PapertradeAccountSummary | null> {
  const a = address.toLowerCase();
  const res: { ok: boolean; selfRow: LeaderboardRow | null } = await getJson(
    `/state/leaderboard/accounts/${a}?window=all`,
    signal,
    fetcher,
  );
  const r = res.selfRow;
  if (!r) return null;
  return {
    realizedPnl: fromRaw18(r.realizedPnl),
    totalVolume: fromRaw18(r.totalVolume),
    balance: fromRaw18(r.currentBalance),
    queued: fromRaw18(r.currentQueued),
    openNotional: fromRaw18(r.currentOpenNotional),
    unrealizedPnl: fromRaw18(r.currentUnrealizedPnl),
    paper: fromRaw18(r.paperTotal),
    stakingRewards: fromRaw18(r.stakingRewards),
    rank: r._leaderboardRank ?? null,
    lastActiveMs: r.lastActiveTs * 1000,
  };
}

interface PortfolioHistory {
  baseTimeMs: number;
  timeOffsetsMs: number[];
  columns: { equity: number[]; pnl: number[] };
}

/** Equity / cumulative PnL samples for the Scorecard's whole-account stats. */
export async function fetchPapertradeEquity(
  address: string,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<EquityPoint[]> {
  const a = address.toLowerCase();
  const h: PortfolioHistory = await getJson(`/query/accounts/${a}/portfolio-history?range=all`, signal, fetcher);
  return h.timeOffsetsMs.map((off, i) => ({
    time: h.baseTimeMs + off,
    accountValue: h.columns.equity[i],
    pnl: h.columns.pnl[i],
  }));
}

/** A closing fill (one per position) as opposed to the synthetic opening leg. */
const isCloseLeg = (f: Fill): boolean => /^(Close|Liquidated)/.test(f.dir);

/** The Tracker view for Papertrade: the shared pipeline over the synthesised
 *  fills, with counts and volume restated per POSITION. Hyperliquid's own views
 *  count fills (an open and a close are two "trades" and both legs' notional is
 *  volume), which is how Hyperliquid reports; Papertrade reports positions, so
 *  showing "102 trades" beside its "51 closed positions" would read as a bug. */
export function papertradeTradingView(trades: PapertradeTrade[], accountValue: number | null = null): TradingView | null {
  const fills = papertradeTradesToFills(trades);
  const view = buildTradingView(fills, { accountValue });
  if (!view) return null;

  const closesByDay = new Map<string, number>();
  const byCoin = new Map<string, { trades: number; volume: number }>();
  let totalVolume = 0;
  for (const f of fills) {
    if (!isCloseLeg(f)) continue;
    const day = formatLocalDateKey(f.time);
    closesByDay.set(day, (closesByDay.get(day) ?? 0) + 1);
    const notional = (parseFloat(f.px) || 0) * (parseFloat(f.sz) || 0);
    const c = byCoin.get(f.coin) ?? { trades: 0, volume: 0 };
    c.trades += 1;
    c.volume += notional;
    byCoin.set(f.coin, c);
    totalVolume += notional;
  }

  const dailyPnL = view.dailyPnL.map(d => ({ ...d, trades: closesByDay.get(d.date) ?? 0 }));
  const assetPerformance = view.assetPerformance.map(a => {
    const c = byCoin.get(a.coin);
    return c ? { ...a, trades: c.trades, volume: c.volume, avgPnl: c.trades > 0 ? a.pnl / c.trades : 0 } : a;
  });
  return {
    ...view,
    dailyPnL,
    weeklyPnL: processWeeklyPnL(dailyPnL),
    assetPerformance,
    summary: { ...view.summary, totalTrades: closesByDay.size ? [...closesByDay.values()].reduce((s, n) => s + n, 0) : 0, totalVolume },
  };
}
