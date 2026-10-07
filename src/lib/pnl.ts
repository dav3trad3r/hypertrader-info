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
