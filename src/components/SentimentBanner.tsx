import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertTriangle, 
  Clock, 
  ExternalLink,
  Target,
  Gauge,
  Newspaper,
  Activity,
  Shield,
  Zap
} from 'lucide-react';

export interface SentimentData {
  action: {
    bias: string;
    confidence: string;
    reason: string;
    urgency: string;
    move_status: string;
    move_recommendation: string;
    move_context: string;
    catalyst_age_minutes: number;
    price_moved_pct: number;
    breaking_news: boolean;
  };
  fear_greed: {
    score: number;
    label: string;
    components: {
      price_momentum: number;
      safe_haven: number;
      news_sentiment: number;
      volatility: number;
      funding?: number;
      whale_flow?: number;
    };
  };
  key_prices: {
    BTC: { price: number; change24h: number; prevDayPx: number };
    ETH: { price: number; change24h: number; prevDayPx: number };
    SOL?: { price: number; change24h: number; prevDayPx: number };
    GOLD: { price: number; change24h: number; prevDayPx: number };
    SILVER: { price: number; change24h: number; prevDayPx: number };
    HYPE?: { price: number; change24h: number; prevDayPx: number };
  };
  breaking_alert?: {
    active: boolean;
    headline: string;
    type: string;
    urgency: string;
    ageMinutes: number;
    category?: string;
    sentiment_score?: number;
  };
  latest_headlines: Array<{
    title: string;
    source: string;
    impact: string;
    url: string;
    age_minutes: number;
  }>;
  move_status: {
    status: string;
    catalyst_age_minutes: number;
    price_moved_pct: number;
    context: string;
    recommendation: string;
  };
  sentiment_data: {
    avgScore: number;
    postCount: number;
    topCategories: Record<string, number>;
  };
  summary: string;
  timestamp: string;
  cached?: boolean;
  cached_at?: string;
  stale?: boolean;
}

// Custom hook to fetch and manage sentiment data
export function useSentimentData() {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHypePrice = async (): Promise<{ price: number; change24h: number; prevDayPx: number } | null> => {
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('hyperliquid-proxy', {
        body: { type: 'allMids' }
      });
      
      if (fnError || !result) return null;
      
      const hypePrice = parseFloat(result['HYPE']);
      if (!hypePrice) return null;
      
      // Also fetch 24h data for change calculation
      const { data: meta } = await supabase.functions.invoke('hyperliquid-proxy', {
        body: { type: 'meta' }
      });
      
      // Get mark price and previous day price from asset contexts if available
      const { data: ctxs } = await supabase.functions.invoke('hyperliquid-proxy', {
        body: { type: 'metaAndAssetCtxs' }
      });
      
      let change24h = 0;
      let prevDayPx = hypePrice;
      
      if (ctxs && Array.isArray(ctxs) && ctxs[1]) {
        const assetCtxs = ctxs[1];
        const universe = ctxs[0]?.universe || [];
        const hypeIdx = universe.findIndex((u: { name: string }) => u.name === 'HYPE');
        if (hypeIdx >= 0 && assetCtxs[hypeIdx]) {
          const ctx = assetCtxs[hypeIdx];
          prevDayPx = parseFloat(ctx.prevDayPx) || hypePrice;
          change24h = prevDayPx > 0 ? ((hypePrice - prevDayPx) / prevDayPx) * 100 : 0;
        }
      }
      
      return { price: hypePrice, change24h, prevDayPx };
    } catch (err) {
      console.error('Failed to fetch HYPE price:', err);
      return null;
    }
  };

  const fetchSentiment = async () => {
    try {
      setError(null);
      
      // Fetch sentiment and HYPE price in parallel
      const [sentimentResult, hypeData] = await Promise.all([
        supabase.functions.invoke('get-sentiment'),
        fetchHypePrice()
      ]);
      
      if (sentimentResult.error) throw sentimentResult.error;
      
      const result = sentimentResult.data;
      
      // Add HYPE to key_prices if we got it
      if (hypeData && result.key_prices) {
        result.key_prices = {
          ...result.key_prices,
          HYPE: hypeData
        };
      }
      
      setData(result);
    } catch (err) {
      console.error('Failed to fetch sentiment:', err);
      setError('Unable to load sentiment data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSentiment();
    const interval = setInterval(fetchSentiment, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error, refetch: fetchSentiment };
}

function getBiasColor(bias: string): string {
  const upper = bias.toUpperCase();
  if (upper.includes('STRONG SHORT') || upper.includes('BEARISH')) return 'text-loss';
  if (upper.includes('SHORT')) return 'text-loss/80';
  if (upper.includes('STRONG LONG') || upper.includes('BULLISH')) return 'text-profit';
  if (upper.includes('LONG')) return 'text-profit/80';
  return 'text-muted-foreground';
}

function getBiasBgColor(bias: string): string {
  const upper = bias.toUpperCase();
  if (upper.includes('STRONG SHORT') || upper.includes('BEARISH')) return 'bg-loss/20 border-loss/40';
  if (upper.includes('SHORT')) return 'bg-loss/10 border-loss/30';
  if (upper.includes('STRONG LONG') || upper.includes('BULLISH')) return 'bg-profit/20 border-profit/40';
  if (upper.includes('LONG')) return 'bg-profit/10 border-profit/30';
  return 'bg-secondary border-border';
}

function getBiasIcon(bias: string) {
  const upper = bias.toUpperCase();
  if (upper.includes('SHORT') || upper.includes('BEARISH')) {
    return <TrendingDown className="w-6 h-6" />;
  }
  if (upper.includes('LONG') || upper.includes('BULLISH')) {
    return <TrendingUp className="w-6 h-6" />;
  }
  return <Minus className="w-6 h-6" />;
}

function getFearGreedColor(score: number): string {
  if (score <= 25) return 'text-loss';
  if (score <= 45) return 'text-orange-500';
  if (score <= 55) return 'text-yellow-500';
  if (score <= 75) return 'text-profit/80';
  return 'text-profit';
}

function getFearGreedBg(score: number): string {
  if (score <= 25) return 'bg-loss';
  if (score <= 45) return 'bg-orange-500';
  if (score <= 55) return 'bg-yellow-500';
  if (score <= 75) return 'bg-profit/80';
  return 'bg-profit';
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

function formatTimeAgo(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m ago`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

export function SentimentBanner({ externalData }: { externalData?: SentimentData | null }) {
  const hookResult = useSentimentData();
  
  // Use external data if provided, otherwise use hook data
  const data = externalData !== undefined ? externalData : hookResult.data;
  const loading = externalData !== undefined ? false : hookResult.loading;
  const error = externalData !== undefined ? null : hookResult.error;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="bg-card border border-border rounded-lg p-6 h-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-lg p-6 h-64" />
          <div className="bg-card border border-border rounded-lg p-6 h-64" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">{error || 'Sentiment data unavailable'}</p>
      </div>
    );
  }

  const biasColor = getBiasColor(data.action.bias);
  const biasBg = getBiasBgColor(data.action.bias);
  const fearGreedColor = getFearGreedColor(data.fear_greed.score);
  const fearGreedBg = getFearGreedBg(data.fear_greed.score);

  return (
    <div className="space-y-6">
      {/* Breaking Alert */}
      {data.breaking_alert?.active && (
        <div className="bg-orange-500/10 border-2 border-orange-500/40 rounded-lg p-4 flex items-start gap-3 animate-pulse-slow">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-orange-500 uppercase">Breaking</span>
              <span className="text-xs text-muted-foreground">
                {data.breaking_alert.ageMinutes}m ago
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                data.breaking_alert.type === 'bearish' ? 'bg-loss/20 text-loss' : 'bg-profit/20 text-profit'
              }`}>
                {data.breaking_alert.type}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">{decodeHtmlEntities(data.breaking_alert.headline)}</p>
            {data.breaking_alert.category && (
              <div className="flex gap-1 mt-2">
                <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                  {data.breaking_alert.category}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Trading Bias Card */}
      <div className={`border-2 rounded-lg p-6 ${biasBg}`}>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-lg bg-background/50 ${biasColor}`}>
                {getBiasIcon(data.action.bias)}
              </div>
              <div>
                <h2 className={`text-2xl font-bold ${biasColor}`}>{data.action.bias}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs bg-background/50 px-2 py-0.5 rounded">
                    {data.action.confidence} confidence
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    data.action.urgency === 'high' ? 'bg-loss/20 text-loss' : 'bg-secondary text-muted-foreground'
                  }`}>
                    {data.action.urgency} urgency
                  </span>
                  {data.move_status && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      data.move_status.status === 'EXTENDED' ? 'bg-yellow-500/20 text-yellow-500' : 
                      data.move_status.status === 'FRESH' ? 'bg-profit/20 text-profit' : 'bg-secondary text-muted-foreground'
                    }`}>
                      {data.move_status.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <p className="text-sm text-foreground mb-3">{data.action.reason}</p>
            
            {data.action.move_recommendation && (
              <div className="bg-background/30 rounded-md p-3 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-primary">Trade Recommendation</span>
                </div>
                <p className="text-sm text-muted-foreground">{data.action.move_recommendation}</p>
              </div>
            )}
            
            {data.action.move_context && (
              <p className="text-xs text-muted-foreground">{data.action.move_context}</p>
            )}
          </div>
          
          {/* Move Stats */}
          {data.move_status && (
            <div className="flex flex-row lg:flex-col gap-4 lg:gap-2 lg:min-w-[140px]">
              <div className="text-center bg-background/30 rounded-md p-3">
                <p className="text-2xl font-bold text-foreground">
                  {data.move_status.price_moved_pct.toFixed(2)}%
                </p>
                <p className="text-xs text-muted-foreground">Price Moved</p>
              </div>
              <div className="text-center bg-background/30 rounded-md p-3">
                <p className="text-2xl font-bold text-foreground">
                  {data.move_status.catalyst_age_minutes}m
                </p>
                <p className="text-xs text-muted-foreground">Catalyst Age</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fear & Greed + Components */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Fear & Greed Index</h3>
          </div>
          
          <div className="flex items-center gap-4 mb-6">
            <div className={`text-4xl font-bold ${fearGreedColor}`}>
              {data.fear_greed.score}
            </div>
            <div>
              <p className={`font-semibold ${fearGreedColor}`}>{data.fear_greed.label}</p>
              <div className="w-32 h-2 bg-secondary rounded-full mt-2 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${fearGreedBg}`}
                  style={{ width: `${data.fear_greed.score}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            {Object.entries(data.fear_greed.components).map(([key, value]) => (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground capitalize">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-foreground">{Math.round(value)}</span>
                </div>
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary/60 rounded-full transition-all"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Asset Prices */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Key Prices</h3>
          </div>
          
          <div className="space-y-3">
            {data.key_prices && Object.entries(data.key_prices)
              .filter(([symbol]) => symbol !== 'SOL')
              .map(([symbol, asset]) => (
              <div key={symbol} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  {['BTC', 'ETH', 'HYPE'].includes(symbol) && (
                    <img 
                      src={`https://app.hyperliquid.xyz/coins/${symbol}_spot.svg`}
                      alt={symbol}
                      className="w-6 h-6 rounded-full"
                    />
                  )}
                  <span className="font-semibold text-foreground w-14">{symbol}</span>
                  <span className="text-lg font-medium text-foreground">
                    {formatPrice(asset.price)}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-medium ${asset.change24h >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {formatChange(asset.change24h)}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    prev: {formatPrice(asset.prevDayPx)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {data.summary && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">AI Market Analysis</h3>
            {data.cached_at && (
              <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(data.cached_at).toLocaleTimeString()}
                {data.stale && <span className="text-yellow-500">(stale)</span>}
              </span>
            )}
          </div>
          
          <div className="prose prose-sm prose-invert max-w-none">
            {data.summary.split('\n\n').map((paragraph, idx) => {
              // Check if it starts with **bold** text
              const match = paragraph.match(/^\*\*(.+?)\*\*:?\s*(.*)/s);
              if (match) {
                return (
                  <div key={idx} className="mb-4">
                    <h4 className="text-sm font-semibold text-primary mb-1">{match[1]}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{match[2]}</p>
                  </div>
                );
              }
              return (
                <p key={idx} className="text-sm text-muted-foreground leading-relaxed mb-3">
                  {paragraph}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* Sentiment Categories */}
      {data.sentiment_data && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">News Sentiment Breakdown</h3>
            <span className="text-xs text-muted-foreground ml-auto">
              {data.sentiment_data.postCount} posts analyzed • avg score: {data.sentiment_data.avgScore.toFixed(2)}
            </span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.sentiment_data.topCategories)
              .sort(([,a], [,b]) => b - a)
              .map(([category, count]) => (
                <div key={category} className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-1.5">
                  <span className="text-sm text-foreground capitalize">{category.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Headlines */}
      {data.latest_headlines && data.latest_headlines.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Newspaper className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Latest Headlines</h3>
          </div>
          
          <div className="space-y-3">
            {data.latest_headlines.map((headline, idx) => (
              <a 
                key={idx}
                href={headline.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors group"
              >
                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                  headline.impact === 'bullish' ? 'bg-profit/20 text-profit' :
                  headline.impact === 'bearish' ? 'bg-loss/20 text-loss' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {headline.impact}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2">
                    {decodeHtmlEntities(headline.title)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{headline.source}</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{formatTimeAgo(headline.age_minutes)}</span>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
