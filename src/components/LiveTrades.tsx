import { useState, useEffect, useRef, memo } from 'react';
import { Activity, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { type Fill } from '@/lib/hyperliquid';
import { cn } from '@/lib/utils';

interface LiveTradesProps {
  address: string;
  initialFills: Fill[];
  marketType: 'all' | 'perps' | 'spot';
}

const HYPERLIQUID_API = "https://api.hyperliquid.xyz/info";
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_DISPLAY_TRADES = 10;

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) {
    return `${Math.floor(diff / 1000)}s ago`;
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m ago`;
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}h ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}

const TradeItem = memo(function TradeItem({ 
  fill, 
  isNew 
}: { 
  fill: Fill; 
  isNew: boolean;
}) {
  const pnl = parseFloat(fill.closedPnl) || 0;
  const isProfitable = pnl > 0;
  const isLoss = pnl < 0;
  const isBuy = fill.side === 'B';
  const coin = fill.coin.startsWith('@') ? fill.coin.slice(1) : fill.coin;
  const isSpot = fill.coin.startsWith('@');
  const volume = parseFloat(fill.sz) * parseFloat(fill.px);

  return (
    <div 
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-all duration-300",
        isNew ? "bg-primary/10 border-primary/30 animate-pulse" : "bg-secondary/30 border-border/50",
        "hover:bg-secondary/50"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          isBuy ? "bg-profit/20" : "bg-loss/20"
        )}>
          {isBuy ? (
            <ArrowUpRight className={cn("w-4 h-4", "text-profit")} />
          ) : (
            <ArrowDownRight className={cn("w-4 h-4", "text-loss")} />
          )}
        </div>
        
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">{coin}</span>
            {isSpot && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                SPOT
              </span>
            )}
            <span className={cn(
              "text-xs",
              isBuy ? "text-profit" : "text-loss"
            )}>
              {fill.dir}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{parseFloat(fill.sz).toLocaleString()} @ ${parseFloat(fill.px).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="flex items-center justify-end gap-2">
          {pnl !== 0 && (
            <span className={cn(
              "font-mono text-sm font-semibold",
              isProfitable ? "text-profit" : "text-loss"
            )}>
              {isProfitable ? '+' : ''}{formatCurrency(pnl)}
            </span>
          )}
          {pnl === 0 && (
            <span className="font-mono text-sm text-muted-foreground">
              {formatCurrency(volume)}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {formatTime(fill.time)}
        </span>
      </div>
    </div>
  );
});

export function LiveTrades({ address, initialFills, marketType }: LiveTradesProps) {
  const [trades, setTrades] = useState<Fill[]>(() => {
    const filtered = filterByMarket(initialFills, marketType);
    return filtered.slice(0, MAX_DISPLAY_TRADES);
  });
  const [newTradeIds, setNewTradeIds] = useState<Set<number>>(new Set());
  const [isLive, setIsLive] = useState(true);
  const latestTidRef = useRef<number>(initialFills[0]?.tid || 0);

  function filterByMarket(fills: Fill[], type: 'all' | 'perps' | 'spot'): Fill[] {
    if (type === 'all') return fills;
    if (type === 'spot') return fills.filter(f => f.coin.startsWith('@'));
    return fills.filter(f => !f.coin.startsWith('@'));
  }

  useEffect(() => {
    // Update trades when marketType changes
    const filtered = filterByMarket(initialFills, marketType);
    setTrades(filtered.slice(0, MAX_DISPLAY_TRADES));
    latestTidRef.current = filtered[0]?.tid || 0;
  }, [marketType, initialFills]);

  useEffect(() => {
    if (!address) return;

    const pollForNewTrades = async () => {
      try {
        const response = await fetch(HYPERLIQUID_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "userFills",
            user: address,
          }),
        });

        if (!response.ok) return;

        const fills: Fill[] = await response.json();
        if (!fills || fills.length === 0) return;

        // Filter by market type
        const filteredFills = filterByMarket(fills, marketType);
        
        // Find new trades (tid > latestTid)
        const newFills = filteredFills.filter(f => f.tid > latestTidRef.current);
        
        if (newFills.length > 0) {
          // Update latest tid
          latestTidRef.current = Math.max(...newFills.map(f => f.tid));
          
          // Add new trades to the front
          setTrades(prev => {
            const updated = [...newFills, ...prev].slice(0, MAX_DISPLAY_TRADES);
            return updated;
          });
          
          // Mark new trades as "new" for animation
          setNewTradeIds(new Set(newFills.map(f => f.tid)));
          
          // Clear "new" status after animation
          setTimeout(() => {
            setNewTradeIds(new Set());
          }, 2000);
        }
      } catch (error) {
        console.error('Error polling for new trades:', error);
      }
    };

    const intervalId = setInterval(pollForNewTrades, POLL_INTERVAL);
    
    return () => clearInterval(intervalId);
  }, [address, marketType]);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">Live Trades</h3>
        </div>
        
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isLive ? "bg-profit animate-pulse" : "bg-muted"
          )} />
          <span className="text-xs text-muted-foreground">
            {isLive ? 'Live' : 'Paused'}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {trades.length > 0 ? (
          trades.map((trade) => (
            <TradeItem 
              key={trade.tid} 
              fill={trade} 
              isNew={newTradeIds.has(trade.tid)}
            />
          ))
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent trades</p>
            <p className="text-xs mt-1">New trades will appear here</p>
          </div>
        )}
      </div>

      {trades.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            Showing {trades.length} most recent trades • Updates every 5s
          </p>
        </div>
      )}
    </div>
  );
}
