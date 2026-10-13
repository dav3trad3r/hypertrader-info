import { describe, it, expect } from 'vitest';
import {
  describeBsktsOrder,
  hasBsktsActivity,
  summarizeBskts,
  type BsktsAccount,
  type BsktsOrder,
  type BsktsPosition,
} from './bskts';

const pos = (over: Partial<BsktsPosition>): BsktsPosition => ({
  ticker: 'DIGI64',
  shares: 1,
  walletShares: 1,
  escrowedShares: 0,
  nav: 100,
  value: 100,
  costBasis: 90,
  avgEntry: 90,
  unrealizedPnl: 10,
  realizedPnl: 0,
  ...over,
});

const order = (over: Partial<BsktsOrder>): BsktsOrder => ({
  id: '1',
  escrow: '0x0',
  ticker: 'INDEX2',
  shares: 1,
  stopNav: null,
  tpNav: null,
  kind: 'bracket',
  ...over,
});

const emptyAccount: BsktsAccount = {
  positions: [],
  orders: [],
  wallet: { address: '0x0', chainId: 4663, eth: 0, usdg: 0, holdings: [], gasOk: false },
};

describe('summarizeBskts', () => {
  it('sums value, cost, pnl across positions', () => {
    const s = summarizeBskts([
      pos({ value: 100, costBasis: 90, unrealizedPnl: 10, realizedPnl: 5 }),
      pos({ ticker: 'MAG6', value: 50, costBasis: 60, unrealizedPnl: -10, realizedPnl: 0 }),
    ]);
    expect(s.value).toBeCloseTo(150);
    expect(s.costBasis).toBeCloseTo(150);
    expect(s.unrealizedPnl).toBeCloseTo(0);
    expect(s.realizedPnl).toBeCloseTo(5);
    expect(s.totalPnl).toBeCloseTo(5);
    expect(s.returnPct).toBeCloseTo(0);
  });

  it('has no return pct without a cost basis', () => {
    expect(summarizeBskts([]).returnPct).toBeNull();
    expect(summarizeBskts([pos({ costBasis: 0 })]).returnPct).toBeNull();
  });
});

describe('hasBsktsActivity', () => {
  it('is false for null or a completely empty account', () => {
    expect(hasBsktsActivity(null)).toBe(false);
    expect(hasBsktsActivity(emptyAccount)).toBe(false);
  });

  it('is true for a held basket, a closed basket with realized pnl, an order, or parked USDG', () => {
    expect(hasBsktsActivity({ ...emptyAccount, positions: [pos({})] })).toBe(true);
    expect(hasBsktsActivity({ ...emptyAccount, positions: [pos({ shares: 0, value: 0, realizedPnl: -3 })] })).toBe(true);
    expect(hasBsktsActivity({ ...emptyAccount, orders: [order({})] })).toBe(true);
    expect(hasBsktsActivity({ ...emptyAccount, wallet: { ...emptyAccount.wallet!, usdg: 25 } })).toBe(true);
  });

  it('ignores dust USDG and a zero position with no realized pnl', () => {
    expect(hasBsktsActivity({ ...emptyAccount, wallet: { ...emptyAccount.wallet!, usdg: 0.001 } })).toBe(false);
    expect(hasBsktsActivity({ ...emptyAccount, positions: [pos({ shares: 0, value: 0, unrealizedPnl: 0 })] })).toBe(false);
  });
});

describe('describeBsktsOrder', () => {
  it('describes brackets, single-sided exits and limit buys', () => {
    expect(describeBsktsOrder(order({ stopNav: 92, tpNav: 112 }))).toBe('Stop $92.00 · TP $112.00');
    expect(describeBsktsOrder(order({ kind: 'take_profit', tpNav: 112 }))).toBe('TP $112.00');
    expect(describeBsktsOrder(order({ kind: 'limit', amountUsdg: 250, triggerNav: 98 }))).toBe(
      'Limit buy $250.00 @ NAV ≤ $98.00',
    );
    expect(describeBsktsOrder(order({ kind: 'limit', amountUsdg: 250 }))).toBe('Buy $250.00');
  });

  it('falls back to the kind when nothing else is set', () => {
    expect(describeBsktsOrder(order({ kind: 'stop_loss' }))).toBe('stop loss');
  });
});
