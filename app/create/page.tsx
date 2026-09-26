"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { billService } from "@/lib/services";
import { billEmoji } from "@/lib/format";
import { RequireUser } from "@/components/features";
import { BottomBar, Button, Header, Screen, cx } from "@/components/ui";

const NAMES = ["Dinner", "Drinks", "Lunch", "Pizza", "Coffee"];

export default function CreatePage() {
  return (
    <RequireUser>
      <Create />
    </RequireUser>
  );
}

function Create() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("Dinner");
  const [busy, setBusy] = useState(false);
  const value = Number(amount) || 0;

  function onAmount(raw: string) {
    const clean = raw.replace(",", ".").replace(/[^0-9.]/g, "");
    const [int = "", dec] = clean.split(".");
    setAmount(dec !== undefined ? `${int.slice(0, 5)}.${dec.slice(0, 2)}` : int.slice(0, 5));
  }

  async function create() {
    setBusy(true);
    const bill = await billService.createBill(Math.round(value * 100) / 100, name.trim() || "Dinner");
    router.replace(`/bill/${bill.id}`);
  }

  return (
    <Screen>
      <Header back="/home" title="New bill" />

      <label className="mt-16 flex flex-col items-center">
        <span className="text-[17px] font-medium text-muted">Total bill</span>
        <span className="mt-4 flex items-start justify-center">
          <span className={cx("mt-3 text-[36px] font-semibold", value ? "text-ink" : "text-faint")}>€</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            aria-label="Total bill"
            className="min-w-0 bg-transparent text-center text-[88px] font-semibold leading-none tracking-[-0.045em] outline-none placeholder:text-faint tabular"
            style={{ width: `${Math.max(amount.length, 1) * 0.62 + 0.2}em` }}
          />
        </span>
      </label>

      <div className="mt-16">
        <label htmlFor="bill-name" className="text-[15px] font-medium text-muted">
          Bill name
        </label>
        <div className="mt-2 flex h-16 items-center gap-3 rounded-[24px] bg-surface px-5">
          <span className="text-[24px]">{billEmoji(name)}</span>
          <input
            id="bill-name"
            value={name}
            maxLength={28}
            onChange={(e) => setName(e.target.value)}
            className="h-full flex-1 bg-transparent text-[19px] font-semibold tracking-tight outline-none"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {NAMES.map((n) => (
            <button
              key={n}
              onClick={() => setName(n)}
              className={cx("h-10 rounded-full px-4 text-[15px] font-semibold transition active:scale-95", name === n ? "bg-ink text-white" : "bg-surface")}
            >
              {billEmoji(n)} {n}
            </button>
          ))}
        </div>
      </div>

      <BottomBar>
        <Button disabled={value <= 0} loading={busy} onClick={create}>
          Continue
        </Button>
      </BottomBar>
    </Screen>
  );
}
