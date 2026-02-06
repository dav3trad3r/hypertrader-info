import { Activity, TrendingUp, Users, DollarSign } from 'lucide-react';
import type { WhaleStats as WhaleStatsType } from '@/pages/Whales';

interface WhaleStatsProps {
  stats: WhaleStatsType | null;
  loading: boolean;
}

function formatVolume(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export function WhaleStats({ stats, loading }: WhaleStatsProps) {
  const items = [
    {
      label: 'Tracked Whales',
      value: stats?.trackedWhales ?? 0,
      icon: Users,
      color: 'text-primary',
    },
    {
      label: 'Total Trades',
      value: stats?.totalTrades ?? 0,
      icon: Activity,
      color: 'text-blue-500',
    },
    {
      label: 'Active TWAPs',
      value: stats?.activeTwaps ?? 0,
      icon: TrendingUp,
      color: 'text-purple-500',
    },
    {
      label: '24h Volume',
      value: stats ? formatVolume(stats.volume24h) : '$0',
      icon: DollarSign,
      color: 'text-profit',
      isFormatted: true,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-secondary rounded w-24 mb-2" />
            <div className="h-8 bg-secondary rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <div key={item.label} className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <item.icon className={`w-4 h-4 ${item.color}`} />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {item.isFormatted ? item.value : item.value.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
