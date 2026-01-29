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
import { MarketFilter } from '@/components/MarketFilter';

const Index = () => {
  const { 
    filteredData, 
    rawFills,
    isLoading, 
    error, 
    address, 
    marketType,
    setMarketType,
    marketCounts,
    fetchData, 
    clearData 
  } = useHyperliquidData();

  const displayData = filteredData;

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
        {!rawFills.length && !isLoading && !error && <EmptyState />}

        {/* Data Display */}
        {rawFills.length > 0 && !isLoading && (
          <div className="space-y-6 animate-fade-in">
            {/* Address Banner with Filter */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Viewing trading history for</p>
                  <p className="font-mono text-sm text-foreground truncate max-w-md">
                    {address}
                  </p>
                </div>
                
                {/* Market Filter */}
                <MarketFilter 
                  value={marketType}
                  onChange={setMarketType}
                  counts={marketCounts}
                />
              </div>
            </div>

            {/* No data for selected filter */}
            {!displayData && (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground">
                  No {marketType === 'perps' ? 'perpetual' : 'spot'} trades found for this address.
                </p>
              </div>
            )}

            {/* Main Content Grid */}
            {displayData && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Calendar - Takes 2 columns */}
              <div className="lg:col-span-2">
                <PnLCalendar 
                  dailyPnL={displayData.dailyPnL} 
                  weeklyPnL={displayData.weeklyPnL}
                  fills={displayData.fills}
                />
              </div>

                  {/* Summary Stats - Right column */}
                  <div className="space-y-6">
                    <SummaryStats summary={displayData.summary} />
                  </div>
                </div>

                {/* Bottom Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <TopAssets assets={displayData.assetPerformance} />
                  <WeeklyBreakdown weeklyPnL={displayData.weeklyPnL} />
                </div>
              </>
            )}
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
