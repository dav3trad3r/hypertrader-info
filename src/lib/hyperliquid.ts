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

// Fetch fills for a specific month (year, month are 0-indexed like JS Date)
export async function fetchFillsForMonth(
  address: string, 
  year: number, 
  month: number
): Promise<Fill[]> {
  const allFills: Fill[] = [];
  const seenTids = new Set<number>();
  
  // Calculate month boundaries
  const startOfMonth = new Date(year, month, 1).getTime();
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
  
  let currentEnd = endOfMonth;
  let windowSize = 3 * 24 * 60 * 60 * 1000; // 3 days - smaller for precision
  const minWindowSize = 2 * 60 * 60 * 1000; // 2 hours minimum
  let requestCount = 0;
  const maxRequests = 100; // Safety limit per month
  
  console.log(`Fetching fills for ${year}-${String(month + 1).padStart(2, '0')}`);
  
  while (currentEnd > startOfMonth && requestCount < maxRequests) {
    const currentStart = Math.max(currentEnd - windowSize, startOfMonth);
    requestCount++;
    
    try {
      const response = await makeApiRequest({
        type: "userFillsByTime",
        user: address,
        startTime: currentStart,
        endTime: currentEnd,
        aggregateByTime: true,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const fills: Fill[] = await response.json();
      
      if (fills && fills.length > 0) {
        let newCount = 0;
        let earliestTime = currentEnd;
        
        for (const fill of fills) {
          if (!seenTids.has(fill.tid)) {
            seenTids.add(fill.tid);
            allFills.push(fill);
            newCount++;
            if (fill.time < earliestTime) {
              earliestTime = fill.time;
            }
          }
        }
        
        // If we hit 2000, use earliest fill time as new end
        if (fills.length >= 2000) {
          windowSize = Math.max(windowSize / 2, minWindowSize);
          currentEnd = earliestTime - 1;
          continue;
        }
        
        // Restore window size if we're not hitting limits
        if (fills.length < 1500 && windowSize < 3 * 24 * 60 * 60 * 1000) {
          windowSize = Math.min(windowSize * 1.5, 3 * 24 * 60 * 60 * 1000);
        }
      }
      
      currentEnd = currentStart - 1;
      
    } catch (error) {
      console.error("Error fetching fills:", error);
      currentEnd = currentEnd - windowSize;
    }
  }
  
  console.log(`Month ${year}-${String(month + 1).padStart(2, '0')}: ${allFills.length} fills, ${requestCount} requests`);
  
  return allFills;
}

// Fetch current month + recent fills (fast initial load)
export async function fetchInitialFills(address: string): Promise<Fill[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  // Fetch current month
  const currentMonthFills = await fetchFillsForMonth(address, currentYear, currentMonth);
  const seenTids = new Set(currentMonthFills.map(f => f.tid));
  
  // Also fetch recent fills endpoint as backup (gets last 2000)
  try {
    const response = await makeApiRequest({
      type: "userFills",
      user: address,
    });

    if (response.ok) {
      const recentFills: Fill[] = await response.json();
      if (recentFills && recentFills.length > 0) {
        for (const fill of recentFills) {
          if (!seenTids.has(fill.tid)) {
            seenTids.add(fill.tid);
            currentMonthFills.push(fill);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error fetching recent fills:", error);
  }
  
  // Sort by time descending
  currentMonthFills.sort((a, b) => b.time - a.time);
  
  console.log(`Initial load: ${currentMonthFills.length} fills`);
  
  return currentMonthFills;
}

// Fetch ALL historical fills (for accurate summary stats)
// Limited to MAX_TRADES to prevent browser overload
const MAX_TRADES = 50000;

export interface FetchAllFillsResult {
  fills: Fill[];
  limitReached: boolean;
  monthsLoaded: number;
}

export async function fetchAllFills(
  address: string,
  onProgress?: (fills: Fill[], monthsLoaded: number, limitReached: boolean, currentMonth: string) => void
): Promise<FetchAllFillsResult> {
  const allFills: Fill[] = [];
  const seenTids = new Set<number>();
  
  // Go back to Jan 2022 as earliest possible date
  const startYear = 2022;
  const startMonth = 0;
  
  let monthsLoaded = 0;
  let limitReached = false;
  
  console.log('Starting full history fetch...');
  
  // First, fetch recent fills to determine where trading activity exists
  // This helps us not stop early if user hasn't traded recently
  let earliestTradeTime = Date.now();
  let latestTradeTime = 0;
  
  try {
    const response = await makeApiRequest({
      type: "userFills",
      user: address,
    });

    if (response.ok) {
      const recentFills: Fill[] = await response.json();
      if (recentFills && recentFills.length > 0) {
        console.log(`Found ${recentFills.length} recent trades via userFills`);
        for (const fill of recentFills) {
          if (!seenTids.has(fill.tid)) {
            seenTids.add(fill.tid);
            allFills.push(fill);
            if (fill.time < earliestTradeTime) earliestTradeTime = fill.time;
            if (fill.time > latestTradeTime) latestTradeTime = fill.time;
          }
        }
        
        // Report initial progress
        if (onProgress) {
          onProgress([...allFills], 0, false, 'Recent trades');
        }
      }
    }
  } catch (error) {
    console.error("Error fetching recent fills:", error);
  }
  
  // If we found trades, scan from the earliest trade month backwards
  // If no trades found, start from current month
  const now = new Date();
  let currentYear: number;
  let currentMonth: number;
  
  if (earliestTradeTime < Date.now()) {
    // Start from the month of the earliest trade we found
    const earliestDate = new Date(earliestTradeTime);
    currentYear = earliestDate.getFullYear();
    currentMonth = earliestDate.getMonth();
    console.log(`Starting scan from earliest known trade: ${currentYear}-${currentMonth + 1}`);
  } else {
    // No trades found yet, start from current month
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    console.log('No trades found via userFills, scanning from current month');
  }
  
  let consecutiveEmptyMonths = 0;
  // Increase tolerance for accounts that may have gaps
  const MAX_CONSECUTIVE_EMPTY = 12; // 12 months instead of 6
  
  while (
    currentYear > startYear || 
    (currentYear === startYear && currentMonth >= startMonth)
  ) {
    // Check if we've hit the trade limit
    if (allFills.length >= MAX_TRADES) {
      console.log(`Trade limit reached (${MAX_TRADES}), stopping fetch`);
      limitReached = true;
      break;
    }
    
    const monthLabel = new Date(currentYear, currentMonth).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const monthFills = await fetchFillsForMonth(address, currentYear, currentMonth);
    monthsLoaded++;
    
    if (monthFills.length > 0) {
      consecutiveEmptyMonths = 0;
      for (const fill of monthFills) {
        if (!seenTids.has(fill.tid)) {
          seenTids.add(fill.tid);
          allFills.push(fill);
          
          // Check limit after each addition
          if (allFills.length >= MAX_TRADES) {
            limitReached = true;
            break;
          }
        }
      }
      console.log(`Total fills so far: ${allFills.length}`);
      
      // Report progress
      if (onProgress) {
        onProgress([...allFills], monthsLoaded, limitReached, monthLabel);
      }
      
      if (limitReached) break;
    } else {
      consecutiveEmptyMonths++;
      // Stop if too many consecutive months with no trades
      if (consecutiveEmptyMonths >= MAX_CONSECUTIVE_EMPTY) {
        console.log(`No trades for ${MAX_CONSECUTIVE_EMPTY} months, stopping fetch`);
        break;
      }
    }
    
    // Move to previous month
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
  }
  
  // Sort by time descending
  allFills.sort((a, b) => b.time - a.time);
  console.log(`Full history fetch complete: ${allFills.length} total fills${limitReached ? ' (limit reached)' : ''}`);
  
  return {
    fills: allFills,
    limitReached,
    monthsLoaded,
  };
}

// Legacy function - fetch all fills (kept for compatibility but not recommended)
export async function fetchUserFills(address: string): Promise<Fill[]> {
  return fetchInitialFills(address);
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
