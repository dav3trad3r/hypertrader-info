import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { basketSymbols, isBasketOpen, valueBasket, type BasketPosition } from '@/lib/bskts';
import { BasketLogo } from '@/components/BasketLogo';

// Top Assets, by basket: the bskts counterpart of the coin-level list.

interface TopBasketsProps {
  positions: BasketPosition[];
  marks: Map<string, number>;
  limit?: number;
}

export function TopBaskets({ positions, marks, limit = 10 }: TopBasketsProps) {
  const rows = useMemo(() => {
    return positions
      .map(p => {
        const v = valueBasket(p, marks);
        const realizedNet = p.realizedUsd - p.feesUsd;
        return {
          ticker: p.ticker,
          symbols: basketSymbols(p),
          open: isBasketOpen(p),
          orders: p.orders,
          realizedNet,
          unrealized: v.unrealizedUsd,
          total: realizedNet + v.unrealizedUsd,
          traded: Object.values(p.legs).reduce((s, l) => s + l.tradedUsd, 0),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [positions, marks]);

  const shown = rows.slice(0, limit);
  const maxAbs = Math.max(0, ...shown.map(r => Math.abs(r.total)));

  if (shown.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Top Baskets</h3>
        <p className="text-sm text-muted-foreground text-center py-8">No basket data available</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">Top Performing Baskets</h3>
        <span className="text-xs text-muted-foreground">{rows.length} baskets traded</span>
      </div>

      <div className="space-y-3">
        {shown.map((r, index) => {
          const up = r.total > 0.005;
          const down = r.total < -0.005;
          const width = maxAbs > 0 ? (Math.abs(r.total) / maxAbs) * 100 : 0;
          return (
            <div key={r.ticker} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-5 text-right font-mono">{index + 1}</span>
              <BasketLogo symbols={r.symbols} size={30} reserve />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-foreground truncate">
                    {r.ticker}
                    {r.open && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary align-middle">open</span>}
                  </span>
                  <div className="flex items-center gap-1">
                    {up && <TrendingUp className="w-3 h-3 text-profit" />}
                    {down && <TrendingDown className="w-3 h-3 text-loss" />}
                    {!up && !down && <Minus className="w-3 h-3 text-muted-foreground" />}
                    <span className={cn('font-mono text-sm font-semibold', up ? 'text-profit' : down ? 'text-loss' : 'text-muted-foreground')}>
                      {formatCurrency(r.total, true, true)}
                    </span>
                  </div>
                </div>
                <div className="relative h-1.5 bg-secondary rounded-full mt-1.5 overflow-hidden">
                  <div
                    className={cn('absolute h-full rounded-full transition-all duration-500', up ? 'bg-profit' : 'bg-loss')}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                  <span>{r.orders} {r.orders === 1 ? 'order' : 'orders'}</span>
                  <span>Vol: {formatCurrency(r.traded)}</span>
                  <span className={cn(r.realizedNet >= 0 ? 'text-profit' : 'text-loss')}>
                    {formatCurrency(r.realizedNet, true, true)} realized
                  </span>
                  {r.open && (
                    <span className={cn(r.unrealized >= 0 ? 'text-profit' : 'text-loss')}>
                      {formatCurrency(r.unrealized, true, true)} open
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {rows.length > limit && (
        <p className="text-xs text-muted-foreground text-center mt-4 pt-4 border-t border-border">
          + {rows.length - limit} more baskets
        </p>
      )}
    </div>
  );
}
