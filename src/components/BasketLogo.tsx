import { useState } from 'react';
import { cn } from '@/lib/utils';
import { bsktsLogoUrl, coinSymbol } from '@/lib/bskts';

// A basket's mark, the way bskts.xyz draws it: its constituents' logos stacked,
// heaviest first, with a "+N" chip for the rest. Baskets have no artwork of
// their own; the constituents are the identity. Logos come from bskts.xyz, fall
// back to Hyperliquid's coin art, then to a lettered chip, so the stack never
// collapses into blank circles.

function Chip({ coin, size, style }: { coin: string; size: number; style?: React.CSSProperties }) {
  const sym = coinSymbol(coin);
  const sources = [bsktsLogoUrl(coin), `https://app.hyperliquid.xyz/coins/${sym}.svg`];
  const [idx, setIdx] = useState(0);
  const src = sources[idx];
  return (
    <span
      className="grid place-items-center overflow-hidden rounded-full bg-secondary ring-2 ring-card"
      style={{ width: size, height: size, ...style }}
      title={sym}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="size-full object-contain p-px"
          onError={() => setIdx(i => i + 1)}
        />
      ) : (
        <span className="text-[9px] font-semibold text-muted-foreground leading-none">
          {sym.slice(0, 3)}
        </span>
      )}
    </span>
  );
}

interface BasketLogoProps {
  /** Coins, heaviest first ("xyz:NVDA"). */
  symbols: string[];
  size?: number;
  max?: number;
  className?: string;
}

export function BasketLogo({ symbols, size = 28, max = 3, className }: BasketLogoProps) {
  const shown = symbols.slice(0, max);
  const extra = symbols.length - shown.length;
  const chip = Math.round(size * 0.78);
  const overlap = Math.round(chip * 0.34);
  return (
    <span
      className={cn('inline-flex shrink-0 items-center', className)}
      style={{ height: size }}
      aria-label={symbols.map(coinSymbol).join(', ')}
      title={symbols.map(coinSymbol).join(' · ')}
    >
      {shown.map((coin, i) => (
        <Chip key={coin} coin={coin} size={chip} style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: shown.length - i }} />
      ))}
      {extra > 0 && (
        <span
          className="grid place-items-center rounded-full bg-secondary ring-2 ring-card text-[9px] font-semibold text-muted-foreground"
          style={{ width: chip, height: chip, marginLeft: -overlap }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
