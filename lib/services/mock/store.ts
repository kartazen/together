import type { Activity, BillMode, Currency, User } from "@/lib/types";

/**
 * Raw persisted shape. Simulated friends act through *future timestamps*
 * (joinedAt, acceptedAt, paidAt) so the simulation survives reloads and
 * navigation — the service materializes state relative to Date.now().
 */
export interface RawParticipant {
  id: string;
  code: string;
  name: string;
  joinedAt: number;
  acceptedAt?: number;
  paidAt?: number;
  amount?: number;
}

export interface RawBill {
  id: string;
  code: string;
  name: string;
  total: number;
  currency: Currency;
  hostId: string;
  createdAt: number;
  mode?: BillMode;
  revealedAt?: number;
  participants: RawParticipant[];
}

export interface DB {
  user: User | null;
  bills: Record<string, RawBill>;
  activity: Activity[];
}

const KEY = "together.db.v1";
const listeners = new Set<() => void>();

const empty = (): DB => ({ user: null, bills: {}, activity: [] });

export function read(): DB {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

export function write(update: (db: DB) => void): DB {
  const db = read();
  update(db);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // storage unavailable — state lives for this call only
  }
  listeners.forEach((l) => l());
  return db;
}

export function clear() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

export function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}
