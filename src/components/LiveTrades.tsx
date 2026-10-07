import { useState, useEffect, memo } from 'react';
import { Activity, ArrowUpRight, ArrowDownRight, Zap, Clock, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { cn, formatCurrency, formatSize } from '@/lib/utils';
import { getPerpDexNames } from '@/lib/hyperliquid';
import { Progress } from '@/components/ui/progress';
import { CoinIcon } from '@/components/CoinIcon';

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
    timestamp: number;
  };
  status: {
    status: 'activated' | 'completed' | 'terminated' | 'canceled';
  };
  time: number;
  twapId: number;
}

interface TwapSliceFillResponse {
  twapId: number;
  fill: {
    coin: string;
    sz: string;
    px: string;
    time: number;
    side: 'B' | 'A';
    fee: string;
  };
}

const HYPERLIQUID_API = "https://api.hyperliquid.xyz/info";
const POLL_INTERVAL = 10000; // 10 seconds to reduce API load

// Get the proxy URL for edge function
function getProxyUrl(): string | null {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (!projectId) return null;
  return `https://${projectId}.supabase.co/functions/v1/hyperliquid-proxy`;
}

// Make API request - tries proxy first, falls back to direct
async function makeApiRequest(payload: object): Promise<Response> {
  const proxyUrl = getProxyUrl();
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  // Try proxy first if available
  if (proxyUrl && anonKey) {
    try {
      const response = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        return response;
      }
      
      // If rate limited, throw specific error
      if (response.status === 429) {
        const error = await response.json();
        throw new Error(error.error || 'Rate limit exceeded');
      }
      
      // Fall through to direct API for other errors
      console.warn('Proxy request failed, falling back to direct API');
    } catch (error) {
      console.warn('Proxy unavailable, using direct API:', error);
    }
  }
  
  // Fallback to direct API
  return fetch(HYPERLIQUID_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

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
  
  // Funding fees - in Hyperliquid, POSITIVE cumFunding means funding PAID (cost), NEGATIVE means funding RECEIVED (profit)
  const fundingSinceOpen = position.cumFunding?.sinceOpen ? parseFloat(position.cumFunding.sinceOpen) : null;
  const hasFunding = fundingSinceOpen !== null && fundingSinceOpen !== 0;
  // Invert for display: positive funding paid = negative P&L impact
  const fundingPnlImpact = fundingSinceOpen !== null ? -fundingSinceOpen : null;
  const fundingPositive = fundingPnlImpact !== null && fundingPnlImpact > 0;
  
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
          <div className="relative">
            <CoinIcon coin={position.coin} size="md" />
            <div className={cn(
              "absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center",
              isLong ? "bg-profit" : "bg-loss"
            )}>
              {isLong ? (
                <ArrowUpRight className="w-2.5 h-2.5 text-white" />
              ) : (
                <ArrowDownRight className="w-2.5 h-2.5 text-white" />
              )}
            </div>
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
              {unrealizedPnl > 0 ? '+' : unrealizedPnl < 0 ? '-' : ''}${Math.abs(unrealizedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={cn(
              "text-xs font-mono",
              isProfitable ? "text-profit/80" : "text-loss/80"
            )}>
              ({returnOnEquity >= 0 ? '+' : ''}{returnOnEquity.toFixed(2)}%)
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            ${positionValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} value
          </span>
        </div>
      </div>
      
      {/* Funding & Liquidation row */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30 text-xs">
        <div className="flex items-center gap-4">
          {/* Funding fees - show P&L impact (negative of cumFunding) */}
          {hasFunding && fundingPnlImpact !== null && (
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Funding:</span>
              <span className={cn(
                "font-mono",
                fundingPositive ? "text-profit" : "text-loss"
              )}>
                {fundingPnlImpact > 0 ? '+' : fundingPnlImpact < 0 ? '-' : ''}${Math.abs(fundingPnlImpact).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          <CoinIcon coin={position.coin} size="md" />
        
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
  // Hyperliquid's `twapHistory` often reports executedSz=0.0 for active TWAPs.
  // To ensure the UI shows progress, fall back to a time-elapsed progress bar.
  const sizeProgress = totalSize > 0 ? (executedSize / totalSize) * 100 : 0;
  const avgPrice = executedSize > 0 ? executedNtl / executedSize : 0;
  const isBuy = twap.side === 'B';
  
  // Calculate remaining size and estimated remaining notional
  const remainingSize = totalSize - executedSize;
  // Estimate remaining notional using avg price if available, otherwise use executed ratio
  const remainingNtl = avgPrice > 0 
    ? remainingSize * avgPrice 
    : (totalSize > 0 && executedSize > 0 ? (remainingSize / executedSize) * executedNtl : 0);
  
  // Calculate estimated time remaining
  const elapsed = Date.now() - twap.time;
  const totalDuration = twap.minutes * 60 * 1000;
  const timeProgress = Math.min((elapsed / totalDuration) * 100, 100);
  const remainingMinutes = Math.max(0, Math.ceil((totalDuration - elapsed) / 60000));

  const progressForBar = sizeProgress > 0 ? sizeProgress : timeProgress;

  // Clean up coin name (remove @ prefix for spot)
  const displayCoin = twap.coin.startsWith('@') ? twap.coin.slice(1) : twap.coin;
  const isSpot = twap.coin.startsWith('@');
  
  // Format as full number with commas
  const formatFullCurrency = (value: number) => {
    return '$' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

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
          <div className="relative">
            <CoinIcon coin={displayCoin} size="md" />
            <div className={cn(
              "absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center bg-primary"
            )}>
              <Clock className="w-2.5 h-2.5 text-white" />
            </div>
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
              {formatFullCurrency(remainingNtl)}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {remainingMinutes > 0 ? `~${remainingMinutes}m remaining` : 'Finishing...'}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress 
          value={Number.isFinite(progressForBar) ? progressForBar : 0} 
          className="h-2"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>
            {Number.isFinite(sizeProgress) ? sizeProgress.toFixed(1) : '0.0'}% filled
            {sizeProgress <= 0 && Number.isFinite(timeProgress)
              ? ` • ${timeProgress.toFixed(0)}% elapsed`
              : ''}
          </span>
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
        // Every other HIP-3 dex (flx, vntl, ...) goes direct to the API: it is polled every
        // 10s and would otherwise blow through the proxy's per-address rate limit
        const otherDexes = (await getPerpDexNames()).filter(dex => dex !== '' && dex !== 'xyz');

        // Fetch perp (main dex), HIP-3 perp (xyz dex), spot positions, TWAP history, and slice fills in parallel
        const [perpResponse, xyzPerpResponse, spotResponse, twapHistoryResponse, xyzTwapHistoryResponse, sliceFillsResponse, ...otherDexResponses] = await Promise.all([
          makeApiRequest({
            type: "clearinghouseState",
            user: address,
          }),
          makeApiRequest({
            type: "clearinghouseState",
            user: address,
            dex: "xyz", // HIP-3 stock perps (NVDA, TSLA, etc.)
          }),
          makeApiRequest({
            type: "spotClearinghouseState",
            user: address,
          }),
          makeApiRequest({
            type: "twapHistory",
            user: address,
          }),
          makeApiRequest({
            type: "twapHistory",
            user: address,
            dex: "xyz", // HIP-3 TWAPs
          }),
          makeApiRequest({
            type: "userTwapSliceFills",
            user: address,
          }),
          ...otherDexes.map(dex => fetch(HYPERLIQUID_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "clearinghouseState", user: address, dex }),
          })),
        ]);

        // Parse slice fills to calculate actual executed amounts per twapId
        let sliceFillsByTwapId = new Map<number, { executedSz: number; executedNtl: number }>();
        if (sliceFillsResponse.ok) {
          const sliceFills: TwapSliceFillResponse[] = await sliceFillsResponse.json();
          if (Array.isArray(sliceFills)) {
            sliceFills.forEach(item => {
              const existing = sliceFillsByTwapId.get(item.twapId) || { executedSz: 0, executedNtl: 0 };
              const sz = parseFloat(item.fill.sz) || 0;
              const px = parseFloat(item.fill.px) || 0;
              existing.executedSz += sz;
              existing.executedNtl += sz * px;
              sliceFillsByTwapId.set(item.twapId, existing);
            });
          }
        }

        const allCurrentCoins = new Set([
          ...perpPositions.map(p => p.coin),
          ...spotPositions.map(p => p.coin),
        ]);

        // Open perp positions from every dex (main, xyz and the other HIP-3 dexes)
        const toPerpPositions = (state: ClearinghouseState | null): PerpPosition[] =>
          (state?.assetPositions ?? [])
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
        const perpStates = await Promise.all(
          [perpResponse, xyzPerpResponse, ...otherDexResponses].map(response =>
            response.ok ? (response.json() as Promise<ClearinghouseState>) : Promise.resolve(null)
          )
        );
        setPerpPositions(perpStates.flatMap(toPerpPositions));

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

        // Process TWAP history to find active TWAPs (merge main + xyz dex)
        // Use slice fills data for accurate progress when available
        const processTwapHistory = (
          twapHistory: TwapHistoryItem[], 
          isXyz: boolean = false,
          sliceFillsMap: Map<number, { executedSz: number; executedNtl: number }>
        ): TwapOrder[] => {
          if (!Array.isArray(twapHistory) || twapHistory.length === 0) return [];
          
          // Group by twapId and get the latest status for each
          const twapLatestStatus = new Map<number, TwapHistoryItem>();
          
          twapHistory.forEach(item => {
            const existing = twapLatestStatus.get(item.twapId);
            // Keep the most recent entry for each twapId
            if (!existing || item.time > existing.time) {
              twapLatestStatus.set(item.twapId, item);
            }
          });
          
          // Filter for active TWAPs only
          const activeTwaps: TwapOrder[] = [];
          
          twapLatestStatus.forEach((item, twapId) => {
            // Only show TWAPs that are currently "activated"
            if (item.status.status === 'activated') {
              // Get real execution data from slice fills if available
              const sliceData = sliceFillsMap.get(twapId);
              const executedSz = sliceData ? String(sliceData.executedSz) : item.state.executedSz;
              const executedNtl = sliceData ? String(sliceData.executedNtl) : item.state.executedNtl;
              
              activeTwaps.push({
                // Use unique ID by combining dex prefix with twapId to avoid collisions
                twapId: isXyz ? twapId + 1000000 : twapId,
                coin: item.state.coin,
                side: item.state.side,
                sz: item.state.sz,
                executedSz,
                executedNtl,
                minutes: item.state.minutes,
                reduceOnly: item.state.reduceOnly,
                randomize: item.state.randomize,
                status: 'activated',
                time: item.state.timestamp || item.time * 1000, // Use timestamp if available
              });
            }
          });
          
          return activeTwaps;
        };

        let allActiveTwaps: TwapOrder[] = [];
        const seenTwapIds = new Set<number>();
        
        if (twapHistoryResponse.ok) {
          const mainTwapHistory: TwapHistoryItem[] = await twapHistoryResponse.json();
          const mainTwaps = processTwapHistory(mainTwapHistory, false, sliceFillsByTwapId);
          mainTwaps.forEach(t => {
            seenTwapIds.add(t.twapId);
            allActiveTwaps.push(t);
          });
        }
        
        if (xyzTwapHistoryResponse.ok) {
          const xyzTwapHistory: TwapHistoryItem[] = await xyzTwapHistoryResponse.json();
          // Only include TWAPs that are actual HIP-3 assets (xyz: prefix) AND not already seen
          const xyzTwaps = processTwapHistory(xyzTwapHistory, true, sliceFillsByTwapId)
            .filter(t => t.coin.startsWith('xyz:') && !seenTwapIds.has(t.twapId - 1000000));
          allActiveTwaps = [...allActiveTwaps, ...xyzTwaps];
        }

        // Sort by most recent
        allActiveTwaps.sort((a, b) => b.time - a.time);
        
        // Check for new TWAPs
        const currentTwapIds = new Set(twapOrders.map(t => t.twapId));
        const newIds = allActiveTwaps
          .filter(t => !currentTwapIds.has(t.twapId))
          .map(t => t.twapId);
        
        if (newIds.length > 0 && currentTwapIds.size > 0) {
          setNewTwapIds(new Set(newIds));
          setTimeout(() => setNewTwapIds(new Set()), 2000);
        }

        setTwapOrders(allActiveTwaps);

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
