-- Table to track addresses we're syncing fills for
CREATE TABLE public.tracked_addresses (
  address TEXT PRIMARY KEY,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMP WITH TIME ZONE,
  last_synced_tid BIGINT,
  oldest_tid BIGINT,
  total_fills INTEGER DEFAULT 0,
  has_gap BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true
);

-- Add index for active addresses
CREATE INDEX idx_tracked_addresses_active ON public.tracked_addresses(is_active) WHERE is_active = true;

-- Table to store all fills (trades)
CREATE TABLE public.fills (
  tid BIGINT PRIMARY KEY,
  user_address TEXT NOT NULL,
  coin TEXT NOT NULL,
  side TEXT NOT NULL,
  dir TEXT,
  px NUMERIC NOT NULL,
  sz NUMERIC NOT NULL,
  closed_pnl NUMERIC DEFAULT 0,
  fee NUMERIC DEFAULT 0,
  fee_token TEXT,
  time BIGINT NOT NULL,
  hash TEXT,
  oid BIGINT,
  crossed BOOLEAN DEFAULT false,
  start_position NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_fills_user_address ON public.fills(user_address);
CREATE INDEX idx_fills_user_time ON public.fills(user_address, time DESC);
CREATE INDEX idx_fills_user_coin ON public.fills(user_address, coin);
CREATE INDEX idx_fills_tid ON public.fills(tid DESC);

-- Add foreign key relationship (soft - no constraint to avoid issues)
COMMENT ON TABLE public.fills IS 'Stores trading fills from Hyperliquid API. tid is the unique trade ID.';
COMMENT ON TABLE public.tracked_addresses IS 'Tracks addresses we are syncing fills for and their sync status.';

-- Enable RLS but allow public read (this is public trading data)
ALTER TABLE public.tracked_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fills ENABLE ROW LEVEL SECURITY;

-- Public read access (trading data is public on Hyperliquid)
CREATE POLICY "Anyone can read tracked addresses"
  ON public.tracked_addresses FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read fills"
  ON public.fills FOR SELECT
  USING (true);

-- Only service role can insert/update (edge functions)
CREATE POLICY "Service role can manage tracked addresses"
  ON public.tracked_addresses FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can manage fills"
  ON public.fills FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');