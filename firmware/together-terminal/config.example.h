// Copy to config.h (git-ignored) and fill in.
#pragma once

#define WIFI_SSID     "your-wifi"
#define WIFI_PASSWORD "your-password"

// Where the Next.js app is deployed. No trailing slash.
//   local dev on the same Wi-Fi: "http://192.168.1.20:3000"
//   production:                  "https://together.vercel.app"
#define API_BASE "https://together.vercel.app"

// Must match the name the restaurant uses: createBill(keccak256("table-12"), ...)
#define TERMINAL_ID "table-12"
