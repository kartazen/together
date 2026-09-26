import { NextResponse, type NextRequest } from "next/server";
import { TERMINAL_NAME, getTerminalSnapshot, type TerminalSnapshot } from "@/lib/terminal";

/**
 * The public Monad RPC allows ~15 req/s. Many screens poll the same table
 * (ESP32, phone fallback, restaurant app), so: one chain read per table per
 * second, shared by everyone, and the last good answer if the RPC hiccups.
 */
const FRESH_MS = 1000;
const STALE_OK_MS = 30_000;
const cache = new Map<string, { at: number; snap: TerminalSnapshot }>();
const inflight = new Map<string, Promise<TerminalSnapshot>>();

async function snapshot(id: string, appUrl: string) {
  const key = `${appUrl}|${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.snap;

  let job = inflight.get(key);
  if (!job) {
    job = getTerminalSnapshot(id, appUrl)
      .then((snap) => {
        cache.set(key, { at: Date.now(), snap });
        return snap;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  try {
    return await job;
  } catch (e) {
    if (hit && Date.now() - hit.at < STALE_OK_MS) return hit.snap;
    throw e;
  }
}

/**
 * GET /api/terminal/table-12 — polled by the ESP32 about once a second.
 * Read-only: looks up the terminal's current bill on Monad and returns a
 * ready-to-draw snapshot (see TerminalSnapshot).
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/terminal/[id]">) {
  const { id } = await ctx.params;
  if (!TERMINAL_NAME.test(id)) {
    return NextResponse.json({ error: "terminal id must be lowercase letters, digits and dashes" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  try {
    const snap = await snapshot(id, appUrl);
    return NextResponse.json(snap, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[terminal]", id, e instanceof Error ? e.message.split("\n")[0] : e);
    // The device keeps showing its last screen when this fails.
    return NextResponse.json({ error: "chain unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
