# Dev 3 — ESP32 terminal + backend

Read `INTERFACES.md` first — the WebSocket message format there is the spec.

## Part A — Backend (Node, ~150 lines)

Job: watch the contract, keep one snapshot per terminal, push it over WebSocket.

- `viem` `createPublicClient({ chain: monadTestnet, transport: http(RPC) })`
- `watchContractEvent` for `BillCreated`, `ParticipantJoined`, `SharePaid`, `BillSettled`, `BillRefunded`. Monad blocks are fast — poll every ~1s if websocket RPC is flaky.
- On `BillCreated`, map `terminalId → billId`. On every event, rebuild the snapshot (call `getBill()` so you never drift) and send it to that terminal with the matching `event`.
- `ws` server at `/terminal?id=…`. On connect / `hello`, send the current snapshot right away.
- On boot, backfill from `deployBlock` so a restart doesn't lose open bills.
- Amounts → formatted decimal strings (`formatUnits(x, 6)`); the device does no math.
- Deploy anywhere with a public `wss://` URL (Railway, Fly, Render, or ngrok for the demo).

**Test without hardware first:** `npx wscat -c "ws://localhost:8080/terminal?id=…"` and watch snapshots arrive while you pay from the app.

## Part B — ESP32 firmware

Hardware: **ESP32-S3** + a 2.8"–3.5" SPI TFT (ILI9341 320×240 or ST7796 480×320). Portrait orientation.

Libraries (Arduino / PlatformIO):
| Need | Library |
|---|---|
| Display | `TFT_eSPI` (or LVGL if you want smooth animations) |
| QR | `ricmoo/QRCode` (`qrcode.h`) — version 4–5, ECC_MEDIUM |
| WebSocket | `links2004/WebSockets` (supports `wss://`) |
| JSON | `ArduinoJson` v7 |
| Wi-Fi setup | `tzapu/WiFiManager` (captive portal, no hardcoded password) |

Firmware loop: connect Wi-Fi → open WebSocket → send `hello` → on every `state` message, parse and redraw the right screen. Reconnect with backoff on disconnect. Show a small dot in a corner: green = connected, red = offline.

### Screens (match the app: white background, near-black text, huge numbers)

```
IDLE              OPEN                  COLLECTING           PAID
┌──────────┐      ┌──────────┐          ┌──────────┐         ┌──────────┐
│ together.│      │ TABLE 12 │          │ TABLE 12 │         │          │
│          │      │  $0.03   │          │  $0.03   │         │    ✓     │
│ TABLE 12 │      │ ▄▄▄▄▄▄▄▄ │          │          │         │   PAID   │
│          │      │ █ QR   █ │          │   2/3    │         │  $0.03   │
│ Ready    │      │ ▀▀▀▀▀▀▀▀ │          │ ███████░ │         │          │
│          │      │ Scan to  │          │          │         │ Thanks!  │
│          │      │ join 2/3 │          │ paid     │         │          │
└──────────┘      └──────────┘          └──────────┘         └──────────┘
bill = null       status=open           status=collecting    status=paid
```

QR rendering: generate from `bill.qr`, draw each module as a filled square, pick the largest integer scale that fits (e.g. 33 modules × 6 px = 198 px), keep a 4-module white quiet zone. Black on white only — inverted QR scans badly.

Animations (keyed off `event`): `joined` → brief pulse of the joined counter; `paid` → progress bar fills to the new value; `settled` → full-screen green ✓ PAID for ~10 s, then back to idle. V2: `chaos_reveal` → full-screen dice / flashing names.

### Build order
1. Display "Hello" + Wi-Fi via WiFiManager
2. Render a hardcoded QR for `https://together.app/bill/42?join=1` and scan it with a phone ← do this early, it's the riskiest bit
3. Connect to a fake WebSocket server that replays JSON snapshots
4. Point at the real backend → checkpoint 1
