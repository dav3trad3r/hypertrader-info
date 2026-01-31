import { useState, useEffect, memo } from 'react';
import { Activity, ArrowUpRight, ArrowDownRight, Zap, Coins, Clock, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { cn, formatCurrency, formatSize } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface LiveTradesProps {
  address: string;
  marketType: 'all' | 'perps' | 'spot';
}

interface PerpPosition {
  type: 'perp';
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  leverage: {
    type: string;
    value: number;
  };
  liquidationPx: string | null;
  cumFunding: {
    allTime: string;
    sinceOpen: string;
  };
}

interface SpotPosition {
  type: 'spot';
  coin: string;
  token: string;
  hold: string;
  total: string;
  entryNtl: string;
}

interface TwapOrder {
  twapId: number;
  coin: string;
  side: 'B' | 'A';
  sz: string;
  executedSz: string;
  executedNtl: string;
  minutes: number;
  reduceOnly: boolean;
  randomize: boolean;
  status: 'activated' | 'completed' | 'terminated' | 'canceled';
  time: number;
}

type Position = PerpPosition | SpotPosition;

interface ClearinghouseState {
  assetPositions: {
    position: {
      coin: string;
      szi: string;
      entryPx: string;
      positionValue: string;
      unrealizedPnl: string;
      returnOnEquity: string;
      leverage: { type: string; value: number };
      liquidationPx: string | null;
      cumFunding: {
        allTime: string;
        sinceChange: string;
        sinceOpen: string;
      };
    };
    type: string;
  }[];
}

interface SpotClearinghouseState {
  balances: {
    coin: string;
    token: number;
    hold: string;
    total: string;
    entryNtl: string;
  }[];
}

interface TwapHistoryItem {
  state: {
    coin: string;
    side: 'B' | 'A';
    sz: string;
    executedSz: string;
    executedNtl: string;
    minutes: number;
    reduceOnly: boolean;
    randomize: boolean;
  };
  status: {
    status: 'activated' | 'completed' | 'terminated' | 'canceled';
    twapId: number;
  };
  time: number;
}

const HYPERLIQUID_API = "https://api.hyperliquid.xyz/info";
const POLL_INTERVAL = 5000;

const PerpPositionItem = memo(function PerpPositionItem({ 
  position,
  isNew
}: { 
  position: PerpPosition;
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
  
  // Funding fees
  const fundingSinceOpen = position.cumFunding?.sinceOpen ? parseFloat(position.cumFunding.sinceOpen) : null;
  const hasFunding = fundingSinceOpen !== null && fundingSinceOpen !== 0;
  const fundingPositive = fundingSinceOpen !== null && fundingSinceOpen > 0;
  
  // Liquidation price
  const liquidationPx = position.liquidationPx ? parseFloat(position.liquidationPx) : null;
  const hasLiquidation = liquidationPx !== null && liquidationPx > 0;
  
  // Calculate distance to liquidation
  const currentPrice = entryPrice; // Approximation - we could fetch mark price for more accuracy
  const liqDistance = hasLiquidation && currentPrice > 0 
    ? ((liquidationPx - currentPrice) / currentPrice) * 100
    : null;

  return (
    <div 
      className={cn(
        "flex flex-col p-3 rounded-lg border transition-all duration-300",
        isNew ? "bg-primary/10 border-primary/30 animate-pulse" : "bg-secondary/30 border-border/50",
        "hover:bg-secondary/50"
      )}
    >
      <div className="flex items-center justify-between">
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
      
      {/* Funding & Liquidation row */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30 text-xs">
        <div className="flex items-center gap-4">
          {/* Funding fees */}
          {hasFunding && (
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Funding:</span>
              <span className={cn(
                "font-mono",
                fundingPositive ? "text-profit" : "text-loss"
              )}>
                {fundingPositive ? '+' : ''}{formatCurrency(fundingSinceOpen!)}
              </span>
            </div>
          )}
          
          {/* Liquidation price */}
          {hasLiquidation && (
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-destructive" />
              <span className="text-muted-foreground">Liq:</span>
              <span className="font-mono text-destructive">
                ${liquidationPx.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
              {liqDistance !== null && (
                <span className="text-muted-foreground">
                  ({liqDistance > 0 ? '+' : ''}{liqDistance.toFixed(1)}%)
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const SpotPositionItem = memo(function SpotPositionItem({ 
  position,
  isNew
}: { 
  position: SpotPosition;
  isNew: boolean;
}) {
  const total = parseFloat(position.total);
  const entryNtl = parseFloat(position.entryNtl);

  return (
    <div 
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-all duration-300",
        isNew ? "bg-primary/10 border-primary/30 animate-pulse" : "bg-secondary/30 border-border/50",
        "hover:bg-secondary/50"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/20">
          <Coins className="w-4 h-4 text-primary" />
        </div>
        
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">{position.coin}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
              SPOT
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">
              {formatSize(total)} tokens
            </span>
          </div>
        </div>
      </div>

      <div className="text-right">
        <span className="font-mono text-sm text-foreground">
          {formatCurrency(entryNtl)}
        </span>
        <p className="text-xs text-muted-foreground">entry value</p>
      </div>
    </div>
  );
});

const TwapOrderItem = memo(function TwapOrderItem({ 
  twap,
  isNew
}: { 
  twap: TwapOrder;
  isNew: boolean;
}) {
  const totalSize = parseFloat(twap.sz);
  const executedSize = parseFloat(twap.executedSz);
  const executedNtl = parseFloat(twap.executedNtl);
  const progress = totalSize > 0 ? (executedSize / totalSize) * 100 : 0;
  const avgPrice = executedSize > 0 ? executedNtl / executedSize : 0;
  const isBuy = twap.side === 'B';
  
  // Calculate estimated time remaining
  const elapsed = Date.now() - twap.time;
  const totalDuration = twap.minutes * 60 * 1000;
  const timeProgress = Math.min((elapsed / totalDuration) * 100, 100);
  const remainingMinutes = Math.max(0, Math.ceil((totalDuration - elapsed) / 60000));

  // Clean up coin name (remove @ prefix for spot)
  const displayCoin = twap.coin.startsWith('@') ? twap.coin.slice(1) : twap.coin;
  const isSpot = twap.coin.startsWith('@');

  return (
    <div 
      className={cn(
        "p-3 rounded-lg border transition-all duration-300",
        isNew ? "bg-primary/10 border-primary/30 animate-pulse" : "bg-secondary/30 border-border/50",
        "hover:bg-secondary/50"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            isBuy ? "bg-profit/20" : "bg-loss/20"
          )}>
            <Clock className="w-4 h-4 text-primary" />
          </div>
          
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-foreground">{displayCoin}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                TWAP
              </span>
              {isSpot && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  SPOT
                </span>
              )}
              <span className={cn(
                "text-xs font-medium",
                isBuy ? "text-profit" : "text-loss"
              )}>
                {isBuy ? 'BUY' : 'SELL'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">
                {formatSize(executedSize)} / {formatSize(totalSize)}
              </span>
              {avgPrice > 0 && (
                <span className="font-mono">
                  @ ${avgPrice.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-1">
            {isBuy ? (
              <TrendingUp className="w-3 h-3 text-profit" />
            ) : (
              <TrendingDown className="w-3 h-3 text-loss" />
            )}
            <span className="font-mono text-sm font-semibold text-foreground">
              {formatCurrency(executedNtl)}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {remainingMinutes > 0 ? `~${remainingMinutes}m left` : 'Finishing...'}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress 
          value={progress} 
          className="h-2"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{progress.toFixed(1)}% filled</span>
          <span>{twap.minutes}min TWAP{twap.randomize ? ' (randomized)' : ''}</span>
        </div>
      </div>
    </div>
  );
});

export function LiveTrades({ address, marketType }: LiveTradesProps) {
  const [perpPositions, setPerpPositions] = useState<PerpPosition[]>([]);
  const [spotPositions, setSpotPositions] = useState<SpotPosition[]>([]);
  const [twapOrders, setTwapOrders] = useState<TwapOrder[]>([]);
  const [newCoins, setNewCoins] = useState<Set<string>>(new Set());
  const [newTwapIds, setNewTwapIds] = useState<Set<number>>(new Set());
  const [isLive, setIsLive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) return;

    const fetchPositions = async () => {
      try {
        // Fetch perp (main dex), HIP-3 perp (xyz dex), spot positions, and TWAP slice fills in parallel
        const [perpResponse, xyzPerpResponse, spotResponse, twapSliceFillsResponse] = await Promise.all([
          fetch(HYPERLIQUID_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "clearinghouseState",
              user: address,
            }),
          }),
          fetch(HYPERLIQUID_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "clearinghouseState",
              user: address,
              dex: "xyz", // HIP-3 stock perps (NVDA, TSLA, etc.)
            }),
          }),
          fetch(HYPERLIQUID_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "spotClearinghouseState",
              user: address,
            }),
          }),
          fetch(HYPERLIQUID_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "userTwapSliceFills",
              user: address,
            }),
          }),
        ]);

        const allCurrentCoins = new Set([
          ...perpPositions.map(p => p.coin),
          ...spotPositions.map(p => p.coin),
        ]);

        // Process perp positions from main dex
        let mainPerps: PerpPosition[] = [];
        if (perpResponse.ok) {
          const perpData: ClearinghouseState = await perpResponse.json();
          if (perpData?.assetPositions) {
            mainPerps = perpData.assetPositions
              .filter(ap => parseFloat(ap.position.szi) !== 0)
              .map(ap => ({
                type: 'perp' as const,
                coin: ap.position.coin,
                szi: ap.position.szi,
                entryPx: ap.position.entryPx,
                positionValue: ap.position.positionValue,
                unrealizedPnl: ap.position.unrealizedPnl,
                returnOnEquity: ap.position.returnOnEquity,
                leverage: ap.position.leverage,
                liquidationPx: ap.position.liquidationPx,
                cumFunding: {
                  allTime: ap.position.cumFunding?.allTime || '0',
                  sinceOpen: ap.position.cumFunding?.sinceOpen || '0',
                },
              }));
          }
        }

        // Process HIP-3 perp positions from xyz dex
        let xyzPerps: PerpPosition[] = [];
        if (xyzPerpResponse.ok) {
          const xyzData: ClearinghouseState = await xyzPerpResponse.json();
          if (xyzData?.assetPositions) {
            xyzPerps = xyzData.assetPositions
              .filter(ap => parseFloat(ap.position.szi) !== 0)
              .map(ap => ({
                type: 'perp' as const,
                coin: ap.position.coin,
                szi: ap.position.szi,
                entryPx: ap.position.entryPx,
                positionValue: ap.position.positionValue,
                unrealizedPnl: ap.position.unrealizedPnl,
                returnOnEquity: ap.position.returnOnEquity,
                leverage: ap.position.leverage,
                liquidationPx: ap.position.liquidationPx,
                cumFunding: {
                  allTime: ap.position.cumFunding?.allTime || '0',
                  sinceOpen: ap.position.cumFunding?.sinceOpen || '0',
                },
              }));
          }
        }

        // Combine both dex positions
        setPerpPositions([...mainPerps, ...xyzPerps]);

        // Process spot positions
        if (spotResponse.ok) {
          const spotData: SpotClearinghouseState = await spotResponse.json();
          if (spotData?.balances) {
            const openSpots: SpotPosition[] = spotData.balances
              .filter(b => parseFloat(b.total) > 0 && b.coin !== 'USDC')
              .map(b => ({
                type: 'spot' as const,
                coin: b.coin,
                token: String(b.token),
                hold: b.hold,
                total: b.total,
                entryNtl: b.entryNtl,
              }));
            setSpotPositions(openSpots);
          }
        }

        // Process TWAP slice fills to identify active TWAPs
        // We look at recent fills and group by twapId to track active orders
        if (twapSliceFillsResponse.ok) {
          const twapData: Array<{ fill: any; twapId: number }> = await twapSliceFillsResponse.json();
          
          if (Array.isArray(twapData) && twapData.length > 0) {
            // Group fills by twapId and aggregate
            const twapMap = new Map<number, {
              coin: string;
              side: 'B' | 'A';
              fills: Array<{ sz: number; px: number; time: number }>;
              latestTime: number;
            }>();

            twapData.forEach(item => {
              const { fill, twapId } = item;
              const existing = twapMap.get(twapId);
              const fillData = {
                sz: parseFloat(fill.sz),
                px: parseFloat(fill.px),
                time: fill.time,
              };

              if (existing) {
                existing.fills.push(fillData);
                existing.latestTime = Math.max(existing.latestTime, fill.time);
              } else {
                twapMap.set(twapId, {
                  coin: fill.coin,
                  side: fill.side,
                  fills: [fillData],
                  latestTime: fill.time,
                });
              }
            });

            // Consider TWAPs from the last 2 hours as potentially active
            const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
            const activeTwaps: TwapOrder[] = [];

            twapMap.forEach((data, twapId) => {
              // Only show TWAPs with recent activity
              if (data.latestTime > twoHoursAgo) {
                const totalExecutedSz = data.fills.reduce((sum, f) => sum + f.sz, 0);
                const totalExecutedNtl = data.fills.reduce((sum, f) => sum + f.sz * f.px, 0);
                const earliestTime = Math.min(...data.fills.map(f => f.time));

                activeTwaps.push({
                  twapId,
                  coin: data.coin,
                  side: data.side,
                  sz: String(totalExecutedSz * 1.5), // Estimate total size (we don't have exact)
                  executedSz: String(totalExecutedSz),
                  executedNtl: String(totalExecutedNtl),
                  minutes: 30, // Default estimate
                  reduceOnly: false,
                  randomize: false,
                  status: 'activated',
                  time: earliestTime,
                });
              }
            });

            // Sort by most recent
            activeTwaps.sort((a, b) => b.time - a.time);
            
            // Check for new TWAPs
            const currentTwapIds = new Set(twapOrders.map(t => t.twapId));
            const newIds = activeTwaps
              .filter(t => !currentTwapIds.has(t.twapId))
              .map(t => t.twapId);
            
            if (newIds.length > 0 && currentTwapIds.size > 0) {
              setNewTwapIds(new Set(newIds));
              setTimeout(() => setNewTwapIds(new Set()), 2000);
            }

            setTwapOrders(activeTwaps.slice(0, 5)); // Show up to 5 recent TWAPs
          } else {
            setTwapOrders([]);
          }
        }

        // Check for new positions
        const newPositionCoins: string[] = [];
        perpPositions.forEach(p => {
          if (!allCurrentCoins.has(p.coin)) newPositionCoins.push(p.coin);
        });
        spotPositions.forEach(p => {
          if (!allCurrentCoins.has(p.coin)) newPositionCoins.push(p.coin);
        });

        if (newPositionCoins.length > 0 && allCurrentCoins.size > 0) {
          setNewCoins(new Set(newPositionCoins));
          setTimeout(() => setNewCoins(new Set()), 2000);
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

  // Filter positions by market type
  const filteredPositions: Position[] = (() => {
    if (marketType === 'perps') return perpPositions;
    if (marketType === 'spot') return spotPositions;
    return [...perpPositions, ...spotPositions];
  })();

  // Filter TWAPs by market type (spot TWAPs have @ prefix)
  const filteredTwaps = twapOrders.filter(twap => {
    if (marketType === 'all') return true;
    if (marketType === 'spot') return twap.coin.startsWith('@');
    return !twap.coin.startsWith('@');
  });

  const totalCount = filteredPositions.length;
  const totalTwapCount = filteredTwaps.length;
  const grandTotal = totalCount + totalTwapCount;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">Live Positions</h3>
          {totalTwapCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
              {totalTwapCount} TWAP{totalTwapCount !== 1 ? 's' : ''}
            </span>
          )}
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
        ) : grandTotal > 0 ? (
          <>
            {/* TWAP Orders Section */}
            {filteredTwaps.length > 0 && (
              <div className="space-y-2">
                {filteredTwaps.map((twap) => (
                  <TwapOrderItem
                    key={`twap-${twap.twapId}`}
                    twap={twap}
                    isNew={newTwapIds.has(twap.twapId)}
                  />
                ))}
              </div>
            )}

            {/* Positions Section */}
            {filteredPositions.map((position) => (
              position.type === 'perp' ? (
                <PerpPositionItem 
                  key={`perp-${position.coin}`} 
                  position={position} 
                  isNew={newCoins.has(position.coin)}
                />
              ) : (
                <SpotPositionItem 
                  key={`spot-${position.coin}`} 
                  position={position} 
                  isNew={newCoins.has(position.coin)}
                />
              )
            ))}
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No open positions</p>
            <p className="text-xs mt-1">Open positions and active TWAPs will appear here</p>
          </div>
        )}
      </div>

      {grandTotal > 0 && (
        <div className="mt-4 pt-3 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            {totalCount > 0 && `${totalCount} position${totalCount !== 1 ? 's' : ''}`}
            {totalCount > 0 && totalTwapCount > 0 && ' • '}
            {totalTwapCount > 0 && `${totalTwapCount} active TWAP${totalTwapCount !== 1 ? 's' : ''}`}
            {' • Updates every 5s'}
          </p>
        </div>
      )}
    </div>
  );
}
