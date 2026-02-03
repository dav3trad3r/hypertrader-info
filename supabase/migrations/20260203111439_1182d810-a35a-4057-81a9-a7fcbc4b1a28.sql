-- Create table to cache sentiment data
CREATE TABLE public.sentiment_cache (
  id TEXT PRIMARY KEY DEFAULT 'current',
  data JSONB NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sentiment_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read sentiment cache (public data)
CREATE POLICY "Anyone can read sentiment cache"
  ON public.sentiment_cache
  FOR SELECT
  USING (true);

-- Only service role can update cache
CREATE POLICY "Service role can manage sentiment cache"
  ON public.sentiment_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');