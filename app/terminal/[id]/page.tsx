"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useTerminal } from "@/components/terminal-screens";
import { cx } from "@/components/ui";

/**
 * Browser twin of the ESP32 terminal: polls the same endpoint the hardware
 * polls and draws the same four screens at the same 240×320 resolution.
 */
export default function TerminalPreview() {
  const { id } = useParams<{ id: string }>();
  const { snap, online, screen } = useTerminal(id);
  const [showJson, setShowJson] = useState(false);

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
