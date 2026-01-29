import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { type AssetPerformance } from '@/lib/hyperliquid';
import { cn } from '@/lib/utils';

interface TopAssetsProps {
  assets: AssetPerformance[];
  limit?: number;
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000000) {
    return `$${(value / 1000000000).toFixed(2)}B`;
  }
  if (absValue >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function formatVolume(value: number): string {
  if (value >= 1000000000) {
    return `$${(value / 1000000000).toFixed(2)}B`;
  }
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

// Asset colors for visual distinction
const ASSET_COLORS: Record<string, string> = {
  BTC: 'bg-orange-500',
  ETH: 'bg-blue-500',
  SOL: 'bg-purple-500',
  AVAX: 'bg-red-500',
  ARB: 'bg-sky-500',
  OP: 'bg-red-600',
  MATIC: 'bg-violet-500',
  DOGE: 'bg-yellow-500',
  LINK: 'bg-blue-600',
  UNI: 'bg-pink-500',
  AAVE: 'bg-cyan-500',
  CRV: 'bg-emerald-500',
  MKR: 'bg-teal-500',
  SNX: 'bg-indigo-500',
  COMP: 'bg-green-500',
};

function getAssetColor(coin: string): string {
  return ASSET_COLORS[coin.toUpperCase()] || 'bg-primary';
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
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white",
                  getAssetColor(asset.coin)
                )}>
                  {asset.coin.substring(0, 2).toUpperCase()}
                </div>
                
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
