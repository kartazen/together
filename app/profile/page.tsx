"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronRight, Copy, LogOut } from "lucide-react";
import { userService } from "@/lib/services";
import { useUser } from "@/lib/hooks";
import { money } from "@/lib/format";
import { RequireUser } from "@/components/features";
import { Avatar, Card, Header, Screen } from "@/components/ui";

export default function ProfilePage() {
  return (
    <RequireUser>
      <Profile />
    </RequireUser>
  );
}

function Profile() {
  const router = useRouter();
  const { user } = useUser();
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState<string | null>(null);
  if (!user) return null;

  const displayName = name ?? (user.name === "You" ? "" : user.name);

  async function copy() {
    try {
      await navigator.clipboard.writeText(user!.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function signOut() {
    await userService.signOut();
    router.replace("/");
  }

  return (
    <Screen>
      <Header back="/home" title="Settings" />

      <div className="mt-6 flex flex-col items-center text-center">
        <Avatar name={user.name === "You" ? user.code : user.name} seed={user.code} size={88} dark />
        <button onClick={copy} className="mt-5 flex items-center gap-2 rounded-full bg-surface px-5 py-2.5 transition active:scale-95">
          <span className="font-mono text-[28px] font-semibold tracking-[0.15em]">{user.code}</span>
          {copied ? <Check className="size-4 text-positive" strokeWidth={3} /> : <Copy className="size-4 text-muted" />}
        </button>
      </div>

      <Card className="mt-8 divide-y divide-surface-2 px-5">
        <label className="flex h-16 items-center justify-between gap-4">
          <span className="text-[16px] text-muted">Name</span>
          <input
            value={displayName}
            placeholder="Add your name"
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== null && userService.updateName(name)}
            className="min-w-0 flex-1 bg-transparent text-right text-[17px] font-semibold outline-none placeholder:font-normal placeholder:text-faint"
          />
        </label>
        <button onClick={() => router.push("/wallet")} className="flex h-16 w-full items-center justify-between">
          <span className="text-[16px] text-muted">Balance</span>
          <span className="flex items-center gap-1 text-[17px] font-semibold tabular">
            {money(user.balance, user.currency, { fixed: true })} <ChevronRight className="size-4 text-faint" />
          </span>
        </button>
        <div className="flex h-16 items-center justify-between">
          <span className="text-[16px] text-muted">Currency</span>
          <span className="text-[17px] font-semibold">Euro</span>
        </div>
      </Card>

      <details className="group mt-4 rounded-[28px] bg-surface px-5">
        <summary className="flex h-16 cursor-pointer list-none items-center justify-between text-[16px] text-muted">
          Advanced details
          <ChevronRight className="size-4 text-faint transition group-open:rotate-90" />
        </summary>
        <dl className="space-y-3 pb-5 font-mono text-[13px]">
          <div className="flex justify-between gap-4"><dt className="text-muted">Account</dt><dd className="truncate">{user.id}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Wallet</dt><dd>Created automatically</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Network</dt><dd>Demo mode</dd></div>
        </dl>
      </details>

      <button onClick={signOut} className="mt-auto flex h-14 items-center justify-center gap-2 pt-8 text-[17px] font-semibold text-chaos">
        <LogOut className="size-5" /> Sign out
      </button>
    </Screen>
  );
}
