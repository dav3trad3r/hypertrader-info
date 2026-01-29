import { TrendingUp, TrendingDown, Activity, DollarSign, Target, BarChart3, Calendar, Percent } from 'lucide-react';
import { type TradingSummary } from '@/lib/hyperliquid';
import { cn } from '@/lib/utils';

interface SummaryStatsProps {
  summary: TradingSummary;
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function formatVolume(value: number): string {
  if (value >= 1000000000) {
    return `$${(value / 1000000000).toFixed(2)}B`;
  }
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
}

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

function StatCard({ label, value, subValue, icon, trend, className }: StatCardProps) {
  return (
    <div className={cn(
      "bg-card border border-border rounded-lg p-4 transition-all duration-200 hover:border-primary/50",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={cn(
            "text-xl font-mono font-bold mt-1",
            trend === 'up' && "text-profit",
            trend === 'down' && "text-loss",
            !trend && "text-foreground"
          )}>
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-muted-foreground mt-0.5">{subValue}</p>
          )}
        </div>
        <div className={cn(
          "p-2 rounded-md",
          trend === 'up' && "bg-profit/10 text-profit",
          trend === 'down' && "bg-loss/10 text-loss",
          !trend && "bg-secondary text-muted-foreground"
        )}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export function SummaryStats({ summary }: SummaryStatsProps) {
  const isProfitable = summary.totalPnl >= 0;
  
  return (
    <div className="space-y-4">
      {/* Main PnL Card */}
      <div className={cn(
        "bg-card border-2 rounded-xl p-6 transition-all duration-300",
        isProfitable ? "border-profit/50 glow-profit" : "border-loss/50 glow-loss"
      )}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total P&L</p>
            <p className={cn(
              "text-4xl font-mono font-bold",
              isProfitable ? "text-profit" : "text-loss"
            )}>
              {isProfitable ? '+' : ''}{formatCurrency(summary.totalPnl)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {summary.totalTrades.toLocaleString()} total trades
            </p>
          </div>
          <div className={cn(
            "p-4 rounded-full",
            isProfitable ? "bg-profit/10" : "bg-loss/10"
          )}>
            {isProfitable ? (
              <TrendingUp className="w-8 h-8 text-profit" />
            ) : (
              <TrendingDown className="w-8 h-8 text-loss" />
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Win Rate"
          value={`${summary.winRate.toFixed(1)}%`}
          subValue={`${summary.profitableDays} winning days`}
          icon={<Target className="w-4 h-4" />}
          trend={summary.winRate >= 50 ? 'up' : 'down'}
        />
        
        <StatCard
          label="Avg Daily P&L"
          value={formatCurrency(summary.avgDailyPnl)}
          icon={<Calendar className="w-4 h-4" />}
          trend={summary.avgDailyPnl >= 0 ? 'up' : 'down'}
        />
        
        <StatCard
          label="Total Volume"
          value={formatVolume(summary.totalVolume)}
          icon={<BarChart3 className="w-4 h-4" />}
        />
        
        <StatCard
          label="Total Fees"
          value={formatCurrency(summary.totalFees)}
          icon={<DollarSign className="w-4 h-4" />}
          trend="down"
        />
        
        <StatCard
          label="Largest Win"
          value={formatCurrency(summary.largestWin)}
          icon={<TrendingUp className="w-4 h-4" />}
          trend="up"
        />
        
        <StatCard
          label="Largest Loss"
          value={formatCurrency(summary.largestLoss)}
          icon={<TrendingDown className="w-4 h-4" />}
          trend="down"
        />
      </div>

      {/* Best/Worst Day */}
      <div className="grid grid-cols-2 gap-3">
        {summary.bestDay && (
          <div className="bg-profit/5 border border-profit/20 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Best Day</p>
            <p className="text-lg font-mono font-bold text-profit">
              +{formatCurrency(summary.bestDay.pnl)}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(summary.bestDay.date).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>
        )}
        
        {summary.worstDay && summary.worstDay.pnl < 0 && (
          <div className="bg-loss/5 border border-loss/20 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Worst Day</p>
            <p className="text-lg font-mono font-bold text-loss">
              {formatCurrency(summary.worstDay.pnl)}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(summary.worstDay.date).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>
        )}
      </div>

      {/* Day Distribution */}
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-xs text-muted-foreground mb-3">Day Distribution</p>
        <div className="flex gap-2 h-4">
          <div 
            className="bg-profit rounded-l-full transition-all duration-500"
            style={{ 
              width: `${(summary.profitableDays / (summary.profitableDays + summary.losingDays)) * 100}%`,
              minWidth: summary.profitableDays > 0 ? '20px' : '0'
            }}
          />
          <div 
            className="bg-loss rounded-r-full transition-all duration-500"
            style={{ 
              width: `${(summary.losingDays / (summary.profitableDays + summary.losingDays)) * 100}%`,
              minWidth: summary.losingDays > 0 ? '20px' : '0'
            }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-profit">{summary.profitableDays} profitable</span>
          <span className="text-loss">{summary.losingDays} losing</span>
        </div>
      </div>
    </div>
  );
}
