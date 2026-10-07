import { describe, it, expect } from 'vitest';
import { attributeCosts, buildRoundTrips, computeEquityStats, computeTradeStats, feeInUsd, type FundingPayment } from './pnl';
import { processDailyPnL, calculateSummary, formatLocalDateKey, type Fill } from './hyperliquid';

let nextTid = 1;
function fill(p: Partial<Fill> & { time: number }): Fill {
  return {
    closedPnl: '0',
    coin: 'BTC',
    crossed: true,
    dir: 'Open Long',
    hash: '0x',
    oid: 1,
    px: '100',
    side: 'B',
    startPosition: '0',
    sz: '1',
    fee: '0',
    feeToken: 'USDC',
    tid: nextTid++,
    ...p,
  };
}

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 9, 3, 12).getTime(); // a Saturday, local noon

function sumNet(fills: Fill[], costs: ReturnType<typeof attributeCosts>) {
  return fills.reduce((s, f) => s + costs.byFill.get(f.tid)!.net, 0);
}

describe('attributeCosts', () => {
  it('books the opening fee on the close, not the open', () => {
    const open = fill({ time: T0, sz: '2', fee: '1' });
    const close = fill({ time: T0 + DAY, side: 'A', dir: 'Close Long', startPosition: '2', sz: '2', fee: '1.5', closedPnl: '20' });
    const costs = attributeCosts([open, close]);

    expect(costs.byFill.get(open.tid)).toMatchObject({ net: 0, bookedFees: 0, isClose: false });
    expect(costs.byFill.get(close.tid)!.bookedFees).toBeCloseTo(2.5);
    expect(costs.byFill.get(close.tid)!.net).toBeCloseTo(17.5);
    expect(costs.openFees).toBeCloseTo(0);
  });

  it('splits opening fees and funding pro rata across partial closes', () => {
    const open = fill({ time: T0, sz: '4', fee: '4' });
    const funding: FundingPayment[] = [{ time: T0 + 1000, coin: 'BTC', usdc: -2 }];
    const half = fill({ time: T0 + 2000, side: 'A', dir: 'Close Long', startPosition: '4', sz: '1', fee: '0', closedPnl: '10' });
    const rest = fill({ time: T0 + 3000, side: 'A', dir: 'Close Long', startPosition: '3', sz: '3', fee: '0', closedPnl: '30' });
    const costs = attributeCosts([open, half, rest], funding);

    // 1/4 of the position closes first: 1/4 of $4 fees and 1/4 of -$2 funding
    expect(costs.byFill.get(half.tid)!.bookedFees).toBeCloseTo(1);
    expect(costs.byFill.get(half.tid)!.bookedFunding).toBeCloseTo(-0.5);
    expect(costs.byFill.get(half.tid)!.net).toBeCloseTo(8.5);
    expect(costs.byFill.get(rest.tid)!.bookedFees).toBeCloseTo(3);
    expect(costs.byFill.get(rest.tid)!.bookedFunding).toBeCloseTo(-1.5);
    expect(costs.openFees).toBeCloseTo(0);
    expect(costs.openFunding).toBeCloseTo(0);
  });

  it('splits a flip fill into a close of the old side and an open of the new one', () => {
    const open = fill({ time: T0, sz: '2', fee: '2' });
    const flip = fill({ time: T0 + 1000, side: 'A', dir: 'Long > Short', startPosition: '2', sz: '5', fee: '5', closedPnl: '10' });
    const costs = attributeCosts([open, flip]);

    // 2 of the 5 closes the long: $2 of the flip fee + the $2 opening fee are booked
    expect(costs.byFill.get(flip.tid)!.bookedFees).toBeCloseTo(4);
    expect(costs.byFill.get(flip.tid)!.net).toBeCloseTo(6);
    // the other $3 opened the short and stays pending
    expect(costs.openFees).toBeCloseTo(3);
  });

  it('keeps costs of still-open positions out of the daily numbers', () => {
    const open = fill({ time: T0, sz: '1', fee: '0.5' });
    const funding: FundingPayment[] = [{ time: T0 + DAY, coin: 'BTC', usdc: -0.25 }];
    const costs = attributeCosts([open], funding);

    expect(costs.byFill.get(open.tid)!.net).toBe(0);
    expect(costs.openFees).toBeCloseTo(0.5);
    expect(costs.openFunding).toBeCloseTo(-0.25);
    expect(costs.totalFees).toBeCloseTo(0.5);
    expect(costs.totalFunding).toBeCloseTo(-0.25);
  });

  it('closes against a position opened before the loaded history', () => {
    // No opening fill loaded; startPosition says a 3-unit short was already open.
    const funding: FundingPayment[] = [{ time: T0, coin: 'ETH', usdc: 1.2 }];
    const close = fill({ time: T0 + 1000, coin: 'ETH', side: 'B', dir: 'Close Short', startPosition: '-3', sz: '3', fee: '0.3', closedPnl: '-5' });
    const costs = attributeCosts([close], funding);

    expect(costs.byFill.get(close.tid)!.bookedFunding).toBeCloseTo(1.2);
    expect(costs.byFill.get(close.tid)!.net).toBeCloseTo(-5 - 0.3 + 1.2);
  });

  it('treats a stored closing fill without startPosition as a full close', () => {
    const open = fill({ time: T0, fee: '1' });
    const close = fill({ time: T0 + 1000, side: 'A', dir: 'Close Long', startPosition: '0', fee: '1', closedPnl: '5' });
    const costs = attributeCosts([open, close]);

    expect(costs.byFill.get(close.tid)!.net).toBeCloseTo(3);
    expect(costs.openFees).toBeCloseTo(0);
  });

  it('converts spot fees paid in the bought token to USD', () => {
    expect(feeInUsd(fill({ time: T0, coin: '@151', dir: 'Buy', fee: '0.001', feeToken: 'UETH', px: '3000' }))).toBeCloseTo(3);
    expect(feeInUsd(fill({ time: T0, fee: '0.4', feeToken: 'USDC', px: '3000' }))).toBeCloseTo(0.4);
  });

  it('reconciles: net + open costs = gross - fees + funding', () => {
    const fills = [
      fill({ time: T0, sz: '3', fee: '1.1' }),
      fill({ time: T0 + 10, coin: 'SOL', side: 'A', dir: 'Open Short', sz: '10', fee: '0.7' }),
      fill({ time: T0 + DAY, side: 'A', dir: 'Close Long', startPosition: '3', sz: '1', fee: '0.4', closedPnl: '12' }),
      fill({ time: T0 + 2 * DAY, coin: 'SOL', side: 'B', dir: 'Close Short', startPosition: '-10', sz: '10', fee: '0.6', closedPnl: '-4' }),
    ];
    const funding: FundingPayment[] = [
      { time: T0 + 5, coin: 'BTC', usdc: -0.3 },
      { time: T0 + DAY / 2, coin: 'SOL', usdc: 0.9 },
      { time: T0 + 3 * DAY, coin: 'BTC', usdc: -0.2 },
    ];
    const costs = attributeCosts(fills, funding);
    const gross = fills.reduce((s, f) => s + parseFloat(f.closedPnl), 0);

    expect(sumNet(fills, costs) - costs.openFees + costs.openFunding)
      .toBeCloseTo(gross - costs.totalFees + costs.totalFunding, 9);
  });
});

describe('daily PnL and summary', () => {
  it('shows a $0 day for opens only and leaves it out of the win rate', () => {
    const open = fill({ time: T0, sz: '2', fee: '1' });
    const close = fill({ time: T0 + 2 * DAY, side: 'A', dir: 'Close Long', startPosition: '2', sz: '2', fee: '1', closedPnl: '10' });
    const costs = attributeCosts([open, close]);
    const daily = processDailyPnL([open, close], costs);
    const openDay = daily.find(d => d.date === formatLocalDateKey(T0))!;
    const closeDay = daily.find(d => d.date === formatLocalDateKey(T0 + 2 * DAY))!;

    expect(openDay.pnl).toBe(0);
    expect(openDay.trades).toBe(1);
    expect(closeDay.pnl).toBeCloseTo(8);
    expect(closeDay.grossPnl).toBeCloseTo(10);
    expect(closeDay.fees).toBeCloseTo(2);

    const summary = calculateSummary([open, close], daily, costs);
    expect(summary.totalPnl).toBeCloseTo(8);
    expect(summary.profitableDays).toBe(1);
    expect(summary.losingDays).toBe(0);
    expect(summary.winRate).toBe(100);
    expect(summary.avgDailyPnl).toBeCloseTo(8);
  });
});

describe('round trips', () => {
  it('counts an exit split over several fills as one trade', () => {
    const fills = [
      fill({ time: T0, sz: '3', fee: '0' }),
      fill({ time: T0 + 1000, side: 'A', dir: 'Close Long', startPosition: '3', sz: '1', closedPnl: '481' }),
      fill({ time: T0 + 2000, side: 'A', dir: 'Close Long', startPosition: '2', sz: '1', closedPnl: '27' }),
      fill({ time: T0 + 3000, side: 'A', dir: 'Close Long', startPosition: '1', sz: '1', closedPnl: '206' }),
    ];
    const trips = buildRoundTrips(fills, attributeCosts(fills));

    expect(trips).toHaveLength(1);
    expect(trips[0].net).toBeCloseTo(714);
    expect(trips[0].openTime).toBe(T0);
    expect(trips[0].closeTime).toBe(T0 + 3000);
  });

  it('closes one trade and opens the next on a flip', () => {
    const fills = [
      fill({ time: T0, sz: '2' }),
      fill({ time: T0 + 1000, side: 'A', dir: 'Long > Short', startPosition: '2', sz: '5', closedPnl: '10' }),
      fill({ time: T0 + 2000, side: 'B', dir: 'Close Short', startPosition: '-3', sz: '3', closedPnl: '-4' }),
    ];
    const trips = buildRoundTrips(fills, attributeCosts(fills));

    expect(trips.map(t => [t.isLong, Math.round(t.net), t.openTime])).toEqual([
      [true, 10, T0],
      [false, -4, T0 + 1000],
    ]);
  });

  it('keeps an unfinished position out of the trades', () => {
    const fills = [
      fill({ time: T0, sz: '4' }),
      fill({ time: T0 + 1000, side: 'A', dir: 'Close Long', startPosition: '4', sz: '1', closedPnl: '5' }),
    ];
    expect(buildRoundTrips(fills, attributeCosts(fills))).toHaveLength(0);
  });

  it('handles a position opened before the loaded history', () => {
    const fills = [fill({ time: T0, coin: 'ETH', side: 'B', dir: 'Close Short', startPosition: '-2', sz: '2', closedPnl: '-7' })];
    const [trip] = buildRoundTrips(fills, attributeCosts(fills));

    expect(trip).toMatchObject({ coin: 'ETH', openTime: null, isLong: false });
    expect(trip.net).toBeCloseTo(-7);
  });

  it('treats a spot balance left with dust as flat', () => {
    const fills = [
      fill({ time: T0, coin: '@166', dir: 'Buy', sz: '90139.52' }),
      fill({ time: T0 + 1000, coin: '@166', side: 'A', dir: 'Sell', startPosition: '90139.52', sz: '90139.5199999', closedPnl: '12' }),
    ];
    expect(buildRoundTrips(fills, attributeCosts(fills))).toHaveLength(1);
  });
});

describe('trade stats', () => {
  const trip = (net: number, holdMs: number | null = DAY) =>
    ({ coin: 'BTC', openTime: holdMs === null ? null : T0, closeTime: T0 + (holdMs ?? 0), net, isLong: true });

  it('computes profit factor, payoff ratio and break-even win rate per trade', () => {
    const stats = computeTradeStats([trip(300), trip(100), trip(-50, 2 * DAY), trip(-150, 2 * DAY), trip(0)]);

    expect(stats.trades).toBe(5);
    expect(stats.winRate).toBe(50); // the flat trade is neither
    expect(stats.avgWin).toBe(200);
    expect(stats.avgLoss).toBe(100);
    expect(stats.payoffRatio).toBe(2);
    expect(stats.breakEvenWinRate).toBeCloseTo(33.33, 2);
    expect(stats.profitFactor).toBe(2);
    expect(stats.expectancy).toBe(40);
    expect(stats.largestWin).toBe(300);
    expect(stats.largestLoss).toBe(-150);
    expect(stats.avgHoldWinMs).toBe(DAY);
    expect(stats.avgHoldLossMs).toBe(2 * DAY);
  });

  it('has no profit factor or payoff ratio without losses', () => {
    const stats = computeTradeStats([trip(10), trip(20, null)]);
    expect(stats.profitFactor).toBeNull();
    expect(stats.payoffRatio).toBeNull();
    expect(stats.avgHoldWinMs).toBe(DAY); // the trip with an unknown open is left out
  });
});

describe('equity stats', () => {
  const series = (days: number, step: (i: number) => number) => {
    let pnl = 0;
    return Array.from({ length: days + 1 }, (_, i) => {
      if (i > 0) pnl += step(i);
      return { time: T0 + i * DAY, accountValue: 10000 + pnl, pnl };
    });
  };

  it('measures the largest peak-to-trough fall', () => {
    const stats = computeEquityStats([
      { time: T0, accountValue: 10000, pnl: 0 },
      { time: T0 + DAY, accountValue: 11000, pnl: 1000 },
      { time: T0 + 2 * DAY, accountValue: 10400, pnl: 400 },
      { time: T0 + 3 * DAY, accountValue: 11500, pnl: 1500 },
    ])!;
    expect(stats.maxDrawdown).toBe(600);
    expect(stats.maxDrawdownPct).toBeCloseTo((600 / 11000) * 100);
    expect(stats.pnl).toBe(1500);
  });

  it('withholds Sharpe until there are 90 days of history', () => {
    const short = computeEquityStats(series(30, i => (i % 3 === 0 ? -40 : 60)))!;
    expect(short.sharpe).toBeNull();

    const long = computeEquityStats(series(120, i => (i % 3 === 0 ? -40 : 60)))!;
    expect(long.sharpe).toBeGreaterThan(0);
    expect(long.sortino!).toBeGreaterThan(long.sharpe!);
  });
});
