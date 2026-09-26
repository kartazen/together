import type { Currency } from "@/lib/types";

const SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$" };

export const symbol = (c: Currency) => SYMBOL[c];

/** €84 for whole amounts, €8.50 otherwise; `fixed` always shows cents. */
export function money(amount: number, currency: Currency, opts: { fixed?: boolean; sign?: boolean } = {}) {
  const abs = Math.abs(amount);
  const whole = Number.isInteger(Math.round(abs * 100) / 100);
  const body = abs.toLocaleString("en-US", {
    minimumFractionDigits: opts.fixed || !whole ? 2 : 0,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? "-" : opts.sign ? "+" : "";
  return `${sign}${SYMBOL[currency]}${body}`;
}

export function relativeDay(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const days = Math.round(
    (new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000,
  );
  if (days === 0) return `Today · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function billEmoji(name: string) {
  const n = name.toLowerCase();
  if (/pizza/.test(n)) return "🍕";
  if (/ramen|noodle|pho/.test(n)) return "🍜";
  if (/sushi/.test(n)) return "🍣";
  if (/burger/.test(n)) return "🍔";
  if (/drink|bar|beer|wine|cocktail/.test(n)) return "🍻";
  if (/coffee|café|cafe|brunch/.test(n)) return "☕";
  if (/taco|mex/.test(n)) return "🌮";
  if (/lunch/.test(n)) return "🥗";
  return "🍽️";
}
