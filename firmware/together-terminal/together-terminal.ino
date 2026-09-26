/*
 * together. — restaurant table terminal (ESP32-S3 + 240x320 SPI TFT)
 *
 * The terminal is a dumb client: once a second it GETs
 *   {API_BASE}/api/terminal/{TERMINAL_ID}
 * and draws what the JSON says. No keys, no chain access, no money math.
 * Browser twin of this firmware: {API_BASE}/terminal/{TERMINAL_ID}
 *
 * Libraries (Arduino Library Manager):
 *   - TFT_eSPI        (set your pins in TFT_eSPI/User_Setup.h; keep LOAD_GFXFF enabled)
 *   - ArduinoJson     v7
 *   - QRCode          by Richard Moore (ricmoo)
 * Board: "ESP32S3 Dev Module" (esp32 core by Espressif)
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include "qrcode.h"
#include "config.h"

// Colors (RGB565) — match the app's palette.
#define C_BG     0xFFFF  // white
#define C_INK    0x0841  // #0b0b0c
#define C_MUTED  0x8C52  // #8b8b90
#define C_TRACK  0xF7BE  // #f5f5f4
#define C_GREEN  0x250D  // #22a06b
#define C_RED    0xFAC6  // #ff5a36

const unsigned long POLL_MS = 1000;
const unsigned long PAID_HOLD_MS = 15000;  // show PAID this long, then go idle

TFT_eSPI tft;

struct Snapshot {
  bool ok = false;        // last fetch succeeded
  bool hasBill = false;
  String id, code, status, display, qr;
  int participants = 0, joined = 0, paid = 0;
};

Snapshot snap;
String drawnKey;          // what is on screen now; redraw only when it changes
String paidBillId;
unsigned long paidSince = 0;
unsigned long lastPoll = 0;
bool online = false;

// ---------------------------------------------------------------- network

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
}

bool fetchSnapshot(Snapshot &out) {
  if (WiFi.status() != WL_CONNECTED) return false;

  String url = String(API_BASE) + "/api/terminal/" + TERMINAL_ID;
  HTTPClient http;
  WiFiClientSecure secure;
  WiFiClient plain;
  bool https = url.startsWith("https");
  if (https) {
    secure.setInsecure();  // hackathon shortcut: skip certificate pinning
    if (!http.begin(secure, url)) return false;
  } else {
    if (!http.begin(plain, url)) return false;
  }
  http.setTimeout(4000);

  int code = http.GET();
  if (code != 200) {
    http.end();
    return false;
  }
  String body = http.getString();  // handles chunked responses
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body)) return false;

  JsonVariant bill = doc["bill"];
  out.ok = true;
  out.hasBill = !bill.isNull();
  if (out.hasBill) {
    out.id = bill["id"].as<String>();
    out.code = bill["code"].as<String>();
    out.status = bill["status"].as<String>();
    out.display = bill["display"].as<String>();
    out.qr = bill["qr"].as<String>();
    out.participants = bill["participants"] | 0;
    out.joined = bill["joined"] | 0;
    out.paid = bill["paid"] | 0;
  }
  return true;
}

// ---------------------------------------------------------------- drawing

void centerText(const String &s, int y, const GFXfont *font, uint16_t color, uint16_t bg = C_BG) {
  tft.setFreeFont(font);
  tft.setTextColor(color, bg);
  tft.setTextDatum(TC_DATUM);
  tft.drawString(s, tft.width() / 2, y);
}

void statusDot() {
  tft.fillCircle(tft.width() - 8, 8, 3, online ? C_GREEN : C_RED);
}

void drawQr(const String &text, int centerX, int top, int maxSize) {
  QRCode qr;
  const uint8_t version = 5;  // 37x37 modules, ~84 bytes at ECC_MEDIUM
  uint8_t buf[qrcode_getBufferSize(version)];
  qrcode_initText(&qr, buf, version, ECC_MEDIUM, text.c_str());

  int quiet = 2;  // modules of white border
  int scale = maxSize / (qr.size + quiet * 2);
  int size = scale * (qr.size + quiet * 2);
  int x0 = centerX - size / 2, y0 = top;
  tft.fillRect(x0, y0, size, size, TFT_WHITE);
  for (uint8_t y = 0; y < qr.size; y++)
    for (uint8_t x = 0; x < qr.size; x++)
      if (qrcode_getModule(&qr, x, y))
        tft.fillRect(x0 + (x + quiet) * scale, y0 + (y + quiet) * scale, scale, scale, TFT_BLACK);
}

void drawIdle() {
  tft.fillScreen(C_BG);
  centerText("together.", 120, &FreeSansBold18pt7b, C_INK);
  String t = TERMINAL_ID;
  t.toUpperCase();
  centerText(t, 190, &FreeSansBold9pt7b, C_MUTED);
  centerText("Ready", 212, &FreeSans9pt7b, C_MUTED);
}

void drawOpen() {
  tft.fillScreen(C_BG);
  String t = TERMINAL_ID;
  t.toUpperCase();
  centerText(t, 12, &FreeSansBold9pt7b, C_MUTED);
  centerText(snap.display, 34, &FreeSansBold18pt7b, C_INK);
  drawQr(snap.qr, tft.width() / 2, 80, 170);
  centerText("Scan to join", 262, &FreeSansBold12pt7b, C_INK);
  centerText("Bill ID " + snap.code + "  -  " + snap.joined + "/" + snap.participants + " joined", 290, &FreeSans9pt7b, C_MUTED);
}

void drawCollecting() {
  tft.fillScreen(C_BG);
  String t = TERMINAL_ID;
  t.toUpperCase();
  centerText(t, 12, &FreeSansBold9pt7b, C_MUTED);
  centerText(snap.display, 34, &FreeSansBold18pt7b, C_INK);
  centerText(String(snap.paid) + "/" + snap.participants, 120, &FreeSansBold24pt7b, C_INK);
  centerText("paid", 180, &FreeSans12pt7b, C_MUTED);

  int x = 20, w = tft.width() - 40, y = 220, h = 12;
  tft.fillRoundRect(x, y, w, h, h / 2, C_TRACK);
  int fill = snap.participants ? w * snap.paid / snap.participants : 0;
  if (fill > 0) tft.fillRoundRect(x, y, fill, h, h / 2, C_INK);
}

void drawPaid() {
  tft.fillScreen(C_GREEN);
  int cx = tft.width() / 2, cy = 110;
  tft.fillCircle(cx, cy, 40, 0x4E75);  // lighter green disc
  tft.drawWideLine(cx - 18, cy + 2, cx - 5, cy + 16, 7, TFT_WHITE, 0x4E75);
  tft.drawWideLine(cx - 5, cy + 16, cx + 20, cy - 14, 7, TFT_WHITE, 0x4E75);
  centerText("PAID", 170, &FreeSansBold24pt7b, TFT_WHITE, C_GREEN);
  centerText(snap.display, 222, &FreeSansBold12pt7b, TFT_WHITE, C_GREEN);
  centerText("Thank you!", 262, &FreeSans9pt7b, TFT_WHITE, C_GREEN);
}

// Decide which screen to show — same rules as the browser twin.
void render() {
  String screen;
  if (!snap.hasBill || snap.status == "refunded" || snap.status == "expired") {
    screen = "idle";
  } else if (snap.status == "paid") {
    if (paidBillId != snap.id) {
      paidBillId = snap.id;
      paidSince = millis();
    }
    screen = (millis() - paidSince < PAID_HOLD_MS) ? "paid" : "idle";
  } else {
    screen = snap.status;  // "open" | "collecting"
  }

  String key = screen + "|" + snap.id + "|" + snap.joined + "|" + snap.paid + "|" + (online ? "1" : "0");
  if (key == drawnKey) return;  // nothing changed: no flicker
  drawnKey = key;

  if (screen == "paid") drawPaid();
  else if (screen == "open") drawOpen();
  else if (screen == "collecting") drawCollecting();
  else drawIdle();
  if (screen != "paid") statusDot();
}

// ---------------------------------------------------------------- main

void setup() {
  Serial.begin(115200);
  tft.init();
  tft.setRotation(0);  // portrait 240x320
  tft.fillScreen(C_BG);
  centerText("connecting...", 150, &FreeSans9pt7b, C_MUTED);
  connectWifi();
}

void loop() {
  if (millis() - lastPoll >= POLL_MS) {
    lastPoll = millis();
    connectWifi();
    Snapshot next;
    online = fetchSnapshot(next);
    if (online) snap = next;  // on failure keep showing the last good screen
    Serial.printf("[%s] %s %s %d/%d\n", online ? "ok" : "offline", snap.id.c_str(), snap.status.c_str(), snap.paid, snap.participants);
  }
  render();
  delay(20);
}
