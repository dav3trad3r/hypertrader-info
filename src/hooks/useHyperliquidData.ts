import { useState, useCallback, useMemo } from 'react';
import { 
  fetchInitialFills,
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

export interface UseHyperliquidDataReturn {
  data: UserTradingData | null;
  filteredData: UserTradingData | null;
  rawFills: Fill[];
  isLoading: boolean;
  isLoadingMonth: boolean;
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
  const [rawFills, setRawFills] = useState<Fill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [marketType, setMarketType] = useState<MarketType>('all');

  // Calculate market counts
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
    
    setIsLoading(true);
    setError(null);
    setAddress(trimmedAddress);
    setMarketType('all');
    setLoadedMonths(new Set());
    
    try {
      const fills = await fetchInitialFills(trimmedAddress);
      
      if (fills.length === 0) {
        setError('No trading history found for this address');
        setRawFills([]);
      } else {
        setRawFills(fills);
        
        // Mark current month and months with data as loaded
        const now = new Date();
        const monthsWithData = new Set<string>();
        monthsWithData.add(getMonthKey(now.getFullYear(), now.getMonth()));
        
        fills.forEach(fill => {
          const date = new Date(fill.time);
          monthsWithData.add(getMonthKey(date.getFullYear(), date.getMonth()));
        });
        
        setLoadedMonths(monthsWithData);
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
    setRawFills([]);
    setError(null);
    setAddress('');
    setMarketType('all');
    setLoadedMonths(new Set());
  }, []);

  return {
    data,
    filteredData,
    rawFills,
    isLoading,
    isLoadingMonth,
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
