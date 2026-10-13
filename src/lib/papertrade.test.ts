import { describe, it, expect, vi } from 'vitest';
import {
  fetchPapertradeTrades,
  fromRaw18,
  monthKeysOf,
  papertradeTradesToFills,
  papertradeTradingView,
  tradeNet,
  tradeNotional,
  type PapertradeTrade,
} from './papertrade';
import { attributeCosts, buildRoundTrips, computeTradeStats } from './pnl';
import { processDailyPnL, calculateSummary } from './hyperliquid';

// A real row from the public feed (ETH short at 500x, closed for a small loss).
const REAL: PapertradeTrade = {
  timestampMs: 1791934605000,
  txHash: '0x61a9',
  positionId: '517049',
  instrumentId: 1,
  symbol: 'ETH',
  assetIndex: 1,
  priceScaleRaw: '100',
  terminal: false,
  retired: false,
  isLong: false,
  entryPriceRaw: '249795',
  marginRaw: '253150000000000000000',
  leverage: 500,
  kind: 'PositionClosed',
  openedAtMs: 1791934533000,
  exitPriceRaw: '249835',
  adjustedPnlRaw: '-20268620268620268620',
  userPaidFeeRaw: '0',
  paperMintedRaw: '459770718544034428023',
  paperMintBasisRaw: '19863247863247863248',
  paperMintBatchTotalRaw: null,
};

const trade = (over: Partial<PapertradeTrade>): PapertradeTrade => ({ ...REAL, ...over });

describe('units', () => {
  it('reads 1e18 amounts and scaled prices', () => {
    expect(fromRaw18('253150000000000000000')).toBeCloseTo(253.15);
    expect(fromRaw18(null)).toBe(0);
    expect(tradeNotional(REAL)).toBeCloseTo(126575);
    expect(tradeNet(REAL)).toBeCloseTo(-20.2686, 3);
  });

  it('nets a fee off a win and books a liquidation as the whole margin', () => {
    const win = trade({ adjustedPnlRaw: '50000000000000000000', userPaidFeeRaw: '1500000000000000000' });
    expect(tradeNet(win)).toBeCloseTo(48.5);
    const liq = trade({ kind: 'Liquidated', adjustedPnlRaw: '-999000000000000000000' });
    expect(tradeNet(liq)).toBeCloseTo(-253.15);
  });
});

describe('papertradeTradesToFills', () => {
  it('makes an open and a close fill that the PnL pipeline reads as one losing trade', () => {
    const fills = papertradeTradesToFills([REAL]);
    expect(fills).toHaveLength(2);
    const [open, close] = fills;
    expect(open.side).toBe('A'); // short opens with a sell
    expect(close.side).toBe('B');
    expect(open.startPosition).toBe('0');
    expect(parseFloat(close.startPosition)).toBeCloseTo(-parseFloat(close.sz));
    expect(parseFloat(open.px)).toBeCloseTo(2497.95);
    expect(parseFloat(close.px)).toBeCloseTo(2498.35);
    expect(open.tid).toBe(517049 * 2);
    expect(close.tid).toBe(517049 * 2 + 1);

    const costs = attributeCosts(fills);
    const trips = buildRoundTrips(fills, costs);
    expect(trips).toHaveLength(1);
    expect(trips[0].isLong).toBe(false);
    expect(trips[0].net).toBeCloseTo(tradeNet(REAL), 4);
    const stats = computeTradeStats(trips);
    expect(stats.trades).toBe(1);
    const daily = processDailyPnL(fills, costs);
    expect(daily.reduce((s, d) => s + d.pnl, 0)).toBeCloseTo(tradeNet(REAL), 4);
    const summary = calculateSummary(fills, daily, costs, stats);
    expect(summary.totalPnl).toBeCloseTo(tradeNet(REAL), 4);
    // the raw pipeline counts both legs' notional, as Hyperliquid does
    expect(summary.totalVolume).toBeCloseTo(tradeNotional(REAL) * (1 + 2498.35 / 2497.95), 0);
  });

  it('restates counts and volume per position in the Papertrade view', () => {
    const view = papertradeTradingView([REAL, trade({ positionId: '9', symbol: 'BTC', priceScaleRaw: '10', entryPriceRaw: '831595', exitPriceRaw: '831605', isLong: true })], 1234)!;
    expect(view.summary.totalTrades).toBe(2);
    expect(view.summary.accountValue).toBe(1234);
    expect(view.summary.totalVolume).toBeCloseTo(
      tradeNotional(REAL) * (2498.35 / 2497.95) + tradeNotional(REAL) * (83160.5 / 83159.5),
      0,
    );
    expect(view.dailyPnL.reduce((s, d) => s + d.trades, 0)).toBe(2);
    expect(view.weeklyPnL.reduce((s, w) => s + w.trades, 0)).toBe(2);
    const eth = view.assetPerformance.find(a => a.coin === 'ETH')!;
    expect(eth.trades).toBe(1);
    expect(eth.avgPnl).toBeCloseTo(tradeNet(REAL), 4);
    expect(view.tradeStats.trades).toBe(2);
  });

  it('keeps a liquidation as a full-margin loss with no fee', () => {
    const liq = trade({ positionId: '7', kind: 'Liquidated', isLong: true });
    const fills = papertradeTradesToFills([liq]);
    const costs = attributeCosts(fills);
    const trips = buildRoundTrips(fills, costs);
    expect(trips[0].net).toBeCloseTo(-253.15);
    expect(fills[1].dir).toBe('Liquidated Long');
  });

  it('skips rows with no usable entry price and sorts by time', () => {
    const fills = papertradeTradesToFills([
      trade({ positionId: '2', openedAtMs: 2000, timestampMs: 3000 }),
      trade({ positionId: '3', entryPriceRaw: '0' }),
      trade({ positionId: '1', openedAtMs: 1000, timestampMs: 1500 }),
    ]);
    expect(fills.map(f => f.tid)).toEqual([2, 3, 4, 5]);
  });

  it('lists the months fills fall in', () => {
    const fills = papertradeTradesToFills([REAL]);
    const keys = [...monthKeysOf(fills)];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('fetchPapertradeTrades', () => {
  it('pages with the cursor until the API stops returning one', async () => {
    const pages: Record<string, unknown> = {
      '': { items: [trade({ positionId: '3' }), trade({ positionId: '2' })], nextCursor: 'c1' },
      c1: { items: [trade({ positionId: '1' })], nextCursor: null },
    };
    const fetcher = vi.fn(async (url: string) => {
      const u = new URL(url);
      expect(u.pathname).toMatch(/\/query\/accounts\/0xabc\/trades$/);
      expect(u.searchParams.get('limit')).toBe('75');
      const body = pages[u.searchParams.get('cursor') ?? ''];
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const trades = await fetchPapertradeTrades('0xABC', undefined, fetcher as unknown as typeof fetch);
    expect(trades.map(t => t.positionId)).toEqual(['3', '2', '1']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
