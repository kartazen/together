"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useBill, useUser } from "@/lib/hooks";
import { money } from "@/lib/format";
import { RequireUser } from "@/components/features";
import { Avatar, Button, Screen, Sheet, Spinner } from "@/components/ui";

export default function SuccessPage() {
  return (
    <RequireUser>
      <Success />
    </RequireUser>
  );
}

function Success() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { bill } = useBill(id);
  const [receipt, setReceipt] = useState(false);

  useEffect(() => {
    if (bill && bill.status !== "paid") router.replace(`/bill/${id}/pay`);
  }, [bill, id, router]);

  if (!bill || bill.status !== "paid") return <Spinner />;
  const mode = bill.mode === "chaos" ? "Chaos" : "Split";

  return (
    <Screen className="text-center">
      <div className="flex flex-1 flex-col items-center justify-center">
        <span className="relative grid size-24 place-items-center">
          <span className="animate-ping-soft absolute inset-0 rounded-full bg-positive/40" />
          <span className="animate-pop relative grid size-24 place-items-center rounded-full bg-positive text-white">
            <Check className="size-11" strokeWidth={3} />
          </span>
        </span>
        <p className="animate-fade-up mt-8 text-[15px] font-bold tracking-[0.22em] [animation-delay:150ms]">PAID</p>
        <p className="animate-fade-up mt-2 text-[56px] font-semibold leading-none tracking-[-0.045em] tabular [animation-delay:200ms]">
          {money(bill.total, bill.currency, { fixed: true })}
        </p>
        <p className="animate-fade-up mt-5 text-[19px] font-medium [animation-delay:260ms]">Everyone&apos;s done.</p>
        <p className="animate-fade-up mt-1 text-[16px] text-muted [animation-delay:300ms]">
          {bill.participants.length} friends · {mode}
        </p>
      </div>

      <Button variant="secondary" onClick={() => setReceipt(true)}>
        View receipt
      </Button>
      <Link href="/home" className="mt-2 flex h-12 items-center justify-center text-[17px] font-semibold">
        Done
      </Link>

      <Sheet open={receipt} onClose={() => setReceipt(false)} title={bill.name} subtitle={new Date(bill.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}>
        <div className="mt-4 rounded-[28px] bg-surface p-5 text-left">
          <div className="flex items-center justify-between text-[15px] text-muted">
            <span>{mode}</span>
            <span className="font-mono">Bill ID {bill.code}</span>
          </div>
          <ul className="mt-3 divide-y divide-surface-2">
            {bill.participants.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <Avatar name={p.name} seed={p.code} size={32} dark={p.id === user?.id} />
                <span className="flex-1 text-[16px] font-semibold">{p.name}</span>
                <span className="font-mono text-[13px] text-muted">{p.code}</span>
                <span className="w-16 text-right text-[16px] font-semibold tabular">{money(p.amount ?? 0, bill.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-ink/10 pt-4 text-[17px] font-semibold">
            <span>Total</span>
            <span className="tabular">{money(bill.total, bill.currency, { fixed: true })}</span>
          </div>
        </div>
        <details className="mt-4 rounded-[28px] px-5 py-3 text-left text-[15px] text-muted">
          <summary className="cursor-pointer font-medium">Advanced details</summary>
          <dl className="mt-3 space-y-2 font-mono text-[13px]">
            <div className="flex justify-between gap-4"><dt>Bill</dt><dd className="truncate">{bill.id}</dd></div>
            <div className="flex justify-between gap-4"><dt>Settlement</dt><dd>Demo (mock)</dd></div>
          </dl>
        </details>
      </Sheet>
    </Screen>
  );
}
