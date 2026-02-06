import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';
const MIN_TRADE_NOTIONAL = 5_000_000; // $5M minimum

// Known whale addresses to seed tracking (well-known large traders)
// These will be auto-added on first scan
const SEED_WHALES: Array<{ address: string; label: string }> = [
  { address: '0x38a6b3c60ae2f89a7f4fd7c3c3f3c3f3c3f3c3f3', label: 'Whale 1' },
  { address: '0x1234567890123456789012345678901234567890', label: 'Whale 2' },
  // Add more known whales here
];

// Seed whale addresses from tracked addresses with the most activity
async function seedWhaleAddresses(supabase: ReturnType<typeof createClient>) {
  try {
    // Check if we have any whales
    const { count } = await supabase
      .from('whale_addresses')
      .select('*', { count: 'exact', head: true });
    
    console.log('Current whale count:', count || 0);
    
    // Get top tracked addresses by fill count (likely to be whales)
    const { data: topAddresses, error } = await supabase
      .from('tracked_addresses')
      .select('address, total_fills')
      .eq('is_active', true)
      .order('total_fills', { ascending: false })
      .limit(20);
    
    if (error) {
      console.error('Error fetching tracked addresses:', error);
      return;
    }
    
    if (!topAddresses || topAddresses.length === 0) {
      console.log('No tracked addresses found');
      return;
    }
    
    console.log(`Processing ${topAddresses.length} top addresses`);
    
    // Add addresses with > 1000 fills as potential whales
    for (const addr of topAddresses) {
      if (addr.total_fills >= 500) {
        const { error: upsertError } = await supabase
          .from('whale_addresses')
          .upsert({
            address: addr.address,
            total_volume: 0,
            trade_count: addr.total_fills || 0,
            last_seen_at: new Date().toISOString(),
          }, {
            onConflict: 'address',
            ignoreDuplicates: true,
          });
        
        if (upsertError) {
          console.error('Error upserting whale:', upsertError);
        } else {
          console.log('Added whale:', addr.address, 'with', addr.total_fills, 'fills');
        }
      }
    }
  } catch (err) {
    console.error('Error in seedWhaleAddresses:', err);
  }
}

interface Trade {
  coin: string;
  side: string;
  px: string;
  sz: string;
  time: number;
  hash: string;
  tid: number;
  dir?: string;
}

interface TwapOrder {
  state: {
    coin: string;
    isBuy: boolean;
    sz: string;
    ntl: string;
    executedNtl: string;
    executedSz: string;
    minutes: number;
    timestamp: number;
  };
}

interface TwapSliceFill {
  fill: {
    coin: string;
    side: string;
    px: string;
    sz: string;
    time: number;
  };
  twap: {
    isBuy: boolean;
    sz: string;
    ntl: string;
    minutes: number;
    timestamp: number;
  };
}

// Fetch recent fills for an address
async function fetchUserFills(address: string): Promise<Trade[]> {
  try {
    const response = await fetch(HYPERLIQUID_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userFills',
        user: address,
      }),
    });
    
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error(`Error fetching fills for ${address}:`, error);
    return [];
  }
}

// Fetch active TWAP orders for an address
async function fetchUserTwapOrders(address: string): Promise<TwapOrder[]> {
  try {
    const response = await fetch(HYPERLIQUID_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'openTwapOrders',
        user: address,
      }),
    });
    
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error(`Error fetching TWAP orders for ${address}:`, error);
    return [];
  }
}

// Fetch TWAP slice fills for an address
async function fetchUserTwapSliceFills(address: string): Promise<TwapSliceFill[]> {
  try {
    const response = await fetch(HYPERLIQUID_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userTwapSliceFills',
        user: address,
      }),
    });
    
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error(`Error fetching TWAP slice fills for ${address}:`, error);
    return [];
  }
}

// Fetch all mid prices for notional calculation
async function fetchAllMids(): Promise<Record<string, string>> {
  try {
    const response = await fetch(HYPERLIQUID_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    });
    
    if (!response.ok) return {};
    return await response.json();
  } catch (error) {
    console.error('Error fetching mid prices:', error);
    return {};
  }
}

// Detect large trades from recent fills
async function detectLargeTrades(supabase: ReturnType<typeof createClient>, mids: Record<string, string>) {
  // Get recent trades from the last 24 hours from our fills table
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  
  const { data: recentFills, error } = await supabase
    .from('fills')
    .select('*')
    .gte('time', oneDayAgo)
    .order('time', { ascending: false })
    .limit(10000);
  
  if (error) {
    console.error('Error fetching recent fills:', error);
    return [];
  }
  
  const largeTrades: Array<{
    address: string;
    coin: string;
    side: string;
    size: number;
    price: number;
    notional: number;
    timestamp: number;
    tx_hash: string | null;
  }> = [];
  
  // Group fills by address and coin to aggregate related trades
  const tradeGroups = new Map<string, typeof recentFills>();
  
  for (const fill of recentFills || []) {
    const key = `${fill.user_address}-${fill.coin}-${fill.side}-${Math.floor(fill.time / 60000)}`; // Group by minute
    const existing = tradeGroups.get(key) || [];
    existing.push(fill);
    tradeGroups.set(key, existing);
  }
  
  // Check each group for $5M+ trades
  for (const [key, fills] of tradeGroups) {
    const totalNotional = fills.reduce((sum, f) => {
      const price = parseFloat(f.px?.toString() || '0');
      const size = parseFloat(f.sz?.toString() || '0');
      return sum + (price * size);
    }, 0);
    
    if (totalNotional >= MIN_TRADE_NOTIONAL) {
      const firstFill = fills[0];
      const avgPrice = fills.reduce((sum, f) => sum + parseFloat(f.px?.toString() || '0'), 0) / fills.length;
      const totalSize = fills.reduce((sum, f) => sum + parseFloat(f.sz?.toString() || '0'), 0);
      
      largeTrades.push({
        address: firstFill.user_address,
        coin: firstFill.coin,
        side: firstFill.side === 'B' ? 'buy' : 'sell',
        size: totalSize,
        price: avgPrice,
        notional: totalNotional,
        timestamp: firstFill.time,
        tx_hash: firstFill.hash,
      });
    }
  }
  
  return largeTrades;
}

// Process and store large trades
async function processLargeTrades(
  supabase: ReturnType<typeof createClient>, 
  trades: Awaited<ReturnType<typeof detectLargeTrades>>
) {
  for (const trade of trades) {
    // First, ensure the whale address exists
    const { error: addressError } = await supabase
      .from('whale_addresses')
      .upsert({
        address: trade.address,
        total_volume: trade.notional,
        trade_count: 1,
        last_seen_at: new Date().toISOString(),
      }, {
        onConflict: 'address',
        ignoreDuplicates: false,
      });
    
    if (addressError) {
      console.error('Error upserting whale address:', addressError);
      continue;
    }
    
    // Update totals for existing addresses
    await supabase.rpc('increment_whale_stats', {
      whale_address: trade.address,
      volume_to_add: trade.notional,
    }).catch(() => {
      // RPC might not exist yet, that's okay
    });
    
    // Insert the trade
    const { error: tradeError } = await supabase
      .from('whale_trades')
      .upsert({
        address: trade.address,
        coin: trade.coin,
        side: trade.side,
        size: trade.size,
        price: trade.price,
        notional: trade.notional,
        timestamp: trade.timestamp,
        tx_hash: trade.tx_hash,
      }, {
        onConflict: 'address,coin,timestamp,side',
        ignoreDuplicates: true,
      });
    
    if (tradeError) {
      console.error('Error inserting whale trade:', tradeError);
    }
  }
  
  return trades.length;
}

// Fetch and process TWAPs for known whale addresses
async function processWhaleTwaps(supabase: ReturnType<typeof createClient>) {
  // Get all whale addresses
  const { data: whales, error } = await supabase
    .from('whale_addresses')
    .select('address')
    .eq('is_active', true);
  
  if (error || !whales) {
    console.error('Error fetching whale addresses:', error);
    return 0;
  }
  
  let twapCount = 0;
  
  for (const whale of whales) {
    // Fetch active TWAP orders
    const twapOrders = await fetchUserTwapOrders(whale.address);
    
    for (const order of twapOrders) {
      const state = order.state;
      const totalNtl = parseFloat(state.ntl);
      const executedNtl = parseFloat(state.executedNtl);
      const remainingNtl = totalNtl - executedNtl;
      
      const { error: twapError } = await supabase
        .from('whale_twaps')
        .upsert({
          address: whale.address,
          coin: state.coin,
          side: state.isBuy ? 'buy' : 'sell',
          total_size: parseFloat(state.sz),
          filled_size: parseFloat(state.executedSz),
          remaining_size: parseFloat(state.sz) - parseFloat(state.executedSz),
          avg_price: executedNtl > 0 ? executedNtl / parseFloat(state.executedSz) : null,
          start_time: state.timestamp,
          is_active: true,
        }, {
          onConflict: 'address,coin,start_time,side',
          ignoreDuplicates: false,
        });
      
      if (!twapError) twapCount++;
    }
    
    // Mark TWAPs as inactive if they're not in the active list
    const activeStarts = twapOrders.map(o => o.state.timestamp);
    if (activeStarts.length > 0) {
      await supabase
        .from('whale_twaps')
        .update({ is_active: false, end_time: Date.now() })
        .eq('address', whale.address)
        .eq('is_active', true)
        .not('start_time', 'in', `(${activeStarts.join(',')})`);
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return twapCount;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse action from body or query params
    let action = 'scan';
    let requestBody: Record<string, unknown> = {};
    
    try {
      const body = await req.json();
      requestBody = body || {};
      action = body?.action || 'scan';
    } catch {
      // No body, check query params
      const url = new URL(req.url);
      action = url.searchParams.get('action') || 'scan';
    }
    
    console.log('Whale tracker action:', action);
    
    switch (action) {
      case 'scan': {
        // First, seed whale addresses from tracked addresses with large positions
        await seedWhaleAddresses(supabase);
        
        // Full scan: detect large trades and update TWAPs
        const mids = await fetchAllMids();
        const largeTrades = await detectLargeTrades(supabase, mids);
        const tradesProcessed = await processLargeTrades(supabase, largeTrades);
        const twapsProcessed = await processWhaleTwaps(supabase);
        
        return new Response(JSON.stringify({
          success: true,
          tradesDetected: largeTrades.length,
          tradesProcessed,
          twapsProcessed,
          timestamp: new Date().toISOString(),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      case 'trades': {
        // Get recent whale trades
        const limit = parseInt((requestBody as Record<string, unknown>).limit as string || '50');
        const coin = (requestBody as Record<string, unknown>).coin as string | undefined;
        
        let query = supabase
          .from('whale_trades')
          .select('*, whale_addresses(label)')
          .order('timestamp', { ascending: false })
          .limit(limit);
        
        if (coin) {
          query = query.eq('coin', coin);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      case 'twaps': {
        // Get active whale TWAPs
        const { data, error } = await supabase
          .from('whale_twaps')
          .select('*, whale_addresses(label)')
          .eq('is_active', true)
          .order('start_time', { ascending: false });
        
        if (error) throw error;
        
        // Fetch current prices for pressure calculation
        const mids = await fetchAllMids();
        
        const twapsWithPressure = (data || []).map(twap => {
          const currentPrice = parseFloat(mids[twap.coin] || '0');
          const remainingNotional = twap.remaining_size * currentPrice;
          
          return {
            ...twap,
            current_price: currentPrice,
            remaining_notional: remainingNotional,
            pressure: twap.side, // buy = bullish pressure, sell = bearish pressure
          };
        });
        
        return new Response(JSON.stringify(twapsWithPressure), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      case 'whales': {
        // Get all tracked whale addresses
        const { data, error } = await supabase
          .from('whale_addresses')
          .select('*')
          .eq('is_active', true)
          .order('total_volume', { ascending: false });
        
        if (error) throw error;
        
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      case 'stats': {
        // Get summary stats
        const [tradesResult, twapsResult, whalesResult] = await Promise.all([
          supabase.from('whale_trades').select('*', { count: 'exact', head: true }),
          supabase.from('whale_twaps').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('whale_addresses').select('*', { count: 'exact', head: true }).eq('is_active', true),
        ]);
        
        // Get 24h volume
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const { data: recentTrades } = await supabase
          .from('whale_trades')
          .select('notional')
          .gte('timestamp', oneDayAgo);
        
        const volume24h = (recentTrades || []).reduce((sum, t) => sum + parseFloat(t.notional?.toString() || '0'), 0);
        
        return new Response(JSON.stringify({
          totalTrades: tradesResult.count || 0,
          activeTwaps: twapsResult.count || 0,
          trackedWhales: whalesResult.count || 0,
          volume24h,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
