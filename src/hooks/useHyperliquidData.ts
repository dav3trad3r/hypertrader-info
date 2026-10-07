import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  fetchAllAvailableFills,
  fetchFillsForMonth, 
  fetchFillsSince,
  fetchAccountValue,
fetchUserFunding,
  isValidAddress,
  filterFillsByMarket,
  processDailyPnL,
  processWeeklyPnL,
  processAssetPerformance,
  calculateSummary,
  isSpotTrade,
  getSpotTokenCache,
  type UserTradingData,
  type MarketType,
  type Fill,
} from '@/lib/hyperliquid';
import { attributeCosts, type FundingPayment } from '@/lib/pnl';
import { resolveInput, isENSName } from '@/lib/ens';
import { toast } from '@/hooks/use-toast';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface TrackingInfo {
  address: string;
  first_seen_at: string;
  last_synced_at: string;
  total_fills: number;
  has_gap: boolean;
  oldest_tid: number;
  last_synced_tid: number;
}

export interface UseHyperliquidDataReturn {
  data: UserTradingData | null;
  filteredData: UserTradingData | null;
  rawFills: Fill[];
  isLoading: boolean;
  isLoadingMonth: boolean;
  isSyncing: boolean;
  isRefreshing: boolean;
  lastRefreshed: Date | null;
  trackingInfo: TrackingInfo | null;
  loadedMonths: Set<string>;
  hasMoreHistory: boolean;
  hitApiLimit: boolean;
  error: string | null;
  address: string;
  ensName: string | null;
  marketType: MarketType;
  setMarketType: (type: MarketType) => void;
  marketCounts: { all: number; perps: number; spot: number };
  fetchData: (addressOrENS: string) => Promise<void>;
  loadMonth: (year: number, month: number) => Promise<void>;
  clearData: () => void;
  refreshNow: () => Promise<void>;
}

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function useHyperliquidData(): UseHyperliquidDataReturn {
  const [rawFills, setRawFills] = useState<Fill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [hitApiLimit, setHitApiLimit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [ensName, setEnsName] = useState<string | null>(null);
  const [marketType, setMarketType] = useState<MarketType>('all');
  const [spotTokenCache, setSpotTokenCache] = useState<Map<number, string>>(new Map());
  const [accountValue, setAccountValue] = useState<number | null>(null);
  const [funding, setFunding] = useState<FundingPayment[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFillTimeRef = useRef<number>(0);
  // Which address and start time the loaded funding covers
  const fundingCoverageRef = useRef<{ address: string; from: number } | null>(null);
  const fundingRef = useRef<FundingPayment[]>([]);
  useEffect(() => {
    fundingRef.current = funding;
  }, [funding]);

  // Preload spot token cache on mount
  useEffect(() => {
    getSpotTokenCache().then(cache => {
      setSpotTokenCache(cache);
    });
  }, []);

  const marketCounts = useMemo(() => {
    const perps = rawFills.filter(f => !isSpotTrade(f)).length;
    const spot = rawFills.filter(f => isSpotTrade(f)).length;
    return {
      all: rawFills.length,
      perps,
      spot,
    };
  }, [rawFills]);

  // Filter and recalculate data based on market type
  const filteredData = useMemo(() => {
    if (rawFills.length === 0) return null;
    
    const filteredFills = filterFillsByMarket(rawFills, marketType);
    if (filteredFills.length === 0) return null;
    
    // Spot has no funding; perps and "all" book it against the positions it was paid on
    const costs = attributeCosts(filteredFills, marketType === 'spot' ? [] : funding);
    const dailyPnL = processDailyPnL(filteredFills, costs);
    const weeklyPnL = processWeeklyPnL(dailyPnL);
    const assetPerformance = processAssetPerformance(filteredFills, spotTokenCache, costs);
    const summary = calculateSummary(filteredFills, dailyPnL, costs);
    
    // Add account value to summary if available
    if (accountValue !== null) {
      summary.accountValue = accountValue;
    }
    
    return {
      fills: filteredFills,
      dailyPnL,
      weeklyPnL,
      assetPerformance,
      summary,
      costs,
    };
  }, [rawFills, marketType, spotTokenCache, accountValue, funding]);

  // Keep original data for reference
  const data = useMemo(() => {
    if (rawFills.length === 0) return null;
    
    const costs = attributeCosts(rawFills, funding);
    const dailyPnL = processDailyPnL(rawFills, costs);
    const weeklyPnL = processWeeklyPnL(dailyPnL);
    const assetPerformance = processAssetPerformance(rawFills, spotTokenCache, costs);
    const summary = calculateSummary(rawFills, dailyPnL, costs);

    return {
      fills: rawFills,
      dailyPnL,
      weeklyPnL,
      assetPerformance,
      summary,
      costs,
    };
  }, [rawFills, spotTokenCache, funding]);

  // Load funding in the background once fills are in, back to the oldest loaded fill.
  // Refetches only when older fills arrive (lazy-loaded months, merged history).
  useEffect(() => {
    if (!address || rawFills.length === 0) return;
    const from = Math.min(...rawFills.map(f => f.time));
    const covered = fundingCoverageRef.current;
    if (covered && covered.address === address && covered.from <= from) return;

    fundingCoverageRef.current = { address, from };
    fetchUserFunding(address, from)
      .then(payments => {
        if (fundingCoverageRef.current?.address === address) setFunding(payments);
      })
      .catch(err => console.warn('Failed to load funding history:', err));
  }, [address, rawFills]);

  // Track which months we've attempted to load (even if empty)
  const attemptedMonths = useRef<Set<string>>(new Set());

  // Load additional month data (lazy loading for months not covered by initial fetch)
  const loadMonth = useCallback(async (year: number, month: number) => {
    const monthKey = getMonthKey(year, month);
    
    // Skip if already loaded, attempted, or currently loading
    if (loadedMonths.has(monthKey) || attemptedMonths.current.has(monthKey) || isLoadingMonth || !address) {
      return;
    }
    
    // Mark as attempted to prevent duplicate requests
    attemptedMonths.current.add(monthKey);
    setIsLoadingMonth(true);
    
    try {
      console.log(`Lazy loading month ${monthKey} for high-volume account...`);
      const monthFills = await fetchFillsForMonth(address, year, month);
      
      if (monthFills.length > 0) {
        setRawFills(prev => {
          const existingTids = new Set(prev.map(f => f.tid));
          const newFills = monthFills.filter(f => !existingTids.has(f.tid));
          
          console.log(`Month ${monthKey}: ${monthFills.length} fetched, ${newFills.length} new`);
          
          if (newFills.length === 0) {
            // All fills were duplicates, month data was already in initial fetch
            return prev;
          }
          
          const combined = [...prev, ...newFills];
          combined.sort((a, b) => b.time - a.time);
          
          toast({
            title: "Additional trades loaded",
            description: `Found ${newFills.length} more trades for ${new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            duration: 3000,
          });
          
          return combined;
        });
      } else {
        console.log(`Month ${monthKey}: No trades found`);
      }
      
      // Mark as loaded (even if empty, to show "no trades" instead of loading state)
      setLoadedMonths(prev => new Set([...prev, monthKey]));
    } catch (err) {
      console.error('Error loading month:', err);
      // Remove from attempted so user can retry
      attemptedMonths.current.delete(monthKey);
      toast({
        title: "Failed to load month",
        description: "Could not fetch trades for this month. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMonth(false);
    }
  }, [address, loadedMonths, isLoadingMonth]);

  const fetchData = useCallback(async (inputAddressOrENS: string) => {
    const trimmed = inputAddressOrENS.trim();
    
    if (!trimmed) {
      setError('Please enter an address or ENS name');
      return;
    }
    
    // Cancel any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setIsLoading(true);
    setError(null);
    setMarketType('all');
    setLoadedMonths(new Set());
    attemptedMonths.current = new Set();
    setRawFills([]);
    setHasMoreHistory(false);
    setHitApiLimit(false);
    setEnsName(null);
    setTrackingInfo(null);
    setAccountValue(null);
    setFunding([]);
    fundingCoverageRef.current = null;

    try {
      // Resolve ENS name or validate address
      let resolvedAddress: string;
      let resolvedENS: string | null = null;
      
      if (isENSName(trimmed)) {
        // Resolve ENS name to address
        const result = await resolveInput(trimmed);
        if (!result.address) {
          setError(`Could not resolve ENS name "${trimmed}"`);
          setIsLoading(false);
          return;
        }
        resolvedAddress = result.address;
        resolvedENS = trimmed.toLowerCase();
      } else if (isValidAddress(trimmed)) {
        resolvedAddress = trimmed;
        // Try reverse lookup for ENS name (don't block on failure)
        resolveInput(trimmed).then(result => {
          if (result.ensName) {
            setEnsName(result.ensName);
          }
        }).catch(() => {});
      } else {
        setError('Invalid Ethereum address or ENS name');
        setIsLoading(false);
        return;
      }
      
      setAddress(resolvedAddress);
      setEnsName(resolvedENS);
      
      // Step 1: Trigger sync to Supabase (runs in background)
      setIsSyncing(true);
      const syncPromise = fetch(`${SUPABASE_URL}/functions/v1/sync-fills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ address: resolvedAddress })
      }).then(async (res) => {
        if (res.ok) {
          const syncResult = await res.json();
          console.log('Sync result:', syncResult);
          return syncResult;
        }
        console.warn('Sync failed, continuing with API data');
        return null;
      }).catch(err => {
        console.warn('Sync error:', err);
        return null;
      }).finally(() => {
        setIsSyncing(false);
      });
      
      // Step 2: Simultaneously fetch from Hyperliquid API for immediate display
      // Also fetch the account's total value for the balance card
      const [apiResult, totalValue] = await Promise.all([
        fetchAllAvailableFills(resolvedAddress),
        fetchAccountValue(resolvedAddress)
      ]);

      if (totalValue !== null) {
        setAccountValue(totalValue);
      }
      
      if (apiResult.fills.length === 0) {
        // Check if we have historical data in Supabase
        const dbRes = await fetch(
          `${SUPABASE_URL}/functions/v1/get-fills?address=${resolvedAddress}`,
          {
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
          }
        );
        
        if (dbRes.ok) {
          const dbData = await dbRes.json();
          if (dbData.fills && dbData.fills.length > 0) {
            setRawFills(dbData.fills);
            setTrackingInfo(dbData.tracking);
            
            const monthsWithData = new Set<string>();
            dbData.fills.forEach((fill: Fill) => {
              const date = new Date(fill.time);
              monthsWithData.add(getMonthKey(date.getFullYear(), date.getMonth()));
            });
            setLoadedMonths(monthsWithData);
            
            toast({
              title: "Historical data loaded",
              description: `Loaded ${dbData.fills.length.toLocaleString()} trades from history.`,
              duration: 3000,
            });
          } else {
            setError('No trading history found for this address');
            setRawFills([]);
          }
        } else {
          setError('No trading history found for this address');
          setRawFills([]);
        }
      } else {
        setRawFills(apiResult.fills);
        setHitApiLimit(apiResult.hitApiLimit);
        
        // Mark months that have data as loaded
        const monthsWithData = new Set<string>();
        apiResult.fills.forEach(fill => {
          const date = new Date(fill.time);
          monthsWithData.add(getMonthKey(date.getFullYear(), date.getMonth()));
        });
        setLoadedMonths(monthsWithData);
        
        // Wait for sync to complete, then check for additional historical data
        syncPromise.then(async () => {
          try {
            const dbRes = await fetch(
              `${SUPABASE_URL}/functions/v1/get-fills?address=${resolvedAddress}`,
              {
                headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
              }
            );
            
            if (dbRes.ok) {
              const dbData = await dbRes.json();
              setTrackingInfo(dbData.tracking);
              
              // If DB has more fills than API returned, merge them
              if (dbData.fills && dbData.fills.length > apiResult.fills.length) {
                const existingTids = new Set(apiResult.fills.map(f => f.tid));
                const historicalFills = dbData.fills.filter((f: Fill) => !existingTids.has(f.tid));
                
                if (historicalFills.length > 0) {
                  setRawFills(prev => {
                    const combined = [...prev, ...historicalFills];
                    combined.sort((a, b) => b.time - a.time);
                    return combined;
                  });
                  
                  // Update loaded months with historical data
                  const newMonths = new Set<string>();
                  historicalFills.forEach((fill: Fill) => {
                    const date = new Date(fill.time);
                    newMonths.add(getMonthKey(date.getFullYear(), date.getMonth()));
                  });
                  
                  if (newMonths.size > 0) {
                    setLoadedMonths(prev => new Set([...prev, ...newMonths]));
                    
                    toast({
                      title: "Historical data merged",
                      description: `Found ${historicalFills.length.toLocaleString()} additional trades from previous syncs.`,
                      duration: 3000,
                    });
                  }
                }
              }
            }
          } catch (err) {
            console.warn('Failed to fetch historical data:', err);
          }
        });
        
        // Show appropriate toast
        if (apiResult.hitApiLimit) {
          toast({
            title: "API limit reached",
            description: `Loaded ${apiResult.totalFetched.toLocaleString()} trades. Historical data syncing in background.`,
            variant: "default",
            duration: 5000,
          });
        } else {
          toast({
            title: "Trades loaded",
            description: `Successfully loaded ${apiResult.totalFetched.toLocaleString()} trades.`,
            duration: 3000,
          });
        }
      }
    } catch (err) {
      console.error('Error fetching trading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trading data');
      setRawFills([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setRawFills([]);
    setError(null);
    setAddress('');
    setEnsName(null);
    setMarketType('all');
    setLoadedMonths(new Set());
    attemptedMonths.current = new Set();
    setHasMoreHistory(false);
    setHitApiLimit(false);
    setIsSyncing(false);
    setIsRefreshing(false);
    setLastRefreshed(null);
    setTrackingInfo(null);
    setAccountValue(null);
    setFunding([]);
    fundingCoverageRef.current = null;
    lastFillTimeRef.current = 0;
  }, []);

  // Refresh function to fetch new fills since last known fill
  const refreshNow = useCallback(async () => {
    if (!address || isLoading || isRefreshing) return;
    
    const sinceTime = lastFillTimeRef.current || Date.now() - 60 * 60 * 1000; // Last hour if no fills
    
    setIsRefreshing(true);
    try {
      const newFills = await fetchFillsSince(address, sinceTime);
      
      if (newFills.length > 0) {
        setRawFills(prev => {
          const existingTids = new Set(prev.map(f => f.tid));
          const uniqueNewFills = newFills.filter(f => !existingTids.has(f.tid));
          
          if (uniqueNewFills.length > 0) {
            console.log(`Auto-refresh: Found ${uniqueNewFills.length} new fills`);
            
            // Update last fill time
            const maxTime = Math.max(...uniqueNewFills.map(f => f.time));
            if (maxTime > lastFillTimeRef.current) {
              lastFillTimeRef.current = maxTime;
            }
            
            const combined = [...uniqueNewFills, ...prev];
            combined.sort((a, b) => b.time - a.time);
            return combined;
          }
          return prev;
        });
      }
      
      // Append funding paid since the last payment we have
      if (fundingCoverageRef.current?.address === address) {
        const loaded = fundingRef.current;
        const since = loaded.length > 0 ? loaded[loaded.length - 1].time + 1 : Date.now() - 60 * 60 * 1000;
        fetchUserFunding(address, since).then(newPayments => {
          if (newPayments.length === 0 || fundingCoverageRef.current?.address !== address) return;
          setFunding(prev => {
            const last = prev.length > 0 ? prev[prev.length - 1].time : 0;
            const fresh = newPayments.filter(p => p.time > last);
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }).catch(() => {});
      }

      // Also refresh account value
      const totalValue = await fetchAccountValue(address);
      if (totalValue !== null) {
        setAccountValue(totalValue);
      }
      
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error refreshing fills:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [address, isLoading, isRefreshing]);

  // Set up auto-refresh polling when we have an address
  useEffect(() => {
    if (address && rawFills.length > 0) {
      // Set the last fill time for efficient polling
      if (rawFills.length > 0 && lastFillTimeRef.current === 0) {
        lastFillTimeRef.current = Math.max(...rawFills.map(f => f.time));
      }
      
      // Start polling every 30 seconds
      pollIntervalRef.current = setInterval(() => {
        refreshNow();
      }, 30000);
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }
  }, [address, rawFills.length, refreshNow]);

  return {
    data,
    filteredData,
    rawFills,
    isLoading,
    isLoadingMonth,
    isSyncing,
    isRefreshing,
    lastRefreshed,
    trackingInfo,
    loadedMonths,
    hasMoreHistory,
    hitApiLimit,
    error,
    address,
    ensName,
    marketType,
    setMarketType,
    marketCounts,
    fetchData,
    loadMonth,
    clearData,
    refreshNow,
  };
}
