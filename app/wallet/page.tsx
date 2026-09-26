"use client";

import { useState } from "react";
import { useActivity, useUser } from "@/lib/hooks";
import { money, symbol } from "@/lib/format";
import { ActivityRow } from "@/components/activity";
import { RequireUser, TopUpSheet } from "@/components/features";
import { Button, Header, Screen } from "@/components/ui";

export default function WalletPage() {
  return (
    <RequireUser>
      <Wallet />
    </RequireUser>
  );
}

function Wallet() {
  const { user } = useUser();
  const activity = useActivity();
  const [topUp, setTopUp] = useState(false);
  const [note, setNote] = useState(false);
  if (!user) return null;

  return (
    <Screen>
      <Header back="/home" title="Balance" />

      <div className="relative mt-4 flex aspect-[1.6] flex-col justify-between overflow-hidden rounded-[28px] bg-gradient-to-br from-[#5b5b61] via-[#2a2a2e] to-[#111113] p-6 text-white">
        <span className="grid size-14 place-items-center rounded-full bg-black">
          <span className="grid size-8 place-items-center rounded-full bg-white text-[17px] font-bold text-black">{symbol(user.currency)}</span>
        </span>
        <div>
          <p className="text-[16px] text-white/75">together balance · {user.currency}</p>
          <p className="mt-1 text-[36px] font-semibold leading-none tracking-[-0.03em] tabular">{money(user.balance, user.currency, { fixed: true })}</p>
        </div>
        <span className="absolute right-6 top-6 font-mono text-[15px] tracking-widest text-white/60">{user.code}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button onClick={() => setTopUp(true)}>Add money</Button>
        <Button onClick={() => setNote(true)}>Withdraw</Button>
      </div>
      {note && <p className="animate-fade-up mt-3 text-center text-[15px] text-muted">Withdrawals arrive in a later version.</p>}

      <h2 className="mb-1 mt-8 text-[24px] font-semibold tracking-tight">Activity</h2>
      {activity.length === 0 ? (
        <p className="py-6 text-[16px] text-muted">Nothing yet.</p>
      ) : (
        <div className="flex flex-col">
          {activity.map((a) => (
            <ActivityRow key={a.id} item={a} flat />
          ))}
        </div>
      )}

      <TopUpSheet open={topUp} onClose={() => setTopUp(false)} />
    </Screen>
  );
}
