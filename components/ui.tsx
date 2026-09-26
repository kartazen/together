"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, X } from "lucide-react";
import { useEffect, type ComponentProps, type ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------------- layout ---------------- */

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cx("flex flex-1 flex-col px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]", className)}>
      {children}
    </main>
  );
}

/** Pinned bottom action area — one strong action per screen. */
export function BottomBar({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 -mx-5 mt-auto bg-gradient-to-t from-canvas from-70% to-transparent px-5 pb-1 pt-6">{children}</div>;
}

export function Header({ title, back, right }: { title?: ReactNode; back?: string | true; right?: ReactNode }) {
  return (
    <header className="relative flex h-14 items-center justify-between">
      {back ? <BackButton href={back === true ? undefined : back} /> : <span className="size-12" />}
      {title && <h1 className="absolute left-1/2 -translate-x-1/2 truncate text-[17px] font-semibold tracking-tight">{title}</h1>}
      {right ?? <span className="size-12" />}
    </header>
  );
}

export function BackButton({ href }: { href?: string }) {
  const router = useRouter();
  return (
    <IconButton label="Back" onClick={() => (href ? router.push(href) : router.back())}>
      <ChevronLeft className="size-6" strokeWidth={2.25} />
    </IconButton>
  );
}

/* ---------------- controls ---------------- */

export function IconButton({ label, className, children, ...rest }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(
        "grid size-12 shrink-0 place-items-center rounded-full bg-canvas text-ink shadow-float transition active:scale-95",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** MoonPay-style floating pill of icon actions (wallet · search · settings). */
export function IconPill({ items }: { items: { label: string; icon: ReactNode; href?: string; onClick?: () => void }[] }) {
  return (
    <nav className="flex h-14 items-center gap-1 rounded-full bg-canvas px-2 shadow-float">
      {items.map((it) => {
        const cls = "grid size-11 place-items-center rounded-full text-ink transition hover:bg-surface active:scale-90";
        return it.href ? (
          <Link key={it.label} href={it.href} aria-label={it.label} className={cls}>
            {it.icon}
          </Link>
        ) : (
          <button key={it.label} type="button" aria-label={it.label} onClick={it.onClick} className={cls}>
            {it.icon}
          </button>
        );
      })}
    </nav>
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "chaos";
  loading?: boolean;
};

export function Button({ variant = "primary", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "relative flex h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-[17px] font-semibold tracking-tight transition active:scale-[0.98] disabled:active:scale-100",
        variant === "primary" && "bg-ink text-white disabled:bg-surface-2 disabled:text-muted",
        variant === "chaos" && "bg-chaos text-white disabled:opacity-50",
        variant === "secondary" && "bg-surface text-ink disabled:text-muted",
        variant === "ghost" && "h-12 text-ink disabled:text-muted",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-5 animate-spin" /> : children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", className, children }: { href: string; variant?: "primary" | "secondary"; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        "flex h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-[17px] font-semibold tracking-tight transition active:scale-[0.98]",
        variant === "primary" ? "bg-ink text-white" : "bg-surface text-ink",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ---------------- surfaces ---------------- */

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-[28px] bg-surface", className)} {...rest}>
      {children}
    </div>
  );
}

const AVATAR_COLORS = ["#FFB199", "#A7D8FF", "#C8F0A8", "#FFE08A", "#D9C2FF", "#FFC4E1", "#9EE6D9", "#FFD0A6"];

export function Avatar({ name, seed, size = 40, dark }: { name: string; seed: string; size?: number; dark?: boolean }) {
  const hash = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-ink"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: dark ? "var(--color-ink)" : AVATAR_COLORS[hash % AVATAR_COLORS.length],
        color: dark ? "white" : undefined,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Dots({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex gap-1", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 rounded-full bg-current" style={{ animation: `dot 1.2s ${i * 0.15}s infinite ease-in-out` }} />
      ))}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="grid flex-1 place-items-center">
      <Loader2 className="size-6 animate-spin text-faint" />
    </div>
  );
}

/* ---------------- sheet ---------------- */

export function Sheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center" role="dialog" aria-modal aria-label={title}>
      <button aria-label="Close" className="animate-fade-in absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="animate-sheet-up relative mt-auto flex max-h-[92dvh] min-h-[70dvh] w-full max-w-[440px] flex-col rounded-t-[36px] bg-canvas px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-6">
        <div className="relative mb-2 flex min-h-12 flex-col items-center justify-center px-14 text-center">
          <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[15px] text-muted">{subtitle}</p>}
          <IconButton label="Close" onClick={onClose} className="absolute right-0 top-0">
            <X className="size-5" strokeWidth={2.5} />
          </IconButton>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
