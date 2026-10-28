import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHyperliquidData } from '@/hooks/useHyperliquidData';
import { Header } from '@/components/Header';
import { OpenSourceLinks } from '@/components/OpenSourceLinks';
import { TraderScorecard } from '@/components/TraderScorecard';
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
import { bsktsCoins } from '@/lib/bskts';
import bsktsMark from '@/assets/bskts.svg';
import { useBasketPositions } from '@/hooks/useBasketPositions';
import { BasketPositions } from '@/components/BasketPositions';
import { TopBaskets } from '@/components/TopBaskets';
import { usePapertrade } from '@/hooks/usePapertrade';
import { PapertradeAccount } from '@/components/PapertradeAccount';

const NO_FILLS: never[] = [];

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
    equity,
    rawFills,
    isLoading,
    isLoadingMonth,
    isRefreshing,
    lastRefreshed,
    trackingInfo,
    hasMoreHistory,
    hitApiLimit,
    error, 
    address,
    ensName,
    bsktsLink,
    marketType,
    setMarketType,
    marketCounts,
    fetchData,
    loadMonth,
    loadedMonths,
    clearData,
    refreshNow,
  } = useHyperliquidData();

  // Perp coins traded through bskts.xyz on this account (scopes Live Positions under the bskts filter)
  const bsktsCoinSet = useMemo(() => bsktsCoins(rawFills), [rawFills]);
  // Under the bskts filter, positions regroup by basket (fills are already bskts-only there)
  const baskets = useBasketPositions(marketType === 'bskts' ? (filteredData?.fills ?? NO_FILLS) : NO_FILLS);
  // papertrade.xyz: off-exchange synthetic perps for the same address, fetched separately
  const papertrade = usePapertrade(address);
  const hasPapertrade = papertrade.trades.length > 0;
  const hasData = rawFills.length > 0 || hasPapertrade;
  // A Papertrade-only address has no Hyperliquid fills; that is not an error.
  const isNoHistoryError = !!error && /no trading history/i.test(error);

  // Land on the venue that has data when Hyperliquid has none, and leave it when it no longer applies.
  useEffect(() => {
    if (isLoading || papertrade.isLoading) return;
    if (rawFills.length === 0 && hasPapertrade && marketType !== 'papertrade') setMarketType('papertrade');
    else if (marketType === 'papertrade' && !hasPapertrade && rawFills.length > 0) setMarketType('all');
  }, [isLoading, papertrade.isLoading, rawFills.length, hasPapertrade, marketType, setMarketType]);

  // Auto-fetch if address is in URL params
  useEffect(() => {
    const urlAddress = searchParams.get('address');
    if (urlAddress && !address && !isLoading) {
      fetchData(urlAddress);
    }
  }, [searchParams, address, isLoading, fetchData]);

  // Update URL when address changes. A searched bskts account stays in the URL
  // (and the search box) even though its perps load from the linked wallet.
  const shownAddress = bsktsLink?.account ?? address;
  useEffect(() => {
    if (shownAddress) {
      setSearchParams({ address: shownAddress }, { replace: true });
    } else if (searchParams.has('address')) {
      setSearchParams({}, { replace: true });
    }
  }, [shownAddress, address, searchParams, setSearchParams]);

  const displayData = marketType === 'papertrade' ? papertrade.view : filteredData;

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Search Section */}
        <div className="mb-10">
          <AddressSearch
            onSearch={fetchData}
            isLoading={isLoading}
            currentAddress={shownAddress}
            onClear={clearData}
          />
        </div>

        {/* Loading State */}
        {isLoading && <LoadingSpinner />}

        {/* Error State */}
        {error && !isLoading && !(isNoHistoryError && hasPapertrade) && (
          <ErrorDisplay
            message={error}
            onRetry={() => shownAddress && fetchData(shownAddress)}
          />
        )}

        {/* Empty State */}
        {!hasData && !isLoading && !error && <EmptyState />}

        {/* Data Display */}
        {hasData && !isLoading && (
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
                    The stored archive for this address has a gap, so some older trades are missing.
                    It holds {trackingInfo.total_fills?.toLocaleString() || 0} fills.
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
                    Hyperliquid's API only returns an account's most recent ~10,000 fills, so older trades
                    are not included in these figures.
                  </p>
                </div>
              </div>
            )}

            {/* Address Banner with Filter */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  {bsktsLink && (
                    <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground flex-wrap">
                      <img src={bsktsMark} alt="" width={14} height={14} className="w-3.5 h-3.5 rounded-[3px]" />
                      <span>bskts account</span>
                      <span className="font-mono text-foreground">{bsktsLink.account.slice(0, 6)}…{bsktsLink.account.slice(-4)}</span>
                      <span>trades perps from its Hyperliquid wallet</span>
                      <a
                        href={`https://robinhoodchain.blockscout.com/tx/${bsktsLink.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        title="The transfer that links the two"
                      >
                        (via transfer)
                      </a>
                    </div>
                  )}
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
                      {(marketType === 'papertrade' ? papertrade.trades.length : rawFills.length).toLocaleString()} trades loaded
                      {trackingInfo && trackingInfo.total_fills > rawFills.length && (
                        <span className="text-primary ml-1">
                          ({trackingInfo.total_fills.toLocaleString()} total in history)
                        </span>
                      )}
                      {isLoadingMonth && <span className="text-primary animate-pulse ml-2">• Loading more...</span>}
                    </p>
                    {/* Auto-refresh indicator */}
                    <RefreshIndicator isRefreshing={isRefreshing} lastRefreshed={lastRefreshed} />
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <MarketFilter 
                    value={marketType}
                    onChange={setMarketType}
                    counts={{ ...marketCounts, papertrade: papertrade.trades.length }}
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
                  No {marketType === 'perps' ? 'perpetual' : marketType === 'bskts' ? 'bskts' : marketType === 'papertrade' ? 'Papertrade' : 'spot'} trades found for this address.
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
                      costs={displayData.costs}
                      isLoadingMonth={false}
                      loadedMonths={marketType === 'papertrade' ? papertrade.months : loadedMonths}
                      onLoadMonth={marketType === 'papertrade' ? undefined : loadMonth}
                    />
                  </div>

                  {/* Summary Stats - Right column */}
                  <div>
                    <SummaryStats summary={displayData.summary} />
                  </div>
                </div>

                <TraderScorecard
                  tradeStats={displayData.tradeStats}
                  summary={displayData.summary}
                  equity={marketType === 'papertrade' ? papertrade.equity : equity}
                  address={address || ''}
                  marketType={marketType}
                />

                {/* Live Positions - Full width below calendar */}
                {marketType === 'bskts' ? (
                  <BasketPositions positions={baskets.positions} marks={baskets.marks} isLive={baskets.isLive} />
                ) : marketType === 'papertrade' ? (
                  <PapertradeAccount account={papertrade.account} closedTrades={papertrade.trades.length} isLive={papertrade.isLive} />
                ) : (
                  <LiveTrades
                    address={address || ''}
                    marketType={marketType}
                    bsktsCoins={bsktsCoinSet}
                  />
                )}

                {/* Bottom Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {marketType === 'bskts' ? (
                    <TopBaskets positions={baskets.positions} marks={baskets.marks} />
                  ) : (
                    <TopAssets assets={displayData.assetPerformance} />
                  )}
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
