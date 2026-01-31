import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Coins } from 'lucide-react';

// Local asset overrides - import custom logos
import silverLogo from '@/assets/silver.svg';

interface CoinIconProps {
  coin: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Map of coin names to local asset URLs
const LOCAL_ASSET_OVERRIDES: Record<string, string> = {
  'SILVER': silverLogo,
};

// Get the clean coin name for the image URL
function getCleanCoinName(coin: string): string {
  // Remove @ prefix for spot tokens (we need the resolved name passed in)
  if (coin.startsWith('@')) {
    return coin.slice(1);
  }
  // Remove xyz: prefix for HIP-3 assets
  if (coin.startsWith('xyz:')) {
    return coin.slice(4);
  }
  // Remove (Spot) suffix if present
  if (coin.endsWith(' (Spot)')) {
    return coin.replace(' (Spot)', '');
  }
  return coin;
}

// Check if we have a local override for this coin
function getLocalOverride(cleanName: string): string | null {
  return LOCAL_ASSET_OVERRIDES[cleanName.toUpperCase()] || null;
}

export function CoinIcon({ coin, size = 'md', className }: CoinIconProps) {
  const [hasError, setHasError] = useState(false);
  
  const cleanName = getCleanCoinName(coin);
  const localOverride = getLocalOverride(cleanName);
  const imageUrl = localOverride || `https://app.hyperliquid.xyz/coins/${cleanName}.svg`;
  
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };
  
  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  if (hasError) {
    // Fallback to generic icon
    return (
      <div className={cn(
        "rounded-full bg-muted flex items-center justify-center",
        sizeClasses[size],
        className
      )}>
        <Coins className={cn("text-muted-foreground", iconSizes[size])} />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={cleanName}
      className={cn(
        "rounded-full object-cover bg-muted",
        sizeClasses[size],
        className
      )}
      onError={() => setHasError(true)}
    />
  );
}
