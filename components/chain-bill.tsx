"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { formatUnits, parseUnits } from "viem";
import type { ChainBill } from "@/lib/chain-bill";
import { USDC_DECIMALS, type ChainMode } from "@/lib/chain/config";
import { userService } from "@/lib/services";
import { billAction, connectWallet, connectedAccount, getTestUsdc, hasWallet, payBill, readGuest } from "@/lib/chain/wallet";
import { NoWalletButton } from "./wallet-gate";
import { Avatar, BottomBar, Button, Dots, Header, Screen, Spinner, cx } from "./ui";

const usd = (units: bigint) => `$${Number(formatUnits(units, USDC_DECIMALS)).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

type Guest = Awaited<ReturnType<typeof readGuest>>;
type Busy = null | "connect" | "join" | "propose" | "accept" | "decline" | "usdc" | "approve" | "approving" | "pay" | "paying" | "sent";

const LABEL: Record<Exclude<Busy, null>, string> = {
  connect: "Connecting",
  join: "Confirm in wallet",
  propose: "Confirm in wallet",
  accept: "Confirm in wallet",
  decline: "Confirm in wallet",
  usdc: "Getting test USDC",
  approve: "Approve in wallet",
  approving: "Approving",
  pay: "Confirm in wallet",
  paying: "Paying on Monad",
  sent: "Waiting for Monad",
};

/**
 * A real bill on Monad (GroupCheckoutV2). The table joins, votes SPLIT or CHAOS,
 * the contract assigns shares, everyone pays.
 */
export function ChainBillView({ id }: { id: string }) {
  const [bill, setBill] = useState<ChainBill | null | undefined>(undefined);
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [revealedRound, setRevealedRound] = useState<number | null>(() => {
    try {
      const v = typeof window !== "undefined" ? sessionStorage.getItem(`together.revealed.${id}`) : null;
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });

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

  useEffect(() => {
    let alive = true;
    connectedAccount()
      .then((a) => alive && a && setAccount(a))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // This wallet's share / balance, straight from the wallet's RPC.
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

  const refreshGuest = useCallback(async () => {
    if (account) setGuest(await readGuest(BigInt(id), account));
  }, [account, id]);

  const markRevealed = useCallback(
    (round: number) => {
      setRevealedRound(round);
      try {
        sessionStorage.setItem(`together.revealed.${id}`, String(round));
      } catch {}
    },
    [id],
  );

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

  const me = bill.members.find((m) => same(m.address, account));
  const chaos = bill.mode === "chaos";

  // CHAOS: roll the dice once per round before showing who pays what.
  if (bill.status === "paying" && chaos && revealedRound !== bill.round) {
    return <ChaosRoll bill={bill} account={account} onDone={() => markRevealed(bill.round)} />;
  }

  async function run(kind: Busy, fn: () => Promise<void>) {
    setError("");
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      const m = e instanceof Error ? e.message.split("\n")[0] : "Something went wrong";
      setError(
        /reject|denied/i.test(m)
          ? "Cancelled in wallet"
          : /insufficient funds/i.test(m)
            ? "This wallet needs testnet MON for the network fee"
            : /WrongStatus/i.test(m)
              ? "The table moved on — refresh and try again"
              : m,
      );
    } finally {
      setBusy(null);
    }
  }

  const act = (kind: "join" | "accept" | "decline", action: Parameters<typeof billAction>[2]) =>
    run(kind, async () => {
      await billAction(BigInt(id), account!, action, () => setBusy("sent"));
      await refreshGuest();
    });

  const propose = (mode: ChainMode) =>
    run("propose", async () => {
      await billAction(BigInt(id), account!, { propose: mode }, () => setBusy("sent"));
      setPicking(false);
    });

  const connect = () => run("connect", async () => setAccount(await connectWallet()));

  const share = guest?.share ?? (me ? BigInt(me.share) : undefined);
  const needsUsdc = guest && share !== undefined && guest.balance < share;

  const topUp = () =>
    run("usdc", async () => {
      const want = share && share > parseUnits("20", USDC_DECIMALS) ? share : parseUnits("20", USDC_DECIMALS);
      await getTestUsdc(account!, want);
      await userService.recordActivity({ kind: "topup", amount: Number(formatUnits(want, USDC_DECIMALS)), currency: "USD" });
      await refreshGuest();
    });

  const pay = () =>
    run("pay", async () => {
      const paidShare = share;
      setTxHash(await payBill(BigInt(id), account!, (step) => setBusy(step)));
      if (paidShare !== undefined)
        await userService.recordActivity({
          kind: "bill",
          billId: id,
          name: `Bill ${bill.code}`,
          amount: -Number(formatUnits(paidShare, USDC_DECIMALS)),
          currency: "USD",
        });
      await refreshGuest();
    });

  const busyLabel = busy ? (
    <>
      {LABEL[busy]} <Dots />
    </>
  ) : null;

  /* ---------------- settled ---------------- */
  if (bill.status === "paid") {
    return (
      <Screen className="text-center">
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className="relative grid size-24 place-items-center">
            <span className="animate-ping-soft absolute inset-0 rounded-full bg-positive/40" />
            <span className="animate-pop relative grid size-24 place-items-center rounded-full bg-positive text-white">
              <Check className="size-11" strokeWidth={3} />
            </span>
          </span>
          <p className="mt-8 text-[15px] font-bold tracking-[0.22em]">PAID</p>
          <p className="mt-2 text-[56px] font-semibold leading-none tracking-[-0.045em] tabular">{bill.display}</p>
          <p className="mt-5 text-[19px] font-medium">Everyone&apos;s done.</p>
          <p className="mt-1 text-[16px] text-muted">
            {bill.joined} friends · {chaos ? "Chaos" : "Split"}
          </p>
          <ul className="mt-8 w-full text-left">
            {bill.members.map((m) => (
              <MemberRow key={m.address} m={m} isMe={same(m.address, account)} right={m.display} />
            ))}
          </ul>
        </div>
        <Link href="/home" className="flex h-14 items-center justify-center rounded-full bg-surface text-[17px] font-semibold">
          Done
        </Link>
      </Screen>
    );
  }

  /* ---------------- CTA per phase ---------------- */
  let cta: React.ReactNode;
  if (bill.status === "expired" || bill.status === "refunded") {
    cta = <p className="py-4 text-center text-[16px] text-muted">This bill {bill.status === "expired" ? "expired" : "was refunded"}.</p>;
  } else if (!hasWallet()) {
    cta = <NoWalletButton action={bill.status === "paying" ? "pay" : "join"} />;
  } else if (!account) {
    cta = (
      <Button loading={busy === "connect"} onClick={connect}>
        Connect wallet
      </Button>
    );
  } else if (bill.status === "joining") {
    if (!me)
      cta = (
        <Button disabled={!!busy} onClick={() => act("join", "join")}>
          {busyLabel ?? "Join this bill"}
        </Button>
      );
    else if (bill.joined < 2)
      cta = (
        <p className="flex h-14 items-center justify-center gap-2 text-[16px] font-medium text-muted">
          Waiting for friends to join <Dots />
        </p>
      );
    else if (!picking)
      cta = <Button onClick={() => setPicking(true)}>Choose how to pay</Button>;
    else
      cta = (
        <Button variant="ghost" disabled={!!busy} onClick={() => setPicking(false)}>
          {busyLabel ?? "Not yet"}
        </Button>
      );
  } else if (bill.status === "agreeing") {
    if (!me) cta = <p className="py-4 text-center text-[16px] text-muted">The table is voting — joining is closed.</p>;
    else if (me.accepted)
      cta = (
        <p className="flex h-14 items-center justify-center gap-2 text-[16px] font-medium text-muted">
          Waiting for everyone · {bill.accepted}/{bill.joined} <Dots />
        </p>
      );
    else
      cta = busy ? (
        <Button disabled>{busyLabel}</Button>
      ) : (
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <Button variant="secondary" onClick={() => act("decline", "decline")}>
            No
          </Button>
          <Button variant={chaos ? "chaos" : "primary"} onClick={() => act("accept", "accept")}>
            I&apos;m in {chaos ? "🎲" : ""}
          </Button>
        </div>
      );
  } else {
    // paying
    if (!me) cta = <p className="py-4 text-center text-[16px] text-muted">The table is paying.</p>;
    else if (me.paid || (guest && guest.paid > BigInt(0)))
      cta = (
        <p className="flex h-14 items-center justify-center gap-2 text-[16px] font-medium text-muted">
          You paid · waiting for {bill.joined - bill.paid} more <Dots />
        </p>
      );
    else if (needsUsdc)
      cta = (
        <Button variant="secondary" disabled={!!busy} onClick={topUp}>
          {busyLabel ?? "Get test USDC"}
        </Button>
      );
    else
      cta = (
        <Button variant={chaos ? "chaos" : "primary"} disabled={!!busy || share === undefined} onClick={pay}>
          {busyLabel ?? `Pay ${share !== undefined ? usd(share) : ""}`}
        </Button>
      );
  }

  /* ---------------- body per phase ---------------- */
  const sortedForReveal =
    bill.status === "paying" && chaos ? [...bill.members].sort((a, b) => Number(BigInt(a.share) - BigInt(b.share))) : bill.members;
  const maxShare = bill.members.reduce((m, x) => (BigInt(x.share) > m ? BigInt(x.share) : m), BigInt(0));
  const minShare = bill.members.reduce((m, x) => (m === BigInt(-1) || BigInt(x.share) < m ? BigInt(x.share) : m), BigInt(-1));
  const paidUnits = bill.members.filter((m) => m.paid).reduce((s, m) => s + BigInt(m.share), BigInt(0));
  const even = bill.joined ? BigInt(bill.total) / BigInt(bill.joined) : BigInt(0);

  return (
    <Screen>
      <Header back="/home" title={`Bill ${bill.code}`} />

      {bill.status === "agreeing" ? (
        <div className="mt-4 flex flex-col items-center text-center">
          <span className={cx("text-[56px] leading-none", chaos && "animate-wobble")}>{chaos ? "🎲" : `1/${bill.joined}`}</span>
          <p className={cx("mt-4 text-[15px] font-bold tracking-[0.18em]", chaos && "text-chaos")}>{chaos ? "CHAOS" : "SPLIT"}</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight">Everyone must agree</h1>
          <p className="mt-1 text-[16px] text-muted tabular">
            {bill.display} · {bill.accepted} of {bill.joined} agreed
          </p>
        </div>
      ) : bill.status === "paying" ? (
        <div className="mt-2 text-center">
          <p className={cx("text-[15px] font-bold tracking-[0.22em]", chaos && "text-chaos")}>{chaos ? "CHAOS SPLIT" : "SPLIT"}</p>
          <p className="mt-2 text-[40px] font-semibold tracking-[-0.03em] tabular">{bill.display}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-700"
              style={{ width: `${Number((paidUnits * BigInt(100)) / BigInt(bill.total))}%` }}
            />
          </div>
          <p className="mt-2 text-[14px] text-muted tabular">
            {usd(paidUnits)} of {bill.display} paid · {bill.paid}/{bill.joined}
          </p>
        </div>
      ) : (
        <div className="mt-6 text-center">
          <p className="text-[48px] font-semibold leading-none tracking-[-0.04em] tabular">{bill.display}</p>
          <p className="mt-3 text-[16px] text-muted">{bill.joined ? `${bill.joined} at the table` : "Nobody has joined yet"}</p>
        </div>
      )}

      {picking && bill.status === "joining" ? (
        <div className="mt-8 flex flex-col gap-3">
          <button
            disabled={!!busy}
            onClick={() => propose("split")}
            className="animate-fade-up rounded-[32px] bg-surface p-6 text-left transition active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex items-center justify-between">
              <span className="text-[15px] font-bold tracking-[0.18em]">SPLIT</span>
              <span className="font-mono text-[32px] font-semibold leading-none">1/{bill.joined}</span>
            </span>
            <span className="mt-6 block text-[24px] font-semibold leading-tight tracking-tight">Everyone pays {usd(even)}</span>
            <span className="mt-1 block text-[15px] text-muted">Fair and square.</span>
          </button>
          <button
            disabled={!!busy}
            onClick={() => propose("chaos")}
            className="animate-fade-up relative overflow-hidden rounded-[32px] bg-ink p-6 text-left text-white transition [animation-delay:80ms] active:scale-[0.98] disabled:opacity-60"
          >
            <span className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full bg-chaos/90 blur-2xl" />
            <span className="relative flex items-center justify-between">
              <span className="text-[15px] font-bold tracking-[0.18em] text-chaos">CHAOS</span>
              <span className="text-[36px] leading-none">🎲</span>
            </span>
            <span className="relative mt-6 block text-[24px] font-semibold leading-tight tracking-tight">Let luck split it.</span>
            <span className="relative mt-1 block text-[15px] text-white/60">Someone pays a little. Someone pays a lot.</span>
          </button>
          <p className="text-center text-[14px] text-muted">Everyone at the table must agree.</p>
        </div>
      ) : (
        <ul className="mt-6">
          {sortedForReveal.map((m, i) => {
            const isMe = same(m.address, account);
            let right: React.ReactNode = null;
            if (bill.status === "agreeing")
              right = m.accepted ? (
                <span className="animate-pop grid size-7 place-items-center rounded-full bg-positive text-white">
                  <Check className="size-4" strokeWidth={3.5} />
                </span>
              ) : (
                <Dots className="text-faint" />
              );
            else if (bill.status === "paying") right = m.display;
            return (
              <MemberRow
                key={m.address}
                m={m}
                isMe={isMe}
                right={right}
                delayMs={bill.status === "paying" ? 150 + i * 200 : 0}
                bar={bill.status === "paying" && chaos && maxShare > BigInt(0) ? Number((BigInt(m.share) * BigInt(100)) / maxShare) : undefined}
              />
            );
          })}
        </ul>
      )}

      {bill.status === "paying" && me && !me.paid && share !== undefined && (
        <div className="animate-pop mt-6 rounded-[28px] bg-surface py-5 text-center" style={{ animationDelay: `${300 + bill.joined * 200}ms` }}>
          <p className="text-[15px] font-medium text-muted">Your share</p>
          <p className="mt-1 text-[48px] font-semibold leading-none tracking-[-0.045em] tabular">{usd(share)}</p>
          {chaos && (
            <p className="mt-2 text-[15px] text-muted">
              {share === maxShare ? "Oof. The dice have spoken. 🫠" : share === minShare ? "Lucky you. 🍀" : "Could be worse."}
            </p>
          )}
          {guest && <p className="mt-1 text-[13px] text-muted">Wallet: {usd(guest.balance)} USDC</p>}
        </div>
      )}

      <BottomBar>
        {error && <p className="mb-3 text-center text-[15px] text-chaos">{error}</p>}
        {cta}
        {txHash && (
          <a
            href={`https://testnet.monadscan.com/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-center justify-center gap-1 text-[14px] font-semibold text-muted"
          >
            View payment on explorer <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </BottomBar>
    </Screen>
  );
}

function MemberRow({
  m,
  isMe,
  right,
  bar,
  delayMs = 0,
}: {
  m: ChainBill["members"][number];
  isMe: boolean;
  right?: React.ReactNode;
  bar?: number;
  delayMs?: number;
}) {
  return (
    <li className="animate-fade-up flex items-center gap-3 py-2.5" style={{ animationDelay: `${delayMs}ms` }}>
      <span className="relative">
        <Avatar name={isMe ? "You" : m.address.slice(2, 3)} seed={m.address} size={40} dark={isMe} />
        {m.paid && (
          <span className="animate-pop absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-canvas bg-positive text-white">
            <Check className="size-2.5" strokeWidth={4} />
          </span>
        )}
      </span>
      <span className="flex-1 text-[17px] font-semibold tracking-tight">
        {isMe ? "You" : <span className="font-mono text-[15px]">{short(m.address)}</span>}
      </span>
      {bar !== undefined && (
        <span className="mr-2 h-1.5 w-14 overflow-hidden rounded-full bg-surface">
          <span className="block h-full rounded-full bg-chaos" style={{ width: `${bar}%` }} />
        </span>
      )}
      <span className="text-[17px] font-semibold tabular">{right}</span>
    </li>
  );
}

const ROLL_MS = 3200;

/** Full-screen dice roll before the CHAOS reveal — same feel as the demo. */
function ChaosRoll({ bill, account, onDone }: { bill: ChainBill; account: string | null; onDone: () => void }) {
  const [tick, setTick] = useState(0);
  const [left, setLeft] = useState(3);
  const names = bill.members.map((m) => (same(m.address, account) ? "YOU" : m.address.slice(2, 6).toUpperCase()));

  // The bill re-polls every 1.5 s; keep the roll running across those re-renders.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const t = (Date.now() - start) / ROLL_MS;
      setLeft(Math.max(1, 3 - Math.floor(t * 3)));
      if (t >= 1) {
        done.current();
        return;
      }
      setTick((x) => x + 1);
      timer = setTimeout(step, 60 + t * t * 260);
    };
    step();
    return () => clearTimeout(timer);
  }, []);

  return (
    <Screen className="bg-ink text-white">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="animate-wobble text-[72px]">🎲</span>
        <p className="mt-4 text-[15px] font-bold tracking-[0.22em] text-chaos">CHAOS</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight">Who&apos;s getting lucky?</h1>
        <ul className="mt-10 flex flex-col gap-2 font-mono text-[28px] font-semibold tracking-widest">
          {names.map((c, i) => (
            <li
              key={`${c}-${i}`}
              className={cx("rounded-full px-6 py-1 transition-colors duration-75", tick % names.length === i ? "bg-chaos text-white" : "text-white/35")}
            >
              {c}
            </li>
          ))}
        </ul>
        <p key={left} className="animate-pop mt-12 text-[56px] font-semibold tabular">
          {left}
        </p>
      </div>
    </Screen>
  );
}
