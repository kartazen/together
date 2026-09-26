import { formatUnits } from "viem";
import { terminalIdOf } from "@/lib/terminal-id";
import { BillStatus, GROUP_CHECKOUT, USDC_DECIMALS, billCode, groupCheckoutAbi, modeName, publicClient, type ChainMode } from "@/lib/chain/config";

/**
 * What an ESP32 terminal should draw. The device renders this as-is:
 * every string is pre-formatted, so the firmware never does money math.
 */
export type TerminalStatus = "open" | "choosing" | "collecting" | "paid" | "expired" | "refunded";

export interface TerminalSnapshot {
  terminal: string;
  bill: null | {
    id: string;
    /** 4-character Bill ID to type in the app, e.g. "0004" */
    code: string;
    status: TerminalStatus;
    /** "split" | "chaos" once someone proposed a mode */
    mode: ChainMode | null;
    /** decimal string, e.g. "0.03" */
    total: string;
    /** ready to print, e.g. "$0.03" */
    display: string;
    /** people at the table so far */
    participants: number;
    joined: number;
    /** how many agreed to the proposed mode */
    accepted: number;
    paid: number;
    /** URL to encode in the QR code */
    qr: string;
    /** unix seconds */
    deadline: number;
  };
  /** unix seconds, server clock */
  serverTime: number;
}

export { TERMINAL_NAME, terminalIdOf } from "@/lib/terminal-id";

export async function getTerminalSnapshot(name: string, appUrl: string): Promise<TerminalSnapshot> {
  const serverTime = Math.floor(Date.now() / 1000);
  const billId = await publicClient.readContract({
    address: GROUP_CHECKOUT,
    abi: groupCheckoutAbi,
    functionName: "activeBillOf",
    args: [terminalIdOf(name)],
  });
  if (billId === BigInt(0)) return { terminal: name, bill: null, serverTime };

  const b = await publicClient.readContract({
    address: GROUP_CHECKOUT,
    abi: groupCheckoutAbi,
    functionName: "getBill",
    args: [billId],
  });

  const deadline = Number(b.deadline);
  let status: TerminalStatus;
  if (b.status === BillStatus.Settled) status = "paid";
  else if (b.status === BillStatus.Refunded) status = "refunded";
  else if (serverTime >= deadline) status = "expired";
  else if (b.status === BillStatus.Paying) status = "collecting";
  else if (b.status === BillStatus.Agreeing) status = "choosing";
  else status = "open";

  const total = Number(formatUnits(b.total, USDC_DECIMALS)).toFixed(2);
  return {
    terminal: name,
    bill: {
      id: billId.toString(),
      code: billCode(billId),
      status,
      mode: modeName(b.mode),
      total,
      display: `$${total}`,
      participants: b.joined,
      joined: b.joined,
      accepted: b.accepted,
      paid: b.paidCount,
      qr: `${appUrl}/bill/${billId}?join=1`,
      deadline,
    },
    serverTime,
  };
}
