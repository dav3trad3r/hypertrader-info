import { useState, useEffect, memo } from 'react';
import { Activity, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveTradesProps {
  address: string;
  marketType: 'all' | 'perps' | 'spot';
}

interface Position {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  leverage: {
    type: string;
    value: number;
  };
  maxLeverage: number;
  cumFunding: {
    allTime: string;
    sinceOpen: string;
    sinceChange: string;
  };
}

interface ClearinghouseState {
  assetPositions: {
    position: Position;
    type: string;
  }[];
  crossMarginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
}

const HYPERLIQUID_API = "https://api.hyperliquid.xyz/info";
const POLL_INTERVAL = 5000;

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function formatSize(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(4);
}

const PositionItem = memo(function PositionItem({ 
  position,
  isNew
}: { 
  position: Position;
  isNew: boolean;
}) {
  const size = parseFloat(position.szi);
  const isLong = size > 0;
  const entryPrice = parseFloat(position.entryPx);
  const positionValue = parseFloat(position.positionValue);
  const unrealizedPnl = parseFloat(position.unrealizedPnl);
  const returnOnEquity = parseFloat(position.returnOnEquity) * 100;
  const leverage = position.leverage?.value || 1;
  const isProfitable = unrealizedPnl > 0;

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
          isLong ? "bg-profit/20" : "bg-loss/20"
        )}>
          {isLong ? (
            <ArrowUpRight className="w-4 h-4 text-profit" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-loss" />
          )}
        </div>
        
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">{position.coin}</span>
            <span className={cn(
              "text-xs font-medium",
              isLong ? "text-profit" : "text-loss"
            )}>
              {isLong ? 'LONG' : 'SHORT'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {leverage}x
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">
              {formatSize(Math.abs(size))} @ ${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </span>
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="flex items-center justify-end gap-2">
          <span className={cn(
            "font-mono text-sm font-semibold",
            isProfitable ? "text-profit" : "text-loss"
          )}>
            {isProfitable ? '+' : ''}{formatCurrency(unrealizedPnl)}
          </span>
          <span className={cn(
            "text-xs font-mono",
            isProfitable ? "text-profit/80" : "text-loss/80"
          )}>
            ({returnOnEquity >= 0 ? '+' : ''}{returnOnEquity.toFixed(2)}%)
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatCurrency(positionValue)} value
        </span>
      </div>
    </div>
  );
});

export function LiveTrades({ address, marketType }: LiveTradesProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [newCoins, setNewCoins] = useState<Set<string>>(new Set());
  const [isLive, setIsLive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) return;

    const fetchPositions = async () => {
      try {
        const response = await fetch(HYPERLIQUID_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "clearinghouseState",
            user: address,
          }),
        });

        if (!response.ok) return;

        const data: ClearinghouseState = await response.json();
        
        if (data?.assetPositions) {
          const openPositions = data.assetPositions
            .map(ap => ap.position)
            .filter(p => parseFloat(p.szi) !== 0);
          
          // Check for new positions
          const currentCoins = new Set(positions.map(p => p.coin));
          const newPositionCoins = openPositions
            .filter(p => !currentCoins.has(p.coin))
            .map(p => p.coin);
          
          if (newPositionCoins.length > 0 && positions.length > 0) {
            setNewCoins(new Set(newPositionCoins));
            setTimeout(() => setNewCoins(new Set()), 2000);
          }
          
          setPositions(openPositions);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching positions:', error);
        setIsLoading(false);
      }
    };

    fetchPositions();
    const intervalId = setInterval(fetchPositions, POLL_INTERVAL);
    
    return () => clearInterval(intervalId);
  }, [address]);

  // Filter positions by market type (perps only for now, spot positions would need different API)
  const filteredPositions = positions.filter(p => {
    if (marketType === 'spot') return false; // Spot positions use different structure
    return true; // Perps and all show perp positions
  });

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">Live Positions</h3>
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
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50 animate-pulse" />
            <p className="text-sm">Loading positions...</p>
          </div>
        ) : filteredPositions.length > 0 ? (
          filteredPositions.map((position) => (
            <PositionItem 
              key={position.coin} 
              position={position} 
              isNew={newCoins.has(position.coin)}
            />
          ))
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No open positions</p>
            <p className="text-xs mt-1">Open positions will appear here</p>
          </div>
        )}
      </div>

      {filteredPositions.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            {filteredPositions.length} open position{filteredPositions.length !== 1 ? 's' : ''} • Updates every 5s
          </p>
        </div>
      )}
    </div>
  );
}
