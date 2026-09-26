import { keccak256, toBytes } from "viem";

export const TERMINAL_NAME = /^[a-z0-9-]{1,32}$/;

/** "table-12" → the bytes32 id the restaurant passes to createBill(). */
export const terminalIdOf = (name: string) => keccak256(toBytes(name));
