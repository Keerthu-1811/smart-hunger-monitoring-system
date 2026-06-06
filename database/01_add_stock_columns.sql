-- Run this in the Supabase SQL Editor
-- This adds the tracking columns requested for the 2-button ESP32 setup

ALTER TABLE public."Food_Stock_Data"
ADD COLUMN IF NOT EXISTS total_weight NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS consumed_weight NUMERIC DEFAULT 0;
