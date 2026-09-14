// ============================================================
//  Smart Hunger IoT -- ESP32 + HX711 Load Cell Firmware
//  Reads real weight from a load cell via HX711 amplifier
//  and POSTs readings to the Node.js backend every interval.
//
//  Libraries required (install via Arduino Library Manager):
//    - HX711 by bogde           -> search "HX711 Arduino Library"
//    - ArduinoJson by bblanchon -> search "ArduinoJson"
//
//  Wiring:
//    HX711 DOUT -> GPIO 16  (DATA_PIN below)
//    HX711 SCK  -> GPIO 17  (CLOCK_PIN below)
//    HX711 VCC  -> 3.3V
//    HX711 GND  -> GND
//    Load cell wires -> HX711 E+, E-, A+, A-  (see your cell datasheet)
// ============================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <HX711.h>

// ----------------------------------------------------------
// 1. CONFIGURATION -- EDIT THESE FOR EACH ESP32 UNIT
// ----------------------------------------------------------

// WiFi credentials
const char* WIFI_SSID     = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";

// Your PC local IP (run `ipconfig` on Windows to find it)
// e.g. "http://192.168.1.5:3000/api/fooddata"
const char* SERVER_URL = "http://192.168.1.100:3000/api/fooddata";

// Shop this device is assigned to (must match exactly)
// Options:
//   "Shop 1 (Central Hub)"
//   "Shop 2 (North Market)"
//   "Shop 3 (South Depot)"
//   "Shop 4 (East District)"
//   "Shop 5 (West Center)"
const char* SHOP_ID = "Shop 1 (Central Hub)";

// Commodity this scale measures
// Options: "Rice" | "Sugar" | "Wheat" | "Toor Dal" | "Palm Oil"
const char* ITEM_NAME = "Rice";

// HX711 GPIO pins
#define DATA_PIN  16
#define CLOCK_PIN 17

// ----- CALIBRATION -----
// Set CALIBRATION_MODE to true, upload, place a known weight,
// and adjust CALIBRATION_FACTOR until Serial Monitor shows the
// correct kg. Then set CALIBRATION_MODE false and re-upload.
#define CALIBRATION_MODE  false
float CALIBRATION_FACTOR = -96650.0;  // Negative if reading is inverted

// How often to send a reading (ms)
const unsigned long SEND_INTERVAL_MS = 8000;  // 8 seconds

// Total known capacity of this container (kg or L)
// Used to compute consumed_weight = capacity - current_weight
const float CONTAINER_CAPACITY_KG = 100.0;

// ----------------------------------------------------------
// 2. GLOBALS
// ----------------------------------------------------------
HX711 scale;
float daily_total_stock = CONTAINER_CAPACITY_KG;
unsigned long lastSendTime = 0;

// ----------------------------------------------------------
// 3. WIFI
// ----------------------------------------------------------
void connectWiFi() {
    Serial.printf("\n[WiFi] Connecting to %s", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[WiFi] Failed. Will retry in loop.");
    }
}

// ----------------------------------------------------------
// 4. HTTP POST
// ----------------------------------------------------------
void sendToBackend(float currentWeight) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[HTTP] WiFi disconnected, skipping.");
        return;
    }

    float consumed = daily_total_stock - currentWeight;
    if (consumed < 0) consumed = 0;

    StaticJsonDocument<256> doc;
    doc["device_id"]       = SHOP_ID;
    doc["item_name"]       = ITEM_NAME;
    doc["weight"]          = round(currentWeight * 100.0) / 100.0;
    doc["total_weight"]    = daily_total_stock;
    doc["consumed_weight"] = round(consumed * 100.0) / 100.0;

    String payload;
    serializeJson(doc, payload);

    Serial.printf("[HTTP] -> %s | %s | %.2f kg\n", SHOP_ID, ITEM_NAME, currentWeight);
    Serial.println("        Payload: " + payload);

    HTTPClient http;
    if (http.begin(SERVER_URL)) {
        http.addHeader("Content-Type", "application/json");
        int code = http.POST(payload);
        if (code > 0) {
            Serial.printf("[HTTP] Response %d: %s\n", code, http.getString().c_str());
        } else {
            Serial.printf("[HTTP] POST failed: %s\n", HTTPClient::errorToString(code).c_str());
        }
        http.end();
    } else {
        Serial.println("[HTTP] Cannot connect. Check SERVER_URL and PC IP.");
    }
}

// ----------------------------------------------------------
// 5. SETUP
// ----------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(200);

    Serial.println("\n================================");
    Serial.println(" Smart Hunger IoT - ESP32 Node");
    Serial.printf(" Shop : %s\n", SHOP_ID);
    Serial.printf(" Item : %s\n", ITEM_NAME);
    Serial.println("================================");

    scale.begin(DATA_PIN, CLOCK_PIN);
    scale.set_scale(CALIBRATION_FACTOR);
    scale.tare();  // Zero with nothing on scale
    Serial.println("[Scale] HX711 ready. Tare complete.");

    if (CALIBRATION_MODE) {
        Serial.println("[CAL]  Place a known weight and watch the readings.");
        Serial.println("[CAL]  Tune CALIBRATION_FACTOR until value matches.");
    }

    connectWiFi();
    lastSendTime = millis();
}

// ----------------------------------------------------------
// 6. LOOP
// ----------------------------------------------------------
void loop() {
    // Auto-reconnect WiFi
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WiFi] Lost connection. Reconnecting...");
        WiFi.disconnect();
        connectWiFi();
    }

    if (!scale.is_ready()) {
        Serial.println("[Scale] HX711 not ready, waiting...");
        delay(200);
        return;
    }

    // ---- CALIBRATION MODE ----
    if (CALIBRATION_MODE) {
        long raw   = scale.read_average(5);
        float kg   = scale.get_units(5);
        Serial.printf("[CAL] Raw: %ld  | Scaled: %.3f kg  | Factor: %.1f\n",
                      raw, kg, CALIBRATION_FACTOR);
        delay(1000);
        return;
    }

    // ---- NORMAL MODE ----
    if (millis() - lastSendTime >= SEND_INTERVAL_MS) {
        lastSendTime = millis();

        // Average 10 samples to reduce noise
        float weightKg = scale.get_units(10);
        if (weightKg < 0) weightKg = 0.0;

        Serial.printf("[Scale] Current weight: %.2f kg\n", weightKg);
        sendToBackend(weightKg);
    }

    delay(50);
}
