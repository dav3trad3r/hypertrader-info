import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Clock, RefreshCw } from 'lucide-react';

interface SentimentData {
  action: {
    bias: string;
    confidence: string;
    reason: string;
    urgency: string;
    move_status: string;
    move_recommendation: string;
  };
  fear_greed: {
    score: number;
    label: string;
    components: {
      price_momentum: number;
      safe_haven: number;
      news_sentiment: number;
      volatility: number;
    };
  };
  key_prices: {
    BTC: { price: number; change24h: number };
    ETH: { price: number; change24h: number };
    SOL: { price: number; change24h: number };
    GOLD: { price: number; change24h: number };
    SILVER: { price: number; change24h: number };
  };
  breaking_alert?: {
    active: boolean;
    headline: string;
    type: string;
    urgency: string;
    ageMinutes: number;
  };
  latest_headlines: Array<{
    title: string;
    source: string;
    impact: string;
    url: string;
  }>;
  cached?: boolean;
  cached_at?: string;
  stale?: boolean;
}

function getBiasColor(bias: string): string {
  const upper = bias.toUpperCase();
  if (upper.includes('STRONG SHORT') || upper.includes('BEARISH')) return 'text-loss';
  if (upper.includes('SHORT')) return 'text-loss/80';
  if (upper.includes('STRONG LONG') || upper.includes('BULLISH')) return 'text-profit';
  if (upper.includes('LONG')) return 'text-profit/80';
  return 'text-muted-foreground';
}

function getBiasIcon(bias: string) {
  const upper = bias.toUpperCase();
  if (upper.includes('SHORT') || upper.includes('BEARISH')) {
    return <TrendingDown className="w-5 h-5" />;
  }
  if (upper.includes('LONG') || upper.includes('BULLISH')) {
    return <TrendingUp className="w-5 h-5" />;
  }
  return <Minus className="w-5 h-5" />;
}

function getFearGreedColor(score: number): string {
  if (score <= 25) return 'text-loss';
  if (score <= 45) return 'text-orange-500';
  if (score <= 55) return 'text-yellow-500';
  if (score <= 75) return 'text-profit/80';
  return 'text-profit';
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

export function SentimentBanner() {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchSentiment = async () => {
    try {
      setError(null);
      const { data: result, error: fnError } = await supabase.functions.invoke('get-sentiment');
      
      if (fnError) throw fnError;
      
      setData(result);
      if (result.cached_at) {
        setLastUpdated(new Date(result.cached_at).toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to fetch sentiment:', err);
      setError('Unable to load sentiment data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSentiment();
    // Refresh every 5 minutes on the client side
    const interval = setInterval(fetchSentiment, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 mb-6 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-muted rounded" />
          <div className="h-5 w-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{error || 'Sentiment data unavailable'}</span>
        </div>
      </div>
    );
  }

  const biasColor = getBiasColor(data.action.bias);
  const fearGreedColor = getFearGreedColor(data.fear_greed.score);

  return (
    <div className="bg-card border border-border rounded-lg p-4 mb-6 space-y-4">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 ${biasColor}`}>
            {getBiasIcon(data.action.bias)}
            <span className="font-bold text-lg">{data.action.bias}</span>
          </div>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
            {data.action.confidence} confidence
          </span>
          {data.action.move_status && (
            <span className={`text-xs px-2 py-0.5 rounded ${
              data.action.move_status === 'EXTENDED' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-primary/20 text-primary'
            }`}>
              {data.action.move_status}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Fear & Greed:</span>
            <span className={`font-semibold ${fearGreedColor}`}>
              {data.fear_greed.score} - {data.fear_greed.label}
            </span>
          </div>
          
          {lastUpdated && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {lastUpdated}
              {data.stale && <span className="text-yellow-500">(stale)</span>}
            </div>
          )}
        </div>
      </div>

      {/* Breaking Alert */}
      {data.breaking_alert?.active && (
        <div className="bg-loss/10 border border-loss/30 rounded-md p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-loss flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-loss">{data.breaking_alert.headline}</p>
            <p className="text-xs text-muted-foreground">
              {data.breaking_alert.ageMinutes}m ago • {data.breaking_alert.urgency} urgency
            </p>
          </div>
        </div>
      )}

      {/* Asset Prices */}
      <div className="flex flex-wrap gap-3">
        {data.key_prices && Object.entries(data.key_prices).map(([symbol, asset]) => (
          <div 
            key={symbol} 
            className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-1.5"
          >
            <span className="text-sm font-medium">{symbol}</span>
            <span className="text-sm text-foreground">{formatPrice(asset.price)}</span>
            <span className={`text-xs ${asset.change24h >= 0 ? 'text-profit' : 'text-loss'}`}>
              {formatChange(asset.change24h)}
            </span>
          </div>
        ))}
      </div>

      {/* Reason */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        {data.action.reason}
      </p>

      {/* Headlines */}
      {data.latest_headlines && data.latest_headlines.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground mb-2">Latest Headlines</p>
          <div className="space-y-1.5">
            {data.latest_headlines.slice(0, 3).map((headline, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  headline.impact === 'positive' ? 'bg-profit/20 text-profit' :
                  headline.impact === 'negative' ? 'bg-loss/20 text-loss' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {headline.impact}
                </span>
                <span className="text-foreground">{headline.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
