"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { TerminalSnapshot } from "@/lib/terminal";
import { cx } from "@/components/ui";

const POLL_MS = 1000;
/** How long PAID stays on screen before the terminal goes back to idle. Same rule as the firmware. */
const PAID_HOLD_MS = 15_000;

/**
 * Browser twin of the ESP32 terminal: polls the same endpoint the hardware
 * polls and draws the same four screens at the same 240×320 resolution.
 */
export default function TerminalPreview() {
  const { id } = useParams<{ id: string }>();
  const [snap, setSnap] = useState<TerminalSnapshot | null>(null);
  const [online, setOnline] = useState(true);
  const [showJson, setShowJson] = useState(false);
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
  else screen = <Open terminal={snap.terminal} bill={bill} />;

  return (
    <main className="flex flex-1 flex-col items-center px-5 py-8">
      <p className="text-[13px] font-semibold tracking-[0.18em] text-muted">HARDWARE PREVIEW</p>
      <h1 className="mt-1 font-mono text-[20px] font-semibold">{id}</h1>

      {/* device */}
      <div className="mt-6 rounded-[36px] bg-[#1b1b1d] p-4 pb-10 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.45)]">
        <div className="relative h-[320px] w-[240px] overflow-hidden rounded-[6px] bg-white">
          {screen}
          <span
            title={online ? "connected" : "offline"}
            className={cx("absolute right-2 top-2 size-2 rounded-full", online ? "bg-positive" : "bg-chaos")}
          />
        </div>
        <p className="mt-4 text-center font-mono text-[10px] tracking-[0.3em] text-white/30">ESP32-S3 · 240×320</p>
      </div>

      <p className="mt-6 text-center text-[14px] text-muted">
        Polls <code className="font-mono text-ink">/api/terminal/{id}</code> every second — same as the device.
      </p>
      <button onClick={() => setShowJson((v) => !v)} className="mt-3 text-[14px] font-semibold">
        {showJson ? "Hide" : "Show"} JSON
      </button>
      {showJson && (
        <pre className="mt-3 w-full overflow-x-auto rounded-[20px] bg-surface p-4 font-mono text-[12px] leading-relaxed">
          {JSON.stringify(snap, null, 2)}
        </pre>
      )}
    </main>
  );
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
      <p key={bill.joined} className="animate-pop mt-0.5 text-[13px] text-muted tabular">
        {bill.joined}/{bill.participants} joined
      </p>
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
