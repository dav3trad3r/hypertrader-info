import { useEffect, useMemo, useState } from 'react';
import type { Fill } from '@/lib/hyperliquid';
import { fetchMarks, isBasketOpen, reduceBsktsFills, type BasketPosition } from '@/lib/bskts';
import { isPageHidden, onPageVisible } from '@/lib/visibility';

// Live marks refresh on the same cadence as Live Positions.
const MARKS_INTERVAL = 10000;

/** Per-basket positions rebuilt from bskts-tagged fills, with live mid prices
 *  for every coin still held. Pass an empty array when the filter is not bskts. */
export function useBasketPositions(fills: Fill[]) {
  const positions = useMemo(() => reduceBsktsFills(fills), [fills]);
  const openCoins = useMemo(() => {
    const coins = new Set<string>();
    for (const p of positions) if (isBasketOpen(p)) for (const l of Object.values(p.legs)) if (l.size !== 0) coins.add(l.coin);
    return [...coins].sort();
  }, [positions]);
  const coinsKey = openCoins.join(',');

  const [marks, setMarks] = useState<Map<string, number>>(new Map());
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!coinsKey) {
      setMarks(new Map());
      setIsLive(false);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const next = await fetchMarks(coinsKey.split(','), controller.signal);
        if (controller.signal.aborted) return;
        setMarks(next);
        setIsLive(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('bskts marks fetch failed:', err);
        setIsLive(false);
      }
    };
    load();
    const id = setInterval(() => { if (!isPageHidden()) load(); }, MARKS_INTERVAL);
    const offVisible = onPageVisible(load);
    return () => {
      controller.abort();
      clearInterval(id);
      offVisible();
    };
  }, [coinsKey]);

  return { positions, marks, isLive } as { positions: BasketPosition[]; marks: Map<string, number>; isLive: boolean };
}
