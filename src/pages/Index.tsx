import { useHyperliquidData } from '@/hooks/useHyperliquidData';
import { Header } from '@/components/Header';
import { AddressSearch } from '@/components/AddressSearch';
import { PnLCalendar } from '@/components/PnLCalendar';
import { SummaryStats } from '@/components/SummaryStats';
import { TopAssets } from '@/components/TopAssets';
import { WeeklyBreakdown } from '@/components/WeeklyBreakdown';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { EmptyState } from '@/components/EmptyState';

const Index = () => {
  const { data, isLoading, error, address, fetchData, clearData } = useHyperliquidData();

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Search Section */}
        <div className="mb-10">
          <AddressSearch 
            onSearch={fetchData}
            isLoading={isLoading}
            currentAddress={address}
            onClear={clearData}
          />
        </div>

        {/* Loading State */}
        {isLoading && <LoadingSpinner />}

        {/* Error State */}
        {error && !isLoading && (
          <ErrorDisplay 
            message={error} 
            onRetry={() => address && fetchData(address)}
          />
        )}

        {/* Empty State */}
        {!data && !isLoading && !error && <EmptyState />}

        {/* Data Display */}
        {data && !isLoading && (
          <div className="space-y-6 animate-fade-in">
            {/* Address Banner */}
            <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Viewing trading history for</p>
                <p className="font-mono text-sm text-foreground truncate max-w-md">
                  {address}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Fills</p>
                <p className="font-mono text-lg font-bold text-primary">
                  {data.fills.length.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Calendar - Takes 2 columns */}
              <div className="lg:col-span-2">
                <PnLCalendar 
                  dailyPnL={data.dailyPnL} 
                  weeklyPnL={data.weeklyPnL} 
                />
              </div>

              {/* Summary Stats - Right column */}
              <div className="space-y-6">
                <SummaryStats summary={data.summary} />
              </div>
            </div>

            {/* Bottom Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TopAssets assets={data.assetPerformance} />
              <WeeklyBreakdown weeklyPnL={data.weeklyPnL} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground">
            Data sourced from Hyperliquid API • Not financial advice
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
