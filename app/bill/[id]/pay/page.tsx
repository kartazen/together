"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { billService } from "@/lib/services";
import { useBill, useUser } from "@/lib/hooks";
import { billEmoji, money } from "@/lib/format";
import type { Bill, User } from "@/lib/types";
import { RequireUser, TopUpSheet } from "@/components/features";
import { Avatar, BottomBar, Button, Card, Dots, Header, Screen, Spinner, cx } from "@/components/ui";

export default function PayPage() {
  return (
    <RequireUser>
      <Pay />
    </RequireUser>
  );
}

function Pay() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { bill } = useBill(id);
  const me = bill?.participants.find((p) => p.id === user?.id);
  const notReady = bill && (!me || me.amount == null || bill.status === "agreeing");

  useEffect(() => {
    if (notReady) router.replace(`/bill/${id}/play`);
  }, [notReady, id, router]);

  if (!bill || !user || !me || notReady) return <Spinner />;
  return me.paid ? <Progress bill={bill} user={user} /> : <Confirm bill={bill} user={user} amount={me.amount!} />;
}

/* ---------------- confirm ---------------- */

function Confirm({ bill, user, amount }: { bill: Bill; user: User; amount: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [topUp, setTopUp] = useState(false);
  const short = Math.max(0, Math.round((amount - user.balance) * 100) / 100);
  const after = Math.round((user.balance - amount) * 100) / 100;

  async function pay() {
    setBusy(true);
    setError("");
    try {
      await billService.pay(bill.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header back={`/bill/${bill.id}/play`} title="Confirm" />

      <div className="mt-10 flex flex-col items-center text-center">
        <span className="grid size-16 place-items-center rounded-full bg-surface text-[30px]">{billEmoji(bill.name)}</span>
        <p className="mt-4 text-[17px] text-muted">
          {bill.name} · {bill.mode === "chaos" ? "Chaos" : "Split"}
        </p>
        <p className="mt-2 text-[72px] font-semibold leading-none tracking-[-0.05em] tabular">{money(amount, bill.currency, { fixed: true })}</p>
        <p className="mt-3 text-[16px] text-muted">
          Your share of {money(bill.total, bill.currency, { fixed: true })}
        </p>
      </div>

      <Card className="mt-10 divide-y divide-surface-2 px-5">
        <Row label="From" value="Your balance" />
        <Row label="Balance now" value={money(user.balance, user.currency, { fixed: true })} />
        <Row
          label="After paying"
          value={short > 0 ? "Not enough" : money(after, user.currency, { fixed: true })}
          tone={short > 0 ? "text-chaos" : undefined}
        />
      </Card>
      {error && <p className="mt-3 text-center text-[15px] text-chaos">{error}</p>}

      <BottomBar>
        {short > 0 ? (
          <Button onClick={() => setTopUp(true)}>Add {money(Math.ceil(short), user.currency)} to pay</Button>
        ) : (
          <Button loading={busy} onClick={pay}>
            Pay {money(amount, bill.currency, { fixed: true })}
          </Button>
        )}
      </BottomBar>
      <TopUpSheet open={topUp} onClose={() => setTopUp(false)} suggested={Math.max(20, Math.ceil(short))} />
    </Screen>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-4 text-[16px]">
      <span className="text-muted">{label}</span>
      <span className={cx("font-semibold tabular", tone)}>{value}</span>
    </div>
  );
}

/* ---------------- live progress ---------------- */

function Progress({ bill, user }: { bill: Bill; user: User }) {
  const router = useRouter();
  const paid = bill.participants.filter((p) => p.paid).reduce((s, p) => s + (p.amount ?? 0), 0);
  const pct = Math.min(100, (paid / bill.total) * 100);
  const waiting = bill.participants.filter((p) => !p.paid);
  const done = bill.status === "paid";

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.replace(`/bill/${bill.id}/success`), 1100);
    return () => clearTimeout(t);
  }, [done, bill.id, router]);

  return (
    <Screen>
      <Header back="/home" title={bill.name} />

      <div className="mt-8 text-center">
        <p className="text-[48px] font-semibold leading-none tracking-[-0.04em] tabular">{money(bill.total, bill.currency, { fixed: true })}</p>
        <p className="mt-4 text-[17px] text-muted tabular">
          <b className="text-ink">{money(paid, bill.currency)}</b> / {money(bill.total, bill.currency)} paid
        </p>
      </div>

      <div className="mt-6 h-3 overflow-hidden rounded-full bg-surface">
        <div className={cx("h-full rounded-full transition-[width] duration-700 ease-out", done ? "bg-positive" : "bg-ink")} style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-8">
        {bill.participants.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3">
            <span className="relative">
              <Avatar name={p.name} seed={p.code} size={40} dark={p.id === user.id} />
              {p.paid && (
                <span className="animate-pop absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-canvas bg-positive text-white">
                  <Check className="size-2.5" strokeWidth={4} />
                </span>
              )}
            </span>
            <span className={cx("flex-1 text-[17px] font-semibold tracking-tight transition", !p.paid && "text-muted")}>{p.name}</span>
            <span className={cx("text-[17px] font-semibold tabular", !p.paid && "text-muted")}>{money(p.amount ?? 0, bill.currency)}</span>
          </li>
        ))}
      </ul>

      <BottomBar>
        <p className="flex h-14 items-center justify-center gap-2 text-[17px] font-medium text-muted">
          {done ? (
            <span className="font-semibold text-positive">Everyone&apos;s paid</span>
          ) : (
            <>
              Waiting for {waiting.length === 1 ? waiting[0].name : `${waiting.length} friends`} <Dots />
            </>
          )}
        </p>
      </BottomBar>
    </Screen>
  );
}
