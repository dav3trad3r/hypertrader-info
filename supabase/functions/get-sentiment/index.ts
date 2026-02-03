import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const SENTIMENT_API_URL = 'https://rnvvopntppbcblrsbztb.supabase.co/functions/v1/sentiment-summary';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if we have cached data that's still fresh
    const { data: cached, error: cacheError } = await supabase
      .from('sentiment_cache')
      .select('*')
      .eq('id', 'current')
      .maybeSingle();

    if (cacheError) {
      console.error('Cache read error:', cacheError);
    }

    const now = Date.now();
    const cachedAt = cached?.fetched_at ? new Date(cached.fetched_at).getTime() : 0;
    const isCacheFresh = cached && (now - cachedAt) < CACHE_DURATION_MS;

    if (isCacheFresh) {
      console.log('Returning cached sentiment data');
      return new Response(JSON.stringify({
        ...cached.data,
        cached: true,
        cached_at: cached.fetched_at,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cache is stale or doesn't exist - fetch fresh data
    console.log('Fetching fresh sentiment data from API');
    
    const response = await fetch(SENTIMENT_API_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      // If fetch fails but we have stale cache, return it
      if (cached) {
        console.log('API fetch failed, returning stale cache');
        return new Response(JSON.stringify({
          ...cached.data,
          cached: true,
          cached_at: cached.fetched_at,
          stale: true,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`API returned ${response.status}`);
    }

    const freshData = await response.json();

    // Update cache
    const { error: upsertError } = await supabase
      .from('sentiment_cache')
      .upsert({
        id: 'current',
        data: freshData,
        fetched_at: new Date().toISOString(),
      });

    if (upsertError) {
      console.error('Cache write error:', upsertError);
    }

    return new Response(JSON.stringify({
      ...freshData,
      cached: false,
      cached_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch sentiment data',
      message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
