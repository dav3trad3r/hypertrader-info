import { useEffect, useState } from 'react';
import { fetchBsktsAccount, type BsktsAccount } from '@/lib/bskts';

// bskts NAV moves with the underlying pools; 30s matches the page's own refresh cadence.
const POLL_INTERVAL = 30000;

/** bskts positions / orders / wallet for an address, polled while mounted.
 *  A transient API error keeps the last good account instead of blanking it. */
export function useBsktsAccount(address: string | null | undefined) {
  const [account, setAccount] = useState<BsktsAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!address) {
      setAccount(null);
      setIsLoading(false);
      setIsLive(false);
      return;
    }
    const controller = new AbortController();
    setAccount(null);
    setIsLoading(true);

    const load = async () => {
      try {
        const next = await fetchBsktsAccount(address, controller.signal);
        if (controller.signal.aborted) return;
        setAccount(next);
        setIsLive(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('bskts fetch failed:', err);
        setIsLive(false);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    load();
    const id = setInterval(load, POLL_INTERVAL);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [address]);

  return { account, isLoading, isLive };
}
