"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Share } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { billService } from "@/lib/services";
import { useBill, useUser } from "@/lib/hooks";
import { money } from "@/lib/format";
import { ChainBillView } from "@/components/chain-bill";
import { RequireUser } from "@/components/features";
import { Avatar, BottomBar, Button, Dots, Header, IconButton, Screen, Spinner } from "@/components/ui";

export default function BillPage() {
  const { id } = useParams<{ id: string }>();
  // Numeric ids are real bills on Monad; the rest are demo (mock) bills.
  if (/^\d+$/.test(id)) return <ChainBillView id={id} />;
  return (
    <RequireUser>
      <LiveBill />
    </RequireUser>
  );
}

function LiveBill() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { bill, loading } = useBill(id);
  const [copied, setCopied] = useState(false);
  const joining = useRef(false);

  // Arrived via QR (?join=1) → add ourselves to the table.
  useEffect(() => {
    if (!bill || !user || joining.current) return;
    const wantsJoin = new URLSearchParams(window.location.search).has("join");
    if (wantsJoin && !bill.participants.some((p) => p.id === user.id)) {
      joining.current = true;
      billService.joinBill(bill.id).catch(() => {});
    }
  }, [bill, user]);

  if (loading) return <Spinner />;
  if (!bill) {
    return (
      <Screen>
        <Header back="/home" />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-[22px] font-semibold">Bill not found</p>
          <p className="mt-2 text-muted">Check the Bill ID and try again.</p>
        </div>
      </Screen>
    );
  }

  const joinUrl = `${window.location.origin}/bill/${bill.id}?join=1`;
  const open = bill.status === "open";

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: bill!.name, text: `Join "${bill!.name}" on together — ID ${bill!.code}`, url: joinUrl });
      else {
        await navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(bill!.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const cta =
    bill.status === "open"
      ? { label: "Choose how to pay", href: `/bill/${bill.id}/play`, disabled: bill.participants.length < 2 }
      : bill.status === "paid"
        ? { label: "View receipt", href: `/bill/${bill.id}/success` }
        : bill.revealed
          ? { label: "Go to payment", href: `/bill/${bill.id}/pay` }
          : { label: "Continue", href: `/bill/${bill.id}/play` };

  return (
    <Screen>
      <Header
        back="/home"
        title={bill.name}
        right={
          <IconButton label="Share bill" onClick={share}>
            {copied ? <Check className="size-5" strokeWidth={2.5} /> : <Share className="size-5" strokeWidth={2.25} />}
          </IconButton>
        }
      />

      <p className="mt-4 text-center text-[48px] font-semibold leading-none tracking-[-0.04em] tabular">
        {money(bill.total, bill.currency, { fixed: true })}
      </p>

      <div className="mx-auto mt-7 rounded-[32px] bg-canvas p-5 shadow-float">
        <QRCodeSVG value={joinUrl} size={180} level="M" bgColor="transparent" fgColor="#0b0b0c" marginSize={0} />
      </div>
      <p className="mt-4 text-center text-[17px] font-semibold tracking-tight">{open ? "Scan to join" : "Table locked"}</p>
      <button onClick={copyCode} className="mx-auto mt-2 flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-[15px] transition active:scale-95">
        <span className="text-muted">Bill ID</span>
        <span className="font-mono font-semibold tracking-wider">{bill.code}</span>
        <Copy className="size-3.5 text-muted" />
      </button>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[20px] font-semibold tracking-tight">Joined</h2>
          <span className="text-[15px] font-medium text-muted tabular">{bill.participants.length}</span>
        </div>
        <ul>
          {bill.participants.map((p) => (
            <li key={p.id} className="animate-fade-up flex items-center gap-3 py-2.5">
              <Avatar name={p.name} seed={p.code} size={40} dark={p.id === user?.id} />
              <span className="flex-1 text-[17px] font-semibold tracking-tight">
                {p.name}
                {p.isHost && <span className="ml-2 text-[13px] font-medium text-muted">host</span>}
              </span>
              <span className="font-mono text-[15px] text-muted">{p.code}</span>
            </li>
          ))}
          {open && (
            <li className="flex items-center gap-3 py-2.5 text-faint">
              <span className="relative grid size-10 place-items-center">
                <span className="animate-ping-soft absolute size-4 rounded-full bg-faint" />
                <span className="size-4 rounded-full bg-faint" />
              </span>
              <span className="flex items-center gap-2 text-[16px] font-medium">
                Waiting for friends <Dots />
              </span>
            </li>
          )}
        </ul>
      </section>

      <BottomBar>
        <Button disabled={cta.disabled} onClick={() => router.push(cta.href)}>
          {cta.label}
        </Button>
      </BottomBar>
    </Screen>
  );
}
