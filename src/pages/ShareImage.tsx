import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchTradingData, filterFillsByMarket, processDailyPnL, calculateSummary, type MarketType, type DailyPnL, type TradingSummary } from '@/lib/hyperliquid';
import { cn, formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, Trophy, Target, Calendar } from 'lucide-react';
import { useMemo } from 'react';

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface ShareCardProps {
  summary: TradingSummary;
  dailyPnL: DailyPnL[];
  address: string;
  marketType: MarketType;
}

function ShareCard({ summary, dailyPnL, address, marketType }: ShareCardProps) {
  const stats = useMemo(() => {
    let currentStreak = 0;
    let maxStreak = 0;
    let bestDay = { date: '', pnl: 0 };
    let worstDay = { date: '', pnl: 0 };

    const sortedDays = [...dailyPnL].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    for (const day of sortedDays) {
      if (day.pnl > 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else if (day.pnl < 0) {
        break;
      }
    }

    dailyPnL.forEach(day => {
      if (day.pnl > bestDay.pnl) bestDay = { date: day.date, pnl: day.pnl };
      if (day.pnl < worstDay.pnl) worstDay = { date: day.date, pnl: day.pnl };
    });

    return { currentStreak, maxStreak, bestDay, worstDay };
  }, [dailyPnL]);

  const isProfitable = summary.totalPnl >= 0;

  return (
    <div
      className="w-[1200px] h-[630px] p-12 overflow-hidden flex flex-col"
      style={{
        background: 'linear-gradient(135deg, #141a24 0%, #1a2332 50%, #0f1419 100%)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
            <TrendingUp className="w-7 h-7 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-foreground">Hyperliquid</div>
            <div className="text-lg text-muted-foreground font-mono">{formatAddress(address)}</div>
          </div>
        </div>
        <div className="text-lg px-4 py-2 rounded-full bg-primary/20 text-primary font-medium">
          {marketType === 'all' ? 'All Markets' : marketType === 'perps' ? 'Perps' : 'Spot'}
        </div>
      </div>

      {/* Main PnL */}
      <div className="text-center mb-8 flex-shrink-0">
        <div className="text-lg text-muted-foreground mb-2">Total P&L</div>
        <div className={cn(
          "text-7xl font-bold font-mono",
          isProfitable ? "text-profit" : "text-loss"
        )}>
          {isProfitable ? '+' : ''}{formatCurrency(summary.totalPnl)}
        </div>
        <div className="flex items-center justify-center gap-2 mt-4">
          {isProfitable ? (
            <TrendingUp className="w-6 h-6 text-profit" />
          ) : (
            <TrendingDown className="w-6 h-6 text-loss" />
          )}
          <span className={cn(
            "text-xl font-medium",
            isProfitable ? "text-profit" : "text-loss"
          )}>
            {summary.winRate.toFixed(1)}% Win Rate
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="p-5 rounded-xl bg-secondary/50">
          <div className="text-sm text-muted-foreground mb-2">Total Trades</div>
          <div className="text-2xl font-mono font-semibold text-foreground">
            {summary.totalTrades.toLocaleString()}
          </div>
        </div>
        <div className="p-5 rounded-xl bg-secondary/50">
          <div className="text-sm text-muted-foreground mb-2">Volume</div>
          <div className="text-2xl font-mono font-semibold text-foreground">
            {formatCurrency(summary.totalVolume)}
          </div>
        </div>
        <div className="p-5 rounded-xl bg-secondary/50">
          <div className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
            <Trophy className="w-4 h-4" /> Best Day
          </div>
          <div className="text-2xl font-mono font-semibold text-profit">
            +{formatCurrency(stats.bestDay.pnl)}
          </div>
        </div>
        <div className="p-5 rounded-xl bg-secondary/50">
          <div className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
            <Target className="w-4 h-4" /> Win Streak
          </div>
          <div className="text-2xl font-mono font-semibold text-foreground">
            {stats.currentStreak} days
          </div>
        </div>
      </div>

      {/* Mini calendar heat map - last 14 days */}
      <div className="flex-1 flex flex-col justify-end">
        <div className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Last 14 Days
        </div>
        <div className="flex gap-2">
          {[...dailyPnL]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-14)
            .map((day) => (
              <div
                key={day.date}
                className={cn(
                  "flex-1 h-10 rounded-md",
                  day.pnl > 0 ? "bg-profit/60" : day.pnl < 0 ? "bg-loss/60" : "bg-secondary"
                )}
              />
            ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>14 days ago</span>
          <span>Today</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/50">
        <div className="text-sm text-muted-foreground">
          Generated on {new Date().toLocaleDateString()}
        </div>
        <div className="text-lg font-medium text-primary">
          hyperliquid.xyz
        </div>
      </div>
    </div>
  );
}

export default function ShareImage() {
  const { address } = useParams<{ address: string }>();
  const [searchParams] = useSearchParams();
  const marketType = (searchParams.get('market') as MarketType) || 'all';

  const { data, isLoading, error } = useQuery({
    queryKey: ['trading-data', address],
    queryFn: () => fetchTradingData(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#141a24] flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#141a24] flex items-center justify-center">
        <div className="text-red-500 text-xl">Error loading data</div>
      </div>
    );
  }

  // Filter data by market type
  const filteredFills = filterFillsByMarket(data.fills, marketType);
  const filteredDailyPnL = processDailyPnL(filteredFills);
  const filteredSummary = calculateSummary(filteredFills, filteredDailyPnL);

  return (
    <div className="min-h-screen bg-[#141a24] flex items-center justify-center p-4">
      <ShareCard
        summary={filteredSummary}
        dailyPnL={filteredDailyPnL}
        address={address!}
        marketType={marketType}
      />
    </div>
  );
}
