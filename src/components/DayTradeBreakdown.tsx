import { useMemo, useState, memo } from 'react';
import { X, ArrowUpRight, ArrowDownRight, ChevronDown } from 'lucide-react';
import { type Fill, formatLocalDateKey, parseLocalDateKey, PNL_EPSILON } from '@/lib/hyperliquid';
import { getFillCosts, type CostAttribution, type FillCosts } from '@/lib/pnl';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface DayTradeBreakdownProps {
  date: string;
  fills: Fill[];
  costs?: CostAttribution;
  onClose: () => void;
}

const INITIAL_DISPLAY_COUNT = 50;

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Memoized row component to prevent unnecessary re-renders
const TradeRow = memo(function TradeRow({ fill, fillCosts }: { fill: Fill; fillCosts: FillCosts }) {
  const gross = parseFloat(fill.closedPnl) || 0;
  const pnl = fillCosts.net;
  const isProfitable = pnl > 0;
  const breakdown = `Gross ${formatCurrency(gross)} · Fees ${formatCurrency(-fillCosts.bookedFees)} · Funding ${formatCurrency(fillCosts.bookedFunding)}`;
  const isBuy = fill.side === 'B';
  const coin = fill.coin.startsWith('@') ? fill.coin.slice(1) : fill.coin;

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
      <td className="py-2 px-4 text-xs font-mono text-muted-foreground">
        {formatTime(fill.time)}
      </td>
      <td className="py-2 px-4">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{coin}</span>
          {fill.coin.startsWith('@') && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
              SPOT
            </span>
          )}
        </div>
      </td>
      <td className="py-2 px-4">
        <div className={cn(
          "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded",
          isBuy ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"
        )}>
          {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {fill.dir}
        </div>
      </td>
      <td className="py-2 px-4 text-right font-mono text-sm">
        {parseFloat(fill.sz).toLocaleString()}
      </td>
      <td className="py-2 px-4 text-right font-mono text-sm text-muted-foreground">
        ${parseFloat(fill.px).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
      </td>
      <td className="py-2 px-4 text-right font-mono text-xs text-loss">
        -${fillCosts.fee.toFixed(2)}
      </td>
      <td className="py-2 px-4 text-right">
        {fillCosts.isClose ? (
          <span
            title={breakdown}
            className={cn(
              "font-mono text-sm font-semibold cursor-help",
              isProfitable ? "text-profit" : "text-loss"
            )}
          >
            {isProfitable ? '+' : ''}{formatCurrency(pnl)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" title="Opening trade: its fee is counted when the position closes">—</span>
        )}
      </td>
    </tr>
  );
});

export function DayTradeBreakdown({ date, fills, costs, onClose }: DayTradeBreakdownProps) {
  const [showAll, setShowAll] = useState(false);

  const dayFills = useMemo(() => {
    return fills
      .filter(f => formatLocalDateKey(f.time) === date)
      .sort((a, b) => b.time - a.time);
  }, [fills, date]);

  const displayedFills = useMemo(() => {
    return showAll ? dayFills : dayFills.slice(0, INITIAL_DISPLAY_COUNT);
  }, [dayFills, showAll]);

  const daySummary = useMemo(() => {
    let totalPnl = 0;
    let grossPnl = 0;
    let totalVolume = 0;
    let totalFees = 0;
    let totalFunding = 0;
    let wins = 0;
    let losses = 0;

    dayFills.forEach(fill => {
      const fillCosts = getFillCosts(costs, fill);
      totalPnl += fillCosts.net;
      grossPnl += parseFloat(fill.closedPnl) || 0;
      totalVolume += parseFloat(fill.sz) * parseFloat(fill.px);
      totalFees += fillCosts.bookedFees;
      totalFunding += fillCosts.bookedFunding;
      if (fillCosts.isClose && fillCosts.net >= PNL_EPSILON) wins++;
      else if (fillCosts.isClose && fillCosts.net <= -PNL_EPSILON) losses++;
    });

    return { totalPnl, grossPnl, totalVolume, totalFees, totalFunding, wins, losses, trades: dayFills.length };
  }, [dayFills, costs]);

  const dayPnlColor = daySummary.totalPnl >= PNL_EPSILON
    ? "text-profit"
    : daySummary.totalPnl <= -PNL_EPSILON ? "text-loss" : "text-muted-foreground";

  const formattedDate = useMemo(() => parseLocalDateKey(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }), [date]);

  const hasMore = dayFills.length > INITIAL_DISPLAY_COUNT && !showAll;

  return (
    <div className="animate-slide-down overflow-hidden">
      <div className="mt-4 bg-card border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border bg-secondary/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{formattedDate}</h3>
              <p className="text-sm text-muted-foreground">
                {daySummary.trades} trades • {daySummary.wins} wins • {daySummary.losses} losses
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Day P&L (net)</p>
                <p className={cn(
                  "text-xl font-mono font-bold",
                  dayPnlColor
                )}>
                  {daySummary.totalPnl >= PNL_EPSILON ? '+' : ''}{formatCurrency(Math.abs(daySummary.totalPnl) < PNL_EPSILON ? 0 : daySummary.totalPnl)}
                </p>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
            <div>
              <span className="text-muted-foreground">Volume: </span>
              <span className="font-mono">{formatCurrency(daySummary.totalVolume)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Gross: </span>
              <span className="font-mono">{formatCurrency(daySummary.grossPnl)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Fees: </span>
              <span className="font-mono text-loss">{formatCurrency(-daySummary.totalFees)}</span>
            </div>
            {Math.abs(daySummary.totalFunding) >= PNL_EPSILON && (
              <div>
                <span className="text-muted-foreground">Funding: </span>
                <span className={cn("font-mono", daySummary.totalFunding > 0 ? "text-profit" : "text-loss")}>
                  {formatCurrency(daySummary.totalFunding)}
                </span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Win Rate: </span>
              <span className={cn(
                "font-mono",
                daySummary.wins >= daySummary.losses ? "text-profit" : "text-loss"
              )}>
                {daySummary.wins + daySummary.losses > 0 ? ((daySummary.wins / (daySummary.wins + daySummary.losses)) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            P&L is net: a position's opening fee and the funding paid while it was open count on the day it closes.
          </p>
        </div>

        {/* Trade List */}
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left py-2 px-4 font-medium">Time</th>
                <th className="text-left py-2 px-4 font-medium">Asset</th>
                <th className="text-left py-2 px-4 font-medium">Side</th>
                <th className="text-right py-2 px-4 font-medium">Size</th>
                <th className="text-right py-2 px-4 font-medium">Price</th>
                <th className="text-right py-2 px-4 font-medium">Fee</th>
                <th className="text-right py-2 px-4 font-medium">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {displayedFills.map((fill) => (
                <TradeRow key={fill.tid} fill={fill} fillCosts={getFillCosts(costs, fill)} />
              ))}
            </tbody>
          </table>
          
          {hasMore && (
            <div className="p-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(true)}
                className="w-full text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="w-4 h-4 mr-2" />
                Show {dayFills.length - INITIAL_DISPLAY_COUNT} more trades
              </Button>
            </div>
          )}
        </div>

        {dayFills.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No trades found for this day
          </div>
        )}
      </div>
    </div>
  );
}
