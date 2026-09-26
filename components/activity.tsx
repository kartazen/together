"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { Activity } from "@/lib/types";
import { billEmoji, money, relativeDay, symbol } from "@/lib/format";
import { cx } from "./ui";

export function ActivityRow({ item, flat }: { item: Activity; flat?: boolean }) {
  const isTopUp = item.kind === "topup";
  const body = (
    <>
      <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-canvas text-[22px]">
        {isTopUp ? (
          <>
            <span className="grid size-12 place-items-center rounded-full bg-ink text-[18px] font-semibold text-white">{symbol(item.currency)}</span>
            <span className="absolute -left-0.5 -top-0.5 grid size-5 place-items-center rounded-full border-2 border-surface bg-positive">
              <Plus className="size-3 text-white" strokeWidth={4} />
            </span>
          </>
        ) : (
          billEmoji(item.name)
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-semibold tracking-tight">{isTopUp ? "Added money" : item.name}</span>
        <span className="block text-[15px] text-muted">{relativeDay(item.at)}</span>
      </span>
      <span className={cx("text-[17px] font-semibold tabular", isTopUp && "text-positive")}>
        {money(item.amount, item.currency, { sign: true })}
      </span>
    </>
  );
  const cls = cx("flex items-center gap-4 transition", flat ? "py-3" : "rounded-[28px] bg-surface px-5 py-4 active:scale-[0.99]");
  return item.kind === "bill" ? (
    <Link href={/^\d+$/.test(item.billId) ? `/bill/${item.billId}` : `/bill/${item.billId}/success`} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
