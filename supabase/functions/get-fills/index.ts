import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const address = url.searchParams.get('address')
    const startTime = url.searchParams.get('startTime')
    const endTime = url.searchParams.get('endTime')
    const limit = url.searchParams.get('limit')
    const offset = url.searchParams.get('offset')

    if (!address) {
      return new Response(JSON.stringify({ error: 'Address required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const normalizedAddress = address.toLowerCase()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Build query
    let query = supabase
      .from('fills')
      .select('*', { count: 'exact' })
      .eq('user_address', normalizedAddress)
      .order('time', { ascending: false })

    if (startTime) {
      query = query.gte('time', parseInt(startTime))
    }
    if (endTime) {
      query = query.lte('time', parseInt(endTime))
    }
    if (limit) {
      query = query.limit(parseInt(limit))
    }
    if (offset && limit) {
      query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
    }

    const { data: fills, error, count } = await query

    if (error) throw error

    // Get tracking info
    const { data: tracking } = await supabase
      .from('tracked_addresses')
      .select('*')
      .eq('address', normalizedAddress)
      .maybeSingle()

    // Transform back to camelCase for frontend compatibility
    const transformedFills = (fills || []).map((f: Record<string, unknown>) => ({
      tid: f.tid,
      coin: f.coin,
      side: f.side,
      dir: f.dir,
      px: String(f.px),
      sz: String(f.sz),
      closedPnl: String(f.closed_pnl || '0'),
      fee: String(f.fee || '0'),
      feeToken: f.fee_token,
      time: f.time,
      hash: f.hash,
      oid: f.oid,
      crossed: f.crossed,
      startPosition: String(f.start_position || '0')
    }))

    return new Response(JSON.stringify({
      fills: transformedFills,
      tracking: tracking,
      count: count || 0,
      hasMore: limit ? (count || 0) > (parseInt(offset || '0') + parseInt(limit)) : false
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Get fills error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
