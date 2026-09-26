# Shared interfaces — the contract between the 3 devs

Freeze this file first. If you need to change something here, tell the other two.

```
Restaurant PWA ──createBill()──▶ GroupCheckout.sol (Monad testnet) ◀──join/payShare()── Phones (PWA)
                                        │ events
                                        ▼
                                  Backend (Node) ──WebSocket──▶ ESP32 terminal
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

## 4. Backend → ESP32 WebSocket

Endpoint: `wss://<BACKEND_HOST>/terminal?id=<terminalId-hex>`

The backend always sends a **full state snapshot**. The device just re-renders — it never has to compute anything or remember history. Animations are triggered by `event`.

```json
{
  "type": "state",
  "terminal": "table-12",
  "bill": {
    "id": "42",
    "status": "open",
    "total": "0.03",
    "currency": "USDC",
    "participants": 3,
    "joined": 2,
    "paid": 1,
    "mode": "split",
    "qr": "https://together.app/bill/42?join=1"
  },
  "event": "paid"
}
```

| field | values |
|---|---|
| `bill` | `null` → device shows idle screen |
| `status` | `open` (joining) · `collecting` (paying) · `paid` · `refunded` |
| `event` | `null` · `joined` · `paid` · `settled` · `chaos_reveal` (V2) |
| amounts | decimal **strings**, already formatted — the device never does money math |

Device → backend: `{ "type": "hello", "terminal": "table-12", "fw": "0.1.0" }` on connect. The backend replies with the current snapshot immediately, so a rebooted device recovers on its own.

## 5. Checkpoint 1 (the frozen demo)

Create **$0.03** bill for 3 people → QR on ESP32 → 3 phones join → each pays **$0.01** → ESP32 shows 1/3, 2/3, 3/3 → merchant receives $0.03 → ESP32 shows **✓ PAID**.

Equal split only. No Chaos, no mode voting. When this works end to end, tag it (`git tag checkpoint-1`) and never break it.
