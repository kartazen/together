# Dev 3 — ESP32 terminal

Read `INTERFACES.md` §4 first — the JSON there is the whole contract between the device and the server.

```
ESP32 ──GET /api/terminal/table-12 every 1s──▶ Vercel (Next.js API route) ──read──▶ Monad: GroupCheckout
      ◀──────────── JSON: what to draw ─────────
```

The server side is **already built and live**:
- `GET /api/terminal/<name>` — `app/api/terminal/[id]/route.ts`
- **Browser twin of the device:** open `/terminal/<name>` (e.g. `http://localhost:3000/terminal/table-12`). It polls the same endpoint and draws the same 4 screens at 240×320. Use it as your pixel reference, and as a backup on demo day.

Try it now: `curl http://localhost:3000/api/terminal/table-12` → bill #1 from the checkpoint run, `status: "paid"`.

## Hardware
- **ESP32-S3** dev board
- 2.8" **ILI9341** SPI TFT, 240×320, portrait (or ST7789 240×320 — just change the driver in `User_Setup.h`)
- USB-C power; enclosure later

## Firmware — `firmware/together-terminal/`
Starter sketch that already does Wi-Fi → poll → parse → draw all 4 screens (idle / QR / 2/3 / PAID). **Not compiled on real hardware yet** — expect to adjust pins and fonts.

1. Arduino IDE → Boards Manager → **esp32 by Espressif** → board **ESP32S3 Dev Module**
2. Library Manager: **TFT_eSPI**, **ArduinoJson** (v7), **QRCode** by Richard Moore
3. Edit `TFT_eSPI/User_Setup.h` in your Arduino libraries folder: driver + your SPI pins (MOSI, SCLK, CS, DC, RST, BL). Keep `LOAD_GFXFF` on.
4. `cp config.example.h config.h` → Wi-Fi, `API_BASE`, `TERMINAL_ID`
5. Upload, open Serial Monitor at 115200 → you should see `[ok] 1 paid 3/3` once a second.

For local testing, `API_BASE` = your laptop's LAN IP (`http://192.168.x.x:3000`) with `pnpm dev --hostname 0.0.0.0` so the ESP32 can reach it.

## Screens (match the browser twin)

```
IDLE              OPEN                  COLLECTING           PAID (15 s)
┌──────────┐      ┌──────────┐          ┌──────────┐         ┌──────────┐
│          │      │ TABLE-12 │          │ TABLE-12 │         │    ✓     │
│ together.│      │  $0.03   │          │  $0.03   │         │   PAID   │
│          │      │ ▄▄▄▄▄▄▄▄ │          │   2/3    │         │  $0.03   │
│ TABLE-12 │      │ █ QR   █ │          │   paid   │         │ Thank    │
│  Ready   │      │ ▀▀▀▀▀▀▀▀ │          │ ███████░ │         │  you!    │
│          │      │Scan to join         │          │         │ (green)  │
└──────────┘      └──────────┘          └──────────┘         └──────────┘
bill = null       status=open           status=collecting    status=paid
```

QR: version 5, ECC medium, black on white, 2-module quiet zone, largest integer scale that fits ~170 px. **Scan it with 3 different phones early** — it's the riskiest part.

## Build order
1. Display "hello" on the TFT (get `User_Setup.h` pins right)
2. Hardcoded QR for `https://together.vercel.app/bill/1?join=1` → scan with a phone
3. Wi-Fi + `curl`-equivalent GET, print JSON to Serial
4. Full sketch against local dev → against Vercel
5. V2: Chaos full-screen animation when the contract gains Chaos mode
