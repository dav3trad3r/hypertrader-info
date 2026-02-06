import { ExternalLink, User, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

interface WhaleAddress {
  address: string;
  label: string | null;
  total_volume: number;
  trade_count: number;
  last_seen_at: string;
}

interface TrackedWhalesListProps {
  whales: WhaleAddress[];
  loading: boolean;
  selectedWhale: string | null;
  onSelectWhale: (address: string | null) => void;
}

function formatVolume(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function TrackedWhalesList({ whales, loading, selectedWhale, onSelectWhale }: TrackedWhalesListProps) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 bg-secondary rounded animate-pulse" />
          <div className="h-5 w-32 bg-secondary rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-secondary/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (whales.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 text-center">
        <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No whales detected yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Track addresses with $1M+ positions in the main dashboard
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <User className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Tracked Whales</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {whales.length} whales
        </span>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {whales.map((whale) => {
          const isSelected = selectedWhale === whale.address;
          
          return (
            <div
              key={whale.address}
              className={`flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer ${
                isSelected 
                  ? 'bg-primary/20 border border-primary/40' 
                  : 'bg-secondary/30 hover:bg-secondary/50'
              }`}
              onClick={() => onSelectWhale(isSelected ? null : whale.address)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isSelected ? 'bg-primary/30' : 'bg-primary/10'
                }`}>
                  {isSelected ? (
                    <Eye className="w-4 h-4 text-primary" />
                  ) : (
                    <User className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {whale.label || truncateAddress(whale.address)}
                    </span>
                    <Link
                      to={`/?address=${whale.address}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary hover:underline flex items-center gap-0.5"
                    >
                      Dashboard
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {truncateAddress(whale.address)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-primary">
                  {formatVolume(whale.total_volume)}
                </p>
                <p className="text-xs text-muted-foreground">position value</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
