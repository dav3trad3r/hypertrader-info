import { useState, useCallback, useMemo, useRef } from 'react';
import { 
  fetchAllAvailableFills,
  fetchFillsForMonth, 
  isValidAddress,
  filterFillsByMarket,
  processDailyPnL,
  processWeeklyPnL,
  processAssetPerformance,
  calculateSummary,
  isSpotTrade,
  type UserTradingData,
  type MarketType,
  type Fill,
} from '@/lib/hyperliquid';
import { toast } from '@/hooks/use-toast';

export interface UseHyperliquidDataReturn {
  data: UserTradingData | null;
  filteredData: UserTradingData | null;
  rawFills: Fill[];
  isLoading: boolean;
  isLoadingMonth: boolean;
  loadedMonths: Set<string>;
  hasMoreHistory: boolean;
  hitApiLimit: boolean;
  error: string | null;
  address: string;
  marketType: MarketType;
  setMarketType: (type: MarketType) => void;
  marketCounts: { all: number; perps: number; spot: number };
  fetchData: (address: string) => Promise<void>;
  loadMonth: (year: number, month: number) => Promise<void>;
  clearData: () => void;
}

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function useHyperliquidData(): UseHyperliquidDataReturn {
  const [rawFills, setRawFills] = useState<Fill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [hitApiLimit, setHitApiLimit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [marketType, setMarketType] = useState<MarketType>('all');
  
  const abortControllerRef = useRef<AbortController | null>(null);

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
    
    const dailyPnL = processDailyPnL(filteredFills);
    const weeklyPnL = processWeeklyPnL(dailyPnL);
    const assetPerformance = processAssetPerformance(filteredFills);
    const summary = calculateSummary(filteredFills, dailyPnL);
    
    return {
      fills: filteredFills,
      dailyPnL,
      weeklyPnL,
      assetPerformance,
      summary,
    };
  }, [rawFills, marketType]);

  // Keep original data for reference
  const data = useMemo(() => {
    if (rawFills.length === 0) return null;
    
    const dailyPnL = processDailyPnL(rawFills);
    const weeklyPnL = processWeeklyPnL(dailyPnL);
    const assetPerformance = processAssetPerformance(rawFills);
    const summary = calculateSummary(rawFills, dailyPnL);
    
    return {
      fills: rawFills,
      dailyPnL,
      weeklyPnL,
      assetPerformance,
      summary,
    };
  }, [rawFills]);

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

  const fetchData = useCallback(async (inputAddress: string) => {
    const trimmedAddress = inputAddress.trim();
    
    if (!trimmedAddress) {
      setError('Please enter an address');
      return;
    }
    
    if (!isValidAddress(trimmedAddress)) {
      setError('Invalid Ethereum address format');
      return;
    }
    
    // Cancel any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setIsLoading(true);
    setError(null);
    setAddress(trimmedAddress);
    setMarketType('all');
    setLoadedMonths(new Set());
    attemptedMonths.current = new Set(); // Reset attempted months for new address
    setRawFills([]);
    setHasMoreHistory(false);
    setHitApiLimit(false);
    
    try {
      // Fetch ALL available fills (up to 10K API limit)
      const result = await fetchAllAvailableFills(trimmedAddress);
      
      if (result.fills.length === 0) {
        setError('No trading history found for this address');
        setRawFills([]);
      } else {
        setRawFills(result.fills);
        setHitApiLimit(result.hitApiLimit);
        
        // Mark months that have data as loaded
        // These are the months covered by the initial 10K fetch
        const monthsWithData = new Set<string>();
        result.fills.forEach(fill => {
          const date = new Date(fill.time);
          monthsWithData.add(getMonthKey(date.getFullYear(), date.getMonth()));
        });
        setLoadedMonths(monthsWithData);
        
        // Show appropriate toast
        if (result.hitApiLimit) {
          toast({
            title: "API limit reached",
            description: `Loaded ${result.totalFetched.toLocaleString()} trades. Navigate to older months to load more history.`,
            variant: "default",
            duration: 5000,
          });
        } else {
          toast({
            title: "Trades loaded",
            description: `Successfully loaded ${result.totalFetched.toLocaleString()} trades.`,
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
    setRawFills([]);
    setError(null);
    setAddress('');
    setMarketType('all');
    setLoadedMonths(new Set());
    attemptedMonths.current = new Set();
    setHasMoreHistory(false);
    setHitApiLimit(false);
  }, []);

  return {
    data,
    filteredData,
    rawFills,
    isLoading,
    isLoadingMonth,
    loadedMonths,
    hasMoreHistory,
    hitApiLimit,
    error,
    address,
    marketType,
    setMarketType,
    marketCounts,
    fetchData,
    loadMonth,
    clearData,
  };
}
