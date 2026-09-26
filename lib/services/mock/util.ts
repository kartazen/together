const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const newCode = () =>
  Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

export const newId = (prefix: string) =>
  `${prefix}_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const toCents = (n: number) => Math.round(n * 100);

/** Even split; leftover cents go to the first participants. */
export function splitEven(total: number, n: number): number[] {
  const cents = toCents(total);
  const base = Math.floor(cents / n);
  const rest = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
}

/**
 * Chaos split: exponential weights (a uniform Dirichlet) give satisfyingly
 * uneven shares. Shares are whole units where possible; the remainder,
 * including cents, lands on the biggest loser. Everyone pays at least ~3%.
 */
export function splitChaos(total: number, n: number): number[] {
  if (n === 1) return [total];
  const weights = Array.from({ length: n }, () => -Math.log(1 - Math.random()) + 0.06);
  const sum = weights.reduce((a, b) => a + b, 0);
  const unit = total >= n * 5 ? 100 : 1; // whole euros when the bill allows it
  const cents = toCents(total);
  const shares = weights.map((w) => Math.max(unit, Math.floor(((w / sum) * cents) / unit) * unit));
  const biggest = shares.indexOf(Math.max(...shares));
  shares[biggest] += cents - shares.reduce((a, b) => a + b, 0);
  return shares.map((c) => c / 100);
}
