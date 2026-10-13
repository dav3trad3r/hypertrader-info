import {
  calculateSummary,
  processAssetPerformance,
  processDailyPnL,
  processWeeklyPnL,
  type AssetPerformance,
  type DailyPnL,
  type Fill,
  type TradingSummary,
  type WeeklyPnL,
} from './hyperliquid';
import { attributeCosts, buildRoundTrips, computeTradeStats, type CostAttribution, type FundingPayment, type TradeStats } from './pnl';

/** Everything the Tracker page renders for one set of fills. */
export interface TradingView {
  fills: Fill[];
  dailyPnL: DailyPnL[];
  weeklyPnL: WeeklyPnL[];
  assetPerformance: AssetPerformance[];
  summary: TradingSummary;
  costs: CostAttribution;
  tradeStats: TradeStats;
}

export interface TradingViewOptions {
  funding?: FundingPayment[];
  spotTokenCache?: Map<number, string>;
  accountValue?: number | null;
}

/** The one place fills turn into calendar, summary, scorecard and asset views,
 *  shared by the Hyperliquid filters and the venues that synthesise fills. */
export function buildTradingView(fills: Fill[], opts: TradingViewOptions = {}): TradingView | null {
  if (fills.length === 0) return null;
  const costs = attributeCosts(fills, opts.funding ?? []);
  const tradeStats = computeTradeStats(buildRoundTrips(fills, costs));
  const dailyPnL = processDailyPnL(fills, costs);
  const weeklyPnL = processWeeklyPnL(dailyPnL);
  const assetPerformance = processAssetPerformance(fills, opts.spotTokenCache, costs);
  const summary = calculateSummary(fills, dailyPnL, costs, tradeStats);
  if (opts.accountValue !== null && opts.accountValue !== undefined) {
    summary.accountValue = opts.accountValue;
  }
  return { fills, dailyPnL, weeklyPnL, assetPerformance, summary, costs, tradeStats };
}
