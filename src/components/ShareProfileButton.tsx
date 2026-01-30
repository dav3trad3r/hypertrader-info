import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ShareProfileButtonProps {
  address: string;
}

export function ShareProfileButton({ address }: ShareProfileButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = new URL(window.location.origin);
    url.searchParams.set('address', address);
    
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
