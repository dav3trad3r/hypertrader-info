import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  fetchAllFills,
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
  type FetchAllFillsResult,
} from '@/lib/hyperliquid';
import { toast } from '@/hooks/use-toast';

export interface LoadingProgress {
  tradesLoaded: number;
  monthsScanned: number;
  currentMonth: string;
  limitReached: boolean;
}

export interface UseHyperliquidDataReturn {
  data: UserTradingData | null;
  filteredData: UserTradingData | null;
  rawFills: Fill[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  isLoadingMonth: boolean;
  loadingProgress: LoadingProgress | null;
  loadedMonths: Set<string>;
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
  // All useState hooks first
  const [rawFills, setRawFills] = useState<Fill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [marketType, setMarketType] = useState<MarketType>('all');
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
  
  // All useRef hooks together
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const toastShownRef = useRef(false);

  // All useMemo hooks together
  const marketCounts = useMemo(() => {
    const perps = rawFills.filter(f => !isSpotTrade(f)).length;
    const spot = rawFills.filter(f => isSpotTrade(f)).length;
    return {
      all: rawFills.length,
      perps,
      spot,
    };
  }, [rawFills]);

  // useEffect for loading toast notification
  useEffect(() => {
    if (isLoadingHistory && !toastShownRef.current) {
      loadingTimerRef.current = setTimeout(() => {
        toastShownRef.current = true;
        toast({
          title: "Loading complete trading history",
          description: "High-volume accounts may have thousands of trades across many months. We're fetching all data to ensure accurate summary statistics.",
          duration: 8000,
        });
      }, 5000);
    }

    if (!isLoadingHistory) {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      toastShownRef.current = false;
    }

    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, [isLoadingHistory]);

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

  // Load additional month data
  const loadMonth = useCallback(async (year: number, month: number) => {
    const monthKey = getMonthKey(year, month);
    
    // Skip if already loaded or currently loading
    if (loadedMonths.has(monthKey) || isLoadingMonth || !address) {
      return;
    }
    
    setIsLoadingMonth(true);
    
    try {
      const monthFills = await fetchFillsForMonth(address, year, month);
      
      if (monthFills.length > 0) {
        setRawFills(prev => {
          const existingTids = new Set(prev.map(f => f.tid));
          const newFills = monthFills.filter(f => !existingTids.has(f.tid));
          
          if (newFills.length === 0) return prev;
          
          const combined = [...prev, ...newFills];
          combined.sort((a, b) => b.time - a.time);
          return combined;
        });
      }
      
      setLoadedMonths(prev => new Set([...prev, monthKey]));
    } catch (err) {
      console.error('Error loading month:', err);
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
    setIsLoadingHistory(true);
    setError(null);
    setAddress(trimmedAddress);
    setMarketType('all');
    setLoadedMonths(new Set());
    setRawFills([]);
    setLoadingProgress({ tradesLoaded: 0, monthsScanned: 0, currentMonth: '', limitReached: false });
    
    try {
      // Fetch ALL historical data for accurate summary
      const result = await fetchAllFills(trimmedAddress, (progressFills, monthsLoaded, limitReached, currentMonthLabel) => {
        // Update fills progressively as they load
        setRawFills(progressFills);
        
        // Update loading progress
        setLoadingProgress({
          tradesLoaded: progressFills.length,
          monthsScanned: monthsLoaded,
          currentMonth: currentMonthLabel || '',
          limitReached,
        });
        
        // Mark months with data as loaded
        const monthsWithData = new Set<string>();
        progressFills.forEach(fill => {
          const date = new Date(fill.time);
          monthsWithData.add(getMonthKey(date.getFullYear(), date.getMonth()));
        });
        setLoadedMonths(monthsWithData);
      });
      
      if (result.fills.length === 0) {
        setError('No trading history found for this address');
        setRawFills([]);
      } else {
        setRawFills(result.fills);
        
        // Mark all months with data as loaded
        const monthsWithData = new Set<string>();
        result.fills.forEach(fill => {
          const date = new Date(fill.time);
          monthsWithData.add(getMonthKey(date.getFullYear(), date.getMonth()));
        });
        setLoadedMonths(monthsWithData);
        
        // Show warning if limit was reached
        if (result.limitReached) {
          toast({
            title: "Partial history loaded",
            description: `This account has more than 50,000 trades. Only the most recent 50K trades are shown to ensure app performance. Summary statistics reflect loaded data only.`,
            duration: 10000,
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      console.error('Error fetching trading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trading data');
      setRawFills([]);
    } finally {
      setIsLoading(false);
      setIsLoadingHistory(false);
      setLoadingProgress(null);
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
    setIsLoadingHistory(false);
    setLoadingProgress(null);
  }, []);

  return {
    data,
    filteredData,
    rawFills,
    isLoading,
    isLoadingHistory,
    isLoadingMonth,
    loadingProgress,
    loadedMonths,
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
