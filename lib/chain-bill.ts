import { formatUnits } from "viem";
import { BillStatus, GROUP_CHECKOUT, USDC_DECIMALS, billCode, groupCheckoutAbi, modeName, publicClient, type ChainMode } from "@/lib/chain/config";

/** An on-chain bill as the guest app sees it (public data only). */
export interface ChainBill {
  id: string;
  code: string;
  status: "joining" | "agreeing" | "paying" | "paid" | "expired" | "refunded";
  mode: ChainMode | null;
  /** bumps on every proposal — used to replay the reveal once per round */
  round: number;
  merchant: string;
  /** base units (6 decimals) as a string, and ready-to-print */
  total: string;
  display: string;
  joined: number;
  accepted: number;
  paid: number;
  deadline: number;
  members: { address: string; share: string; display: string; accepted: boolean; paid: boolean }[];
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
  const [members, shares, accepted, paid] = partsRes.result;
  const now = Math.floor(Date.now() / 1000);

  const statusByCode: Record<number, ChainBill["status"]> = {
    [BillStatus.Joining]: "joining",
    [BillStatus.Agreeing]: "agreeing",
    [BillStatus.Paying]: "paying",
    [BillStatus.Settled]: "paid",
    [BillStatus.Refunded]: "refunded",
  };
  let status = statusByCode[b.status] ?? "joining";
  if ((status === "joining" || status === "agreeing" || status === "paying") && now >= Number(b.deadline)) status = "expired";

  return {
    id: id.toString(),
    code: billCode(id),
    status,
    mode: modeName(b.mode),
    round: b.round,
    merchant: b.merchant,
    total: b.total.toString(),
    display: usd(b.total),
    joined: b.joined,
    accepted: b.accepted,
    paid: b.paidCount,
    deadline: Number(b.deadline),
    members: members.map((address, i) => ({
      address,
      share: shares[i].toString(),
      display: usd(shares[i]),
      accepted: accepted[i],
      paid: paid[i],
    })),
  };
}
