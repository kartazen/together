"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { billService, userService } from "@/lib/services";
import { useUser } from "@/lib/hooks";
import { money, symbol } from "@/lib/format";
import { Button, Sheet, Spinner, cx } from "./ui";

/** Client-side guard: no account → onboarding. */
export function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);
  if (!user) return <Spinner />;
  return <>{children}</>;
}

/* ---------------- 4-character code input ---------------- */

export function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="relative mx-auto flex gap-2.5" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-label="4-character ID"
        className="peer absolute inset-0 opacity-0"
      />
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cx(
            "grid h-[72px] w-16 place-items-center rounded-[20px] bg-surface font-mono text-[32px] font-semibold transition",
            i === Math.min(value.length, 3) && "peer-focus:ring-2 peer-focus:ring-ink",
          )}
        >
          {value[i] ?? ""}
        </span>
      ))}
    </label>
  );
}

/* ---------------- join a bill ---------------- */

export function JoinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setBusy(true);
    setError("");
    try {
      const bill = await billService.joinBill(code);
      router.push(`/bill/${bill.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join");
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Join a bill" subtitle="Enter the Bill ID on the table">
      <div className="mt-10 flex flex-col items-center gap-4">
        <CodeInput value={code} onChange={setCode} autoFocus />
        <p className={cx("h-5 text-[15px]", error ? "text-chaos" : "text-muted")}>{error || "Or scan the QR code with your camera"}</p>
      </div>
      <div className="mt-auto pt-6">
        <Button disabled={code.length !== 4} loading={busy} onClick={join}>
          Join bill
        </Button>
      </div>
    </Sheet>
  );
}

/* ---------------- top up ---------------- */

const PRESETS = [20, 50, 100, 250];

type TopUpProps = { open: boolean; onClose: () => void; suggested?: number };

/** Mounted only while open, so every opening starts fresh. */
export function TopUpSheet(props: TopUpProps) {
  return props.open ? <TopUpFlow {...props} /> : null;
}

function TopUpFlow({ open, onClose, suggested }: TopUpProps) {
  const { user } = useUser();
  const [amount, setAmount] = useState(String(suggested ?? 50));
  const [phase, setPhase] = useState<"form" | "processing" | "done">("form");

  if (!user) return null;
  const value = Number(amount) || 0;
  const cur = user.currency;

  async function submit() {
    setPhase("processing");
    await userService.topUp(value);
    setPhase("done");
  }

  if (phase !== "form") {
    const steps = ["Payment received", "Adding to your balance", "Ready to use"];
    const reached = phase === "done" ? 3 : 1;
    return (
      <Sheet open={open} onClose={onClose} title="Add money">
        <div className="flex flex-col items-center pt-6 text-center">
          <span className="animate-pop grid size-20 place-items-center rounded-full bg-ink text-[34px] font-semibold text-white">{symbol(cur)}</span>
          <p className="mt-6 text-[32px] font-semibold tracking-tight tabular">{money(value, cur, { fixed: true })}</p>
          <p className="text-[16px] text-muted">{phase === "done" ? "Added to your balance." : "We're adding your money."}</p>
        </div>
        <div className="mt-8 rounded-[28px] border border-surface-2 p-6">
          {steps.map((s, i) => (
            <div key={s} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className={cx("mt-1 grid size-5 place-items-center rounded-full border-2 transition", i < reached ? "border-positive bg-positive" : "border-faint")}>
                  {i < reached && <Check className="size-3 text-white" strokeWidth={4} />}
                </span>
                {i < steps.length - 1 && <span className="my-1 h-7 w-px bg-surface-2" />}
              </div>
              <p className={cx("text-[17px]", i < reached ? "text-ink" : "text-muted")}>{s}</p>
            </div>
          ))}
        </div>
        <div className="mt-auto pt-6">
          <Button disabled={phase !== "done"} loading={phase === "processing"} onClick={onClose}>
            Done
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add money" subtitle={`Current balance: ${money(user.balance, cur, { fixed: true })}`}>
      <button className="mx-auto mt-4 flex h-12 items-center gap-2 rounded-full bg-surface px-5 text-[17px] font-semibold">
        <span className="rounded-[5px] border border-ink px-1 text-[10px] font-semibold leading-4">Pay</span>
        Apple Pay
        <ChevronDown className="size-4 text-muted" />
      </button>

      <label className="mt-14 flex items-start justify-center">
        <span className="mt-2 text-[32px] font-semibold text-muted">{symbol(cur)}</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 7))}
          aria-label="Amount"
          className="w-[5ch] min-w-0 bg-transparent text-center text-[88px] font-semibold leading-none tracking-[-0.04em] outline-none tabular"
          style={{ width: `${Math.max(amount.length, 1) + 0.3}ch` }}
        />
      </label>
      <p className="mt-6 text-center text-[17px] text-muted">
        You&apos;ll pay <b className="text-ink">{money(value, cur, { fixed: true })}</b> in total
      </p>

      <div className="mt-8 grid grid-cols-4 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(String(p))}
            className={cx("h-12 rounded-full text-[16px] font-semibold transition active:scale-95", value === p ? "bg-ink text-white" : "bg-surface")}
          >
            {money(p, cur)}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <Button disabled={value <= 0} onClick={submit}>
          <Plus className="size-5" strokeWidth={2.5} /> Add with Apple Pay
        </Button>
        <p className="mt-3 text-center text-[13px] text-muted">Demo mode — no real money moves.</p>
      </div>
    </Sheet>
  );
}
