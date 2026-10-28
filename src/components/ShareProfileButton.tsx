import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MarketType } from '@/lib/hyperliquid';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ShareProfileButtonProps {
  address: string;
  marketType?: MarketType;
}

export function ShareProfileButton({ address, marketType = 'all' }: ShareProfileButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    // /u/<address> links get a link preview with this trader's own numbers
    // (workers/og renders it); ?market= opens the same filter for the reader.
    const url = new URL(`/u/${address}`, window.location.origin);
    if (marketType !== 'all') url.searchParams.set('market', marketType);
    
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={handleShare}
            className="h-9 w-9"
          >
            {copied ? (
              <Check className="h-4 w-4 text-profit" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{copied ? 'Link copied!' : 'Copy profile link'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
