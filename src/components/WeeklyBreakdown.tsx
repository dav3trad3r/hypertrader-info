import { useMemo } from 'react';
import { type WeeklyPnL } from '@/lib/hyperliquid';
import { cn } from '@/lib/utils';

interface WeeklyBreakdownProps {
  weeklyPnL: WeeklyPnL[];
  limit?: number;
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000000) {
    return `$${(value / 1000000000).toFixed(2)}B`;
  }
  if (absValue >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
}

export function WeeklyBreakdown({ weeklyPnL, limit = 8 }: WeeklyBreakdownProps) {
  const displayedWeeks = useMemo(() => {
    return weeklyPnL.slice(0, limit);
  }, [weeklyPnL, limit]);

  const maxAbsPnl = useMemo(() => {
    return Math.max(...displayedWeeks.map(w => Math.abs(w.pnl)), 1);
  }, [displayedWeeks]);

  if (displayedWeeks.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Weekly Breakdown</h3>
        <p className="text-sm text-muted-foreground text-center py-8">No weekly data available</p>
      </div>
    );
  }

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">Weekly P&L</h3>
        <span className="text-xs text-muted-foreground">{weeklyPnL.length} weeks</span>
      </div>

      <div className="space-y-2">
        {displayedWeeks.map((week) => {
          const isProfitable = week.pnl > 0;
          const barWidth = (Math.abs(week.pnl) / maxAbsPnl) * 100;
          
          return (
            <div key={week.weekStart} className="group">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">
                  {formatDateRange(week.weekStart, week.weekEnd)}
                </span>
                <span className={cn(
                  "font-mono font-semibold",
                  isProfitable ? "text-profit" : week.pnl < 0 ? "text-loss" : "text-muted-foreground"
                )}>
                  {isProfitable ? '+' : ''}{formatCurrency(week.pnl)}
                </span>
              </div>
              
              <div className="relative h-6 bg-secondary rounded overflow-hidden">
                <div 
                  className={cn(
                    "absolute h-full rounded transition-all duration-300",
                    isProfitable ? "bg-profit/80" : "bg-loss/80"
                  )}
                  style={{ width: `${Math.max(barWidth, 2)}%` }}
                />
                <div className="absolute inset-0 flex items-center px-2 text-xs">
                  <span className="text-foreground/80 font-mono">
                    {week.trades} trades
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
