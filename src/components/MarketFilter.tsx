import { type MarketType } from '@/lib/hyperliquid';
import { cn } from '@/lib/utils';

interface MarketFilterProps {
  value: MarketType;
  onChange: (value: MarketType) => void;
  counts: {
    all: number;
    perps: number;
    spot: number;
    /** Perp fills placed through bskts.xyz; the button only shows when there are some. */
    bskts: number;
  };
}

const FILTERS: { value: MarketType; label: string; title?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'perps', label: 'Perps' },
  { value: 'spot', label: 'Spot' },
  { value: 'bskts', label: 'bskts', title: 'Perp orders placed through bskts.xyz index baskets' },
];

export function MarketFilter({ value, onChange, counts }: MarketFilterProps) {
  const filters = FILTERS.filter(f => f.value !== 'bskts' || counts.bskts > 0);
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-secondary rounded-lg">
      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => onChange(filter.value)}
          title={filter.title}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-all duration-200",
            value === filter.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
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
