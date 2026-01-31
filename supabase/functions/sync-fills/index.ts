import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface HyperliquidFill {
  tid: number
  coin: string
  side: string
  dir: string
  px: string
  sz: string
  closedPnl: string
  fee: string
  feeToken: string
  time: number
  hash: string
  oid: number
  crossed: boolean
  startPosition: string
}

// Fetch fills from Hyperliquid with pagination
async function fetchAllFills(address: string, startTime?: number): Promise<HyperliquidFill[]> {
  const allFills: HyperliquidFill[] = []
  const seenTids = new Set<number>()
  const fixedEndTime = Date.now()
  let currentStart = startTime || 0
  const MAX_ITERATIONS = 10 // Safety limit (10 * 2000 = 20K fills max per sync)
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const body = {
      type: 'userFillsByTime',
      user: address,
      startTime: currentStart,
      endTime: fixedEndTime,
      aggregateByTime: true
    }
    
    console.log(`Fetching fills from ${new Date(currentStart).toISOString()}, iteration ${i + 1}`)
    
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    
    if (!response.ok) {
      console.error(`HL API error: ${response.status}`)
      break
    }
    
    const fills: HyperliquidFill[] = await response.json()
    
    if (!Array.isArray(fills) || fills.length === 0) {
      console.log('No more fills returned')
      break
    }
    
    // Deduplicate and add, track max time
    let newFillsCount = 0
    let maxTime = currentStart
    
    for (const fill of fills) {
      if (!seenTids.has(fill.tid)) {
        seenTids.add(fill.tid)
        allFills.push(fill)
        newFillsCount++
      }
      if (fill.time > maxTime) {
        maxTime = fill.time
      }
    }
    
    console.log(`Got ${fills.length} fills, ${newFillsCount} new. Total: ${allFills.length}`)
    
    // If we got less than 2000, we've reached the end
    if (fills.length < 2000) {
      console.log('Reached end of available fills')
      break
    }
    
    // If no new fills were added, we're stuck at the same timestamp
    if (newFillsCount === 0) {
      currentStart = maxTime + 1
      console.log('No new fills, forcing cursor forward by 1ms')
    } else {
      currentStart = maxTime
    }
  }
  
  return allFills
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { address } = await req.json()
    
    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      return new Response(JSON.stringify({ error: 'Invalid address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const normalizedAddress = address.toLowerCase()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check if we have existing data to do incremental sync
    const { data: tracking } = await supabase
      .from('tracked_addresses')
      .select('last_synced_tid, oldest_tid')
      .eq('address', normalizedAddress)
      .maybeSingle()

    // Determine start time for incremental sync
    let startTime: number | undefined
    if (tracking?.last_synced_tid) {
      // Get the time of the last synced fill to start from there
      const { data: lastFill } = await supabase
        .from('fills')
        .select('time')
        .eq('tid', tracking.last_synced_tid)
        .maybeSingle()
      
      if (lastFill?.time) {
        startTime = lastFill.time
        console.log(`Incremental sync from time ${startTime}`)
      }
    }

    // Fetch fills from Hyperliquid
    const fills = await fetchAllFills(normalizedAddress, startTime)

    if (fills.length === 0 && !tracking) {
      // First time, no fills found
      await supabase.from('tracked_addresses').upsert({
        address: normalizedAddress,
        last_synced_at: new Date().toISOString(),
        total_fills: 0,
        is_active: true
      }, { onConflict: 'address' })

      return new Response(JSON.stringify({ 
        synced: 0, 
        total: 0,
        message: 'No fills found for this address'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (fills.length > 0) {
      // Transform fills for insert
      const fillRows = fills.map((f) => ({
        tid: f.tid,
        user_address: normalizedAddress,
        coin: f.coin,
        side: f.side,
        dir: f.dir,
        px: parseFloat(f.px) || 0,
        sz: parseFloat(f.sz) || 0,
        closed_pnl: parseFloat(f.closedPnl) || 0,
        fee: parseFloat(f.fee) || 0,
        fee_token: f.feeToken,
        time: f.time,
        hash: f.hash,
        oid: f.oid,
        crossed: f.crossed,
        start_position: parseFloat(f.startPosition) || 0
      }))

      // Batch upsert in chunks to avoid payload size limits
      const CHUNK_SIZE = 1000
      let totalInserted = 0
      
      for (let i = 0; i < fillRows.length; i += CHUNK_SIZE) {
        const chunk = fillRows.slice(i, i + CHUNK_SIZE)
        const { error: fillError, count } = await supabase
          .from('fills')
          .upsert(chunk, { 
            onConflict: 'tid',
            ignoreDuplicates: true,
            count: 'exact'
          })

        if (fillError) {
          console.error('Fill insert error:', fillError)
          throw fillError
        }
        
        totalInserted += count || 0
      }
      
      console.log(`Inserted ${totalInserted} fills`)
    }

    // Get updated stats
    const { data: newestFill } = await supabase
      .from('fills')
      .select('tid, time')
      .eq('user_address', normalizedAddress)
      .order('tid', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: oldestFill } = await supabase
      .from('fills')
      .select('tid, time')
      .eq('user_address', normalizedAddress)
      .order('tid', { ascending: true })
      .limit(1)
      .maybeSingle()

    const { count: totalFills } = await supabase
      .from('fills')
      .select('*', { count: 'exact', head: true })
      .eq('user_address', normalizedAddress)

    // Check for gap - if the API's oldest fill is much newer than our oldest stored
    const apiOldestTid = fills.length > 0 ? Math.min(...fills.map(f => f.tid)) : null
    const hasGap = apiOldestTid && oldestFill?.tid && apiOldestTid > oldestFill.tid + 1000

    // Update tracking info
    await supabase.from('tracked_addresses').upsert({
      address: normalizedAddress,
      last_synced_at: new Date().toISOString(),
      last_synced_tid: newestFill?.tid,
      oldest_tid: oldestFill?.tid,
      total_fills: totalFills,
      has_gap: hasGap,
      is_active: true
    }, { onConflict: 'address' })

    return new Response(JSON.stringify({
      synced: fills.length,
      total: totalFills,
      has_gap: hasGap,
      newest_tid: newestFill?.tid,
      oldest_tid: oldestFill?.tid,
      oldest_time: oldestFill?.time,
      newest_time: newestFill?.time
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Sync error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
