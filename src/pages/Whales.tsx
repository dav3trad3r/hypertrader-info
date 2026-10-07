import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { OpenSourceLinks } from '@/components/OpenSourceLinks';
import { WhaleTradesFeed } from '@/components/whales/WhaleTradesFeed';
import { WhaleActiveTwaps } from '@/components/whales/WhaleActiveTwaps';
import { WhaleStats } from '@/components/whales/WhaleStats';
import { TrackedWhalesList } from '@/components/whales/TrackedWhalesList';
import { WhalePositionsViewer } from '@/components/whales/WhalePositionsViewer';
import { supabase } from '@/integrations/supabase/client';
import { Waves } from 'lucide-react';

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

export interface WhaleAddress {
  address: string;
  label: string | null;
  total_volume: number;
  trade_count: number;
  last_seen_at: string;
}

const Whales = () => {
  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [twaps, setTwaps] = useState<WhaleTwap[]>([]);
  const [whales, setWhales] = useState<WhaleAddress[]>([]);
  const [stats, setStats] = useState<WhaleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedWhale, setSelectedWhale] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      // First trigger a scan, then fetch the data
      await supabase.functions.invoke('whale-tracker', {
        body: { action: 'scan' },
      });
      
      const [tradesRes, twapsRes, statsRes, whalesRes] = await Promise.all([
        supabase.functions.invoke('whale-tracker', { body: { action: 'trades' } }),
        supabase.functions.invoke('whale-tracker', { body: { action: 'twaps' } }),
        supabase.functions.invoke('whale-tracker', { body: { action: 'stats' } }),
        supabase.functions.invoke('whale-tracker', { body: { action: 'whales' } }),
      ]);

      if (tradesRes.data) setTrades(tradesRes.data);
      if (twapsRes.data) setTwaps(twapsRes.data);
      if (statsRes.data) setStats(statsRes.data);
      if (whalesRes.data) setWhales(whalesRes.data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching whale data:', error);
    } finally {
      setLoading(false);
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
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-profit animate-pulse" />
              <span className="text-xs text-muted-foreground">Auto-refresh 30s</span>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <WhaleStats stats={stats} loading={loading} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Tracked Whales */}
          <TrackedWhalesList 
            whales={whales} 
            loading={loading} 
            selectedWhale={selectedWhale}
            onSelectWhale={setSelectedWhale}
          />
          
          {/* Active TWAPs */}
          <WhaleActiveTwaps twaps={twaps} loading={loading} />
          
          {/* Recent Large Trades */}
          <WhaleTradesFeed trades={trades} loading={loading} />
        </div>

        {/* Selected Whale Positions */}
        {selectedWhale && (
          <div className="mt-6">
            <WhalePositionsViewer 
              address={selectedWhale} 
              label={whales.find(w => w.address === selectedWhale)?.label || null}
              onClose={() => setSelectedWhale(null)}
            />
          </div>
        )}

        {/* How it works */}
        {!loading && whales.length > 0 && trades.length === 0 && twaps.length === 0 && (
          <div className="mt-6 bg-secondary/30 border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground text-center">
              <strong className="text-foreground">{whales.length} whale{whales.length !== 1 ? 's' : ''}</strong> detected with $1M+ positions. 
              Large trades ($5M+) and active TWAPs will appear here when activity is detected.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">HyperTrader</span> • Whale tracking auto-detects addresses with $5M+ trades<OpenSourceLinks />
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Whales;
