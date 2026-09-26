"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTerminal } from "@/components/terminal-screens";
import { cx } from "@/components/ui";

const W = 240;
const H = 320;

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

/**
 * Phone / tablet fallback for the ESP32: the exact same terminal screens,
 * scaled up to fill the device. Put a phone on the table, open this, tap once.
 */
export default function PhoneTerminal() {
  const { id } = useParams<{ id: string }>();
  const { online, screen, paid, dark } = useTerminal(id);
  const [hint, setHint] = useState(true);

  const viewport = useSyncExternalStore(subscribeResize, () => `${window.innerWidth}x${window.innerHeight}`, () => `${W}x${H}`);
  const [vw, vh] = viewport.split("x").map(Number);
  const scale = Math.min(vw / W, vh / H) * 0.96;

  // Keep the screen awake while the terminal is showing.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible") lock = await navigator.wakeLock?.request("screen");
      } catch {}
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    const t = setTimeout(() => setHint(false), 5000);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
      clearTimeout(t);
    };
  }, []);

  function goFullscreen() {
    setHint(false);
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  }

  return (
    <div
      onClick={goFullscreen}
      className={cx("fixed inset-0 z-50 grid cursor-none place-items-center overflow-hidden transition-colors", paid ? "bg-positive" : dark ? "bg-ink" : "bg-white")}
    >
      <div className="relative" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {screen}
      </div>
      <span className={cx("absolute right-4 top-4 size-2.5 rounded-full", online ? "bg-positive" : "bg-chaos", paid && "bg-white/70")} />
      {hint && (
        <span className="animate-fade-in absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-ink/80 px-4 py-2 text-[13px] font-medium text-white">
          Tap for full screen
        </span>
      )}
    </div>
  );
}
