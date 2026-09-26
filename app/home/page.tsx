"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronRight, Plus, ScanLine, Search, Settings, WalletCards } from "lucide-react";
import { useActivity, useBills, useUser } from "@/lib/hooks";
import { billEmoji, money } from "@/lib/format";
import { ActivityRow } from "@/components/activity";
import { JoinSheet, RequireUser } from "@/components/features";
import { AddUsdcSheet, formatUsd, useWalletUsdc } from "@/components/wallet-balance";
import { INSTALL_METAMASK_URL, isMobile, openInMetaMaskUrl } from "@/lib/chain/wallet";
import { ScanSheet } from "@/components/scanner";
import { Avatar, IconPill, Screen, Sheet } from "@/components/ui";

export default function HomePage() {
  return (
    <RequireUser>
      <Home />
    </RequireUser>
  );
}

const STATUS_LABEL = { open: "Friends joining", agreeing: "Choosing how to pay", collecting: "Paying now", paid: "Paid" };

function Home() {
  const { user } = useUser();
  const activity = useActivity();
  const live = useBills().filter((b) => b.status !== "paid");
  const [joinOpen, setJoinOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const wallet = useWalletUsdc();
  const [activityOpen, setActivityOpen] = useState(false);
  if (!user) return null;

  const balance = wallet.status === "connected" && wallet.balance !== null ? formatUsd(wallet.balance) : wallet.status === "no-wallet" ? "$0.00" : "$—";
  const muted = wallet.status !== "connected";

  async function onPlus() {
    if (wallet.status === "no-wallet") {
      window.location.href = isMobile() ? openInMetaMaskUrl() : INSTALL_METAMASK_URL;
      return;
    }
    try {
      if (wallet.status === "disconnected") await wallet.connect();
      setTopUpOpen(true);
    } catch {}
  }
  // Keep big balances on one line next to the + button.
  const balanceSize = balance.length <= 7 ? "text-[64px]" : balance.length <= 9 ? "text-[52px]" : "text-[42px]";

  return (
    <Screen>
      <header className="flex items-center justify-between pt-2">
        <Link href="/profile" aria-label="Profile" className="grid size-14 place-items-center rounded-full bg-canvas shadow-float transition active:scale-95">
          <Avatar name={user.name === "You" ? user.code : user.name} seed={user.code} size={44} dark />
        </Link>
        <IconPill
          items={[
            { label: "Wallet", href: "/wallet", icon: <WalletCards className="size-[22px]" strokeWidth={2.2} /> },
            { label: "Join a bill", onClick: () => setJoinOpen(true), icon: <Search className="size-[22px]" strokeWidth={2.4} /> },
            { label: "Settings", href: "/profile", icon: <Settings className="size-[22px]" strokeWidth={2.2} /> },
          ]}
        />
      </header>

      <section className="mt-8">
        <p className="flex items-center gap-2 text-[17px] font-medium text-muted">
          Your balance <span className="rounded-full bg-surface px-2 py-0.5 text-[12px] font-semibold tracking-wide text-ink">USDC</span>
        </p>
        <div className="mt-1 flex items-center justify-between gap-4">
          <Link href="/wallet" className={`min-w-0 truncate font-semibold leading-none tracking-[-0.045em] tabular ${balanceSize} ${muted ? "text-faint" : ""}`}>
            {balance}
          </Link>
          <button
            type="button"
            aria-label="Add money"
            onClick={onPlus}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-surface transition hover:bg-surface-2 active:scale-90"
          >
            <Plus className="size-6" strokeWidth={2.25} />
          </button>
        </div>
        {wallet.status === "disconnected" && (
          <button onClick={() => wallet.connect().catch(() => {})} className="mt-3 text-[15px] font-semibold underline underline-offset-4">
            Connect wallet to see your balance
          </button>
        )}
        {wallet.status === "no-wallet" && (
          <a href={isMobile() ? openInMetaMaskUrl() : INSTALL_METAMASK_URL} className="mt-3 inline-block text-[15px] font-semibold underline underline-offset-4">
            {isMobile() ? "Open in MetaMask to see your balance" : "Install MetaMask to see your balance"}
          </a>
        )}
      </section>

      <button
        type="button"
        onClick={() => setScanOpen(true)}
        className="mt-8 flex h-20 w-full items-center gap-4 rounded-[28px] bg-ink px-5 text-left text-white transition active:scale-[0.98]"
      >
        <span className="grid size-11 place-items-center rounded-full bg-white/15">
          <ScanLine className="size-6" strokeWidth={2.25} />
        </span>
        <span className="flex-1 text-[20px] font-semibold tracking-tight">Scan to join</span>
        <ArrowRight className="size-5 text-white/60" />
      </button>

      {live.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[20px] font-semibold tracking-tight">Right now</h2>
          <div className="flex flex-col gap-3">
            {live.map((b) => (
              <Link key={b.id} href={`/bill/${b.id}`} className="flex items-center gap-4 rounded-[28px] border-2 border-surface-2 px-5 py-4 transition active:scale-[0.99]">
                <span className="relative grid size-12 place-items-center rounded-full bg-surface text-[22px]">
                  {billEmoji(b.name)}
                  <span className="absolute right-0 top-0 size-3 rounded-full border-2 border-canvas bg-chaos" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold tracking-tight">
                    {b.name} · {money(b.total, b.currency)}
                  </span>
                  <span className="block text-[15px] text-muted">
                    {STATUS_LABEL[b.status]} · {b.participants.length} {b.participants.length === 1 ? "person" : "people"}
                  </span>
                </span>
                <ArrowRight className="size-5 text-muted" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setActivityOpen(true)}
        className="mt-6 flex h-14 w-full items-center justify-between text-left transition active:opacity-60"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-[20px] font-semibold tracking-tight">Activity</span>
          {activity.length > 0 && (
            <span className="grid h-7 min-w-7 place-items-center rounded-full bg-surface px-2 text-[14px] font-semibold tabular">{activity.length}</span>
          )}
        </span>
        <ChevronRight className="size-6 text-muted" strokeWidth={2.25} />
      </button>

      <JoinSheet open={joinOpen} onClose={() => setJoinOpen(false)} />
      <ScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onManual={() => {
          setScanOpen(false);
          setJoinOpen(true);
        }}
      />
      <AddUsdcSheet open={topUpOpen} onClose={() => setTopUpOpen(false)} account={wallet.account} balance={wallet.balance} onAdded={() => wallet.refresh().catch(() => {})} />
      <Sheet open={activityOpen} onClose={() => setActivityOpen(false)} title="Activity">
        {activity.length === 0 ? (
          <p className="flex flex-1 items-center justify-center text-[16px] text-muted">Your bills will show up here.</p>
        ) : (
          <div className="mt-2 flex flex-col">
            {activity.map((a) => (
              <ActivityRow key={a.id} item={a} flat />
            ))}
          </div>
        )}
      </Sheet>
    </Screen>
  );
}
