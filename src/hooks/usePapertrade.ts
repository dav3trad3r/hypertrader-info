import { useEffect, useMemo, useState } from 'react';
import type { EquityPoint } from '@/lib/pnl';
import {
  fetchPapertradeAccount,
  fetchPapertradeEquity,
  fetchPapertradeTrades,
  monthKeysOf,
  papertradeTradesToFills,
  papertradeTradingView,
  type PapertradeAccountSummary,
  type PapertradeTrade,
} from '@/lib/papertrade';
import type { TradingView } from '@/lib/view';

const POLL_INTERVAL = 30000;

/** An address's Papertrade history and account figures, polled while mounted.
 *  Everything is empty for addresses that never traded there, which is the
 *  common case: the page shows the venue's filter only when `trades` is non-empty. */
export function usePapertrade(address: string | null | undefined) {
  const [trades, setTrades] = useState<PapertradeTrade[]>([]);
  const [account, setAccount] = useState<PapertradeAccountSummary | null>(null);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!address) {
      setTrades([]);
      setAccount(null);
      setEquity([]);
      setIsLoading(false);
      setIsLive(false);
      return;
    }
    const controller = new AbortController();
    setTrades([]);
    setAccount(null);
    setEquity([]);
    setIsLoading(true);

    const load = async () => {
      const [t, a, e] = await Promise.allSettled([
        fetchPapertradeTrades(address, controller.signal),
        fetchPapertradeAccount(address, controller.signal),
        fetchPapertradeEquity(address, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      if (t.status === 'fulfilled') setTrades(t.value);
      if (a.status === 'fulfilled') setAccount(a.value);
      if (e.status === 'fulfilled') setEquity(e.value);
      const failed = [t, a, e].filter(r => r.status === 'rejected');
      if (failed.length) console.warn('papertrade fetch failed:', failed.map(r => (r as PromiseRejectedResult).reason));
      setIsLive(t.status === 'fulfilled');
      setIsLoading(false);
    };

    load();
    const id = setInterval(load, POLL_INTERVAL);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [address]);

  const fills = useMemo(() => papertradeTradesToFills(trades), [trades]);
  const months = useMemo(() => monthKeysOf(fills), [fills]);
  const view: TradingView | null = useMemo(
    () => papertradeTradingView(trades, account?.balance ?? null),
    [trades, account?.balance],
  );

  return { trades, fills, months, account, equity, view, isLoading, isLive };
}
