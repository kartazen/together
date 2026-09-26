"use client";

import { createPublicClient, createWalletClient, custom, parseEventLogs, parseUnits, toHex, type EIP1193Provider } from "viem";
import { GROUP_CHECKOUT, USDC_DECIMALS, chain, groupCheckoutAbi } from "./config";
import { terminalIdOf } from "@/lib/terminal-id";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const hasWallet = () => typeof window !== "undefined" && !!window.ethereum;

function provider(): EIP1193Provider {
  if (!window.ethereum) throw new Error("No wallet found on this device. Install MetaMask.");
  return window.ethereum;
}

/** Ask the injected wallet for an account and make sure it's on Monad testnet. */
export async function connectWallet(): Promise<`0x${string}`> {
  const eth = provider();
  const [account] = await eth.request({ method: "eth_requestAccounts" });
  const current = await eth.request({ method: "eth_chainId" });
  if (Number(current) !== chain.id) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHex(chain.id) }] });
    } catch {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: toHex(chain.id),
            chainName: "Monad Testnet",
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [...chain.rpcUrls.default.http],
            blockExplorerUrls: ["https://testnet.monadscan.com"],
          },
        ],
      });
    }
  }
  return account;
}

export async function connectedAccount(): Promise<`0x${string}` | null> {
  if (!hasWallet()) return null;
  const [account] = await provider().request({ method: "eth_accounts" });
  return account ?? null;
}

/** Restaurant: open a bill on a table. Signed by the connected (merchant) wallet. */
export async function createBillOnChain(opts: { terminal: string; amountUsd: string; people: number; ttlSeconds?: number }) {
  const account = await connectWallet();
  const wallet = createWalletClient({ account, chain, transport: custom(provider()) });
  const hash = await wallet.writeContract({
    address: GROUP_CHECKOUT,
    abi: groupCheckoutAbi,
    functionName: "createBill",
    args: [terminalIdOf(opts.terminal), parseUnits(opts.amountUsd, USDC_DECIMALS), opts.people, BigInt(opts.ttlSeconds ?? 3600)],
  });
  // Wait through the wallet's own RPC so we see the tx on the same node that received it.
  const receipt = await createPublicClient({ chain, transport: custom(provider()) }).waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction failed");
  const [created] = parseEventLogs({ abi: groupCheckoutAbi, eventName: "BillCreated", logs: receipt.logs });
  return { hash, billId: created?.args.billId.toString() ?? null };
}
