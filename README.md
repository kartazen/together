# together.

Pay together. Make the bill fun.

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## V1 flow

`/` → `/home` → `/create` → `/bill/[id]` → `/bill/[id]/play` (Split / Chaos → reveal) → `/bill/[id]/pay` (confirm → live progress) → `/bill/[id]/success`

Also: `/wallet` (balance + activity), `/profile` (ID, name, advanced details). `/bill/demo` seeds a €84 "Dinner" bill.

## Restaurant & table screen (live on Monad testnet)

| Route | Who | What |
|---|---|---|
| `/restaurant` | Staff | Tables with live status; create a bill on a table (signed by the restaurant's wallet) |
| `/screen/[table]` | A phone/tablet on the table | Full-screen terminal — Plan B if the ESP32 is down |
| `/terminal/[table]` | Hardware dev | Framed 240×320 preview of the ESP32 screen + raw JSON |
| `/api/terminal/[table]` | ESP32 | Read-only JSON snapshot of the table's current bill |

Until guest phones are wired to the chain, pay a table's bill with the demo friends:
`cd contracts && TERMINAL=table-12 forge script script/PayBill.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow`

## Architecture

```
UI (app/, components/)
 ↓  lib/hooks.ts          useUser / useBill / useActivity (live via subscribe + polling)
 ↓  lib/services/index.ts  ← the single swap point
MockBillService / MockUserService   (localStorage)
```

Later: export a `MonadBillService` (viem → `GroupCheckout.sol`) from `lib/services/index.ts`. Pages don't change.

- `lib/types.ts` — product-domain objects (`User`, `Bill`, `Participant`, `Activity`). No chain types in the UI.
- `lib/services/types.ts` — `BillService` / `UserService` interfaces.
- `lib/services/mock/` — simulated friends act through future timestamps (`joinedAt`, `acceptedAt`, `paidAt`), so the demo survives reloads and navigation.

The 4-character ID (e.g. `B7KF`) is the human identity only; accounts use UUIDs internally.
