import { ExternalLink } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { PAPERTRADE_EXCHANGE, type PapertradeAccountSummary } from '@/lib/papertrade';
import papertradeMark from '@/assets/papertrade.svg';

// The Papertrade view of Live Positions. Papertrade only streams an account's
// open positions over its own websocket, so this shows the account figures its
// leaderboard publishes: balance, what is open and its mark-to-market, and the
// all-time result.

interface PapertradeAccountProps {
  account: PapertradeAccountSummary | null;
  closedTrades: number;
  isLive: boolean;
}

function tone(v: number): string {
  if (Math.abs(v) < 0.005) return 'text-muted-foreground';
  return v > 0 ? 'text-profit' : 'text-loss';
}

function Tile({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-base font-semibold font-mono', valueClass ?? 'text-foreground')}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function PapertradeAccount({ account, closedTrades, isLive }: PapertradeAccountProps) {
  const a = account;
  const hasOpen = !!a && a.openNotional > 0;
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <img src={papertradeMark} alt="Papertrade" width={28} height={28} className="w-7 h-7 rounded-md" />
          <h3 className="font-semibold text-foreground">Papertrade Account</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">HyperEVM</span>
          <a
            href={PAPERTRADE_EXCHANGE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            exchange.papertrade.xyz
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', isLive ? 'bg-profit animate-pulse' : 'bg-muted')} />
          <span className="text-xs text-muted-foreground">{isLive ? 'Live' : 'Stale'}</span>
        </div>
      </div>

      {a ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Balance" value={formatCurrency(a.balance)} sub={a.queued > 0 ? `${formatCurrency(a.queued)} queued for payout` : 'USDC margin account'} />
          <Tile
            label="Open Notional"
            value={hasOpen ? formatCurrency(a.openNotional) : '—'}
            sub={hasOpen ? `unrealized ${formatCurrency(a.unrealizedPnl, true, true)}` : 'no open positions'}
            valueClass={hasOpen ? undefined : 'text-muted-foreground'}
          />
          <Tile
            label="Realized PnL"
            value={formatCurrency(a.realizedPnl, true, true)}
            sub={`${closedTrades.toLocaleString()} closed position${closedTrades === 1 ? '' : 's'} · all time`}
            valueClass={tone(a.realizedPnl)}
          />
          <Tile label="Volume" value={formatCurrency(a.totalVolume)} sub={a.rank ? `leaderboard #${a.rank}` : 'all time'} />
          <Tile
            label="PAPER"
            value={a.paper.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            sub="LP fee-claim token, minted from losses"
          />
          {a.stakingRewards > 0 && <Tile label="Staking Rewards" value={formatCurrency(a.stakingRewards)} sub="USDC earned" />}
          {hasOpen && (
            <Tile
              label="Unrealized"
              value={formatCurrency(a.unrealizedPnl, true, true)}
              sub="marked to Hyperliquid mid"
              valueClass={tone(a.unrealizedPnl)}
            />
          )}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">No Papertrade account figures yet.</p>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground px-1">
        Synthetic positions settled against Papertrade's LP on HyperEVM, priced off Hyperliquid's mid. Open positions are
        only streamed inside Papertrade's app; closed ones feed the calendar and scorecard above.
      </p>
    </div>
  );
}
