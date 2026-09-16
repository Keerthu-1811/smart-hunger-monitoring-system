#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <HX711.h>

// ----------------------------------------------------------
// 1. CONFIGURATION
// ----------------------------------------------------------

// WiFi credentials
const char* WIFI_SSID     = "OPPOA785G";
const char* WIFI_PASSWORD = "Alain1811";

// Backend URL — posts to M2 scale endpoint (updates dashboard weight input, NOT inventory)
const char* SERVER_URL = "http://10.118.37.248:3000/api/m2-weight";

// Shop
const char* SHOP_ID = "Shop 1 (Central Hub)";

// Commodity
const char* ITEM_NAME = "Rice";

// HX711 GPIO pins
#define DATA_PIN  18
#define CLOCK_PIN 17

// Push button
#define BUTTON_PIN 4

// ----- CALIBRATION -----
#define CALIBRATION_MODE false
float CALIBRATION_FACTOR = 300000;

// Total container capacity
const float CONTAINER_CAPACITY_KG = 100.0;

// Number of readings to average
const int NUM_SAMPLES = 5;

// ----------------------------------------------------------
// 2. GLOBALS
// ----------------------------------------------------------

HX711 scale;

float daily_total_stock = CONTAINER_CAPACITY_KG;

// Used to detect a new button press
bool lastButtonState = HIGH;

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
        Serial.printf(
            "\n[WiFi] Connected! IP: %s\n",
            WiFi.localIP().toString().c_str()
        );
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

    if (consumed < 0)
        consumed = 0;

    StaticJsonDocument<256> doc;

    doc["device_id"]       = SHOP_ID;
    doc["item_name"]       = ITEM_NAME;
    doc["weight"]          = round(currentWeight * 100.0) / 100.0;
    doc["total_weight"]    = daily_total_stock;
    doc["consumed_weight"] = round(consumed * 100.0) / 100.0;

    String payload;

    serializeJson(doc, payload);

    Serial.printf(
        "[HTTP] -> %s | %s | %.2f kg\n",
        SHOP_ID,
        ITEM_NAME,
        currentWeight
    );

    Serial.println("        Payload: " + payload);

    WiFiClient client;
    HTTPClient http;

    if (http.begin(client, SERVER_URL)) {

        http.addHeader("Content-Type", "application/json");

        int code = http.POST(payload);

        if (code > 0) {

            Serial.printf(
                "[HTTP] Response %d: %s\n",
                code,
                http.getString().c_str()
            );

        } else {

            Serial.printf(
                "[HTTP] POST failed: %s\n",
                HTTPClient::errorToString(code).c_str()
            );
        }

        http.end();

    } else {

        Serial.println(
            "[HTTP] Cannot connect. Check SERVER_URL and PC IP."
        );
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

    // HX711 setup
    scale.begin(DATA_PIN, CLOCK_PIN);

    scale.set_scale(CALIBRATION_FACTOR);

    scale.tare();

    Serial.println("[Scale] HX711 ready. Tare complete.");

    // Push button setup
    pinMode(BUTTON_PIN, INPUT_PULLUP);

    Serial.println("[Button] Ready on GPIO 4.");

    // Calibration mode
    if (CALIBRATION_MODE) {

        Serial.println(
            "[CAL] Place a known weight and watch the readings."
        );

        Serial.println(
            "[CAL] Tune CALIBRATION_FACTOR until value matches."
        );
    }

    // WiFi
    connectWiFi();
}

// ----------------------------------------------------------
// 6. LOOP
// ----------------------------------------------------------

void loop() {

    // ------------------------------------------------------
    // Auto-reconnect WiFi
    // ------------------------------------------------------

    if (WiFi.status() != WL_CONNECTED) {

        Serial.println(
            "[WiFi] Lost connection. Reconnecting..."
        );

        WiFi.disconnect();

        connectWiFi();
    }

    // ------------------------------------------------------
    // Check HX711
    // ------------------------------------------------------

    if (!scale.is_ready()) {

        Serial.println(
            "[Scale] HX711 not ready, waiting..."
        );

        delay(200);

        return;
    }

    // ------------------------------------------------------
    // CALIBRATION MODE
    // ------------------------------------------------------

    if (CALIBRATION_MODE) {

        long raw = scale.read_average(5);

        float kg = scale.get_units(5);

        Serial.printf(
            "[CAL] Raw: %ld | Scaled: %.3f kg | Factor: %.1f\n",
            raw,
            kg,
            CALIBRATION_FACTOR
        );

        delay(1000);

        return;
    }

    // ------------------------------------------------------
    // NORMAL MODE
    // ------------------------------------------------------

    bool buttonState = digitalRead(BUTTON_PIN);

    // Detect NEW button press
    if (buttonState == LOW && lastButtonState == HIGH) {

        Serial.println("\n[Button] PRESSED!");
        Serial.println("[Scale] Taking 5 measurements...");

        // Small delay to allow the scale/load to settle
        delay(300);

        // --------------------------------------------------
        // Take 5 measurements and calculate average
        // --------------------------------------------------

        float total = 0;

        for (int i = 0; i < NUM_SAMPLES; i++) {

            float reading = scale.get_units(1);

            if (reading < 0)
                reading = 0.0;

            total += reading;

            Serial.printf(
                "[Scale] Reading %d/%d: %.2f kg\n",
                i + 1,
                NUM_SAMPLES,
                reading
            );

            delay(100);
        }

        float weightKg = total / NUM_SAMPLES;

        Serial.println("------------------------------");

        Serial.printf(
            "[Scale] AVERAGE WEIGHT: %.2f kg\n",
            weightKg
        );

        Serial.println("------------------------------");

        // Send ONE averaged measurement
        sendToBackend(weightKg);

        Serial.println(
            "[Scale] Measurement complete.\n"
        );
    }

    // Remember current button state
    lastButtonState = buttonState;

    delay(50);
}