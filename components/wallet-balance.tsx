"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "@/lib/chain/config";
import { connectWallet, connectedAccount, getTestUsdc, hasWallet, readUsdcBalance } from "@/lib/chain/wallet";
import { userService } from "@/lib/services";
import { Button, Dots, Sheet, cx } from "./ui";

export const formatUsd = (units: bigint) =>
  `$${Number(formatUnits(units, USDC_DECIMALS)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The user's real money: USDC in their wallet on Monad testnet, refreshed every few seconds. */
export function useWalletUsdc() {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [walletFound, setWalletFound] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    connectedAccount()
      .then((a) => {
        if (!alive) return;
        setWalletFound(hasWallet());
        setAccount(a);
      })
      .catch(() => alive && setWalletFound(hasWallet()));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    const tick = async () => {
      try {
        const b = await readUsdcBalance(account);
        if (alive) setBalance(b);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [account]);

  const connect = useCallback(async () => setAccount(await connectWallet()), []);
  const refresh = useCallback(async () => {
    if (account) setBalance(await readUsdcBalance(account));
  }, [account]);

  const status = walletFound === null ? "loading" : !walletFound ? "no-wallet" : account ? "connected" : "disconnected";
  return { status, account, balance, connect, refresh } as const;
}

const PRESETS = [5, 20, 50, 100];

/** Testnet top-up: mints free test USDC straight into the connected wallet. */
export function AddUsdcSheet({
  open,
  onClose,
  account,
  balance,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  account: `0x${string}` | null;
  balance: bigint | null;
  onAdded: () => void;
}) {
  return open ? <AddUsdcFlow onClose={onClose} account={account} balance={balance} onAdded={onAdded} /> : null;
}

function AddUsdcFlow({ onClose, account, balance, onAdded }: { onClose: () => void; account: `0x${string}` | null; balance: bigint | null; onAdded: () => void }) {
  const [amount, setAmount] = useState(20);
  const [phase, setPhase] = useState<"form" | "busy" | "done">("form");
  const [error, setError] = useState("");

  async function add() {
    if (!account) return;
    setPhase("busy");
    setError("");
    try {
      await getTestUsdc(account, parseUnits(String(amount), USDC_DECIMALS));
      await userService.recordActivity({ kind: "topup", amount, currency: "USD" });
      onAdded();
      setPhase("done");
    } catch (e) {
      const m = e instanceof Error ? e.message.split("\n")[0] : "Something went wrong";
      setError(/reject|denied/i.test(m) ? "Cancelled in wallet" : /insufficient funds/i.test(m) ? "This wallet needs testnet MON for the network fee" : m);
      setPhase("form");
    }
  }

  return (
    <Sheet open onClose={onClose} title="Add money" subtitle={balance !== null ? `Current balance: ${formatUsd(balance)}` : undefined}>
      {phase === "done" ? (
        <div className="flex flex-1 flex-col items-center pt-10 text-center">
          <span className="animate-pop grid size-20 place-items-center rounded-full bg-positive text-white">
            <Check className="size-10" strokeWidth={3} />
          </span>
          <p className="mt-6 text-[32px] font-semibold tracking-tight tabular">+${amount}.00</p>
          <p className="text-[16px] text-muted">Added to your balance.</p>
          <div className="mt-auto w-full pt-6">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mx-auto mt-4 rounded-full bg-surface px-4 py-2 text-[14px] font-semibold">Test USDC · free on Monad testnet</p>
          <p className="mt-12 text-center text-[88px] font-semibold leading-none tracking-[-0.045em] tabular">
            <span className="align-top text-[36px] text-muted">$</span>
            {amount}
          </p>
          <div className="mt-10 grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                disabled={phase === "busy"}
                onClick={() => setAmount(p)}
                className={cx("h-12 rounded-full text-[16px] font-semibold transition active:scale-95", amount === p ? "bg-ink text-white" : "bg-surface")}
              >
                ${p}
              </button>
            ))}
          </div>
          {error && <p className="mt-4 text-center text-[15px] text-chaos">{error}</p>}
          <div className="mt-auto pt-6">
            <Button disabled={phase === "busy" || !account} onClick={add}>
              {phase === "busy" ? <>Confirm in wallet <Dots /></> : `Add $${amount}`}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
