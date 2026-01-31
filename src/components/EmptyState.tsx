import blobGreen from '@/assets/blob_green.gif';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-8">
      {/* Hyperliquid Blob Animation */}
      <div className="relative w-40 h-40 animate-fade-in">
        <img 
          src={blobGreen} 
          alt="Hyperliquid" 
          className="w-full h-full object-contain"
        />
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
