// Trade-basis PnL: fees and funding are booked on the fill that closes the position.
//
// A position's opening fee and the funding paid while it is open are held as
// "pending" costs per coin. When a fill reduces the position, the share of those
// costs matching the closed size (closed size / position size before the fill) is
// booked on that fill together with its own closing fee. Days where positions are
// only opened therefore show $0, and each closed trade shows its result net of
// every cost. Costs still pending at the end belong to positions that are open.
//
// Identity (used by the tests):
//   sum(net) = gross - totalFees + totalFunding + openFees - openFunding

import type { Fill } from './hyperliquid';

export interface FundingPayment {
  time: number;
  coin: string;
  /** Signed USD: negative when the account paid funding, positive when it received it. */
  usdc: number;
}

export interface FillCosts {
  /** This fill's own fee in USD (what was paid at the time of the fill). */
  fee: number;
  /** Fees booked on this fill: the closing share of its own fee + allocated opening fees. */
  bookedFees: number;
  /** Funding booked on this fill (signed, negative = paid). */
  bookedFunding: number;
  /** closedPnl - bookedFees + bookedFunding. Zero for fills that only open. */
  net: number;
  /** True when the fill reduced or closed a position. */
  isClose: boolean;
}

export interface CostAttribution {
  byFill: Map<number, FillCosts>;
  /** Fees paid on positions that are still open (booked when they close). */
  openFees: number;
  /** Funding on positions that are still open (signed). */
  openFunding: number;
  /** Every fee paid, in USD. */
  totalFees: number;
  /** Every funding payment (signed). */
  totalFunding: number;
}

const STABLE_FEE_TOKENS = new Set(['USDC', 'USDH', 'USDE', 'USDT', 'USDT0']);

/** Spot buys pay their fee in the token received; convert those to USD at the fill price. */
export function feeInUsd(fill: Fill): number {
  const fee = parseFloat(fill.fee) || 0;
  if (!fill.feeToken || STABLE_FEE_TOKENS.has(fill.feeToken)) return fee;
  return fee * (parseFloat(fill.px) || 0);
}

const EMPTY_COSTS: FillCosts = { fee: 0, bookedFees: 0, bookedFunding: 0, net: 0, isClose: false };

export function getFillCosts(costs: CostAttribution | undefined, fill: Fill): FillCosts {
  const found = costs?.byFill.get(fill.tid);
  if (found) return found;
  const fee = feeInUsd(fill);
  const gross = parseFloat(fill.closedPnl) || 0;
  return { ...EMPTY_COSTS, fee, bookedFees: fee, net: gross - fee, isClose: gross !== 0 };
}

export function attributeCosts(fills: Fill[], funding: FundingPayment[] = []): CostAttribution {
  const byFill = new Map<number, FillCosts>();
  const pending = new Map<string, { fees: number; funding: number }>();
  const pendingFor = (coin: string) => {
    let p = pending.get(coin);
    if (!p) {
      p = { fees: 0, funding: 0 };
      pending.set(coin, p);
    }
    return p;
  };

  // Funding first on equal timestamps: it accrued before the fill in that millisecond.
  type Event = { time: number; order: number; fill?: Fill; payment?: FundingPayment };
  const events: Event[] = [
    ...funding.map(payment => ({ time: payment.time, order: 0, payment })),
    ...fills.map(fill => ({ time: fill.time, order: 1, fill })),
  ];
  events.sort((a, b) => a.time - b.time || a.order - b.order || (a.fill?.tid ?? 0) - (b.fill?.tid ?? 0));

  let totalFees = 0;
  let totalFunding = 0;

  for (const event of events) {
    if (event.payment) {
      pendingFor(event.payment.coin).funding += event.payment.usdc;
      totalFunding += event.payment.usdc;
      continue;
    }

    const fill = event.fill!;
    const fee = feeInUsd(fill);
    totalFees += fee;

    const size = Math.abs(parseFloat(fill.sz) || 0);
    const start = parseFloat(fill.startPosition) || 0;
    const delta = fill.side === 'B' ? size : -size;

    let closeQty = 0;
    let fraction = 0;
    if (start !== 0 && Math.sign(delta) !== Math.sign(start)) {
      closeQty = Math.min(size, Math.abs(start));
      fraction = closeQty / Math.abs(start);
    } else if (start === 0 && /^(Close|Sell|Liquidat)/.test(fill.dir || '')) {
      // Rows without a startPosition (older stored fills): treat a closing fill as a full close.
      closeQty = size;
      fraction = 1;
    }

    const closeShare = size > 0 ? closeQty / size : 0;
    const ownCloseFee = fee * closeShare;
    const ownOpenFee = fee - ownCloseFee;

    const p = pendingFor(fill.coin);
    const allocatedFees = p.fees * fraction;
    const allocatedFunding = p.funding * fraction;
    p.fees -= allocatedFees;
    p.funding -= allocatedFunding;
    if (fraction >= 1) {
      p.fees = 0;
      p.funding = 0;
    }
    p.fees += ownOpenFee;

    const gross = parseFloat(fill.closedPnl) || 0;
    const bookedFees = ownCloseFee + allocatedFees;
    byFill.set(fill.tid, {
      fee,
      bookedFees,
      bookedFunding: allocatedFunding,
      net: gross - bookedFees + allocatedFunding,
      isClose: closeQty > 0,
    });
  }

  let openFees = 0;
  let openFunding = 0;
  for (const p of pending.values()) {
    openFees += p.fees;
    openFunding += p.funding;
  }

  return { byFill, openFees, openFunding, totalFees, totalFunding };
}

// --- Round trips: a "trade" is a position from open to flat ---

export interface RoundTrip {
  coin: string;
  /** Fill that opened the position, or null when it opened before the loaded history. */
  openTime: number | null;
  closeTime: number;
  /** Realized PnL of every close in the trip, net of all fees and funding booked on them. */
  net: number;
  isLong: boolean;
}

// Spot balances rarely land on exactly zero, so tiny remainders count as flat
const isFlat = (size: number, reference: number) =>
  Math.abs(size) <= Math.max(1e-9, Math.abs(reference) * 1e-6);

// Group fills into round trips per coin. A trip runs from the fill that opens a
// position to the fill that brings it back to flat; partial closes add up inside the
// trip, and a flip closes one trip and opens the next with the remainder.
// Counting fills instead would split one exit over several "trades".
export function buildRoundTrips(fills: Fill[], costs: CostAttribution): RoundTrip[] {
  const sorted = [...fills].sort((a, b) => a.time - b.time || a.tid - b.tid);
  const open = new Map<string, { openTime: number | null; net: number; isLong: boolean; hasClose: boolean }>();
  const trips: RoundTrip[] = [];

  for (const fill of sorted) {
    const size = Math.abs(parseFloat(fill.sz) || 0);
    const start = parseFloat(fill.startPosition) || 0;
    const after = start + (fill.side === 'B' ? size : -size);
    const fillCosts = getFillCosts(costs, fill);

    let trip = open.get(fill.coin);
    if (!trip) {
      trip = start === 0 && !fillCosts.isClose
        ? { openTime: fill.time, net: 0, isLong: fill.side === 'B', hasClose: false }
        // Opened before the loaded history (or a stored fill without startPosition)
        : { openTime: null, net: 0, isLong: start !== 0 ? start > 0 : fill.side === 'A', hasClose: false };
    }

    if (fillCosts.isClose) {
      trip.net += fillCosts.net;
      trip.hasClose = true;
    }

    const flipped = start !== 0 && !isFlat(after, start) && Math.sign(after) !== Math.sign(start);
    const closed = trip.hasClose && (isFlat(after, start || size) || flipped || (start === 0 && fillCosts.isClose));
    if (closed) {
      trips.push({ coin: fill.coin, openTime: trip.openTime, closeTime: fill.time, net: trip.net, isLong: trip.isLong });
      open.delete(fill.coin);
      if (flipped) open.set(fill.coin, { openTime: fill.time, net: 0, isLong: after > 0, hasClose: false });
    } else {
      open.set(fill.coin, trip);
    }
  }

  return trips;
}

export interface TradeStats {
  trades: number;
  wins: number;
  losses: number;
  /** Share of decided trades (wins + losses) that won, 0-100. */
  winRate: number;
  avgWin: number;
  avgLoss: number;
  /** Average win / average loss; null without both wins and losses. */
  payoffRatio: number | null;
  /** Win rate needed to break even at this payoff ratio, 0-100. */
  breakEvenWinRate: number | null;
  /** Gross wins / gross losses; null when nothing was lost. */
  profitFactor: number | null;
  grossWins: number;
  grossLosses: number;
  /** Net result per trade. */
  expectancy: number;
  largestWin: number;
  largestLoss: number;
  avgHoldWinMs: number | null;
  avgHoldLossMs: number | null;
}

const PNL_FLAT = 0.005;

export function computeTradeStats(trips: RoundTrip[]): TradeStats {
  const winners = trips.filter(t => t.net >= PNL_FLAT);
  const losers = trips.filter(t => t.net <= -PNL_FLAT);
  const grossWins = winners.reduce((s, t) => s + t.net, 0);
  const grossLosses = -losers.reduce((s, t) => s + t.net, 0);
  const decided = winners.length + losers.length;
  const avgWin = winners.length ? grossWins / winners.length : 0;
  const avgLoss = losers.length ? grossLosses / losers.length : 0;
  const payoffRatio = winners.length && losers.length ? avgWin / avgLoss : null;
  const avgHold = (list: RoundTrip[]) => {
    const known = list.filter(t => t.openTime !== null);
    return known.length ? known.reduce((s, t) => s + (t.closeTime - t.openTime!), 0) / known.length : null;
  };

  return {
    trades: trips.length,
    wins: winners.length,
    losses: losers.length,
    winRate: decided ? (winners.length / decided) * 100 : 0,
    avgWin,
    avgLoss,
    payoffRatio,
    breakEvenWinRate: payoffRatio !== null ? 100 / (1 + payoffRatio) : null,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : null,
    grossWins,
    grossLosses,
    expectancy: trips.length ? trips.reduce((s, t) => s + t.net, 0) / trips.length : 0,
    largestWin: winners.reduce((m, t) => Math.max(m, t.net), 0),
    largestLoss: losers.reduce((m, t) => Math.min(m, t.net), 0),
    avgHoldWinMs: avgHold(winners),
    avgHoldLossMs: avgHold(losers),
  };
}

// --- Whole-account, mark-to-market stats from Hyperliquid's portfolio history ---

export interface EquityPoint {
  time: number;
  /** Account value, including deposits. */
  accountValue: number;
  /** Cumulative PnL (mark-to-market, excludes deposits and withdrawals). */
  pnl: number;
}

export interface EquityStats {
  spanDays: number;
  /** PnL over the series, open positions marked to market. */
  pnl: number;
  /** Largest peak-to-trough fall in cumulative PnL (positive number). */
  maxDrawdown: number;
  /** maxDrawdown as a share of the account value at the peak, 0-100. */
  maxDrawdownPct: number | null;
  /** Annualised; null until there is enough history to mean anything. */
  sharpe: number | null;
  sortino: number | null;
}

/** Below this much history a Sharpe ratio is mostly noise. */
export const MIN_SHARPE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export function computeEquityStats(points: EquityPoint[]): EquityStats | null {
  if (points.length < 2) return null;
  const series = [...points].sort((a, b) => a.time - b.time);
  const spanDays = (series[series.length - 1].time - series[0].time) / DAY_MS;

  let peakPnl = series[0].pnl;
  let peakValue = series[0].accountValue;
  let maxDrawdown = 0;
  let maxDrawdownPct: number | null = null;
  for (const point of series) {
    if (point.pnl > peakPnl) {
      peakPnl = point.pnl;
      peakValue = point.accountValue;
    }
    const drawdown = peakPnl - point.pnl;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPct = peakValue > 0 ? (drawdown / peakValue) * 100 : null;
    }
  }

  // Period returns: PnL change over the account value at the start of the period
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const base = series[i - 1].accountValue;
    if (base > 0) returns.push((series[i].pnl - series[i - 1].pnl) / base);
  }

  let sharpe: number | null = null;
  let sortino: number | null = null;
  if (spanDays >= MIN_SHARPE_DAYS && returns.length >= 20) {
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const sd = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1));
    const downside = Math.sqrt(returns.reduce((s, r) => s + Math.min(r, 0) ** 2, 0) / returns.length);
    // Samples are irregular, so annualise by the average period length
    const periodsPerYear = (365 * DAY_MS) / ((series[series.length - 1].time - series[0].time) / (series.length - 1));
    if (sd > 0) sharpe = (mean / sd) * Math.sqrt(periodsPerYear);
    if (downside > 0) sortino = (mean / downside) * Math.sqrt(periodsPerYear);
  }

  return {
    spanDays,
    pnl: series[series.length - 1].pnl - series[0].pnl,
    maxDrawdown,
    maxDrawdownPct,
    sharpe,
    sortino,
  };
}
