import { NextResponse, type NextRequest } from "next/server";
import { getChainBill, type ChainBill } from "@/lib/chain-bill";

// Same idea as /api/terminal: one chain read per bill per second, shared by every guest.
const FRESH_MS = 1000;
const cache = new Map<string, { at: number; bill: ChainBill | null }>();
const inflight = new Map<string, Promise<ChainBill | null>>();

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/bill/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d{1,9}$/.test(id) || id === "0") return NextResponse.json({ error: "bad bill id" }, { status: 400 });

  const hit = cache.get(id);
  let bill: ChainBill | null;
  if (hit && Date.now() - hit.at < FRESH_MS) bill = hit.bill;
  else {
    let job = inflight.get(id);
    if (!job) {
      job = getChainBill(BigInt(id))
        .then((b) => (cache.set(id, { at: Date.now(), bill: b }), b))
        .finally(() => inflight.delete(id));
      inflight.set(id, job);
    }
    try {
      bill = await job;
    } catch (e) {
      console.error("[bill]", id, e instanceof Error ? e.message.split("\n")[0] : e);
      if (hit) bill = hit.bill;
      else return NextResponse.json({ error: "chain unavailable" }, { status: 502 });
    }
  }
  if (!bill) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(bill, { headers: { "Cache-Control": "no-store" } });
}
