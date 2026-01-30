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

// Spot token metadata
interface SpotToken {
  name: string;
  szDecimals: number;
  weiDecimals: number;
  index: number;
  tokenId: string;
  isCanonical: boolean;
  fullName: string | null;
}

interface SpotMetaResponse {
  tokens: SpotToken[];
  universe: { name: string; tokens: number[]; index: number; isCanonical: boolean }[];
}

// Cache for spot token names: index -> name
let spotTokenCache: Map<number, string> | null = null;
let spotTokenCachePromise: Promise<Map<number, string>> | null = null;

// Fetch spot token metadata and cache it
async function fetchSpotMeta(): Promise<Map<number, string>> {
  if (spotTokenCache) {
    return spotTokenCache;
  }
  
  // If already fetching, return the existing promise
  if (spotTokenCachePromise) {
    return spotTokenCachePromise;
  }
  
  spotTokenCachePromise = (async () => {
    try {
      const response = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "spotMeta" }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch spot metadata: ${response.status}`);
      }
      
      const data: SpotMetaResponse = await response.json();
      const cache = new Map<number, string>();
      
      // Map token index to name
      for (const token of data.tokens) {
        cache.set(token.index, token.name);
      }
      
      console.log(`Loaded ${cache.size} spot token names`);
      spotTokenCache = cache;
      return cache;
    } catch (error) {
      console.error("Error fetching spot metadata:", error);
      spotTokenCachePromise = null;
      return new Map<number, string>();
    }
  })();
  
  return spotTokenCachePromise;
}

// Get human-readable name for a coin (handles both perps and spot)
export function getSpotTokenName(coin: string, cache: Map<number, string>): string {
  if (!coin.startsWith('@')) {
    return coin; // Regular perp
  }
  
  // Extract token index from @XXX format
  const indexStr = coin.substring(1);
  const index = parseInt(indexStr, 10);
  
  if (isNaN(index)) {
    return coin; // Invalid format, return as-is
  }
  
  const name = cache.get(index);
  return name ? `${name} (Spot)` : `Token ${coin}`;
}

// Preload spot token cache (call early in app lifecycle)
export async function preloadSpotTokenCache(): Promise<void> {
  await fetchSpotMeta();
}

// Get the spot token cache (fetches if not loaded)
export async function getSpotTokenCache(): Promise<Map<number, string>> {
  return fetchSpotMeta();
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

// API limits
const FILLS_PER_REQUEST = 2000;
const MAX_ACCESSIBLE_FILLS = 10000; // Hyperliquid only allows access to most recent 10K fills

function getFillTime(fill: Partial<Fill> & Record<string, unknown>): number | null {
  // Defensive parsing in case API changes types
  const raw = (fill as any)?.time;
  const t = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(t) ? t : null;
}

export interface FetchFillsResult {
  fills: Fill[];
  hitApiLimit: boolean;
  totalFetched: number;
}

// Fetch ALL available fills using proper cursor-based pagination
// Returns up to 10K fills (the API limit) with indicator if limit was hit
export async function fetchAllAvailableFills(address: string): Promise<FetchFillsResult> {
  const allFills: Fill[] = [];
  const seenTids = new Set<number>();
  
  // Strategy: The API returns earliest fills first in a given time range.
  // When there are many fills at the same millisecond (memecoin partial fills),
  // we need to handle timestamp collisions carefully.
  // 
  // Approach: After each batch, advance startTime to the LATEST time we saw.
  // On the next request, we'll get duplicates (same timestamp) + new fills.
  // We dedupe using tid. If we get NO new fills, bump by 1ms.
  
  const fixedEndTime = Date.now();
  let currentStart = 0;
  let requestCount = 0;
  const maxRequests = 50; // More headroom for high-volume accounts
  let hitApiLimit = false;
  let consecutiveNoProgress = 0;
  
  console.log(`Fetching all available fills for ${address}...`);
  
  while (requestCount < maxRequests && allFills.length < MAX_ACCESSIBLE_FILLS) {
    requestCount++;
    
    try {
      const response = await makeApiRequest({
        type: "userFillsByTime",
        user: address,
        startTime: currentStart,
        endTime: fixedEndTime,
        aggregateByTime: true,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const fills: Fill[] = await response.json();
      
      if (!fills || fills.length === 0) {
        console.log(`No more fills available after ${requestCount} requests`);
        break;
      }

      let newCount = 0;
      let maxTime = currentStart;
      let maxTid = 0;
      
      for (const fill of fills) {
        if (!seenTids.has(fill.tid)) {
          seenTids.add(fill.tid);
          allFills.push(fill);
          newCount++;
        }
        
        if (fill.tid > maxTid) {
          maxTid = fill.tid;
        }

        const t = getFillTime(fill as any);
        if (t !== null && t > maxTime) {
          maxTime = t;
        }
      }

      console.log(
        `Request ${requestCount}: Got ${fills.length} fills, ${newCount} new (total: ${allFills.length}), cursorStart: ${new Date(currentStart).toISOString()}, pageMaxTime: ${new Date(maxTime).toISOString()}`
      );
      
      // If we got less than 2000, we've fetched everything available in this range
      if (fills.length < FILLS_PER_REQUEST) {
        console.log(`Received ${fills.length} < ${FILLS_PER_REQUEST}, all available data fetched`);
        break;
      }

      // Track progress - if no new fills, we're stuck in a timestamp collision
      if (newCount === 0) {
        consecutiveNoProgress++;
        if (consecutiveNoProgress >= 3) {
          console.warn('No progress after 3 attempts, likely >2000 fills at same ms - advancing time');
          // Force advance by 1ms to break out of collision
          currentStart = maxTime + 1;
          consecutiveNoProgress = 0;
          continue;
        }
      } else {
        consecutiveNoProgress = 0;
      }

      // Advance startTime to maxTime (not +1) to catch any remaining fills at that timestamp
      // The deduplication via tid handles overlaps
      if (maxTime > currentStart) {
        currentStart = maxTime;
      } else {
        // Safety: if maxTime didn't advance, bump by 1ms
        currentStart = currentStart + 1;
      }
      
      // Check if we've hit the 10K API limit
      if (allFills.length >= MAX_ACCESSIBLE_FILLS) {
        hitApiLimit = true;
        console.log(`Hit the ${MAX_ACCESSIBLE_FILLS} fill API limit`);
        break;
      }
      
    } catch (error) {
      console.error("Error fetching fills:", error);
      break;
    }
  }
  
  // Sort by time descending (most recent first)
  allFills.sort((a, b) => b.time - a.time);
  
  // Detect if we likely hit the API limit (got close to 10K and last request was full)
  if (allFills.length >= MAX_ACCESSIBLE_FILLS * 0.95) {
    hitApiLimit = true;
  }
  
  console.log(`Fetch complete: ${allFills.length} fills, ${requestCount} requests, hitLimit: ${hitApiLimit}`);
  
  return {
    fills: allFills,
    hitApiLimit,
    totalFetched: allFills.length,
  };
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
  
  // Same pagination behavior as fetchAllAvailableFills: move startTime forward.
  let currentStart = startOfMonth;
  let requestCount = 0;
  const maxRequests = 50; // Safety limit per month
  
  console.log(`Fetching fills for ${year}-${String(month + 1).padStart(2, '0')} (${new Date(startOfMonth).toISOString()} to ${new Date(endOfMonth).toISOString()})`);
  
  // Use cursor-based pagination: move startTime forward using the latest fill time.
  while (currentStart < endOfMonth && requestCount < maxRequests) {
    requestCount++;
    
    try {
      const response = await makeApiRequest({
        type: "userFillsByTime",
        user: address,
        startTime: currentStart,
        endTime: endOfMonth,
        aggregateByTime: true,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const fills: Fill[] = await response.json();
      
      if (!fills || fills.length === 0) {
        console.log(`Request ${requestCount}: No fills found after ${new Date(currentStart).toISOString()}`);
        break;
      }
      
      let newCount = 0;
      let maxTime = currentStart;
      
      for (const fill of fills) {
        if (!seenTids.has(fill.tid)) {
          seenTids.add(fill.tid);
          allFills.push(fill);
          newCount++;
        }

        const t = getFillTime(fill as any);
        if (t !== null && t > maxTime) {
          maxTime = t;
        }
      }
      
      console.log(`Request ${requestCount}: Got ${fills.length} fills, ${newCount} new (total: ${allFills.length}), pageMaxTime: ${new Date(maxTime).toISOString()}`);
      
      // If we got less than 2000, we've fetched everything in this range
      if (fills.length < FILLS_PER_REQUEST) {
        break;
      }
      
      // We hit the 2000 limit - advance startTime forward.
      if (maxTime === currentStart) {
        currentStart = currentStart + 1;
      } else {
        currentStart = maxTime;
      }
      
    } catch (error) {
      console.error("Error fetching fills:", error);
      break;
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

// Fetch recent fills only (fast initial load)
// Fetches current month's fills using time-based API
export interface FetchRecentFillsResult {
  fills: Fill[];
  hasMoreHistory: boolean;
}

export async function fetchRecentFills(address: string): Promise<FetchRecentFillsResult> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  console.log('Fetching current month trades...');
  
  // Fetch current month using time-based API (more accurate)
  const fills = await fetchFillsForMonth(address, currentYear, currentMonth);
  
  // Sort by time descending
  fills.sort((a, b) => b.time - a.time);
  
  // Check if there might be more history (if we have trades at the start of the month)
  let hasMoreHistory = false;
  if (fills.length > 0) {
    const earliestFill = fills[fills.length - 1];
    const monthStart = new Date(currentYear, currentMonth, 1).getTime();
    // If earliest fill is close to month start, there's likely more history
    hasMoreHistory = earliestFill.time <= monthStart + 24 * 60 * 60 * 1000; // within first day
  }
  
  console.log(`Initial load complete: ${fills.length} trades for ${new Date(currentYear, currentMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
  
  return {
    fills,
    hasMoreHistory,
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
export function processAssetPerformance(fills: Fill[], spotTokenCache?: Map<number, string>): AssetPerformance[] {
  const assetMap = new Map<string, {
    pnl: number;
    trades: number;
    volume: number;
    wins: number;
    losses: number;
  }>();
  
  const cache = spotTokenCache || new Map<number, string>();
  
  fills.forEach(fill => {
    const coin = getSpotTokenName(fill.coin, cache);
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
  const [fills, spotCache] = await Promise.all([
    fetchUserFills(address),
    getSpotTokenCache(),
  ]);
  const dailyPnL = processDailyPnL(fills);
  const weeklyPnL = processWeeklyPnL(dailyPnL);
  const assetPerformance = processAssetPerformance(fills, spotCache);
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
