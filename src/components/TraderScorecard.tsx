import { useEffect, useMemo, useState } from 'react';
import { Gauge, Info } from 'lucide-react';
import { fetchOpenExposure, type MarketType, type OpenExposure, type TradingSummary } from '@/lib/hyperliquid';
import { computeEquityStats, MIN_SHARPE_DAYS, type EquityPoint, type TradeStats } from '@/lib/pnl';
import { cn, formatCurrency } from '@/lib/utils';

interface TraderScorecardProps {
  tradeStats: TradeStats;
  summary: TradingSummary;
  equity: EquityPoint[];
  address: string;
  marketType: MarketType;
}

type Tone = 'good' | 'bad' | 'neutral';

interface Rating {
  label: string;
  tone: Tone;
}

const EXPOSURE_REFRESH_MS = 60000;
const EARLY_READ_TRADES = 20;

function rateProfitFactor(value: number | null, wins: number): Rating | null {
  if (value === null) return wins > 0 ? { label: 'No losses yet', tone: 'good' } : null;
  if (value < 1) return { label: 'Losing', tone: 'bad' };
  if (value < 1.5) return { label: 'Marginal', tone: 'neutral' };
  if (value < 2) return { label: 'Good', tone: 'good' };
  return { label: 'Strong', tone: 'good' };
}

function rateSharpe(value: number): Rating {
  if (value < 0) return { label: 'Losing', tone: 'bad' };
  if (value < 1) return { label: 'Weak', tone: 'neutral' };
  if (value < 2) return { label: 'Good', tone: 'good' };
  return { label: 'Strong', tone: 'good' };
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

const signed = (value: number) => `${value >= 0.005 ? '+' : ''}${formatCurrency(value)}`;

const toneText: Record<Tone, string> = {
  good: 'text-profit',
  bad: 'text-loss',
  neutral: 'text-foreground',
};

const toneBadge: Record<Tone, string> = {
  good: 'bg-profit/10 text-profit',
  bad: 'bg-loss/10 text-loss',
  neutral: 'bg-secondary text-muted-foreground',
};

function Tile({ label, value, tone = 'neutral', rating, sub, help }: {
  label: string;
  value: string;
  tone?: Tone;
  rating?: Rating | null;
  sub?: string;
  help: string;
}) {
  return (
    <div className="bg-secondary/30 border border-border rounded-lg p-3" title={help}>
      <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">
        {label}
        <Info className="w-3 h-3 opacity-60" />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-1">
        <span className={cn('text-base sm:text-lg font-mono font-bold', toneText[tone])}>{value}</span>
        {rating && (
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', toneBadge[rating.tone])}>
            {rating.label}
          </span>
        )}
      </div>
      {sub && <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export function TraderScorecard({ tradeStats, summary, equity, address, marketType }: TraderScorecardProps) {
  const [exposure, setExposure] = useState<OpenExposure | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = () => fetchOpenExposure(address).then(result => {
      if (!cancelled && result) setExposure(result);
    });
    load();
    const interval = setInterval(load, EXPOSURE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address]);

  const equityStats = useMemo(() => computeEquityStats(equity), [equity]);

  const t = tradeStats;
  const hasTrades = t.wins + t.losses > 0;
  const costs = summary.totalFees - summary.totalFunding;
  const accountValue = summary.accountValue ?? null;
  const notional = exposure ? exposure.long + exposure.short : null;
  const marketLabel = marketType === 'all' ? 'All markets' : marketType === 'perps' ? 'Perps' : 'Spot';

  return (
    <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            Trader Scorecard
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            A trade is a position from open to flat, so an exit split over several fills counts once.
            {hasTrades && t.trades < EARLY_READ_TRADES && ` Based on ${t.trades} closed trades, so still an early read.`}
          </p>
        </div>
      </div>

      {/* Closed trades: follow the market filter */}
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Closed trades</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{marketLabel}</span>
      </div>
      {hasTrades ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile
            label="Profit factor"
            value={t.profitFactor === null ? '∞' : t.profitFactor.toFixed(2)}
            tone={t.profitFactor === null || t.profitFactor >= 1 ? 'good' : 'bad'}
            rating={rateProfitFactor(t.profitFactor, t.wins)}
            sub={`Won ${formatCurrency(t.grossWins)} · lost ${formatCurrency(t.grossLosses)}`}
            help="Total won on winning trades divided by total lost on losing ones, after fees and funding. Above 1 makes money; 1.5+ is good, 2+ strong."
          />
          <Tile
            label="Win rate"
            value={`${t.winRate.toFixed(0)}%`}
            tone={t.breakEvenWinRate === null || t.winRate >= t.breakEvenWinRate ? 'good' : 'bad'}
            rating={t.breakEvenWinRate === null ? null : t.winRate >= t.breakEvenWinRate
              ? { label: 'Above break-even', tone: 'good' }
              : { label: 'Below break-even', tone: 'bad' }}
            sub={t.breakEvenWinRate === null
              ? `${t.wins} wins · ${t.losses} losses`
              : `Break-even at your win/loss size: ${t.breakEvenWinRate.toFixed(0)}%`}
            help="Share of closed trades that made money. On its own it misleads: what matters is whether it beats the break-even rate implied by how big your wins are compared to your losses."
          />
          <Tile
            label="Avg win / loss"
            value={`${formatCurrency(t.avgWin)} / ${formatCurrency(t.avgLoss)}`}
            tone={t.payoffRatio === null || t.payoffRatio >= 1 ? 'good' : 'bad'}
            sub={t.payoffRatio === null ? 'Needs both a win and a loss' : `Wins are ${t.payoffRatio.toFixed(1)}× your losses`}
            help="Average net result of a winning trade compared with a losing one. Above 1× means winners are bigger than losers."
          />
          <Tile
            label="Expectancy"
            value={signed(t.expectancy)}
            tone={t.expectancy >= 0 ? 'good' : 'bad'}
            sub={`per trade · ${t.trades} trades`}
            help="What a trade made on average, after fees and funding. Positive means the way you trade has made money so far."
          />
          <Tile
            label="Time in trade"
            value={`${formatDuration(t.avgHoldWinMs)} / ${formatDuration(t.avgHoldLossMs)}`}
            sub="winners / losers"
            help="Average time from opening a position to closing it. Holding losers much longer than winners is a common way to give back gains."
          />
          <Tile
            label="Fees + funding"
            value={summary.grossPnl > 0 ? `${((costs / summary.grossPnl) * 100).toFixed(0)}%` : formatCurrency(costs)}
            tone={costs > 0 ? 'bad' : 'good'}
            sub={`${summary.grossPnl > 0 ? 'of gross profit · ' : ''}fees ${formatCurrency(summary.totalFees)} · funding ${formatCurrency(summary.totalFunding)}`}
            help="Trading fees plus net funding paid, including on positions that are still open, compared with gross realized profit."
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No closed trades yet for this market.</p>
      )}

      {/* Whole account: Hyperliquid's own mark-to-market history, can't be split by market */}
      <div className="flex items-center gap-2 mt-5 mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Whole account</h3>
        <span className="text-[10px] text-muted-foreground">mark-to-market, includes open positions</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Mark-to-market PnL"
          value={equityStats ? signed(equityStats.pnl) : '—'}
          tone={!equityStats || equityStats.pnl >= 0 ? 'good' : 'bad'}
          sub={equityStats ? `over ${Math.round(equityStats.spanDays)} days · realized ${signed(summary.totalPnl)}` : 'No account history'}
          help="PnL with open positions valued at today's prices, from Hyperliquid's account history (deposits and withdrawals excluded). A big gap below realized PnL means losses are sitting in open positions."
        />
        <Tile
          label="Max drawdown"
          value={equityStats ? formatCurrency(-equityStats.maxDrawdown) : '—'}
          tone={equityStats && equityStats.maxDrawdown > 0 ? 'bad' : 'neutral'}
          sub={equityStats?.maxDrawdownPct != null ? `${equityStats.maxDrawdownPct.toFixed(1)}% of the account at its peak` : undefined}
          help="Largest fall from a high point in cumulative PnL before a new high, open positions included."
        />
        <Tile
          label="Sharpe / Sortino"
          value={equityStats?.sharpe != null ? `${equityStats.sharpe.toFixed(2)} / ${equityStats.sortino?.toFixed(2) ?? '—'}` : 'Too early'}
          tone={equityStats?.sharpe != null ? (equityStats.sharpe >= 1 ? 'good' : equityStats.sharpe < 0 ? 'bad' : 'neutral') : 'neutral'}
          rating={equityStats?.sharpe != null ? rateSharpe(equityStats.sharpe) : null}
          sub={equityStats?.sharpe != null
            ? 'annualised, from account returns'
            : `${Math.floor(equityStats?.spanDays ?? 0)} of ${MIN_SHARPE_DAYS} days of history`}
          help={`Return per unit of volatility (Sortino counts only downside moves), annualised. Below ${MIN_SHARPE_DAYS} days of history it is mostly noise, so it is held back. Above 1 is good, 2+ strong.`}
        />
        <Tile
          label="Exposure"
          value={notional !== null && accountValue ? `${(notional / accountValue).toFixed(1)}×` : '—'}
          sub={exposure ? `${formatCurrency(exposure.long)} long · ${formatCurrency(exposure.short)} short` : 'Loading positions'}
          help="Open perp positions on every market (notional value) as a multiple of account value. 4× means a 10% move against you costs about 40% of the account."
        />
      </div>
    </div>
  );
}
