import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { type AssetPerformance } from '@/lib/hyperliquid';
import { cn, formatCurrency, formatVolume } from '@/lib/utils';
import { CoinIcon } from '@/components/CoinIcon';

interface TopAssetsProps {
  assets: AssetPerformance[];
  limit?: number;
}


export function TopAssets({ assets, limit = 10 }: TopAssetsProps) {
  const displayedAssets = useMemo(() => {
    return assets.slice(0, limit);
  }, [assets, limit]);

  const maxAbsPnl = useMemo(() => {
    return Math.max(...displayedAssets.map(a => Math.abs(a.pnl)));
  }, [displayedAssets]);

  if (displayedAssets.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Top Assets</h3>
        <p className="text-sm text-muted-foreground text-center py-8">No asset data available</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">Top Performing Assets</h3>
        <span className="text-xs text-muted-foreground">{assets.length} assets traded</span>
      </div>

      <div className="space-y-3">
        {displayedAssets.map((asset, index) => {
          const isProfitable = asset.pnl > 0;
          const isLoss = asset.pnl < 0;
          const barWidth = maxAbsPnl > 0 ? (Math.abs(asset.pnl) / maxAbsPnl) * 100 : 0;
          
          return (
            <div key={asset.coin} className="group">
              <div className="flex items-center gap-3">
                {/* Rank */}
                <span className="text-xs text-muted-foreground w-5 text-right font-mono">
                  {index + 1}
                </span>
                
                {/* Asset Icon */}
                <CoinIcon coin={asset.coin} size="md" />
                
                {/* Asset Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-foreground truncate">
                      {asset.coin}
                    </span>
                    <div className="flex items-center gap-1">
                      {isProfitable && <TrendingUp className="w-3 h-3 text-profit" />}
                      {isLoss && <TrendingDown className="w-3 h-3 text-loss" />}
                      {!isProfitable && !isLoss && <Minus className="w-3 h-3 text-muted-foreground" />}
                      <span className={cn(
                        "font-mono text-sm font-semibold",
                        isProfitable ? "text-profit" : isLoss ? "text-loss" : "text-muted-foreground"
                      )}>
                        {isProfitable ? '+' : ''}{formatCurrency(asset.pnl)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="relative h-1.5 bg-secondary rounded-full mt-1.5 overflow-hidden">
                    <div 
                      className={cn(
                        "absolute h-full rounded-full transition-all duration-500",
                        isProfitable ? "bg-profit" : "bg-loss"
                      )}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  
                  {/* Meta Info */}
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                    <span>{asset.trades} trades</span>
                    <span>Vol: {formatVolume(asset.volume)}</span>
                    <span className={cn(
                      asset.winRate >= 50 ? "text-profit" : "text-loss"
                    )}>
                      {asset.winRate.toFixed(0)}% win rate
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {assets.length > limit && (
        <p className="text-xs text-muted-foreground text-center mt-4 pt-4 border-t border-border">
          + {assets.length - limit} more assets
        </p>
      )}
    </div>
  );
}
