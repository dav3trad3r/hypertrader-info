import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory cache with TTL
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 30000; // 30 seconds cache

// Rate limiting - track requests per address
const requestCounts = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per minute per address

// Request queue for rate-limited requests
interface QueuedRequest {
  resolve: (value: Response) => void;
  reject: (error: Error) => void;
  payload: unknown;
  cacheKey: string;
}

const requestQueue: QueuedRequest[] = [];
let isProcessingQueue = false;

// Global rate limit for Hyperliquid API
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 100; // 100ms between requests to Hyperliquid

async function processQueue(): Promise<void> {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest));
    }
    
    const request = requestQueue.shift();
    if (!request) continue;
    
    try {
      const response = await makeHyperliquidRequest(request.payload, request.cacheKey);
      request.resolve(response);
    } catch (error) {
      request.reject(error as Error);
    }
    
    lastRequestTime = Date.now();
  }
  
  isProcessingQueue = false;
}

async function makeHyperliquidRequest(payload: unknown, cacheKey: string): Promise<Response> {
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`Cache hit for ${cacheKey}`);
    return new Response(JSON.stringify(cached.data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
    });
  }

  // Make request to Hyperliquid
  const response = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Cache the response
  cache.set(cacheKey, { data, timestamp: Date.now() });
  console.log(`Cache miss, stored ${cacheKey}`);

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
  });
}

function checkRateLimit(address: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(address);
  
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(address, { count: 1, windowStart: now });
    return true;
  }
  
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  record.count++;
  return true;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, user } = payload;
    
    // Extract address for rate limiting
    const address = user || 'anonymous';
    
    // Check rate limit
    if (!checkRateLimit(address)) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded. Please wait before making more requests.',
        retryAfter: 60 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }
    
    // Create cache key from payload
    const cacheKey = JSON.stringify(payload);
    
    // Check if we can serve from cache immediately
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      });
    }
    
    // Queue the request
    const response = await new Promise<Response>((resolve, reject) => {
      requestQueue.push({ resolve, reject, payload, cacheKey });
      processQueue();
    });
    
    return response;
    
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
