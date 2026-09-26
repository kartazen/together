"use client";

import { ArrowUpRight } from "lucide-react";
import { INSTALL_METAMASK_URL, isMobile, openInMetaMaskUrl } from "@/lib/chain/wallet";

/** Shown when this browser has no wallet: jump into MetaMask's browser on phones, install it on desktop. */
export function NoWalletButton({ action = "pay" }: { action?: string }) {
  const mobile = isMobile();
  return (
    <div className="flex flex-col items-center gap-2">
      <a
        href={mobile ? openInMetaMaskUrl() : INSTALL_METAMASK_URL}
        target={mobile ? undefined : "_blank"}
        rel="noreferrer"
        className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#f6851b] px-6 text-[17px] font-semibold tracking-tight text-white transition active:scale-[0.98]"
      >
        <MetaMaskFox />
        {mobile ? `Open in MetaMask to ${action}` : "Install MetaMask"}
        {!mobile && <ArrowUpRight className="size-4" />}
      </a>
      <p className="text-center text-[13px] text-muted">
        {mobile ? "Opens this same bill inside the MetaMask app." : `You need a wallet extension to ${action}.`}
      </p>
    </div>
  );
}

function MetaMaskFox() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <path fill="#fff" d="M20.9 3 13 8.8l1.5-3.4L20.9 3ZM3.1 3l7.8 5.9-1.4-3.5L3.1 3Zm15 13.6-2.1 3.2 4.5 1.2 1.3-4.3-3.7-.1Zm-15.8.1 1.3 4.3 4.5-1.2-2.1-3.2-3.7.1Zm5.5-5.4-1.3 1.9 4.5.2-.2-4.8-3 2.7Zm7.4 0-3.1-2.8-.1 4.9 4.5-.2-1.3-1.9ZM8.5 19.8l2.7-1.3-2.3-1.8-.4 3.1Zm4.3-1.3 2.7 1.3-.4-3.1-2.3 1.8Z" />
    </svg>
  );
}
