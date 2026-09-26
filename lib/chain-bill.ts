import { formatUnits } from "viem";
import { BillStatus, GROUP_CHECKOUT, USDC_DECIMALS, billCode, groupCheckoutAbi, publicClient } from "@/lib/chain/config";

/** An on-chain bill as the guest app sees it (read-only, public data). */
export interface ChainBill {
  id: string;
  code: string;
  status: "open" | "paid" | "expired" | "refunded";
  merchant: string;
  /** base units (6 decimals) as a string, and ready-to-print */
  total: string;
  display: string;
  participants: number;
  joined: number;
  paid: number;
  deadline: number;
  members: { address: string; share: string; display: string; paid: boolean }[];
}

const usd = (units: bigint) => `$${Number(formatUnits(units, USDC_DECIMALS)).toFixed(2)}`;

export async function getChainBill(id: bigint): Promise<ChainBill | null> {
  const [billRes, partsRes] = await publicClient.multicall({
    contracts: [
      { address: GROUP_CHECKOUT, abi: groupCheckoutAbi, functionName: "getBill", args: [id] },
      { address: GROUP_CHECKOUT, abi: groupCheckoutAbi, functionName: "getParticipants", args: [id] },
    ],
  });
  if (billRes.status === "failure") {
    if (/InvalidBill|reverted/i.test(String(billRes.error))) return null;
    throw billRes.error;
  }
  if (partsRes.status === "failure") throw partsRes.error;
  const b = billRes.result;
  const [members, shares, paid] = partsRes.result;
  const now = Math.floor(Date.now() / 1000);

  let status: ChainBill["status"] = "open";
  if (b.status === BillStatus.Settled) status = "paid";
  else if (b.status === BillStatus.Refunded) status = "refunded";
  else if (now >= Number(b.deadline)) status = "expired";

  return {
    id: id.toString(),
    code: billCode(id),
    status,
    merchant: b.merchant,
    total: b.total.toString(),
    display: usd(b.total),
    participants: b.participants,
    joined: b.joined,
    paid: b.paidCount,
    deadline: Number(b.deadline),
    members: members.map((address, i) => ({ address, share: shares[i].toString(), display: usd(shares[i]), paid: paid[i] })),
  };
}
