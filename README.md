# together.

**Pay together. Make the bill fun.**

A restaurant opens a bill on a table. Friends scan the QR code on the table, join, and **vote how to pay: SPLIT (equal) or CHAOS 🎲 (random shares)**. Everyone must agree; the contract assigns the shares, everyone pays in test USDC on **Monad testnet**, and the restaurant is paid automatically when the last person pays. The table screen shows **✓ PAID**.

**Live:** https://together-pay.vercel.app

```
  RESTAURANT                    TABLE SCREEN                     GUESTS
  /restaurant                   /screen/table-12 (phone/tablet)  phones
  ───────────                   ───────────────────────────────  ──────
  create $0.84 bill   ──────►   $0.84  █ QR █  Bill ID 0004  ──► scan / type ID, join
  (amount only)                 🎲 CHAOS · 2/3 agreed      ◄───── vote SPLIT or CHAOS
                                1/3 → 2/3 → 3/3 paid       ◄───── dice roll → reveal → pay
                                ✓ PAID
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
| 4. Create the bill | Tap a free table, enter the **amount ($)** only, tap **Create bill** and confirm in MetaMask. The table decides how many people and how to split. |
| 5. Show it on the table | Tap **Show table screen on a phone** and put a phone or tablet on the table: it shows the QR, the Bill ID, the vote and the payments live. |
| 6. Get paid | When everyone has paid, the contract sends the full amount to the restaurant wallet in the same transaction. |

Only the restaurant creates bills. Guests never do.

## 2. For guests (friends at the table)

**App:** https://together-pay.vercel.app

| Step | What to do |
|---|---|
| 1. Scan | Scan the QR on the table with the phone camera, or open the app, tap **Scan to join**, or type the **Bill ID** (for example `0004`) with 🔍. |
| 2. Open in MetaMask | Phone browsers have no wallet. Tap **Open in MetaMask** to reopen the same bill inside the MetaMask app. |
| 3. Join | Tap **Connect wallet**, then **Join this bill**. Everyone at the table joins. |
| 4. Choose how to pay | Once 2+ people joined, anyone taps **Choose how to pay** → **SPLIT** (everyone pays the same) or **CHAOS 🎲** (luck decides; everyone pays at least 3%). Joining closes during the vote. |
| 5. Agree | Everyone taps **I'm in** (or **No** to reopen the table and vote again). The last "I'm in" makes the contract assign every share. |
| 6. Reveal | CHAOS plays the dice roll, then shows who pays what and **your share**. |
| 7. Pay | First time only: **Get test USDC** (free). Then **Pay $X** and confirm (approval, then payment). |
| 8. Done | Everyone's screen and the table screen update live until **PAID**. |

Guests need a little **MON** for fees. The restaurant or a teammate can send some:
```bash
cast send <GUEST_ADDRESS> --value 0.2ether --rpc-url https://testnet-rpc.monad.xyz --account deployer
```

## 3. The table screen

Any phone or tablet on the table: **`/screen/table-12`**. Tap once for full screen; the screen stays awake. It only **reads** — no wallet, no keys.

Screens: **idle** (together. · Ready) → **open** (amount · QR · Bill ID · N joined) → **voting** (🎲 CHAOS or SPLIT · 2/3 agreed) → **paying** (2/3 paid) → **✓ PAID** (15 s) → idle.

`/terminal/table-12` shows the same screen in a small device frame with the raw JSON (`/api/terminal/table-12`).

---

## How it works

```
 Restaurant & guests (browser + MetaMask)
          │ writes: createBill · join · vote · approve + payShare  (signed on each device)
          ▼
 ┌──────────────────────────────┐          ┌─────────────────────────────────────┐
 │ Monad testnet                │  reads   │ Vercel — Next.js (this repo)        │
 │ GroupCheckoutV2.sol          │ ◄─────── │ pages: /, /restaurant, /bill/[id] … │
 │ test USDC (MockUSDC)         │          │ API:   /api/terminal/[table]        │
 └──────────────────────────────┘          │        /api/bill/[id]               │
                                           └──────────────────┬──────────────────┘
                                                              │ GET every 1 s
                                                              ▼
                                                 phone / tablet table screen
```

- **All money moves on-chain**, signed in each person's own wallet. The server has **no keys** and only reads.
- **No database.** Bills, members and payments live in the contract. The server keeps a 1-second shared cache per table/bill (the public RPC allows ~15 requests/s).

### Deployed contracts (Monad testnet, chainId 10143)

| | Address |
|---|---|
| **GroupCheckoutV2** (used by the app — Split / Chaos vote) | [`0x88f5a9893083E02fB8D8529aa5E6745F1a1c5c6a`](https://testnet.monadscan.com/address/0x88f5a9893083E02fB8D8529aa5E6745F1a1c5c6a) |
| GroupCheckout V1 (equal split only, frozen) | [`0x371150B970A6381985871fc5E0743F0b3a98c5d2`](https://testnet.monadscan.com/address/0x371150B970A6381985871fc5E0743F0b3a98c5d2) |
| Test USDC (6 decimals, public `mint`) | [`0xdF6dA3b58f478deF8bDF0D87E27401026b23528a`](https://testnet.monadscan.com/token/0xdF6dA3b58f478deF8bDF0D87E27401026b23528a) |

Also in [`docs/deployments.json`](docs/deployments.json), with ABIs in `docs/*.abi.json`.

CHAOS randomness comes from block data (`prevrandao` + `blockhash`) — fine for a testnet game, not tamper-proof.

### Where the data lives

| Data | Where |
|---|---|
| Bills, members, votes, shares, payments, payouts | On-chain (GroupCheckoutV2) |
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
| `app/screen/`, `app/terminal/`, `components/terminal-screens.tsx` | Table screen (phone/tablet) | UX |
| `app/api/terminal/`, `lib/terminal.ts` | Read-only JSON the table screen polls | UX |
| `lib/chain/` | Chain config, ABIs, wallet actions (viem) | UX + Blockchain |
| `lib/services/` | Mock data layer for the demo flow (`/bill/demo`) | UX |
| `contracts/` | Foundry project: `GroupCheckoutV2.sol` (+ V1), tests, deploy and demo scripts | Blockchain |
| `firmware/`, `docs/HARDWARE.md` | Old ESP32 sketch — **not used** (the hardware was dropped; the table screen is a phone) | — |
| `docs/` | Team handoff: [`INTERFACES.md`](docs/INTERFACES.md), [`CONTRACT.md`](docs/CONTRACT.md) | Everyone |

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

Fake friends for demos (they join, accept the vote, pay — topped up by the deployer):
```bash
cd contracts
export CHECKOUT=0x88f5a9893083E02fB8D8529aa5E6745F1a1c5c6a TERMINAL=table-12
ACTION=join COUNT=2 forge script script/Friends.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
ACTION=accept       forge script script/Friends.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
ACTION=pay          forge script script/Friends.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
```

## Deploy

Hosted on Vercel at `together-pay.vercel.app`. From the repo root:
```bash
vercel --prod
```
`.vercelignore` keeps `contracts/` and `firmware/` out of the upload.

## Demo mode (no chain)

`/bill/demo` and the mock services under `lib/services/` run the full UX (Split / Chaos → reveal → pay → PAID) with simulated friends and no wallet. This is where the V2 Chaos flow is designed before the contract supports it.
