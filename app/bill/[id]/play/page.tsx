"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { billService } from "@/lib/services";
import { useBill, useUser } from "@/lib/hooks";
import { money } from "@/lib/format";
import type { Bill, BillMode } from "@/lib/types";
import { RequireUser } from "@/components/features";
import { Avatar, BottomBar, Button, Dots, Header, Screen, Spinner, cx } from "@/components/ui";

export default function PlayPage() {
  return (
    <RequireUser>
      <Play />
    </RequireUser>
  );
}

function Play() {
  const { id } = useParams<{ id: string }>();
  const { bill } = useBill(id);
  const [rolled, setRolled] = useState(false);
  const onRolled = useCallback(() => setRolled(true), []);

  if (!bill) return <Spinner />;
  if (!bill.mode) return <ChooseMode bill={bill} />;
  if (bill.status === "agreeing") return <Agreeing bill={bill} />;
  if (bill.mode === "chaos" && !bill.revealed && !rolled) return <ChaosRoll bill={bill} onDone={onRolled} />;
  return <Reveal bill={bill} />;
}

/* ---------------- 1. choose ---------------- */

function ChooseMode({ bill }: { bill: Bill }) {
  const [busy, setBusy] = useState<BillMode | null>(null);
  const n = bill.participants.length;
  const even = Math.round((bill.total / n) * 100) / 100;

  async function pick(mode: BillMode) {
    setBusy(mode);
    await billService.selectMode(bill.id, mode);
  }

  return (
    <Screen>
      <Header back={`/bill/${bill.id}`} title="How do we pay?" />

      <div className="mt-6 text-center">
        <p className="text-[48px] font-semibold leading-none tracking-[-0.04em] tabular">{money(bill.total, bill.currency, { fixed: true })}</p>
        <p className="mt-3 text-[17px] text-muted">{n} friends</p>
      </div>

      <div className="mt-10 flex flex-col gap-3">
        <button
          disabled={!!busy}
          onClick={() => pick("split")}
          className="animate-fade-up group relative overflow-hidden rounded-[32px] bg-surface p-6 text-left transition active:scale-[0.98] disabled:opacity-60"
        >
          <span className="flex items-center justify-between">
            <span className="text-[15px] font-bold tracking-[0.18em]">SPLIT</span>
            <span className="font-mono text-[40px] font-semibold leading-none">
              <sup>1</sup>&frasl;<sub>{n}</sub>
            </span>
          </span>
          <span className="mt-8 block text-[26px] font-semibold leading-tight tracking-tight">
            Everyone pays {money(even, bill.currency)}
          </span>
          <span className="mt-1 block text-[16px] text-muted">Fair and square.</span>
          {busy === "split" && <Dots className="absolute bottom-6 right-6" />}
        </button>

        <button
          disabled={!!busy}
          onClick={() => pick("chaos")}
          className="animate-fade-up relative overflow-hidden rounded-[32px] bg-ink p-6 text-left text-white transition [animation-delay:80ms] active:scale-[0.98] disabled:opacity-60"
        >
          <span className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full bg-chaos/90 blur-2xl" />
          <span className="relative flex items-center justify-between">
            <span className="text-[15px] font-bold tracking-[0.18em] text-chaos">CHAOS</span>
            <span className="text-[40px] leading-none group-hover:animate-wobble">🎲</span>
          </span>
          <span className="relative mt-8 block text-[26px] font-semibold leading-tight tracking-tight">Let luck split it.</span>
          <span className="relative mt-1 block text-[16px] text-white/60">Someone pays €2. Someone pays a lot.</span>
          {busy === "chaos" && <Dots className="absolute bottom-6 right-6" />}
        </button>
      </div>

      <p className="mt-auto pt-8 text-center text-[15px] text-muted">Everyone must agree</p>
    </Screen>
  );
}

/* ---------------- 2. agreeing ---------------- */

function Agreeing({ bill }: { bill: Bill }) {
  const { user } = useUser();
  const agreed = bill.participants.filter((p) => p.accepted).length;
  const chaos = bill.mode === "chaos";
  return (
    <Screen>
      <Header title={bill.name} />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className={cx("text-[64px]", chaos && "animate-wobble")}>{chaos ? "🎲" : `1/${bill.participants.length}`}</span>
        <p className={cx("mt-4 text-[15px] font-bold tracking-[0.18em]", chaos && "text-chaos")}>{chaos ? "CHAOS" : "SPLIT"}</p>
        <h1 className="mt-2 text-[30px] font-semibold tracking-tight">Waiting for everyone</h1>
        <p className="mt-2 text-[17px] text-muted tabular">
          {agreed} of {bill.participants.length} agreed
        </p>
        <ul className="mt-10 w-full">
          {bill.participants.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={p.name} seed={p.code} size={40} dark={p.id === user?.id} />
              <span className="flex-1 text-left text-[17px] font-semibold tracking-tight">{p.name}</span>
              {p.accepted ? (
                <span className="animate-pop grid size-7 place-items-center rounded-full bg-positive text-white">
                  <Check className="size-4" strokeWidth={3.5} />
                </span>
              ) : (
                <Dots className="text-faint" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}

/* ---------------- 3. chaos roll ---------------- */

const ROLL_MS = 3200;

function ChaosRoll({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const [tick, setTick] = useState(0);
  const [left, setLeft] = useState(3);
  const codes = bill.participants.map((p) => p.code);

  useEffect(() => {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    // The highlight spins fast then decelerates, like a wheel.
    const step = () => {
      const t = (Date.now() - start) / ROLL_MS;
      setLeft(Math.max(1, 3 - Math.floor(t * 3)));
      if (t >= 1) {
        billService.markRevealed(bill.id);
        onDone();
        return;
      }
      setTick((x) => x + 1);
      timer = setTimeout(step, 60 + t * t * 260);
    };
    step();
    return () => clearTimeout(timer);
  }, [bill.id, onDone]);

  return (
    <Screen className="bg-ink text-white">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="animate-wobble text-[72px]">🎲</span>
        <p className="mt-4 text-[15px] font-bold tracking-[0.22em] text-chaos">CHAOS</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight">Who&apos;s getting lucky?</h1>
        <ul className="mt-10 flex flex-col gap-2 font-mono text-[28px] font-semibold tracking-widest">
          {codes.map((c, i) => {
            const on = tick % codes.length === i;
            return (
              <li key={c} className={cx("rounded-full px-6 py-1 transition-colors duration-75", on ? "bg-chaos text-white" : "text-white/35")}>
                {c}
              </li>
            );
          })}
        </ul>
        <p key={left} className="animate-pop mt-12 text-[56px] font-semibold tabular">
          {left}
        </p>
      </div>
    </Screen>
  );
}

/* ---------------- 4. reveal ---------------- */

function Reveal({ bill }: { bill: Bill }) {
  const router = useRouter();
  const { user } = useUser();
  const me = bill.participants.find((p) => p.id === user?.id);
  const chaos = bill.mode === "chaos";

  useEffect(() => {
    if (!bill.revealed) billService.markRevealed(bill.id);
  }, [bill.id, bill.revealed]);

  const sorted = chaos ? [...bill.participants].sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0)) : bill.participants;
  const max = Math.max(...bill.participants.map((p) => p.amount ?? 0));

  return (
    <Screen>
      <Header back={`/bill/${bill.id}`} />
      <div className="text-center">
        <p className={cx("text-[15px] font-bold tracking-[0.22em]", chaos && "text-chaos")}>{chaos ? "CHAOS SPLIT" : "SPLIT"}</p>
        <p className="mt-2 text-[40px] font-semibold tracking-[-0.03em] tabular">{money(bill.total, bill.currency)}</p>
      </div>

      <ul className="mt-6">
        {sorted.map((p, i) => (
          <li key={p.id} className="animate-fade-up flex items-center gap-3 py-2" style={{ animationDelay: `${150 + i * 220}ms` }}>
            <Avatar name={p.name} seed={p.code} size={36} dark={p.id === user?.id} />
            <span className="flex-1 text-[17px] font-semibold tracking-tight">{p.name}</span>
            {chaos && (
              <span className="mr-3 h-1.5 w-16 overflow-hidden rounded-full bg-surface">
                <span className="block h-full rounded-full bg-chaos" style={{ width: `${((p.amount ?? 0) / max) * 100}%` }} />
              </span>
            )}
            <span className="w-16 text-right text-[17px] font-semibold tabular">{money(p.amount ?? 0, bill.currency)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end border-t border-surface-2 pt-3 text-[17px] font-semibold text-muted tabular">
        {money(bill.total, bill.currency)}
      </div>

      {me && (
        <div className="animate-pop mt-8 rounded-[32px] bg-surface py-6 text-center" style={{ animationDelay: `${300 + sorted.length * 220}ms` }}>
          <p className="text-[15px] font-medium text-muted">Your share</p>
          <p className="mt-1 text-[56px] font-semibold leading-none tracking-[-0.045em] tabular">{money(me.amount ?? 0, bill.currency, { fixed: true })}</p>
          {chaos && <p className="mt-2 text-[15px] text-muted">{me.amount === max ? "Oof. The dice have spoken. 🫠" : me.amount === sorted[0].amount ? "Lucky you. 🍀" : "Could be worse."}</p>}
        </div>
      )}

      <BottomBar>
        {me?.paid ? (
          <Button onClick={() => router.push(`/bill/${bill.id}/pay`)}>See who&apos;s paid</Button>
        ) : (
          <Button variant={chaos ? "chaos" : "primary"} onClick={() => router.push(`/bill/${bill.id}/pay`)}>
            Pay {money(me?.amount ?? 0, bill.currency, { fixed: true })}
          </Button>
        )}
      </BottomBar>
    </Screen>
  );
}
