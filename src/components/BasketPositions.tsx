import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import bsktsMark from '@/assets/bskts.svg';
import { cn, formatCurrency, formatSize } from '@/lib/utils';
import {
  BSKTS_SITE,
  basketSymbols,
  coinSymbol,
  isBasketOpen,
  valueBasket,
  type BasketPosition,
} from '@/lib/bskts';
import { BasketLogo } from '@/components/BasketLogo';
import { CoinIcon } from '@/components/CoinIcon';

// The bskts view of Live Positions: one row per basket, the way bskts.xyz's own
// Positions table reads, rebuilt from this account's cloid-tagged fills.

interface BasketPositionsProps {
  positions: BasketPosition[];
  marks: Map<string, number>;
  isLive: boolean;
}

function tone(v: number): string {
  if (Math.abs(v) < 0.005) return 'text-muted-foreground';
  return v > 0 ? 'text-profit' : 'text-loss';
}

function signed(v: number): string {
  return formatCurrency(v, true, true);
}

function pct(v: number, base: number): string | null {
  if (!(base > 0)) return null;
  const p = (v / base) * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
}

function ago(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const GRID = 'grid-cols-[minmax(150px,1.6fr)_repeat(5,minmax(0,1fr))]';

function BasketRow({ pos, marks, expanded, onToggle }: {
  pos: BasketPosition;
  marks: Map<string, number>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const v = valueBasket(pos, marks);
  const legs = Object.values(pos.legs).filter(l => l.size !== 0);
  const netRealized = pos.realizedUsd - pos.feesUsd;
  return (
    <div className="rounded-lg bg-secondary/40">
      <button
        type="button"
        onClick={onToggle}
        className={cn('w-full grid items-center gap-x-3 px-3 py-2.5 text-sm text-left', GRID)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          <BasketLogo symbols={basketSymbols(pos)} size={26} reserve />
          <div className="min-w-0">
            <div className="font-semibold text-foreground truncate">{pos.ticker}</div>
            <div className="text-[11px] text-muted-foreground">
              {legs.length} leg{legs.length === 1 ? '' : 's'}
              {pos.openedAt > 0 && <> · open {ago(pos.openedAt)}</>}
            </div>
          </div>
        </div>
        <div className="font-mono text-foreground">
          {formatCurrency(v.valueUsd)}
          {v.partial && <span className="text-muted-foreground" title="A leg has no live mark yet">*</span>}
        </div>
        <div className="font-mono text-muted-foreground">{formatCurrency(v.costUsd)}</div>
        <div className={cn('font-mono', tone(v.unrealizedUsd))}>
          {signed(v.unrealizedUsd)}
          {pct(v.unrealizedUsd, v.costUsd) && (
            <span className="block text-[11px] opacity-80">{pct(v.unrealizedUsd, v.costUsd)}</span>
          )}
        </div>
        <div className={cn('font-mono', tone(netRealized))}>
          {signed(netRealized)}
          <span className="block text-[11px] text-muted-foreground">{pos.orders} order{pos.orders === 1 ? '' : 's'}</span>
        </div>
        <div className="font-mono text-muted-foreground">
          {formatCurrency(pos.feesUsd)}
          {pos.builderFeesUsd > 0 && (
            <span className="block text-[11px]">bskts {formatCurrency(pos.builderFeesUsd)}</span>
          )}
        </div>
      </button>

      {expanded && legs.length > 0 && (
        <div className="border-t border-border/60 px-3 pb-2.5 pt-1.5 space-y-1">
          {legs.map(l => {
            const mark = marks.get(l.coin);
            const pnl = mark === undefined ? null : l.size * (mark - l.entryPx);
            const isLong = l.size > 0;
            return (
              <div key={l.coin} className={cn('grid items-center gap-x-3 pl-6 text-xs', GRID)}>
                <div className="flex items-center gap-2 min-w-0">
                  <CoinIcon coin={l.coin} size="sm" />
                  <span className="text-foreground">{coinSymbol(l.coin)}</span>
                  <span className={cn('text-[10px] font-semibold', isLong ? 'text-profit' : 'text-loss')}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                </div>
                <div className="font-mono text-foreground">
                  {mark === undefined ? '—' : formatCurrency(Math.abs(l.size) * mark)}
                  <span className="block text-[10px] text-muted-foreground">{formatSize(Math.abs(l.size))}</span>
                </div>
                <div className="font-mono text-muted-foreground">
                  ${l.entryPx.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  <span className="block text-[10px]">
                    mark {mark === undefined ? '—' : `$${mark.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
                  </span>
                </div>
                <div className={cn('font-mono', pnl === null ? 'text-muted-foreground' : tone(pnl))}>
                  {pnl === null ? '—' : signed(pnl)}
                  {pnl !== null && pct(pnl, Math.abs(l.size) * l.entryPx) && (
                    <span className="block text-[10px] opacity-80">{pct(pnl, Math.abs(l.size) * l.entryPx)}</span>
                  )}
                </div>
                <div />
                <div className="font-mono text-muted-foreground">{formatCurrency(l.entryFeeUsd)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BasketPositions({ positions, marks, isLive }: BasketPositionsProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const open = positions.filter(isBasketOpen);
  const closed = positions.filter(p => !isBasketOpen(p));

  const totals = open.reduce(
    (t, p) => {
      const v = valueBasket(p, marks);
      t.value += v.valueUsd;
      t.cost += v.costUsd;
      t.unrealized += v.unrealizedUsd;
      return t;
    },
    { value: 0, cost: 0, unrealized: 0 },
  );
  const realizedAll = positions.reduce((s, p) => s + p.realizedUsd - p.feesUsd, 0);

  const toggle = (ticker: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
      return next;
    });

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <img src={bsktsMark} alt="bskts" width={28} height={28} className="w-7 h-7 rounded-md" />
          <h3 className="font-semibold text-foreground">Basket Positions</h3>
          <a
            href={`${BSKTS_SITE}/perps`}
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
          <span className="text-xs text-muted-foreground">{isLive ? 'Live' : open.length ? 'Paused' : 'Flat'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-secondary/50 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Open Baskets</p>
          <p className="text-base font-semibold font-mono text-foreground">{open.length}</p>
          <p className="text-[11px] text-muted-foreground">{closed.length} closed</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Position Value</p>
          <p className="text-base font-semibold font-mono text-foreground">{formatCurrency(totals.value)}</p>
          <p className="text-[11px] text-muted-foreground">cost {formatCurrency(totals.cost)}</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Unrealized</p>
          <p className={cn('text-base font-semibold font-mono', tone(totals.unrealized))}>{signed(totals.unrealized)}</p>
          {pct(totals.unrealized, totals.cost) && (
            <p className="text-[11px] text-muted-foreground">{pct(totals.unrealized, totals.cost)} on cost</p>
          )}
        </div>
        <div className="bg-secondary/50 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Realized, net</p>
          <p className={cn('text-base font-semibold font-mono', tone(realizedAll))}>{signed(realizedAll)}</p>
          <p className="text-[11px] text-muted-foreground">after exchange + bskts fees</p>
        </div>
      </div>

      {open.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="min-w-[640px] space-y-1.5">
            <div className={cn('grid gap-x-3 px-3 text-[11px] uppercase tracking-wide text-muted-foreground', GRID)}>
              <span>Basket</span>
              <span>Value</span>
              <span>Entry</span>
              <span>Unrealized</span>
              <span>Realized</span>
              <span>Fees</span>
            </div>
            {open.map(p => (
              <BasketRow key={p.ticker} pos={p} marks={marks} expanded={expanded.has(p.ticker)} onToggle={() => toggle(p.ticker)} />
            ))}
          </div>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">No open baskets.</p>
      )}

      {closed.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 px-3">Closed Baskets</p>
          <div className="flex flex-wrap gap-2 px-3">
            {closed.map(p => {
              const net = p.realizedUsd - p.feesUsd;
              return (
                <span key={p.ticker} className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded bg-secondary/40">
                  <BasketLogo symbols={basketSymbols(p)} size={16} max={2} />
                  <span className="text-foreground">{p.ticker}</span>
                  <span className={tone(net)}>{signed(net)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground px-3">
        Rebuilt from this account's bskts-tagged fills at average cost per basket per coin. Funding is not split by basket.
      </p>
    </div>
  );
}
