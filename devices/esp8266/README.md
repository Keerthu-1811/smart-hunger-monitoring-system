ESP8266 Food Sensor
====================

Files:
- `esp8266_food_sensor.ino` - Arduino sketch for the ESP8266 board.

Center assignment:
- ESP8266 board uses `DEVICE_ID = "Center A"`.

Quick setup:
1. Open `esp8266_food_sensor.ino` in Arduino IDE.
2. Replace `YOUR_WIFI_NAME`, `YOUR_WIFI_PASSWORD`, and `NODE_SERVER_URL`.
   - `NODE_SERVER_URL` example: `http://192.168.1.50:3000/api/fooddata`
3. Wire buttons (active-LOW with `INPUT_PULLUP`):
   - Add stock button on D5
   - Consume stock button on D6
4. Flash and open Serial Monitor at 115200 baud.

Data path:
- ESP8266 firmware posts JSON to Node backend (`/api/fooddata`).
- Backend inserts into Supabase table `Food_Stock_Data`.

Payload sent:
- `device_id`
- `total_weight`
- `consumed_weight`
- `weight`
