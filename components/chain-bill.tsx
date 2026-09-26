"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { formatUnits, parseUnits } from "viem";
import type { ChainBill } from "@/lib/chain-bill";
import { USDC_DECIMALS } from "@/lib/chain/config";
import { connectWallet, connectedAccount, getTestUsdc, hasWallet, payBill, readGuest } from "@/lib/chain/wallet";
import { Avatar, BottomBar, Button, Dots, Header, Screen, Spinner, cx } from "./ui";

const usd = (units: bigint) => `$${Number(formatUnits(units, USDC_DECIMALS)).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Guest = Awaited<ReturnType<typeof readGuest>>;
type Busy = null | "connect" | "usdc" | "approve" | "approving" | "pay" | "paying";

/** A real bill on Monad (numeric id). Guests connect a wallet, see their share and pay it. */
export function ChainBillView({ id }: { id: string }) {
  const [bill, setBill] = useState<ChainBill | null | undefined>(undefined);
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);

  // Public bill state, shared through the server cache.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/bill/${id}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 404) setBill(null);
        else if (res.ok) setBill(await res.json());
      } catch {}
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  // This wallet's share / balance, straight from the wallet's RPC.
  const refreshGuest = useCallback(
    async (a: `0x${string}`) => {
      try {
        setGuest(await readGuest(BigInt(id), a));
      } catch {}
    },
    [id],
  );

  useEffect(() => {
    let alive = true;
    connectedAccount()
      .then((a) => alive && a && setAccount(a))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    const tick = async () => {
      try {
        const g = await readGuest(BigInt(id), account);
        if (alive) setGuest(g);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [account, id]);

  if (bill === undefined) return <Spinner />;
  if (bill === null) {
    return (
      <Screen>
        <Header back="/home" />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-[22px] font-semibold">Bill not found</p>
          <p className="mt-2 text-muted">Check the Bill ID on the table and try again.</p>
        </div>
      </Screen>
    );
  }

  const me = account ? bill.members.find((m) => m.address.toLowerCase() === account.toLowerCase()) : undefined;
  const iPaid = !!me?.paid || (guest ? guest.paid > BigInt(0) : false);
  const full = !me && bill.joined >= bill.participants;
  const share = guest?.share;
  const needsUsdc = guest && share !== undefined && guest.balance < share;
  const paidUnits = bill.members.filter((m) => m.paid).reduce((s, m) => s + BigInt(m.share), BigInt(0));
  const pct = Number((paidUnits * BigInt(100)) / BigInt(bill.total));
  const done = bill.status === "paid";

  async function run(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      const m = e instanceof Error ? e.message.split("\n")[0] : "Something went wrong";
      setError(/reject|denied/i.test(m) ? "Cancelled in wallet" : /insufficient funds/i.test(m) ? "This wallet needs testnet MON for the network fee" : m);
    } finally {
      setBusy(null);
    }
  }

  const connect = () =>
    run(async () => {
      setBusy("connect");
      setAccount(await connectWallet());
    });

  const topUp = () =>
    run(async () => {
      setBusy("usdc");
      const want = share && share > parseUnits("20", USDC_DECIMALS) ? share : parseUnits("20", USDC_DECIMALS);
      await getTestUsdc(account!, want);
      await refreshGuest(account!);
    });

  const pay = () =>
    run(async () => {
      setTxHash(await payBill(BigInt(id), account!, (step) => setBusy(step)));
      await refreshGuest(account!);
    });

  const label: Record<Exclude<Busy, null>, string> = {
    connect: "Connecting",
    usdc: "Getting test USDC",
    approve: "Approve in wallet",
    approving: "Approving",
    pay: "Confirm in wallet",
    paying: "Paying on Monad",
  };

  return (
    <Screen>
      <Header back="/home" title={`Bill ${bill.code}`} />

      <div className="mt-6 text-center">
        <p className="text-[48px] font-semibold leading-none tracking-[-0.04em] tabular">{bill.display}</p>
        <p className="mt-3 text-[16px] text-muted">
          Split equally · {bill.participants} people
        </p>
      </div>

      <div className="mt-8">
        <div className="flex justify-between text-[15px] text-muted tabular">
          <span>
            <b className="text-ink">{usd(paidUnits)}</b> paid
          </span>
          <span>
            {bill.paid}/{bill.participants}
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface">
          <div className={cx("h-full rounded-full transition-[width] duration-700", done ? "bg-positive" : "bg-ink")} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="mt-6">
        {bill.members.map((m) => {
          const isMe = account && m.address.toLowerCase() === account.toLowerCase();
          return (
            <li key={m.address} className="animate-fade-up flex items-center gap-3 py-2.5">
              <span className="relative">
                <Avatar name={isMe ? "You" : m.address.slice(2, 3)} seed={m.address} size={40} dark={!!isMe} />
                {m.paid && (
                  <span className="animate-pop absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-canvas bg-positive text-white">
                    <Check className="size-2.5" strokeWidth={4} />
                  </span>
                )}
              </span>
              <span className={cx("flex-1 text-[17px] font-semibold tracking-tight", !m.paid && "text-muted")}>
                {isMe ? "You" : <span className="font-mono text-[15px]">{short(m.address)}</span>}
              </span>
              <span className={cx("text-[17px] font-semibold tabular", !m.paid && "text-muted")}>{m.display}</span>
            </li>
          );
        })}
        {Array.from({ length: bill.participants - bill.joined }, (_, i) => (
          <li key={`empty-${i}`} className="flex items-center gap-3 py-2.5 text-faint">
            <span className="size-10 rounded-full border-2 border-dashed border-surface-2" />
            <span className="flex-1 text-[16px] font-medium">Waiting for someone to join</span>
          </li>
        ))}
      </ul>

      {!done && !iPaid && !full && share !== undefined && (
        <div className="mt-6 rounded-[28px] bg-surface py-5 text-center">
          <p className="text-[15px] font-medium text-muted">Your share</p>
          <p className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.045em] tabular">{usd(share)}</p>
          {guest && <p className="mt-2 text-[14px] text-muted">Wallet balance {usd(guest.balance)} USDC</p>}
        </div>
      )}

      <BottomBar>
        {error && <p className="mb-3 text-center text-[15px] text-chaos">{error}</p>}
        {done ? (
          <div className="flex flex-col items-center gap-2">
            <p className="flex items-center gap-2 text-[19px] font-semibold text-positive">
              <Check className="size-5" strokeWidth={3} /> Paid. Everyone&apos;s done.
            </p>
            <Link href="/home" className="flex h-12 items-center text-[17px] font-semibold">
              Done
            </Link>
          </div>
        ) : bill.status !== "open" ? (
          <p className="py-4 text-center text-[16px] text-muted">This bill {bill.status === "expired" ? "expired" : "was refunded"}.</p>
        ) : iPaid ? (
          <p className="flex h-14 items-center justify-center gap-2 text-[17px] font-medium text-muted">
            You paid · waiting for {bill.participants - bill.paid} more <Dots />
          </p>
        ) : full ? (
          <p className="py-4 text-center text-[16px] text-muted">This table is full.</p>
        ) : !hasWallet() ? (
          <p className="py-4 text-center text-[15px] text-muted">Open this page in a browser with a wallet (MetaMask) to pay.</p>
        ) : !account ? (
          <Button loading={busy === "connect"} onClick={connect}>
            Connect wallet to pay
          </Button>
        ) : needsUsdc ? (
          <Button variant="secondary" disabled={!!busy} onClick={topUp}>
            {busy === "usdc" ? <>{label.usdc} <Dots /></> : "Get test USDC"}
          </Button>
        ) : (
          <Button disabled={!!busy || share === undefined} onClick={pay}>
            {busy ? <>{label[busy]} <Dots /></> : `Pay ${share !== undefined ? usd(share) : ""}`}
          </Button>
        )}
        {txHash && (
          <a href={`https://testnet.monadscan.com/tx/${txHash}`} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-1 text-[14px] font-semibold text-muted">
            View payment on explorer <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </BottomBar>
    </Screen>
  );
}
