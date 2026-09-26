"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, MonitorSmartphone, Plus, Wallet } from "lucide-react";
import type { TerminalSnapshot } from "@/lib/terminal";
import { TERMINAL_NAME } from "@/lib/terminal-id";
import { connectWallet, connectedAccount, createBillOnChain, hasWallet } from "@/lib/chain/wallet";
import { Button, Dots, Screen, Sheet, cx } from "@/components/ui";
import { NoWalletButton } from "@/components/wallet-gate";

const TABLES_KEY = "together.restaurant.tables";
const DEFAULT_TABLES = ["table-12", "table-7", "table-3"];
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function loadTables(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(TABLES_KEY) ?? "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return DEFAULT_TABLES;
}

/** Staff app: see every table live, open a bill on one, put a phone on the table if the terminal is down. */
export default function RestaurantPage() {
  const [tables, setTables] = useState<string[]>(DEFAULT_TABLES);
  const [account, setAccount] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = loadTables();
    connectedAccount()
      .then((a) => alive && (setAccount(a), setTables(t)))
      .catch(() => alive && setTables(t));
    return () => {
      alive = false;
    };
  }, []);

  function saveTables(next: string[]) {
    setTables(next);
    try {
      localStorage.setItem(TABLES_KEY, JSON.stringify(next));
    } catch {}
  }

  async function connect() {
    setWalletError("");
    try {
      setAccount(await connectWallet());
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : "Couldn't connect");
    }
  }

  return (
    <Screen>
      <header className="flex h-14 items-center justify-between pt-2">
        <div>
          <p className="text-[13px] font-semibold tracking-[0.18em] text-muted">RESTAURANT</p>
          <h1 className="text-[22px] font-semibold tracking-tight">together.</h1>
        </div>
        <button
          onClick={connect}
          disabled={!!account}
          className="flex h-12 items-center gap-2 rounded-full bg-canvas px-4 text-[15px] font-semibold shadow-float transition active:scale-95"
        >
          {account ? (
            <>
              <span className="size-2 rounded-full bg-positive" />
              <span className="font-mono">{short(account)}</span>
            </>
          ) : (
            <>
              <Wallet className="size-4" /> Connect
            </>
          )}
        </button>
      </header>
      {walletError && <p className="mt-3 text-[14px] text-chaos">{walletError}</p>}

      <div className="mb-3 mt-8 flex items-baseline justify-between">
        <h2 className="text-[20px] font-semibold tracking-tight">Tables</h2>
        <span className="text-[14px] text-muted">live from Monad</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tables.map((t) => (
          <TableCard key={t} name={t} onClick={() => setSelected(t)} />
        ))}
        <button
          onClick={() => setAdding(true)}
          className="flex h-36 flex-col items-center justify-center gap-2 rounded-[28px] border-2 border-dashed border-surface-2 text-muted transition active:scale-[0.97]"
        >
          <Plus className="size-6" />
          <span className="text-[15px] font-semibold">Add table</span>
        </button>
      </div>

      <TableSheet name={selected} account={account} onConnect={connect} onClose={() => setSelected(null)} />
      <AddTableSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(t) => {
          if (!tables.includes(t)) saveTables([...tables, t]);
          setAdding(false);
        }}
      />
    </Screen>
  );
}

/* ---------------- live table status ---------------- */

function useTable(name: string | null, ms = 3000) {
  const [snap, setSnap] = useState<TerminalSnapshot | null>(null);
  useEffect(() => {
    if (!name) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/terminal/${name}`, { cache: "no-store" });
        if (res.ok && alive) setSnap(await res.json());
      } catch {}
    };
    tick();
    const t = setInterval(tick, ms);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [name, ms]);
  return { snap };
}

function describe(snap: TerminalSnapshot | null) {
  const b = snap?.bill;
  if (!snap) return { label: "…", tone: "muted" as const, busy: false };
  if (!b || b.status === "refunded" || b.status === "expired") return { label: "Free", tone: "muted" as const, busy: false };
  if (b.status === "paid") return { label: `Paid ${b.display}`, tone: "positive" as const, busy: false };
  if (b.status === "collecting") return { label: `Paying ${b.paid}/${b.joined}`, tone: "live" as const, busy: true };
  if (b.status === "choosing")
    return { label: `${b.mode === "chaos" ? "Chaos" : "Split"} vote ${b.accepted}/${b.joined}`, tone: "live" as const, busy: true };
  return { label: b.joined ? `${b.joined} joined` : "Waiting to scan", tone: "live" as const, busy: true };
}

function TableCard({ name, onClick }: { name: string; onClick: () => void }) {
  const { snap } = useTable(name);
  const d = describe(snap);
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex h-36 flex-col justify-between rounded-[28px] p-5 text-left transition active:scale-[0.97]",
        d.busy ? "bg-ink text-white" : "bg-surface",
      )}
    >
      <span className={cx("text-[13px] font-semibold tracking-[0.18em]", d.busy ? "text-white/60" : "text-muted")}>TABLE</span>
      <span className="text-[40px] font-semibold leading-none tracking-[-0.04em]">{name.replace(/^table-/, "")}</span>
      <span className={cx("flex items-center gap-1.5 text-[15px] font-semibold", d.tone === "positive" && "text-positive", d.tone === "muted" && "text-muted")}>
        {d.busy && <span className="size-2 animate-pulse rounded-full bg-chaos" />}
        {d.tone === "positive" && <Check className="size-4" strokeWidth={3} />}
        {d.label}
      </span>
    </button>
  );
}

/* ---------------- table detail / new bill ---------------- */

type Phase = { kind: "form" } | { kind: "signing" } | { kind: "mining" } | { kind: "done"; billId: string | null; hash: string } | { kind: "error"; message: string };

function TableSheet({ name, account, onConnect, onClose }: { name: string | null; account: string | null; onConnect: () => void; onClose: () => void }) {
  const { snap } = useTable(name, 1500);
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const d = describe(snap);
  const title = name ? `Table ${name.replace(/^table-/, "")}` : "";

  function close() {
    setPhase({ kind: "form" });
    setAmount("");
    onClose();
  }

  async function create() {
    if (!name) return;
    setPhase({ kind: "signing" });
    try {
      const { billId, hash } = await createBillOnChain({
        terminal: name,
        amountUsd: amount,
        onSubmitted: () => setPhase({ kind: "mining" }),
      });
      setPhase({ kind: "done", billId, hash });
    } catch (e) {
      const message = e instanceof Error ? e.message.split("\n")[0] : "Something went wrong";
      setPhase({
        kind: "error",
        message: /reject|denied/i.test(message)
          ? "Cancelled in wallet"
          : /insufficient funds|gas/i.test(message)
            ? "This wallet needs testnet MON to pay the network fee"
            : message,
      });
    }
  }

  const value = Number(amount) || 0;
  const busy = phase.kind === "signing" || phase.kind === "mining";

  return (
    <Sheet open={!!name} onClose={close} title={title} subtitle={d.label}>
      {d.busy && phase.kind === "form" ? (
        <LiveBill snap={snap!} />
      ) : phase.kind === "done" ? (
        <div className="flex flex-1 flex-col items-center pt-8 text-center">
          <span className="animate-pop grid size-20 place-items-center rounded-full bg-positive text-white">
            <Check className="size-10" strokeWidth={3} />
          </span>
          <p className="mt-6 text-[24px] font-semibold tracking-tight">Bill is live</p>
          <p className="mt-1 text-[16px] text-muted">
            {phase.billId ? `Bill #${phase.billId} · ` : ""}the table screen now shows the QR
          </p>
          <a
            href={`https://testnet.monadscan.com/tx/${phase.hash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center gap-1 text-[15px] font-semibold"
          >
            View on explorer <ArrowUpRight className="size-4" />
          </a>
          <div className="mt-auto w-full pt-6">
            <Button onClick={() => setPhase({ kind: "form" })}>Done</Button>
          </div>
        </div>
      ) : (
        <>
          <label className="mt-8 flex items-start justify-center">
            <span className={cx("mt-2 text-[32px] font-semibold", value ? "text-ink" : "text-faint")}>$</span>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              disabled={busy}
              onChange={(e) => {
                const clean = e.target.value.replace(",", ".").replace(/[^0-9.]/g, "");
                const [i = "", dec] = clean.split(".");
                setAmount(dec !== undefined ? `${i.slice(0, 5)}.${dec.slice(0, 2)}` : i.slice(0, 5));
              }}
              aria-label="Bill total in dollars"
              className="min-w-0 bg-transparent text-center text-[72px] font-semibold leading-none tracking-[-0.045em] outline-none placeholder:text-faint tabular"
              style={{ width: `${Math.max(amount.length || 4, 1) * 0.6 + 0.2}em` }}
            />
          </label>

          <p className="mt-8 text-center text-[15px] text-muted">
            Guests scan, join, then choose together: <b className="text-ink">Split</b> or <b className="text-chaos">Chaos 🎲</b>
          </p>
          {phase.kind === "error" && <p className="mt-3 text-center text-[15px] text-chaos">{phase.message}</p>}

          <div className="mt-auto pt-6">
            {!hasWallet() ? (
              <NoWalletButton action="create bills" />
            ) : !account ? (
              <Button onClick={onConnect}>
                <Wallet className="size-5" /> Connect restaurant wallet
              </Button>
            ) : (
              <Button disabled={value <= 0 || busy} onClick={create}>
                {phase.kind === "signing" ? (
                  <>Confirm in wallet <Dots /></>
                ) : phase.kind === "mining" ? (
                  <>Creating on Monad <Dots /></>
                ) : (
                  "Create bill"
                )}
              </Button>
            )}
            {name && <ScreenLink name={name} />}
          </div>
        </>
      )}
    </Sheet>
  );
}

function LiveBill({ snap }: { snap: TerminalSnapshot }) {
  const b = snap.bill!;
  const step =
    b.status === "open" ? "Friends are joining" : b.status === "choosing" ? `Voting on ${b.mode === "chaos" ? "Chaos 🎲" : "Split"}` : "Friends are paying";
  const pct = b.status === "collecting" && b.joined ? (b.paid / b.joined) * 100 : 0;
  return (
    <div className="flex flex-1 flex-col pt-6">
      <p className="text-center text-[56px] font-semibold tracking-[-0.045em] tabular">{b.display}</p>
      <p className="text-center text-[16px] text-muted">
        Bill ID <b className="font-mono text-ink">{b.code}</b> · {step}
      </p>
      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          ["Joined", `${b.joined}`],
          ["Agreed", b.status === "open" ? "—" : `${b.status === "collecting" ? b.joined : b.accepted}/${b.joined}`],
          ["Paid", b.status === "collecting" ? `${b.paid}/${b.joined}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[24px] bg-surface p-4">
            <p className="text-[14px] text-muted">{k}</p>
            <p className="text-[24px] font-semibold tabular">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 h-3 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-auto pt-6">
        <ScreenLink name={snap.terminal} primary />
      </div>
    </div>
  );
}

/** Hardware down? Open the table screen on any phone or tablet. */
function ScreenLink({ name, primary }: { name: string; primary?: boolean }) {
  return (
    <Link
      href={`/screen/${name}`}
      target="_blank"
      className={cx(
        "mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[16px] font-semibold",
        primary ? "h-14 bg-ink text-white" : "text-ink",
      )}
    >
      <MonitorSmartphone className="size-5" /> Show table screen on a phone
    </Link>
  );
}

function AddTableSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string) => void }) {
  const [n, setN] = useState("");
  const name = `table-${n}`;
  return (
    <Sheet open={open} onClose={onClose} title="Add table">
      <label className="mt-10 flex flex-col items-center">
        <span className="text-[15px] font-medium text-muted">Table number</span>
        <input
          autoFocus
          inputMode="numeric"
          value={n}
          onChange={(e) => setN(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          placeholder="5"
          className="mt-2 w-40 bg-transparent text-center text-[72px] font-semibold outline-none placeholder:text-faint"
        />
        <span className="mt-2 font-mono text-[14px] text-muted">terminal id: {name}</span>
      </label>
      <div className="mt-auto pt-6">
        <Button disabled={!n || !TERMINAL_NAME.test(name)} onClick={() => (onAdd(name), setN(""))}>
          Add table
        </Button>
      </div>
    </Sheet>
  );
}
