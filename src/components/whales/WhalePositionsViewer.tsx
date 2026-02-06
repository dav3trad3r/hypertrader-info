import { X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LiveTrades } from '@/components/LiveTrades';

interface WhalePositionsViewerProps {
  address: string;
  label: string | null;
  onClose: () => void;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WhalePositionsViewer({ address, label, onClose }: WhalePositionsViewerProps) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="font-semibold text-foreground">
              {label || truncateAddress(address)}
            </h3>
            <p className="text-xs text-muted-foreground font-mono">{address}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Link to={`/?address=${address}`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              Open in Dashboard
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </Link>
          <a
            href={`https://app.hyperliquid.xyz/explorer/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="sm" className="gap-1.5">
              Hyperliquid
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </a>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Positions */}
      <div className="p-4">
        <LiveTrades address={address} marketType="all" />
      </div>
    </div>
  );
}
