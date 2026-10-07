// Hyperliquid API Types and Services

import {
  attributeCosts,
  buildRoundTrips,
  computeTradeStats,
  getFillCosts,
  type CostAttribution,
  type EquityPoint,
  type FundingPayment,
  type TradeStats,
} from './pnl';

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
  /** Net PnL of positions closed this day (after their fees and funding). */
  pnl: number;
  /** Realized PnL before fees and funding. */
  grossPnl: number;
  trades: number;
  volume: number;
  /** Fees booked this day (closing fees + the opening fees of what was closed). */
  fees: number;
  /** Funding booked this day (signed, negative = paid). */
  funding: number;
  wins: number;
  losses: number;
}

/** Below half a cent a day or trade counts as flat ($0.00), neither a win nor a loss. */
export const PNL_EPSILON = 0.005;

export interface WeeklyPnL {
  weekStart: string;
  weekEnd: string;
  pnl: number;
  trades: number;
  volume: number;
}

// --- Date helpers ---
// We intentionally use *local time* for day/week bucketing so the calendar matches
// what the user considers "today".
export function formatLocalDateKey(input: Date | number): string {
  const d = typeof input === 'number' ? new Date(input) : input;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  // Constructing via (y, m-1, d) ensures this is interpreted in local time.
  return new Date(y, (m || 1) - 1, d || 1);
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
  /** Every fee paid, including on positions that are still open. */
  totalFees: number;
  /** Every funding payment (signed). */
  totalFunding: number;
  grossPnl: number;
  /** Fees and funding on still-open positions, booked when they close (signed, negative = cost). */
  openPositionCosts: number;
  winRate: number;
  bestDay: DailyPnL | null;
  worstDay: DailyPnL | null;
  profitableDays: number;
  losingDays: number;
  avgDailyPnl: number;
  largestWin: number;
  largestLoss: number;
  accountValue?: number;
}

export interface UserTradingData {
  fills: Fill[];
  dailyPnL: DailyPnL[];
  weeklyPnL: WeeklyPnL[];
  assetPerformance: AssetPerformance[];
  summary: TradingSummary;
  costs: CostAttribution;
  /** Closed round trips (open to flat), the unit for per-trade stats. */
  tradeStats: TradeStats;
}

const HYPERLIQUID_API = "https://api.hyperliquid.xyz/info";

// Direct API call that backs off and retries when rate limited or on a server error.
// The limit is per minute per IP, so a short wait usually clears it; returning the
// error straight away would make callers treat a 429 as the end of the data.
async function postInfoDirect(payload: object, attempts = 4): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(HYPERLIQUID_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if ((response.status !== 429 && response.status < 500) || attempt >= attempts) return response;
    await new Promise(resolve => setTimeout(resolve, 2000 * 2 ** (attempt - 1)));
  }
}

export interface Portfolio {
  /** Total account value as Hyperliquid computes it: perps on every dex plus spot, and the
   *  right total for unified accounts (where perp margin is a hold on spot USDC, so adding
   *  the per-dex perp values to spot would double count, and perps alone miss free USDC). */
  accountValue: number | null;
  /** All-time account value and mark-to-market PnL history. */
  equity: EquityPoint[];
}

export async function fetchPortfolio(address: string): Promise<Portfolio | null> {
  try {
    const response = await makeApiRequest({ type: "portfolio", user: address });
    if (!response.ok) return null;
    type Period = { accountValueHistory?: Array<[number, string]>; pnlHistory?: Array<[number, string]> };
    const periods = new Map<string, Period>(await response.json());

    const latest = periods.get("day")?.accountValueHistory ?? periods.get("allTime")?.accountValueHistory;
    const value = latest?.length ? parseFloat(latest[latest.length - 1][1]) : NaN;

    const allTime = periods.get("allTime");
    const pnlByTime = new Map((allTime?.pnlHistory ?? []).map(([time, pnl]) => [time, parseFloat(pnl)]));
    const equity = (allTime?.accountValueHistory ?? [])
      .filter(([time]) => pnlByTime.has(time))
      .map(([time, accountValue]) => ({ time, accountValue: parseFloat(accountValue), pnl: pnlByTime.get(time)! }));

    return { accountValue: Number.isFinite(value) ? value : null, equity };
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    return null;
  }
}

export interface OpenExposure {
  long: number;
  short: number;
}

// Notional of open perp positions across every dex (long and short separately)
export async function fetchOpenExposure(address: string): Promise<OpenExposure | null> {
  try {
    const dexes = await getPerpDexNames();
    const states = await Promise.all(dexes.map(async dex => {
      const response = await postInfoDirect(dex ? { type: "clearinghouseState", user: address, dex } : { type: "clearinghouseState", user: address });
      return response.ok ? response.json() : null;
    }));
    const exposure: OpenExposure = { long: 0, short: 0 };
    for (const state of states) {
      for (const { position } of state?.assetPositions ?? []) {
        const size = parseFloat(position.szi) || 0;
        const notional = Math.abs(parseFloat(position.positionValue) || 0);
        if (size > 0) exposure.long += notional;
        else if (size < 0) exposure.short += notional;
      }
    }
    return exposure;
  } catch (error) {
    console.error('Error fetching open exposure:', error);
    return null;
  }
}

let perpDexNamesPromise: Promise<string[]> | null = null;

// Every perp dex: '' is the main dex, the rest are HIP-3 dexes (xyz, flx, ...)
export function getPerpDexNames(): Promise<string[]> {
  perpDexNamesPromise ??= postInfoDirect({ type: "perpDexs" })
    .then(response => (response.ok ? response.json() : Promise.reject(new Error(`perpDexs ${response.status}`))))
    .then((dexes: Array<{ name: string } | null>) => dexes.map(dex => dex?.name ?? ''))
    .catch(error => {
      console.warn('Could not list perp dexes, using main + xyz:', error);
      perpDexNamesPromise = null;
      return ['', 'xyz'];
    });
  return perpDexNamesPromise;
}

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
  return postInfoDirect(payload);
}

const FUNDING_PAGE_SIZE = 500;
const MAX_FUNDING_REQUESTS = 40;
const HOUR_MS = 60 * 60 * 1000;
const MAX_FUNDING_WINDOW = 90 * 24 * HOUR_MS;

// Fetch funding payments from newest to oldest, back to startTime.
// Each request covers a time window sized to the account's funding density: a full
// page means the window was too wide (halve it and retry), a sparse one means the
// next window can be wider. Goes direct to the API so long funding histories don't
// eat into the proxy's per-address rate limit.
export async function fetchUserFunding(address: string, startTime: number): Promise<FundingPayment[]> {
  const payments: FundingPayment[] = [];
  let end = Date.now();
  let window = 30 * 24 * HOUR_MS;

  for (let request = 0; request < MAX_FUNDING_REQUESTS && end > startTime; request++) {
    const from = Math.max(startTime, end - window);
    const response = await postInfoDirect({ type: 'userFunding', user: address, startTime: from, endTime: end });
    if (!response.ok) {
      console.warn(`Funding request failed (${response.status}); using ${payments.length} payments loaded so far`);
      break;
    }

    const rows: Array<{ time: number; delta: { type: string; coin: string; usdc: string } }> = await response.json();
    if (rows.length >= FUNDING_PAGE_SIZE && window > HOUR_MS) {
      window = Math.max(HOUR_MS, Math.floor(window / 2));
      continue;
    }

    for (const row of rows) {
      if (row.delta?.type === 'funding') {
        payments.push({ time: row.time, coin: row.delta.coin, usdc: parseFloat(row.delta.usdc) || 0 });
      }
    }
    end = from - 1;
    if (rows.length < FUNDING_PAGE_SIZE / 2) window = Math.min(MAX_FUNDING_WINDOW, window * 2);
  }

  if (end > startTime) {
    console.warn(`Funding loaded back to ${new Date(end).toISOString()} only (request cap reached)`);
  }
  return payments.sort((a, b) => a.time - b.time);
}

// API limits
const FILLS_PER_REQUEST = 2000;
// Hyperliquid documents access to the most recent ~10K fills; at or near this many,
// older history may be cut off (used only to flag that, never to stop fetching)
const MAX_ACCESSIBLE_FILLS = 10000;

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

// Fetch fills since a given timestamp (for polling/refresh)
export async function fetchFillsSince(
  address: string, 
  sinceTime: number
): Promise<Fill[]> {
  try {
    const response = await makeApiRequest({
      type: "userFillsByTime",
      user: address,
      startTime: sinceTime,
      endTime: Date.now(),
      aggregateByTime: true,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const fills: Fill[] = await response.json();
    return fills || [];
  } catch (error) {
    console.error('Error fetching recent fills:', error);
    return [];
  }
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
  // Fetching runs oldest-first, so stopping early would drop the NEWEST fills:
  // keep paging until the API returns a short page. This cap is only a runaway guard.
  const maxRequests = 200;
  let hitApiLimit = false;
  let consecutiveNoProgress = 0;
  let consecutiveErrors = 0;
  
  console.log(`Fetching all available fills for ${address}...`);
  
  while (requestCount < maxRequests) {
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
      consecutiveErrors = 0;

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
      
    } catch (error) {
      // Retry before giving up: breaking here would also drop every newer fill
      console.error("Error fetching fills:", error);
      if (++consecutiveErrors >= 3) break;
      await new Promise(resolve => setTimeout(resolve, 1000 * consecutiveErrors));
    }
  }

  if (requestCount >= maxRequests) {
    console.warn(`Stopped after ${maxRequests} requests; the newest fills may be missing`);
    hitApiLimit = true;
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

export async function fetchInitialMonthFills(address: string): Promise<FetchRecentFillsResult> {
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

// Process fills into daily PnL data (trade basis: costs are booked when positions close)
export function processDailyPnL(fills: Fill[], costs: CostAttribution = attributeCosts(fills)): DailyPnL[] {
  const dailyMap = new Map<string, DailyPnL>();

  fills.forEach(fill => {
    const date = formatLocalDateKey(fill.time);
    const volume = parseFloat(fill.sz) * parseFloat(fill.px);
    const fillCosts = getFillCosts(costs, fill);

    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        pnl: 0,
        grossPnl: 0,
        trades: 0,
        volume: 0,
        fees: 0,
        funding: 0,
        wins: 0,
        losses: 0,
      });
    }

    const day = dailyMap.get(date)!;
    day.pnl += fillCosts.net;
    day.grossPnl += parseFloat(fill.closedPnl) || 0;
    day.trades += 1;
    day.volume += volume;
    day.fees += fillCosts.bookedFees;
    day.funding += fillCosts.bookedFunding;

    if (fillCosts.isClose && fillCosts.net >= PNL_EPSILON) day.wins += 1;
    else if (fillCosts.isClose && fillCosts.net <= -PNL_EPSILON) day.losses += 1;
  });

  return Array.from(dailyMap.values()).sort((a, b) =>
    parseLocalDateKey(b.date).getTime() - parseLocalDateKey(a.date).getTime()
  );
}

// Process fills into weekly PnL data
export function processWeeklyPnL(dailyPnL: DailyPnL[]): WeeklyPnL[] {
  const weeklyMap = new Map<string, WeeklyPnL>();
  
  dailyPnL.forEach(day => {
    const date = parseLocalDateKey(day.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay()); // Sunday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Saturday
    
    const weekKey = formatLocalDateKey(weekStart);
    
    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, {
        weekStart: weekKey,
        weekEnd: formatLocalDateKey(weekEnd),
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
    parseLocalDateKey(b.weekStart).getTime() - parseLocalDateKey(a.weekStart).getTime()
  );
}

// Process fills into asset performance data
export function processAssetPerformance(
  fills: Fill[],
  spotTokenCache?: Map<number, string>,
  costs: CostAttribution = attributeCosts(fills),
): AssetPerformance[] {
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
    const fillCosts = getFillCosts(costs, fill);
    const volume = parseFloat(fill.sz) * parseFloat(fill.px);

    if (!assetMap.has(coin)) {
      assetMap.set(coin, { pnl: 0, trades: 0, volume: 0, wins: 0, losses: 0 });
    }

    const asset = assetMap.get(coin)!;
    asset.pnl += fillCosts.net;
    asset.volume += volume;
  });

  // Trades and win rate count round trips (open to flat), not fills
  buildRoundTrips(fills, costs).forEach(trip => {
    const asset = assetMap.get(getSpotTokenName(trip.coin, cache));
    if (!asset) return;
    asset.trades += 1;
    if (trip.net >= PNL_EPSILON) asset.wins += 1;
    else if (trip.net <= -PNL_EPSILON) asset.losses += 1;
  });
  
  return Array.from(assetMap.entries())
    .map(([coin, data]) => ({
      coin,
      pnl: data.pnl,
      trades: data.trades,
      volume: data.volume,
      winRate: data.wins + data.losses > 0 ? (data.wins / (data.wins + data.losses)) * 100 : 0,
      avgPnl: data.trades > 0 ? data.pnl / data.trades : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

// Calculate trading summary
export function calculateSummary(
  fills: Fill[],
  dailyPnL: DailyPnL[],
  costs: CostAttribution = attributeCosts(fills),
  tradeStats: TradeStats = computeTradeStats(buildRoundTrips(fills, costs)),
): TradingSummary {
  const totalPnl = dailyPnL.reduce((sum, d) => sum + d.pnl, 0);
  const grossPnl = dailyPnL.reduce((sum, d) => sum + d.grossPnl, 0);
  const totalTrades = fills.length;
  const totalVolume = dailyPnL.reduce((sum, d) => sum + d.volume, 0);

  // Days that only opened positions (or broke even) are flat: neither wins nor losses
  const profitableDays = dailyPnL.filter(d => d.pnl >= PNL_EPSILON).length;
  const losingDays = dailyPnL.filter(d => d.pnl <= -PNL_EPSILON).length;
  const decidedDays = profitableDays + losingDays;

  const sortedByPnl = [...dailyPnL].sort((a, b) => b.pnl - a.pnl);
  const bestDay = sortedByPnl[0] || null;
  const worstDay = sortedByPnl[sortedByPnl.length - 1] || null;

  // Largest win/loss per round trip (an exit split over several fills is one trade)
  const { largestWin, largestLoss } = tradeStats;

  return {
    totalPnl,
    grossPnl,
    totalTrades,
    totalVolume,
    totalFees: costs.totalFees,
    totalFunding: costs.totalFunding,
    openPositionCosts: costs.openFunding - costs.openFees,
    winRate: decidedDays > 0 ? (profitableDays / decidedDays) * 100 : 0,
    bestDay,
    worstDay,
    profitableDays,
    losingDays,
    avgDailyPnl: decidedDays > 0 ? totalPnl / decidedDays : 0,
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
  const costs = attributeCosts(fills);
  const tradeStats = computeTradeStats(buildRoundTrips(fills, costs));
  const dailyPnL = processDailyPnL(fills, costs);
  const weeklyPnL = processWeeklyPnL(dailyPnL);
  const assetPerformance = processAssetPerformance(fills, spotCache, costs);
  const summary = calculateSummary(fills, dailyPnL, costs, tradeStats);

  return {
    fills,
    dailyPnL,
    weeklyPnL,
    assetPerformance,
    summary,
    costs,
    tradeStats,
  };
}

// Validate Ethereum address format
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
