import { useState, useCallback, useMemo } from 'react';
import { 
  fetchTradingData, 
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
  error: string | null;
  address: string;
  marketType: MarketType;
  setMarketType: (type: MarketType) => void;
  marketCounts: { all: number; perps: number; spot: number };
  fetchData: (address: string) => Promise<void>;
  clearData: () => void;
}

export function useHyperliquidData(): UseHyperliquidDataReturn {
  const [rawFills, setRawFills] = useState<Fill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
    setMarketType('all'); // Reset filter on new search
    
    try {
      const tradingData = await fetchTradingData(trimmedAddress);
      
      if (tradingData.fills.length === 0) {
        setError('No trading history found for this address');
        setRawFills([]);
      } else {
        setRawFills(tradingData.fills);
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
  }, []);

  return {
    data,
    filteredData,
    rawFills,
    isLoading,
    error,
    address,
    marketType,
    setMarketType,
    marketCounts,
    fetchData,
    clearData,
  };
}
