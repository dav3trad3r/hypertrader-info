import { Layers, ExternalLink, Lock } from 'lucide-react';
import { cn, formatCurrency, formatSize } from '@/lib/utils';
import {
  BSKTS_SITE,
  basketUrl,
  describeBsktsOrder,
  hasBsktsActivity,
  summarizeBskts,
  type BsktsAccount,
  type BsktsPosition,
} from '@/lib/bskts';

interface BsktsPositionsProps {
  /** From useBsktsAccount; null while loading or when the address has nothing on bskts. */
  account: BsktsAccount | null;
  isLive: boolean;
}

function pnlClass(value: number): string {
  if (Math.abs(value) < 0.005) return 'text-muted-foreground';
  return value > 0 ? 'text-profit' : 'text-loss';
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-base font-semibold font-mono', tone ?? 'text-foreground')}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function HoldingRow({ position }: { position: BsktsPosition }) {
  const roi = position.costBasis > 0 ? position.unrealizedPnl / position.costBasis : null;
  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] items-center gap-x-3 gap-y-1 px-3 py-2 rounded-lg bg-secondary/40 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <a
          href={basketUrl(position.ticker)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-foreground hover:text-primary transition-colors truncate"
        >
          {position.ticker}
        </a>
        {position.escrowedShares > 0 && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary"
            title={`${formatSize(position.escrowedShares)} shares escrowed in a resting order`}
          >
            <Lock className="w-2.5 h-2.5" />
            escrow
          </span>
        )}
      </div>
      <div className="font-mono text-right sm:text-left">
        <span className="text-foreground">{formatSize(position.shares)}</span>
        <span className="text-muted-foreground text-xs"> sh</span>
      </div>
      <div className="hidden sm:block font-mono text-muted-foreground">${position.nav.toFixed(2)}</div>
      <div className="hidden sm:block font-mono text-muted-foreground">
        {position.avgEntry != null ? `$${position.avgEntry.toFixed(2)}` : '—'}
      </div>
      <div className="hidden sm:block font-mono text-foreground">{formatCurrency(position.value)}</div>
      <div className={cn('col-span-2 sm:col-span-1 font-mono text-right sm:text-left', pnlClass(position.unrealizedPnl))}>
        {formatCurrency(position.unrealizedPnl, true, true)}
        {roi != null && (
          <span className="text-xs opacity-80"> ({roi >= 0 ? '+' : ''}{(roi * 100).toFixed(2)}%)</span>
        )}
      </div>
    </div>
  );
}

export function BsktsPositions({ account, isLive }: BsktsPositionsProps) {
  // Hyperliquid-only addresses never see this card.
  if (!account || !hasBsktsActivity(account)) return null;

  const positions = account.positions;
  const open = positions.filter(p => p.shares > 0);
  const closed = positions.filter(p => p.shares <= 0 && p.realizedPnl !== 0);
  const summary = summarizeBskts(positions);
  const usdg = account.wallet?.usdg ?? 0;
  const orders = account.orders;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">bskts Baskets</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
            Robinhood Chain
          </span>
          <a
            href={BSKTS_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            bskts.xyz
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', isLive ? 'bg-profit animate-pulse' : 'bg-muted')} />
          <span className="text-xs text-muted-foreground">{isLive ? 'Live' : 'Stale'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Tile label="Basket Value" value={formatCurrency(summary.value)} sub={`${open.length} basket${open.length === 1 ? '' : 's'}`} />
        <Tile
          label="Unrealized PnL"
          value={formatCurrency(summary.unrealizedPnl, true, true)}
          sub={summary.returnPct != null ? `${summary.returnPct >= 0 ? '+' : ''}${(summary.returnPct * 100).toFixed(2)}% on cost` : undefined}
          tone={pnlClass(summary.unrealizedPnl)}
        />
        <Tile label="Realized PnL" value={formatCurrency(summary.realizedPnl, true, true)} tone={pnlClass(summary.realizedPnl)} />
        <Tile label="USDG Cash" value={formatCurrency(usdg)} sub="on Robinhood Chain" />
      </div>

      {open.length > 0 && (
        <div className="space-y-1.5">
          <div className="hidden sm:grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] gap-x-3 px-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Basket</span>
            <span>Shares</span>
            <span>NAV</span>
            <span>Avg Entry</span>
            <span>Value</span>
            <span>Unrealized</span>
          </div>
          {open.map(p => (
            <HoldingRow key={p.ticker} position={p} />
          ))}
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 px-3">
            Open Orders ({orders.length})
          </p>
          <div className="space-y-1.5">
            {orders.map(o => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-secondary/40 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-foreground">{o.ticker ?? '—'}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary uppercase">
                    {o.kind.replace(/_/g, ' ')}
                  </span>
                  <span className="text-muted-foreground truncate">{describeBsktsOrder(o)}</span>
                </div>
                {o.shares > 0 && (
                  <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatSize(o.shares)} sh
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {closed.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 px-3">Closed Baskets</p>
          <div className="flex flex-wrap gap-2 px-3">
            {closed.map(p => (
              <span key={p.ticker} className="text-xs font-mono px-2 py-1 rounded bg-secondary/40">
                <span className="text-foreground">{p.ticker}</span>{' '}
                <span className={pnlClass(p.realizedPnl)}>{formatCurrency(p.realizedPnl, true, true)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground px-3">
        Positions and PnL from the bskts API. Not included in the Hyperliquid calendar or scorecard above.
      </p>
    </div>
  );
}
