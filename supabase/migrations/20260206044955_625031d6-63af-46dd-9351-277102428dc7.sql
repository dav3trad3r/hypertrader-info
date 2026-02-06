-- Table to track whale addresses (auto-detected from $5M+ trades)
CREATE TABLE public.whale_addresses (
  address TEXT NOT NULL PRIMARY KEY,
  label TEXT, -- optional human-readable label
  total_volume NUMERIC DEFAULT 0, -- cumulative trade volume
  trade_count INTEGER DEFAULT 0,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.whale_addresses ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read whale addresses" 
ON public.whale_addresses 
FOR SELECT 
USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage whale addresses" 
ON public.whale_addresses 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Table to store large trades ($5M+)
CREATE TABLE public.whale_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT NOT NULL REFERENCES public.whale_addresses(address) ON DELETE CASCADE,
  coin TEXT NOT NULL,
  side TEXT NOT NULL, -- 'buy' or 'sell'
  size NUMERIC NOT NULL, -- token amount
  price NUMERIC NOT NULL,
  notional NUMERIC NOT NULL, -- USD value
  timestamp BIGINT NOT NULL, -- unix ms
  tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(address, coin, timestamp, side)
);

-- Enable RLS
ALTER TABLE public.whale_trades ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read whale trades" 
ON public.whale_trades 
FOR SELECT 
USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage whale trades" 
ON public.whale_trades 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Index for efficient queries
CREATE INDEX idx_whale_trades_timestamp ON public.whale_trades(timestamp DESC);
CREATE INDEX idx_whale_trades_coin ON public.whale_trades(coin);
CREATE INDEX idx_whale_trades_address ON public.whale_trades(address);

-- Table to track active whale TWAPs
CREATE TABLE public.whale_twaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT NOT NULL REFERENCES public.whale_addresses(address) ON DELETE CASCADE,
  coin TEXT NOT NULL,
  side TEXT NOT NULL, -- 'buy' or 'sell'
  total_size NUMERIC NOT NULL,
  filled_size NUMERIC DEFAULT 0,
  remaining_size NUMERIC NOT NULL,
  avg_price NUMERIC,
  start_time BIGINT NOT NULL, -- unix ms
  end_time BIGINT, -- unix ms, null if still active
  is_active BOOLEAN DEFAULT true,
  last_fill_time BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(address, coin, start_time, side)
);

-- Enable RLS
ALTER TABLE public.whale_twaps ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read whale twaps" 
ON public.whale_twaps 
FOR SELECT 
USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage whale twaps" 
ON public.whale_twaps 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Index for efficient queries
CREATE INDEX idx_whale_twaps_active ON public.whale_twaps(is_active) WHERE is_active = true;
CREATE INDEX idx_whale_twaps_coin ON public.whale_twaps(coin);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_whale_twaps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for automatic timestamp updates
CREATE TRIGGER update_whale_twaps_updated_at
BEFORE UPDATE ON public.whale_twaps
FOR EACH ROW
EXECUTE FUNCTION public.update_whale_twaps_updated_at();