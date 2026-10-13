import { type MarketType } from '@/lib/hyperliquid';
import { cn } from '@/lib/utils';
import bsktsMark from '@/assets/bskts.svg';
import papertradeMark from '@/assets/papertrade.svg';

interface MarketFilterProps {
  value: MarketType;
  onChange: (value: MarketType) => void;
  counts: {
    all: number;
    perps: number;
    spot: number;
    /** Perp fills placed through bskts.xyz; the button only shows when there are some. */
    bskts: number;
    /** Closed positions on papertrade.xyz; likewise only shown when there are some. */
    papertrade: number;
  };
}

// Venue filters appear only for addresses that have traded there.
const OPTIONAL: ReadonlySet<MarketType> = new Set(['bskts', 'papertrade']);

const FILTERS: { value: MarketType; label: string; title?: string; icon?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'perps', label: 'Perps' },
  { value: 'spot', label: 'Spot' },
  { value: 'bskts', label: 'bskts', title: 'Perp orders placed through bskts.xyz index baskets', icon: bsktsMark },
  { value: 'papertrade', label: 'Papertrade', title: 'Synthetic perps on papertrade.xyz (HyperEVM)', icon: papertradeMark },
];

export function MarketFilter({ value, onChange, counts }: MarketFilterProps) {
  const filters = FILTERS.filter(f => !OPTIONAL.has(f.value) || counts[f.value as 'bskts' | 'papertrade'] > 0);
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-secondary rounded-lg">
      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => onChange(filter.value)}
          title={filter.title}
          className={cn(
            "inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200",
            value === filter.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          {filter.icon && (
            <img src={filter.icon} alt="" width={16} height={16} className="w-4 h-4 rounded-[3px] mr-1.5" />
          )}
          {filter.label}
          <span className={cn(
            "ml-2 text-xs font-mono",
            value === filter.value ? "text-primary-foreground/80" : "text-muted-foreground"
          )}>
            {counts[filter.value].toLocaleString()}
          </span>
        </button>
      ))}
    </div>
  );
}
