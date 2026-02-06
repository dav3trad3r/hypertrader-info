import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { WhaleTradesFeed } from '@/components/whales/WhaleTradesFeed';
import { WhaleActiveTwaps } from '@/components/whales/WhaleActiveTwaps';
import { WhaleStats } from '@/components/whales/WhaleStats';
import { supabase } from '@/integrations/supabase/client';
import { Waves, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface WhaleTrade {
  id: string;
  address: string;
  coin: string;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  notional: number;
  timestamp: number;
  tx_hash: string | null;
  whale_addresses?: { label: string | null };
}

export interface WhaleTwap {
  id: string;
  address: string;
  coin: string;
  side: 'buy' | 'sell';
  total_size: number;
  filled_size: number;
  remaining_size: number;
  avg_price: number | null;
  start_time: number;
  is_active: boolean;
  current_price: number;
  remaining_notional: number;
  pressure: 'buy' | 'sell';
  whale_addresses?: { label: string | null };
}

export interface WhaleStats {
  totalTrades: number;
  activeTwaps: number;
  trackedWhales: number;
  volume24h: number;
}

const Whales = () => {
  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [twaps, setTwaps] = useState<WhaleTwap[]>([]);
  const [stats, setStats] = useState<WhaleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    try {
      const [tradesRes, twapsRes, statsRes] = await Promise.all([
        supabase.functions.invoke('whale-tracker', {
          body: null,
          headers: {},
        }).then(() => 
          supabase.functions.invoke('whale-tracker?action=trades')
        ),
        supabase.functions.invoke('whale-tracker?action=twaps'),
        supabase.functions.invoke('whale-tracker?action=stats'),
      ]);

      if (tradesRes.data) setTrades(tradesRes.data);
      if (twapsRes.data) setTwaps(twapsRes.data);
      if (statsRes.data) setStats(statsRes.data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching whale data:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerScan = async () => {
    setScanning(true);
    try {
      await supabase.functions.invoke('whale-tracker?action=scan');
      await fetchData();
    } catch (error) {
      console.error('Error triggering scan:', error);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10">
              <Waves className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Whale Tracker</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                $5M+ trades & active TWAPs from detected whales
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={triggerScan}
              disabled={scanning}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scanning...' : 'Scan Now'}
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <WhaleStats stats={stats} loading={loading} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Active TWAPs */}
          <WhaleActiveTwaps twaps={twaps} loading={loading} />
          
          {/* Recent Large Trades */}
          <WhaleTradesFeed trades={trades} loading={loading} />
        </div>

        {/* Empty State */}
        {!loading && trades.length === 0 && twaps.length === 0 && (
          <div className="mt-8 bg-card border border-border rounded-lg p-8 text-center">
            <Waves className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Whale Activity Detected</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Whales are auto-detected when trades ≥$5M occur. Click "Scan Now" to check for recent activity.
            </p>
            <Button onClick={triggerScan} disabled={scanning}>
              {scanning ? 'Scanning...' : 'Scan for Whales'}
            </Button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">HyperTrader</span> • Whale tracking auto-detects addresses with $5M+ trades
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Whales;
