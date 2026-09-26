# together.

Pay together. Make the bill fun.

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## V1 flow

`/` → `/home` → `/create` → `/bill/[id]` → `/bill/[id]/play` (Split / Chaos → reveal) → `/bill/[id]/pay` (confirm → live progress) → `/bill/[id]/success`

Also: `/wallet` (balance + activity), `/profile` (ID, name, advanced details). `/bill/demo` seeds a €84 "Dinner" bill.

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
