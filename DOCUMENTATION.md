# Smart Hunger IoT - Current Documentation

## Overview
This project monitors food stock levels for multiple distribution centers using microcontroller devices and a web dashboard.

## Active Data Flow
1. Device firmware posts JSON to backend endpoint `POST /api/fooddata`.
2. Backend stores records in Supabase table `Food_Stock_Data` using `@supabase/supabase-js`.
3. Frontend dashboard polls backend `GET /api/data` every 5 seconds for analytics and alerts.

## Payload Contract (`/api/fooddata`)
Expected JSON fields:
- `device_id` (string, required)
- `weight` (number, required)
- `total_weight` (number, optional, defaults to 0 in backend)
- `consumed_weight` (number, optional, defaults to 0 in backend)

## Device Firmware Layout

ESP8266 firmware:
- File: `devices/esp8266/esp8266_food_sensor.ino`
- Center assignment: `Center A`
- Button pins: D5 (add stock), D6 (consume stock)

ESP32 firmware:
- File: `devices/esp32/esp32_food_sensor.ino`
- Center assignment via `ESP32_NODE_INDEX`:
	- `1` -> `Center B`
	- `2` -> `Center C`
- Button pins: GPIO 18 (add stock), GPIO 19 (consume stock)

Shared behavior (both sketches):
- Add button increases `total_weight` by `+10 kg`.
- Consume button increases `consumed_weight` by `+5 kg` (simulated).
- Remaining stock is computed on device as `weight = max(total_weight - consumed_weight, 0)`.
- On each button event, firmware sends updated payload to backend.

Required firmware config values before flashing:
- `YOUR_WIFI_NAME`
- `YOUR_WIFI_PASSWORD`
- `NODE_SERVER_URL` (example: `http://192.168.1.50:3000/api/fooddata`)
- `NODE_SERVER_URL` must include `http://` and your computer LAN IP. Do not use `localhost` in device firmware.

## Cleanup Performed
Removed files that were redundant or unused:
- `devices/esp32/esp32_food_sensor_direct_supabase.ino` (legacy duplicate, ESP8266-specific implementation)
- `backend/routes` (empty unused file)

Added files for clear board split:
- `devices/esp8266/esp8266_food_sensor.ino`
- `devices/esp8266/README.md`

## Backend Notes
- Backend entrypoint: `backend/server.js`
- Server port: `3000`
- Supabase credentials expected in `backend/.env` as:
	- `SUPABASE_URL`
	- `SUPABASE_KEY`

## Frontend Notes
- Frontend files are in `frontend/`
- Dashboard fetches from `http://localhost:3000/api/data`