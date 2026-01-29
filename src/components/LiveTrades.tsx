import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Activity, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { type Fill } from '@/lib/hyperliquid';
import { cn } from '@/lib/utils';

interface LiveTradesProps {
  address: string;
  initialFills: Fill[];
  marketType: 'all' | 'perps' | 'spot';
}

interface GroupedTrade {
  oid: number;
  coin: string;
  side: 'B' | 'A';
  dir: string;
  totalSize: number;
  avgPrice: number;
  totalPnl: number;
  totalFee: number;
  fillCount: number;
  latestTime: number;
  isSpot: boolean;
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

// Group fills by order ID (oid)
function groupFillsByOrder(fills: Fill[]): GroupedTrade[] {
  const orderMap = new Map<number, {
    fills: Fill[];
    totalSize: number;
    totalValue: number;
    totalPnl: number;
    totalFee: number;
    latestTime: number;
  }>();

  fills.forEach(fill => {
    const existing = orderMap.get(fill.oid);
    const size = parseFloat(fill.sz);
    const price = parseFloat(fill.px);
    const pnl = parseFloat(fill.closedPnl) || 0;
    const fee = parseFloat(fill.fee) || 0;

    if (existing) {
      existing.fills.push(fill);
      existing.totalSize += size;
      existing.totalValue += size * price;
      existing.totalPnl += pnl;
      existing.totalFee += fee;
      existing.latestTime = Math.max(existing.latestTime, fill.time);
    } else {
      orderMap.set(fill.oid, {
        fills: [fill],
        totalSize: size,
        totalValue: size * price,
        totalPnl: pnl,
        totalFee: fee,
        latestTime: fill.time,
      });
    }
  });

  return Array.from(orderMap.entries())
    .map(([oid, data]) => {
      const firstFill = data.fills[0];
      return {
        oid,
        coin: firstFill.coin.startsWith('@') ? firstFill.coin.slice(1) : firstFill.coin,
        side: firstFill.side,
        dir: firstFill.dir,
        totalSize: data.totalSize,
        avgPrice: data.totalValue / data.totalSize,
        totalPnl: data.totalPnl,
        totalFee: data.totalFee,
        fillCount: data.fills.length,
        latestTime: data.latestTime,
        isSpot: firstFill.coin.startsWith('@'),
      };
    })
    .sort((a, b) => b.latestTime - a.latestTime);
}

const TradeItem = memo(function TradeItem({ 
  trade, 
  isNew 
}: { 
  trade: GroupedTrade; 
  isNew: boolean;
}) {
  const isProfitable = trade.totalPnl > 0;
  const isLoss = trade.totalPnl < 0;
  const isBuy = trade.side === 'B';

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
            <ArrowUpRight className="w-4 h-4 text-profit" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-loss" />
          )}
        </div>
        
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">{trade.coin}</span>
            {trade.isSpot && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                SPOT
              </span>
            )}
            <span className={cn(
              "text-xs",
              isBuy ? "text-profit" : "text-loss"
            )}>
              {trade.dir}
            </span>
            {trade.fillCount > 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {trade.fillCount} fills
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">
              {trade.totalSize.toLocaleString(undefined, { maximumFractionDigits: 4 })} @ ${trade.avgPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </span>
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="flex items-center justify-end gap-2">
          {trade.totalPnl !== 0 ? (
            <span className={cn(
              "font-mono text-sm font-semibold",
              isProfitable ? "text-profit" : "text-loss"
            )}>
              {isProfitable ? '+' : ''}{formatCurrency(trade.totalPnl)}
            </span>
          ) : (
            <span className="font-mono text-sm text-muted-foreground">
              {formatCurrency(trade.totalSize * trade.avgPrice)}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {formatTime(trade.latestTime)}
        </span>
      </div>
    </div>
  );
});

export function LiveTrades({ address, initialFills, marketType }: LiveTradesProps) {
  const [fills, setFills] = useState<Fill[]>(initialFills);
  const [newOrderIds, setNewOrderIds] = useState<Set<number>>(new Set());
  const [isLive, setIsLive] = useState(true);
  const latestTidRef = useRef<number>(initialFills[0]?.tid || 0);

  function filterByMarket(fills: Fill[], type: 'all' | 'perps' | 'spot'): Fill[] {
    if (type === 'all') return fills;
    if (type === 'spot') return fills.filter(f => f.coin.startsWith('@'));
    return fills.filter(f => !f.coin.startsWith('@'));
  }

  // Group fills into trades
  const groupedTrades = useMemo(() => {
    const filtered = filterByMarket(fills, marketType);
    return groupFillsByOrder(filtered).slice(0, MAX_DISPLAY_TRADES);
  }, [fills, marketType]);

  useEffect(() => {
    // Update fills when initialFills changes
    setFills(initialFills);
    latestTidRef.current = initialFills[0]?.tid || 0;
  }, [initialFills]);

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

        const newFills: Fill[] = await response.json();
        if (!newFills || newFills.length === 0) return;

        // Find new fills (tid > latestTid)
        const trulyNewFills = newFills.filter(f => f.tid > latestTidRef.current);
        
        if (trulyNewFills.length > 0) {
          // Update latest tid
          latestTidRef.current = Math.max(...trulyNewFills.map(f => f.tid));
          
          // Merge new fills with existing
          setFills(prev => {
            const existingTids = new Set(prev.map(f => f.tid));
            const uniqueNewFills = trulyNewFills.filter(f => !existingTids.has(f.tid));
            return [...uniqueNewFills, ...prev];
          });
          
          // Mark new orders as "new" for animation
          const newOids = new Set(trulyNewFills.map(f => f.oid));
          setNewOrderIds(newOids);
          
          // Clear "new" status after animation
          setTimeout(() => {
            setNewOrderIds(new Set());
          }, 2000);
        }
      } catch (error) {
        console.error('Error polling for new trades:', error);
      }
    };

    const intervalId = setInterval(pollForNewTrades, POLL_INTERVAL);
    
    return () => clearInterval(intervalId);
  }, [address]);

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
        {groupedTrades.length > 0 ? (
          groupedTrades.map((trade) => (
            <TradeItem 
              key={trade.oid} 
              trade={trade} 
              isNew={newOrderIds.has(trade.oid)}
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

      {groupedTrades.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            Showing {groupedTrades.length} recent positions • Updates every 5s
          </p>
        </div>
      )}
    </div>
  );
}
