import { useRef, useState, useMemo } from 'react';
import { toPng } from 'html-to-image';
import { Download, Share2, X, Calendar, TrendingUp, TrendingDown, Trophy, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { type TradingSummary, type DailyPnL } from '@/lib/hyperliquid';
import { cn } from '@/lib/utils';

interface SharePnLCardProps {
  summary: TradingSummary;
  dailyPnL: DailyPnL[];
  address: string;
  marketType: 'all' | 'perps' | 'spot';
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function SharePnLCard({ summary, dailyPnL, address, marketType }: SharePnLCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Calculate streak and best day
  const stats = useMemo(() => {
    let currentStreak = 0;
    let maxStreak = 0;
    let bestDay = { date: '', pnl: 0 };
    let worstDay = { date: '', pnl: 0 };

    const sortedDays = [...dailyPnL].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // Calculate current streak
    for (const day of sortedDays) {
      if (day.pnl > 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else if (day.pnl < 0) {
        break;
      }
    }

    // Find best and worst days
    dailyPnL.forEach(day => {
      if (day.pnl > bestDay.pnl) bestDay = { date: day.date, pnl: day.pnl };
      if (day.pnl < worstDay.pnl) worstDay = { date: day.date, pnl: day.pnl };
    });

    return { currentStreak, maxStreak, bestDay, worstDay };
  }, [dailyPnL]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    
    setIsGenerating(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#141a24',
      });
      
      const link = document.createElement('a');
      link.download = `hyperliquid-pnl-${formatAddress(address)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to generate image:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current) return;
    
    setIsGenerating(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#141a24',
      });
      
      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], 'hyperliquid-pnl.png', { type: 'image/png' });
      
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Hyperliquid PnL',
          text: `Check out my trading performance on Hyperliquid! ${summary.totalPnl >= 0 ? '📈' : '📉'}`,
        });
      } else {
        // Fallback to download
        handleDownload();
      }
    } catch (error) {
      console.error('Failed to share:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const isProfitable = summary.totalPnl >= 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="w-4 h-4" />
          Share PnL
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-transparent border-0">
        <div className="p-4 bg-card rounded-lg border border-border">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center justify-between">
              <span>Share Your Performance</span>
            </DialogTitle>
          </DialogHeader>

          {/* The shareable card */}
          <div
            ref={cardRef}
            className="p-6 rounded-xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #141a24 0%, #1a2332 50%, #0f1419 100%)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Hyperliquid</div>
                  <div className="text-xs text-muted-foreground font-mono">{formatAddress(address)}</div>
                </div>
              </div>
              <div className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary font-medium">
                {marketType === 'all' ? 'All Markets' : marketType === 'perps' ? 'Perps' : 'Spot'}
              </div>
            </div>

            {/* Main PnL */}
            <div className="text-center mb-6">
              <div className="text-xs text-muted-foreground mb-1">Total P&L</div>
              <div className={cn(
                "text-4xl font-bold font-mono",
                isProfitable ? "text-profit" : "text-loss"
              )}>
                {isProfitable ? '+' : ''}{formatCurrency(summary.totalPnl)}
              </div>
              <div className="flex items-center justify-center gap-1 mt-2">
                {isProfitable ? (
                  <TrendingUp className="w-4 h-4 text-profit" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-loss" />
                )}
                <span className={cn(
                  "text-sm font-medium",
                  isProfitable ? "text-profit" : "text-loss"
                )}>
                  {summary.winRate.toFixed(1)}% Win Rate
                </span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 rounded-lg bg-secondary/50">
                <div className="text-xs text-muted-foreground mb-1">Total Trades</div>
                <div className="text-lg font-mono font-semibold text-foreground">
                  {summary.totalTrades.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50">
                <div className="text-xs text-muted-foreground mb-1">Volume</div>
                <div className="text-lg font-mono font-semibold text-foreground">
                  {formatCurrency(summary.totalVolume)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Trophy className="w-3 h-3" /> Best Day
                </div>
                <div className="text-lg font-mono font-semibold text-profit">
                  +{formatCurrency(stats.bestDay.pnl)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Target className="w-3 h-3" /> Win Streak
                </div>
                <div className="text-lg font-mono font-semibold text-foreground">
                  {stats.currentStreak} days
                </div>
              </div>
            </div>

            {/* Mini calendar heat map - last 14 days */}
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Last 14 Days
              </div>
              <div className="flex gap-1">
                {[...dailyPnL]
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .slice(-14)
                  .map((day, i) => (
                    <div
                      key={day.date}
                      className={cn(
                        "flex-1 h-6 rounded-sm",
                        day.pnl > 0 ? "bg-profit/60" : day.pnl < 0 ? "bg-loss/60" : "bg-secondary"
                      )}
                      title={`${day.date}: ${formatCurrency(day.pnl)}`}
                    />
                  ))}
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                <span>14 days ago</span>
                <span>Today</span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <div className="text-[10px] text-muted-foreground">
                Generated on {new Date().toLocaleDateString()}
              </div>
              <div className="text-xs font-medium text-primary">
                hyperliquid.xyz
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            <Button
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex-1 gap-2"
            >
              <Download className="w-4 h-4" />
              {isGenerating ? 'Generating...' : 'Download'}
            </Button>
            <Button
              onClick={handleShare}
              disabled={isGenerating}
              variant="outline"
              className="flex-1 gap-2"
            >
              <Share2 className="w-4 h-4" />
              Share
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
