import { TrendingUp } from 'lucide-react';

export function Header() {
  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 glow-teal">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Hyper<span className="text-primary">Trader</span>
              </h1>
              <p className="text-xs text-muted-foreground">Hyperliquid PnL Tracker & Analytics</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-muted-foreground">Live Data</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
