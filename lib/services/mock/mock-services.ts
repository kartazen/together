import type { Activity, Bill, BillMode, NewActivity, Participant, User } from "@/lib/types";
import type { BillService, UserService } from "@/lib/services/types";
import { clear, read, write, type RawBill, type RawParticipant } from "./store";
import { newCode, newId, splitChaos, splitEven, wait } from "./util";

const FRIENDS = ["Alice", "David", "Charlie", "Maya", "Leo", "Sofia", "Noah", "Iris"];
const LATENCY = 250;

function pickFriends(n: number): string[] {
  return [...FRIENDS].sort(() => Math.random() - 0.5).slice(0, n);
}

function friend(name: string, joinedAt: number): RawParticipant {
  return { id: newId("usr"), code: newCode(), name, joinedAt };
}

function requireUser(): User {
  const { user } = read();
  if (!user) throw new Error("Not signed in");
  return user;
}

/** Turn raw timestamped records into the product-domain Bill as of `now`. */
function materialize(raw: RawBill, userId: string | undefined, now = Date.now()): Bill {
  const participants: Participant[] = raw.participants
    .filter((p) => p.joinedAt <= now)
    .map((p) => ({
      id: p.id,
      code: p.code,
      name: p.id === userId ? "You" : p.name,
      isHost: p.id === raw.hostId,
      amount: raw.mode && p.amount != null ? p.amount : null,
      accepted: p.acceptedAt != null && p.acceptedAt <= now,
      paid: p.paidAt != null && p.paidAt <= now,
    }));

  let status: Bill["status"] = "open";
  if (raw.mode) {
    if (!participants.every((p) => p.accepted)) status = "agreeing";
    else if (!participants.every((p) => p.paid)) status = "collecting";
    else status = "paid";
  }

  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    total: raw.total,
    currency: raw.currency,
    mode: raw.mode ?? null,
    status,
    revealed: raw.revealedAt != null,
    createdAt: raw.createdAt,
    participants,
  };
}

function newBill(host: RawParticipant, name: string, total: number, others: RawParticipant[]): RawBill {
  return {
    id: newId("bill"),
    code: newCode(),
    name,
    total,
    currency: "EUR",
    hostId: host.id,
    createdAt: Date.now(),
    participants: [host, ...others],
  };
}

function seedDemo(user: User): RawBill {
  const now = Date.now();
  const bill = newBill(
    { id: user.id, code: user.code, name: user.name, joinedAt: now },
    "Dinner",
    84,
    ["Alice", "David", "Charlie"].map((n, i) => friend(n, now + 900 + i * 1300)),
  );
  return { ...bill, id: "demo", code: "K4MX" };
}

export class MockBillService implements BillService {
  async createBill(amount: number, name: string): Promise<Bill> {
    const user = requireUser();
    await wait(LATENCY);
    const now = Date.now();
    const friends = pickFriends(3).map((n, i) => friend(n, now + 1200 + i * 1400 + Math.random() * 600));
    const raw = newBill({ id: user.id, code: user.code, name: user.name, joinedAt: now }, name, amount, friends);
    write((db) => void (db.bills[raw.id] = raw));
    return materialize(raw, user.id);
  }

  async getBill(id: string): Promise<Bill | null> {
    const db = read();
    let raw = db.bills[id];
    if (!raw && id === "demo" && db.user) {
      raw = seedDemo(db.user);
      write((d) => void (d.bills.demo = raw));
    }
    return raw ? materialize(raw, db.user?.id) : null;
  }

  async listBills(): Promise<Bill[]> {
    const db = read();
    return Object.values(db.bills)
      .map((b) => materialize(b, db.user?.id))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async joinBill(idOrCode: string): Promise<Bill> {
    const user = requireUser();
    await wait(LATENCY * 2);
    const key = idOrCode.trim();
    const db = read();
    const existing =
      db.bills[key] ?? Object.values(db.bills).find((b) => b.code.toUpperCase() === key.toUpperCase());

    if (existing) {
      if (!existing.participants.some((p) => p.id === user.id)) {
        if (existing.mode) throw new Error("This bill is already being paid");
        write((d) => {
          d.bills[existing.id].participants.push({ id: user.id, code: user.code, name: user.name, joinedAt: Date.now() });
        });
      }
      return materialize(read().bills[existing.id], user.id);
    }

    // Unknown code: pretend a friend's bill exists on the network.
    const now = Date.now() - 1;
    const [hostName, ...rest] = pickFriends(3);
    const host = friend(hostName, now);
    const raw: RawBill = {
      ...newBill(host, ["Dinner", "Drinks", "Lunch", "Pizza"][Math.floor(Math.random() * 4)], 30 + Math.round(Math.random() * 90), [
        friend(rest[0], now),
        { id: user.id, code: user.code, name: user.name, joinedAt: now },
        friend(rest[1], now + 1500),
      ]),
      code: key.toUpperCase().slice(0, 4),
    };
    write((d) => void (d.bills[raw.id] = raw));
    return materialize(raw, user.id);
  }

  async selectMode(id: string, mode: BillMode): Promise<void> {
    const user = requireUser();
    await wait(LATENCY);
    write((db) => {
      const bill = db.bills[id];
      if (!bill || bill.mode) return;
      const now = Date.now();
      // Lock the table: anyone not yet joined misses out.
      bill.participants = bill.participants.filter((p) => p.joinedAt <= now);
      const n = bill.participants.length;
      const shares = mode === "split" ? splitEven(bill.total, n) : splitChaos(bill.total, n);
      bill.mode = mode;
      let delay = 700;
      bill.participants.forEach((p, i) => {
        p.amount = shares[i];
        if (p.id === user.id) p.acceptedAt = now;
        else p.acceptedAt = now + (delay += 500 + Math.random() * 700);
      });
    });
  }

  async markRevealed(id: string): Promise<void> {
    write((db) => {
      const bill = db.bills[id];
      if (bill && !bill.revealedAt) bill.revealedAt = Date.now();
    });
  }

  async pay(id: string): Promise<void> {
    const user = requireUser();
    const bill = read().bills[id];
    const me = bill?.participants.find((p) => p.id === user.id);
    if (!bill || !me || me.amount == null) throw new Error("Nothing to pay");
    if (me.paidAt) return;
    if (user.balance < me.amount) throw new Error("Not enough balance");

    await wait(900);
    write((db) => {
      const b = db.bills[id];
      const now = Date.now();
      b.participants.find((p) => p.id === user.id)!.paidAt = now;
      // Friends pay in order of the size of their share — the unlucky one last.
      let delay = 900;
      [...b.participants]
        .filter((p) => !p.paidAt)
        .sort((a, c) => (a.amount ?? 0) - (c.amount ?? 0))
        .forEach((p, i, arr) => {
          delay += i === arr.length - 1 ? 2800 + Math.random() * 1500 : 700 + Math.random() * 900;
          p.paidAt = now + delay;
        });
      db.user!.balance = Math.round((db.user!.balance - me.amount!) * 100) / 100;
      db.activity.unshift({
        id: newId("act"),
        kind: "bill",
        billId: id,
        name: b.name,
        amount: -me.amount!,
        currency: b.currency,
        at: now,
      });
    });
  }
}

export class MockUserService implements UserService {
  async getCurrentUser() {
    return read().user;
  }

  async createUser(): Promise<User> {
    await wait(700);
    const user: User = { id: newId("usr"), code: newCode(), name: "You", balance: 0, currency: "USD" };
    write((db) => {
      db.user = user;
      db.activity = [];
    });
    return user;
  }

  async signIn(code: string): Promise<User> {
    await wait(600);
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(normalized)) throw new Error("IDs are 4 characters");
    const current = read().user;
    if (current?.code === normalized) return current;
    // Mock: any well-formed ID signs in to a fresh account with that ID.
    const user: User = { id: newId("usr"), code: normalized, name: "You", balance: 0, currency: "USD" };
    write((db) => {
      db.user = user;
      db.bills = {};
      db.activity = [];
    });
    return user;
  }

  async signOut() {
    clear();
  }

  async updateName(name: string): Promise<User> {
    return write((db) => void (db.user!.name = name.trim() || "You")).user!;
  }

  async topUp(amount: number): Promise<User> {
    await wait(1200);
    return write((db) => {
      db.user!.balance = Math.round((db.user!.balance + amount) * 100) / 100;
      db.activity.unshift({ id: newId("act"), kind: "topup", amount, currency: db.user!.currency, at: Date.now() });
    }).user!;
  }

  async listActivity(): Promise<Activity[]> {
    return read().activity;
  }

  async recordActivity(entry: NewActivity): Promise<void> {
    write((db) => void db.activity.unshift({ ...entry, id: newId("act"), at: Date.now() } as Activity));
  }
}
