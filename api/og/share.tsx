import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';

type MarketType = 'all' | 'perps' | 'spot';

interface Fill {
  closedPnl: string;
  coin: string;
  px: string;
  sz: string;
  time: number;
  fee: string;
  tid: number;
}

interface DailyPnL {
  date: string;
  pnl: number;
  trades: number;
  volume: number;
}

interface TradingSummary {
  totalPnl: number;
  totalTrades: number;
  totalVolume: number;
  winRate: number;
}

function isSpotTrade(fill: Fill): boolean {
  return fill.coin.startsWith('@');
}

function filterFillsByMarket(fills: Fill[], marketType: MarketType): Fill[] {
  if (marketType === 'all') return fills;
  if (marketType === 'spot') return fills.filter(f => isSpotTrade(f));
  return fills.filter(f => !isSpotTrade(f));
}

async function fetchUserFills(address: string): Promise<Fill[]> {
  const allFills: Fill[] = [];
  const now = Date.now();
  const startOfHistory = new Date('2022-01-01').getTime();
  const windowSize = 30 * 24 * 60 * 60 * 1000;
  
  let currentEnd = now;
  let currentStart = currentEnd - windowSize;
  
  while (currentEnd > startOfHistory && allFills.length < 50000) {
    try {
      const response = await fetch(HYPERLIQUID_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'userFillsByTime',
          user: address,
          startTime: Math.max(currentStart, startOfHistory),
          endTime: currentEnd,
          aggregateByTime: true,
        }),
      });

      if (!response.ok) break;
      const fills: Fill[] = await response.json();
      
      if (fills?.length > 0) {
        allFills.push(...fills);
      }
      
      currentEnd = currentStart;
      currentStart = currentEnd - windowSize;
      
      if (!fills || fills.length === 0) {
        currentEnd = currentStart;
        currentStart = currentEnd - windowSize;
      }
    } catch {
      break;
    }
  }
  
  // Also get recent fills
  try {
    const response = await fetch(HYPERLIQUID_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userFills', user: address }),
    });
    if (response.ok) {
      const recentFills: Fill[] = await response.json();
      const existingTids = new Set(allFills.map(f => f.tid));
      const newFills = recentFills.filter(f => !existingTids.has(f.tid));
      allFills.push(...newFills);
    }
  } catch {}
  
  return allFills.sort((a, b) => b.time - a.time);
}

function processDailyPnL(fills: Fill[]): DailyPnL[] {
  const dailyMap = new Map<string, DailyPnL>();
  
  fills.forEach(fill => {
    const date = new Date(fill.time).toISOString().split('T')[0];
    const pnl = parseFloat(fill.closedPnl) || 0;
    const volume = parseFloat(fill.sz) * parseFloat(fill.px);
    
    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, pnl: 0, trades: 0, volume: 0 });
    }
    
    const day = dailyMap.get(date)!;
    day.pnl += pnl;
    day.trades += 1;
    day.volume += volume;
  });
  
  return Array.from(dailyMap.values()).sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

function calculateSummary(fills: Fill[], dailyPnL: DailyPnL[]): TradingSummary {
  const totalPnl = dailyPnL.reduce((sum, d) => sum + d.pnl, 0);
  const totalTrades = fills.length;
  const totalVolume = dailyPnL.reduce((sum, d) => sum + d.volume, 0);
  const profitableDays = dailyPnL.filter(d => d.pnl > 0).length;
  
  return {
    totalPnl,
    totalTrades,
    totalVolume,
    winRate: dailyPnL.length > 0 ? (profitableDays / dailyPnL.length) * 100 : 0,
  };
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (absValue >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)} . . . ${address.slice(-4)}`;
}

export default async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const marketType = (searchParams.get('market') as MarketType) || 'all';
  
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return new Response('Invalid address', { status: 400 });
  }
  
  try {
    const fills = await fetchUserFills(address);
    const filteredFills = filterFillsByMarket(fills, marketType);
    const dailyPnL = processDailyPnL(filteredFills);
    const summary = calculateSummary(filteredFills, dailyPnL);
    
    // Calculate stats
    const sortedDays = [...dailyPnL].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    let currentStreak = 0;
    for (const day of sortedDays) {
      if (day.pnl > 0) currentStreak++;
      else if (day.pnl < 0) break;
    }
    
    let bestDayPnl = 0;
    dailyPnL.forEach(day => {
      if (day.pnl > bestDayPnl) bestDayPnl = day.pnl;
    });
    
    const last14Days = [...dailyPnL]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14);
    
    const isProfitable = summary.totalPnl >= 0;
    const profitColor = '#22c55e';
    const lossColor = '#ef4444';
    const mainColor = isProfitable ? profitColor : lossColor;
    
    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            padding: '48px',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #141a24 0%, #1a2332 50%, #0f1419 100%)',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '12px',
                background: 'rgba(34, 197, 94, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                  <polyline points="17 6 23 6 23 12"></polyline>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '24px', fontWeight: 600, color: '#fff' }}>Hyperliquid</span>
                <span style={{ fontSize: '18px', color: '#9ca3af', fontFamily: 'monospace' }}>{formatAddress(address)}</span>
              </div>
            </div>
            <div style={{
              fontSize: '18px',
              padding: '8px 16px',
              borderRadius: '9999px',
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#22c55e',
              fontWeight: 500,
            }}>
              {marketType === 'all' ? 'All Markets' : marketType === 'perps' ? 'Perps' : 'Spot'}
            </div>
          </div>

          {/* Main PnL */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
            <span style={{ fontSize: '18px', color: '#9ca3af', marginBottom: '8px' }}>Total P&L</span>
            <span style={{
              fontSize: '72px',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: mainColor,
            }}>
              {isProfitable ? '+' : ''}{formatCurrency(summary.totalPnl)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={mainColor} strokeWidth="2">
                {isProfitable ? (
                  <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></>
                ) : (
                  <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></>
                )}
              </svg>
              <span style={{ fontSize: '20px', fontWeight: 500, color: mainColor }}>
                {summary.winRate.toFixed(1)}% Win Rate
              </span>
            </div>
          </div>

          {/* Stats Row - Flexbox instead of Grid */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
            <div style={{
              flex: 1,
              padding: '20px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
            }}>
              <span style={{ fontSize: '14px', color: '#9ca3af', display: 'block', marginBottom: '8px' }}>Total Trades</span>
              <span style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 600, color: '#fff' }}>
                {summary.totalTrades.toLocaleString()}
              </span>
            </div>
            <div style={{
              flex: 1,
              padding: '20px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
            }}>
              <span style={{ fontSize: '14px', color: '#9ca3af', display: 'block', marginBottom: '8px' }}>Volume</span>
              <span style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 600, color: '#fff' }}>
                {formatCurrency(summary.totalVolume)}
              </span>
            </div>
            <div style={{
              flex: 1,
              padding: '20px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
            }}>
              <span style={{ fontSize: '14px', color: '#9ca3af', display: 'block', marginBottom: '8px' }}>🏆 Best Day</span>
              <span style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 600, color: profitColor }}>
                +{formatCurrency(bestDayPnl)}
              </span>
            </div>
            <div style={{
              flex: 1,
              padding: '20px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
            }}>
              <span style={{ fontSize: '14px', color: '#9ca3af', display: 'block', marginBottom: '8px' }}>🎯 Win Streak</span>
              <span style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 600, color: '#fff' }}>
                {currentStreak} days
              </span>
            </div>
          </div>

          {/* Last 14 Days Heat Map */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📅 Last 14 Days
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {last14Days.map((day, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: '40px',
                    borderRadius: '6px',
                    background: day.pnl > 0 
                      ? 'rgba(34, 197, 94, 0.6)' 
                      : day.pnl < 0 
                        ? 'rgba(239, 68, 68, 0.6)' 
                        : 'rgba(255, 255, 255, 0.1)',
                  }}
                />
              ))}
              {/* Fill remaining slots if less than 14 days */}
              {Array.from({ length: Math.max(0, 14 - last14Days.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  style={{
                    flex: 1,
                    height: '40px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.1)',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>14 days ago</span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>Today</span>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '24px',
            marginTop: '24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              Generated on {new Date().toLocaleDateString()}
            </span>
            <span style={{ fontSize: '18px', fontWeight: 500, color: '#22c55e' }}>
              hyperliquid.xyz
            </span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
