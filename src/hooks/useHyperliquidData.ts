import { useState, useCallback } from 'react';
import { 
  fetchTradingData, 
  isValidAddress, 
  type UserTradingData 
} from '@/lib/hyperliquid';

export interface UseHyperliquidDataReturn {
  data: UserTradingData | null;
  isLoading: boolean;
  error: string | null;
  address: string;
  fetchData: (address: string) => Promise<void>;
  clearData: () => void;
}

export function useHyperliquidData(): UseHyperliquidDataReturn {
  const [data, setData] = useState<UserTradingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');

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
    
    try {
      const tradingData = await fetchTradingData(trimmedAddress);
      
      if (tradingData.fills.length === 0) {
        setError('No trading history found for this address');
        setData(null);
      } else {
        setData(tradingData);
      }
    } catch (err) {
      console.error('Error fetching trading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trading data');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setData(null);
    setError(null);
    setAddress('');
  }, []);

  return {
    data,
    isLoading,
    error,
    address,
    fetchData,
    clearData,
  };
}
