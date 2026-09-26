"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Keyboard, X } from "lucide-react";
import { billService } from "@/lib/services";
import { Dots } from "./ui";

/** Table QR → in-app path. Accepts our bill links (any host) or a bare 4-character Bill ID. */
export function parseScan(text: string): { path: string } | { code: string } | null {
  try {
    const url = new URL(text);
    const m = url.pathname.match(/^\/bill\/([^/]+)\/?$/);
    if (m) return { path: `/bill/${m[1]}?join=1` };
  } catch {}
  const code = text.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(code) ? { code } : null;
}

/** Full-screen camera that reads the QR code on the table and opens that bill. */
export function ScanSheet({ open, onClose, onManual }: { open: boolean; onClose: () => void; onManual: () => void }) {
  if (!open) return null;
  return <Scanner onClose={onClose} onManual={onManual} />;
}

function Scanner({ onClose, onManual }: { onClose: () => void; onManual: () => void }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"starting" | "scanning" | "joining">("starting");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function found(text: string) {
      const target = parseScan(text);
      if (!target) return false; // some other QR — keep scanning
      done = true;
      setStatus("joining");
      navigator.vibrate?.(40);
      if ("path" in target) router.push(target.path);
      else {
        try {
          const bill = await billService.joinBill(target.code);
          router.push(`/bill/${bill.id}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't join");
        }
      }
      return true;
    }

    function tick() {
      const v = video.current;
      if (!done && v && ctx && v.readyState >= v.HAVE_ENOUGH_DATA) {
        const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (qr?.data) {
          found(qr.data).then((ok) => !ok && !done && (raf = requestAnimationFrame(tick)));
          return;
        }
      }
      if (!done) raf = requestAnimationFrame(tick);
    }

    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (done || !video.current) {
          s.getTracks().forEach((t) => t.stop()); // closed (or remounted) while the camera was starting
          return;
        }
        stream = s;
        video.current.srcObject = stream;
        await video.current.play();
        setStatus("scanning");
        raf = requestAnimationFrame(tick);
      } catch (e) {
        if (done || (e instanceof DOMException && e.name === "AbortError")) return;
        const denied = e instanceof DOMException && e.name === "NotAllowedError";
        setError(denied ? "Camera access is off. Allow it in your browser settings, or enter the Bill ID." : "Couldn't open the camera.");
      }
    })();

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex justify-center bg-black" role="dialog" aria-modal aria-label="Scan to join">
      <div className="relative flex h-full w-full max-w-[440px] flex-col text-white">
        <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

        {/* viewfinder: dim everything except the square */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative size-64 rounded-[36px] shadow-[0_0_0_200vmax_rgb(0_0_0/0.55)]">
            {["left-0 top-0 border-l-4 border-t-4 rounded-tl-[36px]", "right-0 top-0 border-r-4 border-t-4 rounded-tr-[36px]", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[36px]", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-[36px]"].map((c) => (
              <span key={c} className={`absolute size-12 border-white ${c}`} />
            ))}
          </div>
        </div>

        <header className="relative flex items-start justify-between px-5 pt-[max(20px,env(safe-area-inset-top))]">
          <div>
            <h2 className="text-[22px] font-semibold tracking-tight">Scan to join</h2>
            <p className="mt-1 text-[15px] text-white/70">Point at the QR code on your table</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="grid size-12 place-items-center rounded-full bg-white/15 backdrop-blur transition active:scale-95">
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </header>

        <div className="relative mt-auto flex flex-col items-center gap-4 px-5 pb-[max(28px,env(safe-area-inset-bottom))]">
          {error ? (
            <p className="rounded-[20px] bg-black/60 px-4 py-3 text-center text-[15px] backdrop-blur">{error}</p>
          ) : (
            <p className="flex h-6 items-center gap-2 text-[15px] font-medium text-white/80">
              {status === "joining" ? "Joining" : status === "starting" ? "Opening camera" : "Looking for a QR code"} <Dots />
            </p>
          )}
          <button onClick={onManual} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white text-[17px] font-semibold text-ink transition active:scale-[0.98]">
            <Keyboard className="size-5" /> Enter Bill ID instead
          </button>
        </div>
      </div>
    </div>
  );
}
