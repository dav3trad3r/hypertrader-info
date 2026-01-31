-- Add usage tracking columns to tracked_addresses
ALTER TABLE public.tracked_addresses
ADD COLUMN last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN access_count INTEGER DEFAULT 1;