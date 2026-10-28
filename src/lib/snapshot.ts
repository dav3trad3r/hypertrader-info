// One trader's numbers, computed the way the Tracker page computes them, for
// anything that shows a summary outside the page: the /share card and the
// link-preview image (workers/og). Until 2026-10-29 the share card ran its own,
// older calculation (no funding, no cost attribution, only the newest 2,000
// fills), so a shared card could disagree with the page (e.g. -$166.01 on the
// card vs -$138.84 on the page for the same account).
//
// Same sources as the page: the newest ~10,000 fills, funding back to the oldest
// of them, and the portfolio's account value. The one thing the page can add is
// the old stored archive for addresses saved before October; this does not.

import {
  fetchAllAvailableFills,
  fetchPortfolio,
  fetchUserFunding,
  filterFillsByMarket,
  getSpotTokenCache,
  type DailyPnL,
  type MarketType,
} from './hyperliquid';
import { buildTradingView, type TradingView } from './view';
import {
  fetchPapertradeAccount,
  fetchPapertradeTrades,
  papertradeTradingView,
} from './papertrade';

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface TradingSnapshot {
  address: string;
  market: MarketType;
  view: TradingView | null;
}

export const MARKETS: readonly MarketType[] = ['all', 'perps', 'spot', 'bskts', 'papertrade'];

export function parseMarket(value: string | null | undefined): MarketType {
  return (MARKETS as readonly string[]).includes(value ?? '') ? (value as MarketType) : 'all';
}

export async function loadTradingSnapshot(
  address: string,
  market: MarketType = 'all',
  opts: { papertradeFetch?: Fetcher } = {},
): Promise<TradingSnapshot> {
  if (market === 'papertrade') {
    const [trades, account] = await Promise.all([
      fetchPapertradeTrades(address, undefined, opts.papertradeFetch),
      fetchPapertradeAccount(address, undefined, opts.papertradeFetch).catch(() => null),
    ]);
    return { address, market, view: papertradeTradingView(trades, account?.balance ?? null) };
  }

  const [fillsRes, portfolio, spotTokenCache] = await Promise.all([
    fetchAllAvailableFills(address),
    fetchPortfolio(address).catch(() => null),
    getSpotTokenCache().catch(() => new Map<number, string>()),
  ]);
  const fills = fillsRes.fills;
  const funding = fills.length > 0 && market !== 'spot'
    ? await fetchUserFunding(address, Math.min(...fills.map(f => f.time))).catch(() => [])
    : [];
  const view = buildTradingView(filterFillsByMarket(fills, market), {
    funding,
    spotTokenCache,
    accountValue: portfolio?.accountValue ?? null,
  });
  return { address, market, view };
}

export interface ShareStats {
  /** consecutive profitable days ending at the latest day with a result */
  currentStreak: number;
  bestDay: { date: string; pnl: number };
  worstDay: { date: string; pnl: number };
  /** the last 14 days with activity, oldest first */
  recent: DailyPnL[];
}

/** The streak / best day / recent-days strip the share cards show. */
export function shareStats(dailyPnL: DailyPnL[]): ShareStats {
  let currentStreak = 0;
  let bestDay = { date: '', pnl: 0 };
  let worstDay = { date: '', pnl: 0 };
  const newestFirst = [...dailyPnL].sort((a, b) => b.date.localeCompare(a.date));
  for (const day of newestFirst) {
    if (day.pnl > 0) currentStreak++;
    else if (day.pnl < 0) break;
  }
  for (const day of dailyPnL) {
    if (day.pnl > bestDay.pnl) bestDay = { date: day.date, pnl: day.pnl };
    if (day.pnl < worstDay.pnl) worstDay = { date: day.date, pnl: day.pnl };
  }
  const recent = [...dailyPnL].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  return { currentStreak, bestDay, worstDay, recent };
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
