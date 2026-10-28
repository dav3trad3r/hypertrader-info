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
import { isPageHidden, onPageVisible } from '@/lib/visibility';

const POLL_INTERVAL = 30000;

interface Options {
  /** True while the Papertrade filter is open: only then is the data refreshed. */
  live: boolean;
}

/** An address's Papertrade history and account figures.
 *
 *  Most addresses never traded on Papertrade, and the page only needs to know
 *  whether to show the filter. So a search costs ONE call (closed trades); the
 *  account figures and equity history load only for an address that has trades,
 *  and refresh every 30 s only while the Papertrade view is open and the tab is
 *  visible. (Until 2026-10-29 every searched address polled three routes every
 *  30 s for as long as the tab stayed open: ~6,400 proxy calls a day.) */
export function usePapertrade(address: string | null | undefined, { live }: Options) {
  const [trades, setTrades] = useState<PapertradeTrade[]>([]);
  const [account, setAccount] = useState<PapertradeAccountSummary | null>(null);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const hasActivity = trades.length > 0;

  // Once per address: is there any Papertrade activity at all?
  useEffect(() => {
    setTrades([]);
    setAccount(null);
    setEquity([]);
    setIsLive(false);
    if (!address) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    fetchPapertradeTrades(address, controller.signal)
      .then(t => {
        if (controller.signal.aborted) return;
        setTrades(t);
        setIsLive(true);
      })
      .catch(err => {
        if (!controller.signal.aborted) console.warn('papertrade fetch failed:', err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [address]);

  // Account figures + equity for an address that has traded there; refreshed
  // (with the trades) only while the Papertrade view is open and visible.
  useEffect(() => {
    if (!address || !hasActivity) return;
    const controller = new AbortController();

    const loadAccount = async (withTrades: boolean) => {
      const [t, a, e] = await Promise.allSettled([
        withTrades ? fetchPapertradeTrades(address, controller.signal) : Promise.resolve(null),
        fetchPapertradeAccount(address, controller.signal),
        fetchPapertradeEquity(address, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      if (t.status === 'fulfilled' && t.value) setTrades(t.value);
      if (a.status === 'fulfilled') setAccount(a.value);
      if (e.status === 'fulfilled') setEquity(e.value);
      const failed = [t, a, e].filter(r => r.status === 'rejected');
      if (failed.length) console.warn('papertrade fetch failed:', failed.map(r => (r as PromiseRejectedResult).reason));
      setIsLive(failed.length === 0);
    };

    loadAccount(false);
    if (!live) return () => controller.abort();

    const tick = () => { if (!isPageHidden()) loadAccount(true); };
    const id = setInterval(tick, POLL_INTERVAL);
    const offVisible = onPageVisible(() => loadAccount(true));
    return () => {
      controller.abort();
      clearInterval(id);
      offVisible();
    };
  }, [address, hasActivity, live]);

  const fills = useMemo(() => papertradeTradesToFills(trades), [trades]);
  const months = useMemo(() => monthKeysOf(fills), [fills]);
  const view: TradingView | null = useMemo(
    () => papertradeTradingView(trades, account?.balance ?? null),
    [trades, account?.balance],
  );

  return { trades, fills, months, account, equity, view, isLoading, isLive };
}
