// bskts.xyz — tokenized index baskets on Robinhood Chain (chainId 4663).
// Public read API, no key, CORS open: https://api.bskts.xyz/llms.txt
// A Hyperliquid address is the same EVM address on Robinhood Chain, so the
// Tracker can look up bskts holdings for whatever address the user entered.

export const BSKTS_API = 'https://api.bskts.xyz';
export const BSKTS_SITE = 'https://bskts.xyz';

export interface BsktsPosition {
  ticker: string;
  shares: number;
  walletShares: number;
  escrowedShares: number;
  nav: number;
  value: number;
  costBasis: number;
  avgEntry: number | null;
  unrealizedPnl: number;
  realizedPnl: number;
}

export interface BsktsOrder {
  id: string;
  escrow: string;
  ticker: string | null;
  shares: number;
  stopNav: number | null;
  tpNav: number | null;
  // bracket | take_profit | stop_loss for exits; limit buys carry amountUsdg / triggerNav
  kind: string;
  amountUsdg?: number | null;
  triggerNav?: number | null;
}

export interface BsktsWallet {
  address: string;
  chainId: number;
  eth: number;
  usdg: number;
  holdings: { ticker: string; shares: number }[];
  gasOk: boolean;
}

export interface BsktsAccount {
  positions: BsktsPosition[];
  orders: BsktsOrder[];
  wallet: BsktsWallet | null;
}

export interface BsktsSummary {
  value: number;
  costBasis: number;
  unrealizedPnl: number;
  realizedPnl: number;
  /** unrealized + realized */
  totalPnl: number;
  /** unrealized / cost basis, null when there is no cost basis */
  returnPct: number | null;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BSKTS_API}${path}`, { signal });
  if (!res.ok) {
    throw new Error(`bskts ${path} -> HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Positions, open orders and wallet for one address. Orders and wallet are
 *  best-effort: if either call fails the positions still render. */
export async function fetchBsktsAccount(address: string, signal?: AbortSignal): Promise<BsktsAccount> {
  const [positions, orders, wallet] = await Promise.all([
    getJson<{ positions: BsktsPosition[] }>(`/v1/positions/${address}`, signal).then(r => r.positions ?? []),
    getJson<{ orders: BsktsOrder[] }>(`/v1/orders/${address}`, signal)
      .then(r => r.orders ?? [])
      .catch(() => [] as BsktsOrder[]),
    getJson<BsktsWallet>(`/v1/wallet/${address}`, signal).catch(() => null),
  ]);
  return { positions, orders, wallet };
}

/** True when the address has anything worth showing on bskts: a basket
 *  position, an open order, or USDG parked on Robinhood Chain. */
export function hasBsktsActivity(account: BsktsAccount | null): boolean {
  if (!account) return false;
  if (account.positions.some(p => p.shares > 0 || p.realizedPnl !== 0)) return true;
  if (account.orders.length > 0) return true;
  if ((account.wallet?.usdg ?? 0) >= 0.01) return true;
  return false;
}

export function summarizeBskts(positions: BsktsPosition[]): BsktsSummary {
  const value = positions.reduce((s, p) => s + p.value, 0);
  const costBasis = positions.reduce((s, p) => s + p.costBasis, 0);
  const unrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const realizedPnl = positions.reduce((s, p) => s + p.realizedPnl, 0);
  return {
    value,
    costBasis,
    unrealizedPnl,
    realizedPnl,
    totalPnl: unrealizedPnl + realizedPnl,
    returnPct: costBasis > 0 ? unrealizedPnl / costBasis : null,
  };
}

/** One-line human description of an open order, e.g. "Stop $92.00 · TP $112.00". */
export function describeBsktsOrder(order: BsktsOrder): string {
  const parts: string[] = [];
  if (order.stopNav != null) parts.push(`Stop $${order.stopNav.toFixed(2)}`);
  if (order.tpNav != null) parts.push(`TP $${order.tpNav.toFixed(2)}`);
  if (order.amountUsdg != null) {
    parts.push(
      order.triggerNav != null
        ? `Limit buy $${order.amountUsdg.toFixed(2)} @ NAV ≤ $${order.triggerNav.toFixed(2)}`
        : `Buy $${order.amountUsdg.toFixed(2)}`,
    );
  }
  if (parts.length === 0) parts.push(order.kind.replace(/_/g, ' '));
  return parts.join(' · ');
}

export function basketUrl(ticker: string): string {
  return `${BSKTS_SITE}/?basket=${encodeURIComponent(ticker)}`;
}
