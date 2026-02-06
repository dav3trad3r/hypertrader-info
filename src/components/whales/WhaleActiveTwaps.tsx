import { Timer, TrendingUp, TrendingDown, ExternalLink, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { WhaleTwap } from '@/pages/Whales';

interface WhaleActiveTwapsProps {
  twaps: WhaleTwap[];
  loading: boolean;
}

function formatNotional(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WhaleActiveTwaps({ twaps, loading }: WhaleActiveTwapsProps) {
  // Sort by remaining notional (biggest pressure first)
  const sortedTwaps = [...twaps].sort((a, b) => b.remaining_notional - a.remaining_notional);
  
  // Calculate aggregate pressure
  const buyPressure = twaps
    .filter(t => t.side === 'buy')
    .reduce((sum, t) => sum + t.remaining_notional, 0);
  const sellPressure = twaps
    .filter(t => t.side === 'sell')
    .reduce((sum, t) => sum + t.remaining_notional, 0);
  const netPressure = buyPressure - sellPressure;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 bg-secondary rounded animate-pulse" />
          <div className="h-5 w-32 bg-secondary rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-secondary/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Timer className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Active Whale TWAPs</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {twaps.length} active
        </span>
      </div>

      {/* Net Pressure Indicator */}
      {twaps.length > 0 && (
        <div className={`mb-4 p-3 rounded-lg border ${
          netPressure > 0 
            ? 'bg-profit/10 border-profit/30' 
            : netPressure < 0 
              ? 'bg-loss/10 border-loss/30'
              : 'bg-secondary/50 border-border'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Net Market Pressure</span>
            <div className="flex items-center gap-2">
              {netPressure > 0 ? (
                <TrendingUp className="w-4 h-4 text-profit" />
              ) : netPressure < 0 ? (
                <TrendingDown className="w-4 h-4 text-loss" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              )}
              <span className={`text-sm font-bold ${
                netPressure > 0 ? 'text-profit' : netPressure < 0 ? 'text-loss' : 'text-muted-foreground'
              }`}>
                {netPressure > 0 ? 'BULLISH' : netPressure < 0 ? 'BEARISH' : 'NEUTRAL'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-profit" />
              <span className="text-muted-foreground">Buy:</span>
              <span className="text-profit font-medium">{formatNotional(buyPressure)}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-loss" />
              <span className="text-muted-foreground">Sell:</span>
              <span className="text-loss font-medium">{formatNotional(sellPressure)}</span>
            </div>
          </div>
        </div>
      )}

      {twaps.length === 0 ? (
        <div className="text-center py-8">
          <Timer className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No active TWAPs from tracked whales</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {sortedTwaps.map((twap) => {
            const progress = (twap.filled_size / twap.total_size) * 100;
            
            return (
              <div
                key={twap.id}
                className={`p-3 rounded-lg border ${
                  twap.side === 'buy'
                    ? 'bg-profit/5 border-profit/20'
                    : 'bg-loss/5 border-loss/20'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {twap.side === 'buy' ? (
                      <TrendingUp className="w-4 h-4 text-profit" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-loss" />
                    )}
                    <span className="font-semibold text-foreground">{twap.coin}</span>
                    <span className={`text-xs font-medium uppercase px-1.5 py-0.5 rounded ${
                      twap.side === 'buy' 
                        ? 'bg-profit/20 text-profit' 
                        : 'bg-loss/20 text-loss'
                    }`}>
                      {twap.side} pressure
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Started {formatTimeAgo(twap.start_time)}
                  </span>
                </div>

                {/* Progress */}
                <div className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="text-foreground">{progress.toFixed(1)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="text-muted-foreground">Remaining: </span>
                    <span className={`font-bold ${
                      twap.side === 'buy' ? 'text-profit' : 'text-loss'
                    }`}>
                      {formatNotional(twap.remaining_notional)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Filled: </span>
                    <span className="text-foreground">
                      {twap.filled_size.toLocaleString()} / {twap.total_size.toLocaleString()}
                    </span>
                  </div>
                  <a
                    href={`https://app.hyperliquid.xyz/explorer/address/${twap.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    {twap.whale_addresses?.label || truncateAddress(twap.address)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
