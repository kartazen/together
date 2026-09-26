import { NextResponse, type NextRequest } from "next/server";
import { TERMINAL_NAME, getTerminalSnapshot } from "@/lib/terminal";

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
    const snapshot = await getTerminalSnapshot(id, appUrl);
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[terminal]", id, e);
    // The device keeps showing its last screen when this fails.
    return NextResponse.json({ error: "chain unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
