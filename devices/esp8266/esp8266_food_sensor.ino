#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <WiFiClient.h>

// Wi-Fi
const char *ssid = "Anirudh’s iPhone";
const char *password = "12345678";

// Update this with the computer IP where backend/server.js is running.
const char *NODE_SERVER_URL = "http://172.20.10.3:3000/api/fooddata";

// ESP8266 board center assignment
const char *DEVICE_ID = "Center A";

// NodeMCU button pins
const int BUTTON_TOTAL_PIN = D5;
const int BUTTON_CONSUME_PIN = D6;

// Running totals
float daily_total_stock = 0.0;
float total_consumed = 0.0;

// Debounce and edge detection
unsigned long lastDebounceTimeTotal = 0;
unsigned long lastDebounceTimeConsume = 0;
const unsigned long debounceDelay = 200;
int lastReadingTotal = HIGH;
int lastReadingConsume = HIGH;
int stableStateTotal = HIGH;
int stableStateConsume = HIGH;

void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(BUTTON_TOTAL_PIN, INPUT_PULLUP);
  pinMode(BUTTON_CONSUME_PIN, INPUT_PULLUP);

  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected. IP: ");
  Serial.println(WiFi.localIP());

  randomSeed(micros());
}

float readSimulatedConsumedWeight() {
  return 5.0;
}

void sendDataToBackend() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return;
  }

  float current_weight = daily_total_stock - total_consumed;
  if (current_weight < 0) {
    current_weight = 0;
  }

  Serial.printf("Sending Data -> Total: %.2f, Consumed: %.2f, Remaining: %.2f\n",
                daily_total_stock, total_consumed, current_weight);

  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["total_weight"] = daily_total_stock;
  doc["consumed_weight"] = total_consumed;
  doc["weight"] = current_weight;

  String payload;
  serializeJson(doc, payload);

  WiFiClient client;
  HTTPClient http;
  if (http.begin(client, NODE_SERVER_URL)) {
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST(payload);

    if (httpCode > 0) {
      String resp = http.getString();
      Serial.printf("Server POST -> %d\n", httpCode);
      Serial.println(resp);
    } else {
      Serial.printf("Server POST failed, error: %s\n",
                    http.errorToString(httpCode).c_str());
    }

    http.end();
  } else {
    Serial.println("Unable to connect to local Node server");
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    WiFi.begin(ssid, password);
  }

  int totalButtonState = digitalRead(BUTTON_TOTAL_PIN);
  int consumeButtonState = digitalRead(BUTTON_CONSUME_PIN);

  if (totalButtonState != lastReadingTotal) {
    lastDebounceTimeTotal = millis();
  }

  if ((millis() - lastDebounceTimeTotal) > debounceDelay &&
      totalButtonState != stableStateTotal) {
    stableStateTotal = totalButtonState;
    if (stableStateTotal == LOW) {
      Serial.println("Button 1 pressed: Adding 10kg to total daily stock");
      daily_total_stock += 10.0;
      sendDataToBackend();
    }
  }
  lastReadingTotal = totalButtonState;

  if (consumeButtonState != lastReadingConsume) {
    lastDebounceTimeConsume = millis();
  }

  if ((millis() - lastDebounceTimeConsume) > debounceDelay &&
      consumeButtonState != stableStateConsume) {
    stableStateConsume = consumeButtonState;
    if (stableStateConsume == LOW) {
      Serial.println("Button 2 pressed: Tracking consumed stock");
      float removedStock = readSimulatedConsumedWeight();
      total_consumed += removedStock;
      sendDataToBackend();
    }
  }
  lastReadingConsume = consumeButtonState;

  delay(20);
}
