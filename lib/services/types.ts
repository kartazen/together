import type { Activity, Bill, BillMode, User } from "@/lib/types";

export interface BillService {
  createBill(amount: number, name: string): Promise<Bill>;
  getBill(id: string): Promise<Bill | null>;
  listBills(): Promise<Bill[]>;
  /** Accepts a bill id or its 4-character code. Returns the joined bill. */
  joinBill(idOrCode: string): Promise<Bill>;
  selectMode(id: string, mode: BillMode): Promise<void>;
  markRevealed(id: string): Promise<void>;
  pay(id: string): Promise<void>;
}

export interface UserService {
  getCurrentUser(): Promise<User | null>;
  createUser(): Promise<User>;
  signIn(code: string): Promise<User>;
  signOut(): Promise<void>;
  updateName(name: string): Promise<User>;
  topUp(amount: number): Promise<User>;
  listActivity(): Promise<Activity[]>;
}

/** Fired whenever underlying data may have changed. */
export type Subscribe = (onChange: () => void) => () => void;
