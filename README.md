# together.

**Pay together. Make the bill fun.**

A restaurant opens a bill on a table. Friends scan the QR code on the table, join, and each pays their share in test USDC on **Monad testnet**. When the last person pays, the restaurant is paid automatically and the table screen shows **✓ PAID**.

**Live:** https://together-pay.vercel.app

```
  RESTAURANT                    TABLE SCREEN                     GUESTS
  /restaurant                   ESP32 or /screen/table-12        phones
  ───────────                   ────────────────────────         ──────
  create $0.03 bill   ──────►   $0.03  █ QR █  Bill ID 0004  ──► scan / type ID
  for 3 people                  1/3 → 2/3 → 3/3                  connect wallet
                                ✓ PAID                   ◄────── pay my share
        ▲                                                            │
        └──────────── contract pays the restaurant when all paid ◄───┘
```

---

## 1. For the restaurant (staff)

**Page:** [`/restaurant`](https://together-pay.vercel.app/restaurant). Use it on a laptop or tablet with the MetaMask extension.

| Step | What to do |
|---|---|
| 1. Connect | Tap **Connect**. MetaMask adds Monad Testnet if needed. This wallet is the restaurant's wallet: it receives the money. |
| 2. Get gas | The wallet needs a little **MON** (about 0.015 MON per bill) for network fees. Get it from the Monad testnet faucet. |
| 3. Pick a table | Table cards show live status: **Free**, **Waiting 0/3**, **Paying 1/3**, **✓ Paid**. Add tables with **Add table**. |
| 4. Create the bill | Tap a free table, enter the **amount ($)** and **number of people**, then tap **Create bill** and confirm in MetaMask. |
| 5. Show it on the table | The table's terminal shows the QR and the Bill ID. No terminal? Tap **Show table screen on a phone** and put a phone or tablet on the table. |
| 6. Get paid | When everyone has paid, the contract sends the full amount to the restaurant wallet in the same transaction. |

Only the restaurant creates bills. Guests never do.

## 2. For guests (friends at the table)

**App:** https://together-pay.vercel.app

| Step | What to do |
|---|---|
| 1. Scan | Scan the QR on the table with the phone camera, or open the app, tap **Scan to join**, or type the **Bill ID** (for example `0004`) with 🔍. |
| 2. Open in MetaMask | Phone browsers have no wallet. Tap **Open in MetaMask to pay** to reopen the same bill inside the MetaMask app. |
| 3. Connect | Tap **Connect wallet to pay**. The page shows the bill, who has paid, and **your share**. |
| 4. Get test USDC | First time only: tap **Get test USDC** (free, testnet only). |
| 5. Pay | Tap **Pay $X** and confirm: one approval, then the payment. |
| 6. Watch | Everyone's screen and the table screen update live until **Paid. Everyone's done.** |

Guests need a little **MON** for fees. The restaurant or a teammate can send some:
```bash
cast send <GUEST_ADDRESS> --value 0.2ether --rpc-url https://testnet-rpc.monad.xyz --account deployer
```

> **V1 limitation:** real on-chain bills are split **equally**. The **Split / Chaos** choice (the group picks, everyone agrees) exists in the UI demo (`/bill/demo`) and needs contract V2.

## 3. The table screen

| Where | URL | Notes |
|---|---|---|
| ESP32 terminal | polls `/api/terminal/table-12` | Read-only: it only **pulls** JSON and draws it. No keys, no writes. See [`docs/HARDWARE.md`](docs/HARDWARE.md) and [`firmware/`](firmware/). |
| Any phone or tablet (Plan B) | `/screen/table-12` | Same four screens, full-screen. Tap once for full screen; the screen stays awake. |
| Hardware preview | `/terminal/table-12` | Framed 240×320 preview + raw JSON, for the hardware dev. |

Screens: **idle** (together. · Ready) → **open** (amount · QR · Bill ID · joined) → **collecting** (2/3 paid) → **✓ PAID** (15 s) → idle.

---

## How it works

```
 Restaurant & guests (browser + MetaMask)
          │ writes: createBill / approve + payShare   (signed on each person's device)
          ▼
 ┌──────────────────────────────┐          ┌─────────────────────────────────────┐
 │ Monad testnet                │  reads   │ Vercel — Next.js (this repo)        │
 │ GroupCheckout.sol            │ ◄─────── │ pages: /, /restaurant, /bill/[id] … │
 │ test USDC (MockUSDC)         │          │ API:   /api/terminal/[table]        │
 └──────────────────────────────┘          │        /api/bill/[id]               │
                                           └──────────────────┬──────────────────┘
                                                              │ GET every 1 s
                                                              ▼
                                                 ESP32 / phone table screen
```

- **All money moves on-chain**, signed in each person's own wallet. The server has **no keys** and only reads.
- **No database.** Bills, members and payments live in the contract. The server keeps a 1-second shared cache per table/bill (the public RPC allows ~15 requests/s).

### Deployed contracts (Monad testnet, chainId 10143)

| | Address |
|---|---|
| GroupCheckout | [`0x371150B970A6381985871fc5E0743F0b3a98c5d2`](https://testnet.monadscan.com/address/0x371150B970A6381985871fc5E0743F0b3a98c5d2) |
| Test USDC (6 decimals, public `mint`) | [`0xdF6dA3b58f478deF8bDF0D87E27401026b23528a`](https://testnet.monadscan.com/token/0xdF6dA3b58f478deF8bDF0D87E27401026b23528a) |

Also in [`docs/deployments.json`](docs/deployments.json), with ABIs in `docs/*.abi.json`.

### Where the data lives

| Data | Where |
|---|---|
| Bills, members, payments, payouts | On-chain (GroupCheckout) |
| USDC balances | On-chain (test USDC) |
| Wallet keys | Each person's MetaMask; the deployer key in `~/.foundry/keystores` on the deployer's machine |
| Guest profile (4-letter ID, demo balance, activity) | Browser localStorage (demo data, per device) |
| Restaurant table list | Staff browser localStorage |

---

## Repo layout

| Path | What | Owner |
|---|---|---|
| `app/`, `components/`, `lib/` | Next.js app: guest app, restaurant app, table screens, API | UX |
| `app/restaurant/` | Restaurant (staff) app | UX |
| `app/bill/[id]/`, `components/chain-bill.tsx` | Guest bill page (numeric id = on-chain bill) | UX |
| `app/screen/`, `app/terminal/`, `components/terminal-screens.tsx` | Table screens | UX + Hardware |
| `app/api/terminal/`, `lib/terminal.ts` | Endpoint the ESP32 polls | Hardware |
| `lib/chain/` | Chain config, ABIs, wallet actions (viem) | UX + Blockchain |
| `lib/services/` | Mock data layer for the demo flow (`/bill/demo`) | UX |
| `contracts/` | Foundry project: `GroupCheckout.sol`, tests, deploy and demo scripts | Blockchain |
| `firmware/` | ESP32-S3 Arduino sketch (not yet flashed on real hardware) | Hardware |
| `docs/` | Team handoff: [`INTERFACES.md`](docs/INTERFACES.md), [`CONTRACT.md`](docs/CONTRACT.md), [`HARDWARE.md`](docs/HARDWARE.md) | Everyone |

## Run locally

```bash
pnpm install
pnpm dev                    # http://localhost:3000
```

Optional env (`.env.local`):
```bash
MONAD_RPC_URL=https://…     # private Monad testnet RPC; recommended, the public one allows ~15 req/s
NEXT_PUBLIC_APP_URL=https://together-pay.vercel.app   # host used in table QR codes (defaults to the current host)
```

Contracts:
```bash
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
forge test
```
Deploy, wallet setup and demo scripts: [`contracts/README.md`](contracts/README.md).

Simulate friends paying a table's bill (until everyone has a phone):
```bash
cd contracts
TERMINAL=table-12 forge script script/PayBill.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
```

## Deploy

Hosted on Vercel at `together-pay.vercel.app`. From the repo root:
```bash
vercel --prod
```
`.vercelignore` keeps `contracts/` and `firmware/` out of the upload.

## Demo mode (no chain)

`/bill/demo` and the mock services under `lib/services/` run the full UX (Split / Chaos → reveal → pay → PAID) with simulated friends and no wallet. This is where the V2 Chaos flow is designed before the contract supports it.
