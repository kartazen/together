"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { TerminalSnapshot } from "@/lib/terminal";
import { cx } from "./ui";

const POLL_MS = 1000;
/** How long PAID stays on screen before the terminal goes back to idle. Same rule as the firmware. */
const PAID_HOLD_MS = 15_000;

/**
 * Polls the same endpoint the ESP32 polls and applies the same rules.
 * Used by the hardware preview (/terminal) and the phone fallback (/screen).
 */
export function useTerminal(id: string) {
  const [snap, setSnap] = useState<TerminalSnapshot | null>(null);
  const [online, setOnline] = useState(true);
  const [paidSince, setPaidSince] = useState<{ bill: string; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/terminal/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data: TerminalSnapshot = await res.json();
        if (!alive) return;
        setSnap(data);
        setOnline(true);
        const paidBill = data.bill?.status === "paid" ? data.bill.id : null;
        if (paidBill) setPaidSince((prev) => (prev?.bill === paidBill ? prev : { bill: paidBill, at: Date.now() }));
      } catch {
        if (alive) setOnline(false); // keep the last screen, like the device
      }
      if (alive) setNow(Date.now());
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  const bill = snap?.bill ?? null;
  const showPaid = bill?.status === "paid" && paidSince?.bill === bill.id && now - paidSince.at < PAID_HOLD_MS;

  let screen: React.ReactNode;
  if (!snap) screen = <Booting />;
  else if (!bill || bill.status === "refunded" || bill.status === "expired" || (bill.status === "paid" && !showPaid))
    screen = <Idle terminal={snap.terminal} />;
  else if (bill.status === "paid") screen = <Paid display={bill.display} />;
  else if (bill.status === "collecting") screen = <Collecting terminal={snap.terminal} bill={bill} />;
  else if (bill.status === "choosing") screen = <Choosing terminal={snap.terminal} bill={bill} />;
  else screen = <Open terminal={snap.terminal} bill={bill} />;

  const dark = !showPaid && bill?.status === "choosing" && bill.mode === "chaos";
  return { snap, online, screen, paid: !!showPaid, dark };
}

type Bill = NonNullable<TerminalSnapshot["bill"]>;

function Booting() {
  return <div className="grid h-full place-items-center font-mono text-[12px] text-muted">connecting…</div>;
}

function Idle({ terminal }: { terminal: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="text-[28px] font-semibold tracking-[-0.03em]">together.</p>
      <p className="mt-10 text-[13px] font-semibold tracking-[0.2em] text-muted">{terminal.toUpperCase()}</p>
      <p className="mt-1 text-[15px] text-muted">Ready</p>
    </div>
  );
}

function Open({ terminal, bill }: { terminal: string; bill: Bill }) {
  return (
    <div className="flex h-full flex-col items-center px-4 pt-4 text-center">
      <p className="text-[11px] font-semibold tracking-[0.2em] text-muted">{terminal.toUpperCase()}</p>
      <p className="text-[34px] font-semibold leading-tight tracking-[-0.04em] tabular">{bill.display}</p>
      <div className="mt-2 bg-white p-2">
        <QRCodeSVG value={bill.qr} size={150} level="M" marginSize={0} fgColor="#000000" bgColor="#ffffff" />
      </div>
      <p className="mt-3 text-[15px] font-semibold">Scan to join</p>
      <p className="mt-0.5 text-[13px] text-muted tabular">
        Bill ID <b className="font-mono font-semibold tracking-wider text-ink">{bill.code}</b> ·{" "}
        <span key={bill.joined} className="animate-pop inline-block">
          {bill.joined} joined
        </span>
      </p>
    </div>
  );
}

function Choosing({ terminal, bill }: { terminal: string; bill: Bill }) {
  const chaos = bill.mode === "chaos";
  return (
    <div className={cx("flex h-full flex-col items-center px-4 pt-4 text-center", chaos && "bg-ink text-white")}>
      <p className={cx("text-[11px] font-semibold tracking-[0.2em]", chaos ? "text-white/50" : "text-muted")}>{terminal.toUpperCase()}</p>
      <p className="text-[34px] font-semibold leading-tight tracking-[-0.04em] tabular">{bill.display}</p>
      <span className={cx("mt-8 text-[64px] leading-none", chaos && "animate-wobble")}>{chaos ? "🎲" : `1/${bill.joined}`}</span>
      <p className={cx("mt-5 text-[15px] font-bold tracking-[0.22em]", chaos ? "text-chaos" : "text-ink")}>{chaos ? "CHAOS" : "SPLIT"}</p>
      <p className={cx("mt-1 text-[14px]", chaos ? "text-white/70" : "text-muted")}>Everyone must agree</p>
      <p key={bill.accepted} className="animate-pop mt-6 text-[40px] font-semibold leading-none tabular">
        {bill.accepted}/{bill.joined}
      </p>
      <p className={cx("mt-1 text-[13px]", chaos ? "text-white/60" : "text-muted")}>agreed</p>
    </div>
  );
}

function Collecting({ terminal, bill }: { terminal: string; bill: Bill }) {
  const pct = (bill.paid / bill.participants) * 100;
  return (
    <div className="flex h-full flex-col items-center px-5 pt-4 text-center">
      <p className="text-[11px] font-semibold tracking-[0.2em] text-muted">{terminal.toUpperCase()}</p>
      <p className="text-[34px] font-semibold leading-tight tracking-[-0.04em] tabular">{bill.display}</p>
      <p key={bill.paid} className="animate-pop mt-12 text-[72px] font-semibold leading-none tracking-[-0.05em] tabular">
        {bill.paid}/{bill.participants}
      </p>
      <p className="mt-2 text-[15px] text-muted">paid</p>
      <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Paid({ display }: { display: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-positive text-center text-white">
      <span className="animate-pop grid size-20 place-items-center rounded-full bg-white/20">
        <Check className="size-11" strokeWidth={3.5} />
      </span>
      <p className="mt-5 text-[40px] font-semibold tracking-[-0.03em]">PAID</p>
      <p className="text-[22px] font-semibold tabular">{display}</p>
      <p className="mt-4 text-[14px] text-white/80">Thank you!</p>
    </div>
  );
}
