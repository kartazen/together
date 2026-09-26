import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";
import deployments from "@/docs/deployments.json";

/** Deployed addresses — source of truth is docs/deployments.json (overridable per env). */
export const GROUP_CHECKOUT = (process.env.NEXT_PUBLIC_GROUP_CHECKOUT ?? deployments.groupCheckout) as `0x${string}`;
export const USDC = (process.env.NEXT_PUBLIC_USDC ?? deployments.usdc) as `0x${string}`;
export const USDC_DECIMALS = 6;

export const chain = monadTestnet;

export const publicClient = createPublicClient({
  chain,
  transport: http(process.env.MONAD_RPC_URL ?? deployments.rpc),
});

export const BillStatus = { None: 0, Open: 1, Settled: 2, Refunded: 3 } as const;

/** Subset of GroupCheckout's ABI the app uses (full ABI: docs/GroupCheckout.abi.json). */
export const groupCheckoutAbi = [
  {
    type: "function",
    name: "createBill",
    stateMutability: "nonpayable",
    inputs: [
      { name: "terminalId", type: "bytes32" },
      { name: "total", type: "uint256" },
      { name: "participants", type: "uint8" },
      { name: "ttlSeconds", type: "uint64" },
    ],
    outputs: [{ name: "billId", type: "uint256" }],
  },
  {
    type: "event",
    name: "BillCreated",
    inputs: [
      { name: "billId", type: "uint256", indexed: true },
      { name: "merchant", type: "address", indexed: true },
      { name: "terminalId", type: "bytes32", indexed: true },
      { name: "total", type: "uint256", indexed: false },
      { name: "participants", type: "uint8", indexed: false },
    ],
  },
  {
    type: "function",
    name: "activeBillOf",
    stateMutability: "view",
    inputs: [{ name: "terminalId", type: "bytes32" }],
    outputs: [{ name: "billId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getBill",
    stateMutability: "view",
    inputs: [{ name: "billId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "merchant", type: "address" },
          { name: "terminalId", type: "bytes32" },
          { name: "total", type: "uint256" },
          { name: "paidAmount", type: "uint256" },
          { name: "deadline", type: "uint64" },
          { name: "participants", type: "uint8" },
          { name: "joined", type: "uint8" },
          { name: "paidCount", type: "uint8" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getParticipants",
    stateMutability: "view",
    inputs: [{ name: "billId", type: "uint256" }],
    outputs: [
      { name: "members", type: "address[]" },
      { name: "shares", type: "uint256[]" },
      { name: "paid", type: "bool[]" },
    ],
  },
  {
    type: "function",
    name: "shareOf",
    stateMutability: "view",
    inputs: [
      { name: "billId", type: "uint256" },
      { name: "who", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "paidBy",
    stateMutability: "view",
    inputs: [
      { name: "billId", type: "uint256" },
      { name: "who", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "payShare",
    stateMutability: "nonpayable",
    inputs: [{ name: "billId", type: "uint256" }],
    outputs: [],
  },
] as const;

/** Test USDC (MockUSDC): standard ERC-20 plus a public, capped mint. */
export const usdcAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/** Human Bill ID for on-chain bills: bill 4 → "0004". Typed on the Join sheet, shown on table screens. */
export const billCode = (billId: bigint | number | string) => String(billId).padStart(4, "0");
