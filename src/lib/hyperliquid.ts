// Hyperliquid API Types and Services

export type MarketType = 'all' | 'perps' | 'spot';

export interface Fill {
  closedPnl: string;
  coin: string;
  crossed: boolean;
  dir: string;
  hash: string;
  oid: number;
  px: string;
  side: "B" | "A";
  startPosition: string;
  sz: string;
  time: number;
  fee: string;
  feeToken: string;
  builderFee?: string;
  tid: number;
}

// Helper to determine if a fill is a spot trade
export function isSpotTrade(fill: Fill): boolean {
  return fill.coin.startsWith('@');
}

// Filter fills by market type
export function filterFillsByMarket(fills: Fill[], marketType: MarketType): Fill[] {
  if (marketType === 'all') return fills;
  if (marketType === 'spot') return fills.filter(f => isSpotTrade(f));
  return fills.filter(f => !isSpotTrade(f)); // perps
}

export interface DailyPnL {
  date: string;
  pnl: number;
  trades: number;
  volume: number;
  fees: number;
  wins: number;
  losses: number;
}

export interface WeeklyPnL {
  weekStart: string;
  weekEnd: string;
  pnl: number;
  trades: number;
  volume: number;
}

export interface AssetPerformance {
  coin: string;
  pnl: number;
  trades: number;
  volume: number;
  winRate: number;
  avgPnl: number;
}

export interface TradingSummary {
  totalPnl: number;
  totalTrades: number;
  totalVolume: number;
  totalFees: number;
  winRate: number;
  bestDay: DailyPnL | null;
  worstDay: DailyPnL | null;
  profitableDays: number;
  losingDays: number;
  avgDailyPnl: number;
  largestWin: number;
  largestLoss: number;
}

export interface UserTradingData {
  fills: Fill[];
  dailyPnL: DailyPnL[];
  weeklyPnL: WeeklyPnL[];
  assetPerformance: AssetPerformance[];
  summary: TradingSummary;
}

const HYPERLIQUID_API = "https://api.hyperliquid.xyz/info";

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
        console.log(`Proxy request successful (cache: ${response.headers.get('X-Cache') || 'N/A'})`);
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
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

// Fetch all user fills using pagination - NO LIMITS
export async function fetchUserFills(address: string): Promise<Fill[]> {
  const allFills: Fill[] = [];
  const seenTids = new Set<number>();
  
  // Get fills in batches - start from beginning of time
  // Hyperliquid uses milliseconds timestamps
  const now = Date.now();
  const startOfHistory = new Date('2022-01-01').getTime(); // Hyperliquid launch approx
  
  // Use userFillsByTime with time windows - use smaller windows for better coverage
  const windowSize = 14 * 24 * 60 * 60 * 1000; // 14 days in ms for better granularity
  let currentEnd = now;
  let currentStart = currentEnd - windowSize;
  let consecutiveEmpty = 0;
  const maxConsecutiveEmpty = 6; // Skip ~3 months of empty data before stopping
  
  console.log(`Fetching fills for ${address} from ${new Date(startOfHistory).toISOString()} to now`);
  
  while (currentEnd > startOfHistory && consecutiveEmpty < maxConsecutiveEmpty) {
    try {
      const response = await makeApiRequest({
        type: "userFillsByTime",
        user: address,
        startTime: Math.max(currentStart, startOfHistory),
        endTime: currentEnd,
        aggregateByTime: true,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const fills: Fill[] = await response.json();
      
      if (fills && fills.length > 0) {
        // Add only unique fills
        let newCount = 0;
        for (const fill of fills) {
          if (!seenTids.has(fill.tid)) {
            seenTids.add(fill.tid);
            allFills.push(fill);
            newCount++;
          }
        }
        if (newCount > 0) {
          consecutiveEmpty = 0; // Reset counter when we find data
        } else {
          consecutiveEmpty++;
        }
        console.log(`Window ${new Date(currentStart).toISOString().split('T')[0]} to ${new Date(currentEnd).toISOString().split('T')[0]}: ${newCount} new fills (${allFills.length} total)`);
      } else {
        consecutiveEmpty++;
      }
      
      // Move window back
      currentEnd = currentStart;
      currentStart = currentEnd - windowSize;
      
    } catch (error) {
      console.error("Error fetching fills:", error);
      // Continue to next window instead of breaking completely
      currentEnd = currentStart;
      currentStart = currentEnd - windowSize;
      consecutiveEmpty++;
    }
  }
  
  console.log(`Finished fetching historical fills: ${allFills.length} total`);
  
  // Also try the simple userFills endpoint for recent trades (as backup)
  try {
    const response = await makeApiRequest({
      type: "userFills",
      user: address,
    });

    if (response.ok) {
      const recentFills: Fill[] = await response.json();
      if (recentFills && recentFills.length > 0) {
        let newCount = 0;
        for (const fill of recentFills) {
          if (!seenTids.has(fill.tid)) {
            seenTids.add(fill.tid);
            allFills.push(fill);
            newCount++;
          }
        }
        console.log(`Recent fills endpoint: ${newCount} additional fills`);
      }
    }
  } catch (error) {
    console.error("Error fetching recent fills:", error);
  }
  
  // Sort by time descending
  allFills.sort((a, b) => b.time - a.time);
  
  console.log(`Final fill count: ${allFills.length}`);
  
  return allFills;
}

// Process fills into daily PnL data
export function processDailyPnL(fills: Fill[]): DailyPnL[] {
  const dailyMap = new Map<string, DailyPnL>();
  
  fills.forEach(fill => {
    const date = new Date(fill.time).toISOString().split('T')[0];
    const pnl = parseFloat(fill.closedPnl) || 0;
    const volume = parseFloat(fill.sz) * parseFloat(fill.px);
    const fee = parseFloat(fill.fee) || 0;
    
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        pnl: 0,
        trades: 0,
        volume: 0,
        fees: 0,
        wins: 0,
        losses: 0,
      });
    }
    
    const day = dailyMap.get(date)!;
    day.pnl += pnl;
    day.trades += 1;
    day.volume += volume;
    day.fees += fee;
    
    if (pnl > 0) day.wins += 1;
    else if (pnl < 0) day.losses += 1;
  });
  
  return Array.from(dailyMap.values()).sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

// Process fills into weekly PnL data
export function processWeeklyPnL(dailyPnL: DailyPnL[]): WeeklyPnL[] {
  const weeklyMap = new Map<string, WeeklyPnL>();
  
  dailyPnL.forEach(day => {
    const date = new Date(day.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay()); // Sunday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Saturday
    
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, {
        weekStart: weekKey,
        weekEnd: weekEnd.toISOString().split('T')[0],
        pnl: 0,
        trades: 0,
        volume: 0,
      });
    }
    
    const week = weeklyMap.get(weekKey)!;
    week.pnl += day.pnl;
    week.trades += day.trades;
    week.volume += day.volume;
  });
  
  return Array.from(weeklyMap.values()).sort((a, b) => 
    new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
  );
}

// Process fills into asset performance data
export function processAssetPerformance(fills: Fill[]): AssetPerformance[] {
  const assetMap = new Map<string, {
    pnl: number;
    trades: number;
    volume: number;
    wins: number;
    losses: number;
  }>();
  
  fills.forEach(fill => {
    const coin = fill.coin.startsWith('@') ? `Token ${fill.coin}` : fill.coin;
    const pnl = parseFloat(fill.closedPnl) || 0;
    const volume = parseFloat(fill.sz) * parseFloat(fill.px);
    
    if (!assetMap.has(coin)) {
      assetMap.set(coin, { pnl: 0, trades: 0, volume: 0, wins: 0, losses: 0 });
    }
    
    const asset = assetMap.get(coin)!;
    asset.pnl += pnl;
    asset.trades += 1;
    asset.volume += volume;
    
    if (pnl > 0) asset.wins += 1;
    else if (pnl < 0) asset.losses += 1;
  });
  
  return Array.from(assetMap.entries())
    .map(([coin, data]) => ({
      coin,
      pnl: data.pnl,
      trades: data.trades,
      volume: data.volume,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
      avgPnl: data.trades > 0 ? data.pnl / data.trades : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

// Calculate trading summary
export function calculateSummary(
  fills: Fill[],
  dailyPnL: DailyPnL[]
): TradingSummary {
  const totalPnl = dailyPnL.reduce((sum, d) => sum + d.pnl, 0);
  const totalTrades = fills.length;
  const totalVolume = dailyPnL.reduce((sum, d) => sum + d.volume, 0);
  const totalFees = dailyPnL.reduce((sum, d) => sum + d.fees, 0);
  
  const wins = dailyPnL.filter(d => d.pnl > 0).length;
  const losses = dailyPnL.filter(d => d.pnl < 0).length;
  const profitableDays = wins;
  const losingDays = losses;
  
  const sortedByPnl = [...dailyPnL].sort((a, b) => b.pnl - a.pnl);
  const bestDay = sortedByPnl[0] || null;
  const worstDay = sortedByPnl[sortedByPnl.length - 1] || null;
  
  // Find largest single trade win/loss
  let largestWin = 0;
  let largestLoss = 0;
  fills.forEach(fill => {
    const pnl = parseFloat(fill.closedPnl) || 0;
    if (pnl > largestWin) largestWin = pnl;
    if (pnl < largestLoss) largestLoss = pnl;
  });
  
  return {
    totalPnl,
    totalTrades,
    totalVolume,
    totalFees,
    winRate: dailyPnL.length > 0 ? (profitableDays / dailyPnL.length) * 100 : 0,
    bestDay,
    worstDay,
    profitableDays,
    losingDays,
    avgDailyPnl: dailyPnL.length > 0 ? totalPnl / dailyPnL.length : 0,
    largestWin,
    largestLoss,
  };
}

// Main function to fetch and process all trading data
export async function fetchTradingData(address: string): Promise<UserTradingData> {
  const fills = await fetchUserFills(address);
  const dailyPnL = processDailyPnL(fills);
  const weeklyPnL = processWeeklyPnL(dailyPnL);
  const assetPerformance = processAssetPerformance(fills);
  const summary = calculateSummary(fills, dailyPnL);
  
  return {
    fills,
    dailyPnL,
    weeklyPnL,
    assetPerformance,
    summary,
  };
}

// Validate Ethereum address format
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
