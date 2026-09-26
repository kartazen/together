# Dev 1 — `GroupCheckout.sol` on Monad testnet

Read `INTERFACES.md` first — event signatures there are the spec.

## Setup
- Foundry (`forge init`), OpenZeppelin (`SafeERC20`, `ReentrancyGuard`)
- Monad testnet: chainId `10143`, RPC `https://testnet-rpc.monad.xyz`, faucet from the Monad docs
- Deploy `MockUSDC` (6 decimals, public `mint(to, amount)`) if you can't get test USDC. Mint to all 3 demo phones.

## Checkpoint 1 API (build only this first)

```solidity
enum Status { Open, Settled, Refunded }

struct Bill {
  address merchant;
  bytes32 terminalId;
  uint256 total;          // USDC base units
  uint8   participants;   // expected count, e.g. 3
  uint8   joined;
  uint8   paidCount;
  uint256 paidAmount;
  uint64  deadline;       // refunds allowed after this
  Status  status;
}

function createBill(bytes32 terminalId, uint256 total, uint8 participants, uint64 ttlSeconds) external returns (uint256 billId);
function join(uint256 billId) external;                 // reverts if full / already joined
function shareOf(uint256 billId, address who) external view returns (uint256);
function payShare(uint256 billId) external;             // pulls shareOf() via transferFrom; auto-joins if needed
function refund(uint256 billId) external;               // after deadline & not settled: return paid shares
function getBill(uint256 billId) external view returns (Bill memory);
function getParticipants(uint256 billId) external view returns (address[] memory, bool[] memory paid);
```

Rules:
- `msg.sender` of `createBill` = merchant (the restaurant wallet).
- Equal split: `share = total / n`; the **last payer pays the remainder** so the sum is exact.
- When `paidAmount == total` → transfer everything to `merchant` in the same tx, emit `SharePaid` then `BillSettled`.
- Use `SafeERC20`, `nonReentrant` on `payShare` / `refund`, checks-effects-interactions.
- Frontend flow is `usdc.approve(groupCheckout, share)` → `payShare(billId)`. Keep it to those 2 txs.

## Tests (forge)
- 3 payers settle exactly; merchant balance +total
- non-divisible total (e.g. 100 / 3) sums exactly
- double pay / pay after settle / 4th join revert
- refund only after deadline, returns exactly what each paid

## V2 — Chaos (after checkpoint 1 is frozen)
- `selectMode(billId, mode)` + `acceptMode(billId)`; lock when everyone accepted
- On lock, compute random shares on-chain, emit `SharesAssigned`
- Randomness: `block.prevrandao`-seeded is fine for the hackathon (say so in the pitch). Better: Pyth Entropy if available on Monad testnet.
- Minimum share per person (e.g. 3% of total) so no one pays 0.

## Hand-off
Push `docs/deployments.json` + the ABI (`out/GroupCheckout.sol/GroupCheckout.json`) to the repo. Dev 2 plugs it into `lib/services/` (replacing the mock); Dev 3's backend reads the events.
