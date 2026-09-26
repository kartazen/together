# Shared interfaces — the contract between the 3 devs

Freeze this file first. If you need to change something here, tell the other two.

```
Restaurant PWA ──createBill()──▶ GroupCheckout.sol (Monad testnet) ◀──join/payShare()── Phones (PWA)
                                        ▲ read
                                        │
                          Vercel: /api/terminal/[id] ◀──GET every 1s── ESP32 terminal
```

## 1. Chain

| | |
|---|---|
| Network | Monad testnet — chainId `10143`, RPC `https://testnet-rpc.monad.xyz` |
| Token | USDC-style ERC-20, **6 decimals**. If there's no usable test USDC, deploy `MockUSDC` with a public `mint()` |
| Amounts | Always integer base units on-chain (`$0.01` = `10000`) |
| Addresses | Dev 1 publishes them in `docs/deployments.json` (see below) |

```json
{ "chainId": 10143, "groupCheckout": "0x…", "usdc": "0x…", "deployBlock": 123456 }
```

## 2. Contract events (Dev 1 emits, Dev 2 + Dev 3 listen)

```solidity
event BillCreated(uint256 indexed billId, address indexed merchant, bytes32 indexed terminalId, uint256 total, uint8 participants);
event ParticipantJoined(uint256 indexed billId, address indexed participant, uint8 joinedCount);
event SharePaid(uint256 indexed billId, address indexed participant, uint256 amount, uint8 paidCount);
event BillSettled(uint256 indexed billId, address indexed merchant, uint256 total);
event BillRefunded(uint256 indexed billId);
// V2 (Chaos) — do not build before checkpoint 1
event ModeSelected(uint256 indexed billId, uint8 mode);            // 0 = SPLIT, 1 = CHAOS
event SharesAssigned(uint256 indexed billId, address[] participants, uint256[] amounts);
```

`terminalId` = `keccak256("table-12")` style id burned into each ESP32. It's how the backend knows which screen to update. No database needed.

## 3. QR code (Dev 3 renders, Dev 2 serves)

```
https://<APP_HOST>/bill/<billId>?join=1
```

Keep it short (≤ 60 chars) so the QR stays low-density and scannable from a small screen. `billId` is the on-chain uint256 in decimal.

## 4. ESP32 ⇄ server (HTTP polling)

The ESP32 polls **one URL about once a second**. The Next.js app on Vercel reads the contract and answers with a ready-to-draw snapshot. No WebSocket and no separate server: Vercel can't hold sockets open, and a 1 s poll looks instant for a payment screen.

```
GET https://<APP_HOST>/api/terminal/table-12
```

```json
{
  "terminal": "table-12",
  "bill": {
    "id": "1",
    "code": "0001",
    "status": "collecting",
    "total": "0.03",
    "display": "$0.03",
    "participants": 3,
    "joined": 3,
    "paid": 2,
    "qr": "https://<APP_HOST>/bill/1?join=1",
    "deadline": 1790435916
  },
  "serverTime": 1790432774
}
```

| field | values |
|---|---|
| `bill` | `null` → idle screen |
| `status` | `open` (nobody paid yet) · `collecting` (some paid) · `paid` (settled) · `expired` · `refunded` |
| `code` | 4-character Bill ID to show under the QR (typed in the app's Join sheet) |
| `display` | already formatted — print as-is, never do money math on the device |
| errors | `400` bad terminal name · `502` chain unreachable → keep showing the last screen |

Device rules (implemented in `firmware/` and in the browser twin at `/terminal/<name>`):
- Show **PAID** for 15 s after first seeing `status: "paid"` for a bill id, then go back to idle.
- Animate when `joined` / `paid` go up compared with the previous poll.
- Redraw only when something changed (no flicker).

Implementation: `app/api/terminal/[id]/route.ts` → `lib/terminal.ts`.

## 5. Checkpoint 1 (the frozen demo)

Create **$0.03** bill for 3 people → QR on ESP32 → 3 phones join → each pays **$0.01** → ESP32 shows 1/3, 2/3, 3/3 → merchant receives $0.03 → ESP32 shows **✓ PAID**.

Equal split only. No Chaos, no mode voting. When this works end to end, tag it (`git tag checkpoint-1`) and never break it.
