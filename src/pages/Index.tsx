import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHyperliquidData } from '@/hooks/useHyperliquidData';
import { Header } from '@/components/Header';
import { OpenSourceLinks } from '@/components/OpenSourceLinks';
import { AddressSearch } from '@/components/AddressSearch';
import { PnLCalendar } from '@/components/PnLCalendar';
import { SummaryStats } from '@/components/SummaryStats';
import { TopAssets } from '@/components/TopAssets';
import { WeeklyBreakdown } from '@/components/WeeklyBreakdown';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { EmptyState } from '@/components/EmptyState';
import { MarketFilter } from '@/components/MarketFilter';
import { SharePnLCard } from '@/components/SharePnLCard';
import { LiveTrades } from '@/components/LiveTrades';
import { ShareProfileButton } from '@/components/ShareProfileButton';
import { TradingRulesBanner } from '@/components/TradingRulesBanner';

// Address that shows the trading rules banner
const RULES_ADDRESS = '0xF5dbd88878Ea8ED3992c883871a77bb146E6b619'.toLowerCase();

// Refresh indicator with live countdown
function RefreshIndicator({ isRefreshing, lastRefreshed }: { isRefreshing: boolean; lastRefreshed: Date | null }) {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    if (!lastRefreshed) return;
    
    const update = () => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshed.getTime()) / 1000));
    };
    
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastRefreshed]);

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`w-1.5 h-1.5 rounded-full ${isRefreshing ? 'bg-primary animate-pulse' : 'bg-profit'}`} />
      {isRefreshing ? (
        'Refreshing...'
      ) : lastRefreshed ? (
        `${secondsAgo}s ago`
      ) : (
        'Auto-refresh: 30s'
      )}
    </span>
  );
}

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    filteredData, 
    rawFills,
    isLoading,
    isLoadingMonth,
    isSyncing,
    isRefreshing,
    lastRefreshed,
    trackingInfo,
    hasMoreHistory,
    hitApiLimit,
    error, 
    address,
    ensName,
    marketType,
    setMarketType,
    marketCounts,
    fetchData,
    loadMonth,
    loadedMonths,
    clearData,
    refreshNow,
  } = useHyperliquidData();

  // Auto-fetch if address is in URL params
  useEffect(() => {
    const urlAddress = searchParams.get('address');
    if (urlAddress && !address && !isLoading) {
      fetchData(urlAddress);
    }
  }, [searchParams, address, isLoading, fetchData]);

  // Update URL when address changes
  useEffect(() => {
    if (address) {
      setSearchParams({ address }, { replace: true });
    } else if (searchParams.has('address')) {
      setSearchParams({}, { replace: true });
    }
  }, [address, searchParams, setSearchParams]);

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
            {/* Trading Rules Banner - only for specific address */}
            {address?.toLowerCase() === RULES_ADDRESS && (
              <TradingRulesBanner />
            )}
            {/* Gap Warning */}
            {trackingInfo?.has_gap && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-start gap-3">
                <svg 
                  className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-yellow-500">
                    Historical Gap Detected
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Some historical trades may be missing. Keep visiting to accumulate more history over time.
                    We've stored {trackingInfo.total_fills?.toLocaleString() || 0} fills so far.
                  </p>
                </div>
              </div>
            )}

            {/* API Limit Warning */}
            {hitApiLimit && !trackingInfo?.has_gap && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
                <svg 
                  className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-destructive">
                    API Limit Reached
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hyperliquid's API only provides access to the most recent ~10,000 trades. 
                    Your data is being synced to our database for unlimited historical access on future visits.
                  </p>
                </div>
              </div>
            )}

            {/* Address Banner with Filter */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Viewing trading history for</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {ensName && (
                      <span className="font-semibold text-base text-foreground">
                        {ensName}
                      </span>
                    )}
                    <p className={`font-mono text-sm truncate max-w-md ${ensName ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {ensName ? `(${address?.slice(0, 6)}...${address?.slice(-4)})` : address}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <p className="text-xs text-muted-foreground">
                      {rawFills.length.toLocaleString()} trades loaded
                      {trackingInfo && trackingInfo.total_fills > rawFills.length && (
                        <span className="text-primary ml-1">
                          ({trackingInfo.total_fills.toLocaleString()} total in history)
                        </span>
                      )}
                      {isLoadingMonth && <span className="text-primary animate-pulse ml-2">• Loading more...</span>}
                    </p>
                    {isSyncing && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Syncing...
                      </span>
                    )}
                    {/* Auto-refresh indicator */}
                    <RefreshIndicator isRefreshing={isRefreshing} lastRefreshed={lastRefreshed} />
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <MarketFilter 
                    value={marketType}
                    onChange={setMarketType}
                    counts={marketCounts}
                  />
                  <ShareProfileButton address={address || ''} />
                  {displayData && (
                    <SharePnLCard 
                      summary={displayData.summary}
                      dailyPnL={displayData.dailyPnL}
                      address={address || ''}
                      marketType={marketType}
                    />
                  )}
                </div>
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
                      isLoadingMonth={false}
                      loadedMonths={loadedMonths}
                      onLoadMonth={loadMonth}
                    />
                  </div>

                  {/* Summary Stats - Right column */}
                  <div>
                    <SummaryStats summary={displayData.summary} />
                  </div>
                </div>

                {/* Live Positions - Full width below calendar */}
                <LiveTrades 
                  address={address || ''}
                  marketType={marketType}
                />

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
            <span className="font-medium text-foreground">HyperTrader</span> • Data sourced from Hyperliquid API • Not financial advice<OpenSourceLinks />
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
