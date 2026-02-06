import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import type { WhaleTrade } from '@/pages/Whales';

interface WhaleTradesFeedProps {
  trades: WhaleTrade[];
  loading: boolean;
}

function formatNotional(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WhaleTradesFeed({ trades, loading }: WhaleTradesFeedProps) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 bg-secondary rounded animate-pulse" />
          <div className="h-5 w-32 bg-secondary rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-secondary/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Recent $5M+ Trades</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {trades.length} trades
        </span>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No large trades detected yet</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className={`p-3 rounded-lg border ${
                trade.side === 'buy'
                  ? 'bg-profit/5 border-profit/20'
                  : 'bg-loss/5 border-loss/20'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {trade.side === 'buy' ? (
                    <TrendingUp className="w-4 h-4 text-profit" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-loss" />
                  )}
                  <span className="font-semibold text-foreground">{trade.coin}</span>
                  <span className={`text-xs font-medium uppercase ${
                    trade.side === 'buy' ? 'text-profit' : 'text-loss'
                  }`}>
                    {trade.side}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(trade.timestamp)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {formatNotional(trade.notional)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {trade.size.toLocaleString()} @ {formatPrice(trade.price)}
                  </p>
                </div>
                <div className="text-right">
                  <a
                    href={`https://app.hyperliquid.xyz/explorer/address/${trade.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    {trade.whale_addresses?.label || truncateAddress(trade.address)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
