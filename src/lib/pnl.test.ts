import { describe, it, expect } from 'vitest';
import { attributeCosts, feeInUsd, type FundingPayment } from './pnl';
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
