-- Run this migration in Supabase SQL Editor if using Supabase Cloud
-- Adds multi-item support for 5 commodities: Rice, Sugar, Wheat, Toor Dal, Palm Oil

ALTER TABLE public."Food_Stock_Data"
ADD COLUMN IF NOT EXISTS item_name TEXT DEFAULT 'Rice';

-- Optional index for faster 24-hour analytics queries
CREATE INDEX IF NOT EXISTS idx_food_stock_device_item_time 
ON public."Food_Stock_Data" (device_id, item_name, created_at DESC);
