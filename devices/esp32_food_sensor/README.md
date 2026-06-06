ESP32 Food Sensor
==================

Files:
- `esp32_food_sensor.ino` - Arduino sketch for both ESP32 boards.

Quick setup:
1. Open `esp32_food_sensor.ino` in Arduino IDE or PlatformIO.
2. Replace `YOUR_WIFI_NAME`, `YOUR_WIFI_PASSWORD`, and `NODE_SERVER_URL`.
   - `NODE_SERVER_URL` example: `http://192.168.1.50:3000/api/fooddata`
3. Set center assignment inside sketch using `ESP32_NODE_INDEX`:
   - `ESP32_NODE_INDEX 1` -> `Center B` (ESP32 board #1)
   - `ESP32_NODE_INDEX 2` -> `Center C` (ESP32 board #2)
4. Wire the push buttons as active-LOW inputs:
   - Add stock button on GPIO 18
   - Consume stock button on GPIO 19
   - Both use `INPUT_PULLUP`, so each button should short GPIO to GND when pressed.
5. Default behavior in firmware:
   - Button 1 adds +10 kg to total stock.
   - Button 2 adds +5 kg to consumed stock.
   - Remaining stock is computed as `total_weight - consumed_weight`.
6. If using a load cell + HX711, replace `readSimulatedConsumedWeight()` with HX711 read logic.
   - Use the HX711 library (`HX711.h`) and calibrate to return kilograms.
7. Flash the board and open Serial Monitor (115200) to observe posts.

Data path used by this project:
- ESP32 firmware posts JSON to Node backend (`/api/fooddata`).
- Center naming plan across all boards:
   - ESP8266 board -> `Center A`
   - ESP32 board #1 -> `Center B`
   - ESP32 board #2 -> `Center C`
- Backend (`backend/server.js`) inserts into Supabase table `Food_Stock_Data`.
- Frontend polls backend (`/api/data`) every 5 seconds.

Manual test (simulate an ESP post):

```bash
curl -X POST http://<HOST>:3000/api/fooddata \
  -H "Content-Type: application/json" \
  -d '{"device_id":"ESP32-test","weight":4.25}'
```

Next steps:
- Flash both ESP32 boards and confirm `Center B` and `Center C` appear on dashboard.
- If needed, add HX711 integration once pin map and calibration factor are available.