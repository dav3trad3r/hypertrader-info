import { useMemo, useState, memo } from 'react';
import { X, ArrowUpRight, ArrowDownRight, ChevronDown } from 'lucide-react';
import { type Fill } from '@/lib/hyperliquid';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface DayTradeBreakdownProps {
  date: string;
  fills: Fill[];
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
const TradeRow = memo(function TradeRow({ fill }: { fill: Fill }) {
  const pnl = parseFloat(fill.closedPnl) || 0;
  const isProfitable = pnl > 0;
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
        -${parseFloat(fill.fee).toFixed(2)}
      </td>
      <td className="py-2 px-4 text-right">
        {pnl !== 0 ? (
          <span className={cn(
            "font-mono text-sm font-semibold",
            isProfitable ? "text-profit" : "text-loss"
          )}>
            {isProfitable ? '+' : ''}{formatCurrency(pnl)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
});

export function DayTradeBreakdown({ date, fills, onClose }: DayTradeBreakdownProps) {
  const [showAll, setShowAll] = useState(false);

  const dayFills = useMemo(() => {
    return fills
      .filter(f => new Date(f.time).toISOString().split('T')[0] === date)
      .sort((a, b) => b.time - a.time);
  }, [fills, date]);

  const displayedFills = useMemo(() => {
    return showAll ? dayFills : dayFills.slice(0, INITIAL_DISPLAY_COUNT);
  }, [dayFills, showAll]);

  const daySummary = useMemo(() => {
    let totalPnl = 0;
    let totalVolume = 0;
    let totalFees = 0;
    let wins = 0;
    let losses = 0;

    dayFills.forEach(fill => {
      const pnl = parseFloat(fill.closedPnl) || 0;
      totalPnl += pnl;
      totalVolume += parseFloat(fill.sz) * parseFloat(fill.px);
      totalFees += parseFloat(fill.fee) || 0;
      if (pnl > 0) wins++;
      else if (pnl < 0) losses++;
    });

    return { totalPnl, totalVolume, totalFees, wins, losses, trades: dayFills.length };
  }, [dayFills]);

  const formattedDate = useMemo(() => new Date(date).toLocaleDateString('en-US', {
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
                <p className="text-xs text-muted-foreground">Day P&L</p>
                <p className={cn(
                  "text-xl font-mono font-bold",
                  daySummary.totalPnl >= 0 ? "text-profit" : "text-loss"
                )}>
                  {daySummary.totalPnl >= 0 ? '+' : ''}{formatCurrency(daySummary.totalPnl)}
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
          <div className="flex gap-6 mt-3 text-sm">
            <div>
              <span className="text-muted-foreground">Volume: </span>
              <span className="font-mono">{formatCurrency(daySummary.totalVolume)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Fees: </span>
              <span className="font-mono text-loss">{formatCurrency(daySummary.totalFees)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Win Rate: </span>
              <span className={cn(
                "font-mono",
                daySummary.wins >= daySummary.losses ? "text-profit" : "text-loss"
              )}>
                {daySummary.trades > 0 ? ((daySummary.wins / daySummary.trades) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
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
                <th className="text-right py-2 px-4 font-medium">P&L</th>
              </tr>
            </thead>
            <tbody>
              {displayedFills.map((fill) => (
                <TradeRow key={fill.tid} fill={fill} />
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
