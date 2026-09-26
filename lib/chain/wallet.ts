"use client";

import { createPublicClient, createWalletClient, custom, parseEventLogs, parseUnits, toHex, type EIP1193Provider } from "viem";
import { GROUP_CHECKOUT, USDC, USDC_DECIMALS, chain, groupCheckoutAbi, usdcAbi } from "./config";
import { terminalIdOf } from "@/lib/terminal-id";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const hasWallet = () => typeof window !== "undefined" && !!window.ethereum;

export const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Opens this exact page inside the MetaMask app's browser (or the store if it isn't installed).
 * Safari / Chrome on phones have no wallet; MetaMask's in-app browser does.
 */
export const openInMetaMaskUrl = (href = window.location.href) =>
  `https://metamask.app.link/dapp/${href.replace(/^https?:\/\//, "")}`;

export const INSTALL_METAMASK_URL = "https://metamask.io/download/";

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
export async function createBillOnChain(opts: {
  terminal: string;
  amountUsd: string;
  people: number;
  ttlSeconds?: number;
  /** called once the wallet has signed and the tx is sent */
  onSubmitted?: (hash: `0x${string}`) => void;
}) {
  const account = await connectWallet();
  const wallet = createWalletClient({ account, chain, transport: custom(provider()) });
  const hash = await wallet.writeContract({
    address: GROUP_CHECKOUT,
    abi: groupCheckoutAbi,
    functionName: "createBill",
    args: [terminalIdOf(opts.terminal), parseUnits(opts.amountUsd, USDC_DECIMALS), opts.people, BigInt(opts.ttlSeconds ?? 3600)],
  });
  opts.onSubmitted?.(hash);
  // Wait through the wallet's own RPC so we see the tx on the same node that received it.
  const receipt = await createPublicClient({ chain, transport: custom(provider()) }).waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction failed");
  const [created] = parseEventLogs({ abi: groupCheckoutAbi, eventName: "BillCreated", logs: receipt.logs });
  return { hash, billId: created?.args.billId.toString() ?? null };
}

/* ---------------- guests ---------------- */

function clients(account: `0x${string}`) {
  return {
    read: createPublicClient({ chain, transport: custom(provider()) }),
    write: createWalletClient({ account, chain, transport: custom(provider()) }),
  };
}

/** What this wallet owes on a bill, and whether it can pay right now. */
export async function readGuest(billId: bigint, account: `0x${string}`) {
  const { read } = clients(account);
  const [share, paid, balance, allowance] = await Promise.all([
    read.readContract({ address: GROUP_CHECKOUT, abi: groupCheckoutAbi, functionName: "shareOf", args: [billId, account] }),
    read.readContract({ address: GROUP_CHECKOUT, abi: groupCheckoutAbi, functionName: "paidBy", args: [billId, account] }),
    read.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [account] }),
    read.readContract({ address: USDC, abi: usdcAbi, functionName: "allowance", args: [account, GROUP_CHECKOUT] }),
  ]);
  return { share, paid, balance, allowance };
}

export async function readUsdcBalance(account: `0x${string}`) {
  return clients(account).read.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [account] });
}

/**
 * Ask MetaMask to show test USDC in the wallet (EIP-747 `wallet_watchAsset`), so nobody has to
 * import the token by hand. Asked once per wallet on this device; declining is fine.
 */
export async function suggestUsdcToWallet(account: `0x${string}`) {
  const key = `together.usdc-suggested.${account.toLowerCase()}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {}
  try {
    await provider().request({
      method: "wallet_watchAsset",
      params: { type: "ERC20", options: { address: USDC, symbol: "USDC", decimals: USDC_DECIMALS } },
    });
  } catch {}
}

/** Testnet only: MockUSDC has a public mint (max 1,000 per call). */
export async function getTestUsdc(account: `0x${string}`, amount: bigint) {
  const { read, write } = clients(account);
  const hash = await write.writeContract({ address: USDC, abi: usdcAbi, functionName: "mint", args: [account, amount] });
  await read.waitForTransactionReceipt({ hash });
  await suggestUsdcToWallet(account); // first time: MetaMask offers to show USDC in the wallet
}

/** approve (if needed) → payShare. `onStep` drives the button label. */
export async function payBill(billId: bigint, account: `0x${string}`, onStep: (step: "approve" | "approving" | "pay" | "paying") => void) {
  const { read, write } = clients(account);
  const { share, allowance } = await readGuest(billId, account);
  if (allowance < share) {
    onStep("approve");
    const hash = await write.writeContract({ address: USDC, abi: usdcAbi, functionName: "approve", args: [GROUP_CHECKOUT, share] });
    onStep("approving");
    await read.waitForTransactionReceipt({ hash });
  }
  onStep("pay");
  const hash = await write.writeContract({ address: GROUP_CHECKOUT, abi: groupCheckoutAbi, functionName: "payShare", args: [billId] });
  onStep("paying");
  const receipt = await read.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Payment failed");
  return hash;
}
