import { Activity, TrendingUp, Calendar, Search } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-8">
      {/* Animated Icon Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-6 rounded-xl bg-card border border-border animate-fade-in" style={{ animationDelay: '0ms' }}>
          <Calendar className="w-8 h-8 text-primary" />
        </div>
        <div className="p-6 rounded-xl bg-card border border-border animate-fade-in" style={{ animationDelay: '100ms' }}>
          <TrendingUp className="w-8 h-8 text-profit" />
        </div>
        <div className="p-6 rounded-xl bg-card border border-border animate-fade-in" style={{ animationDelay: '200ms' }}>
          <Activity className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="p-6 rounded-xl bg-card border border-border animate-fade-in" style={{ animationDelay: '300ms' }}>
          <Search className="w-8 h-8 text-muted-foreground" />
        </div>
      </div>

      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Track Any Trader's Performance
        </h2>
        <p className="text-muted-foreground">
          Enter a Hyperliquid wallet address above to view their complete trading history, 
          daily P&L calendar, best performing assets, and more.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
        <div className="text-center p-4">
          <div className="text-primary text-2xl font-bold mb-1">📅</div>
          <p className="text-sm text-muted-foreground">Daily & Weekly P&L Calendar</p>
        </div>
        <div className="text-center p-4">
          <div className="text-primary text-2xl font-bold mb-1">📊</div>
          <p className="text-sm text-muted-foreground">Asset Performance Breakdown</p>
        </div>
        <div className="text-center p-4">
          <div className="text-primary text-2xl font-bold mb-1">⚡</div>
          <p className="text-sm text-muted-foreground">Real-time Hyperliquid Data</p>
        </div>
      </div>

      {/* Example addresses hint */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground mb-2">Try searching for any Hyperliquid trader address or ENS name</p>
        <code className="text-xs font-mono text-primary/80 bg-primary/10 px-3 py-1.5 rounded">
          0x...
        </code>
      </div>
    </div>
  );
}
