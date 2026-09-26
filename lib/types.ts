export type Currency = "EUR" | "USD";

export type BillMode = "split" | "chaos";

/**
 * open       → friends are joining
 * agreeing   → a mode was proposed, waiting for everyone to accept
 * collecting → amounts are assigned, waiting for payments
 * paid       → everyone paid
 */
export type BillStatus = "open" | "agreeing" | "collecting" | "paid";

export interface User {
  id: string;
  /** 4-character human identity, e.g. "B7KF". Not a credential. */
  code: string;
  name: string;
  balance: number;
  currency: Currency;
}

export interface Participant {
  id: string;
  code: string;
  name: string;
  isHost: boolean;
  /** Assigned share, null until a mode is agreed. */
  amount: number | null;
  accepted: boolean;
  paid: boolean;
}

export interface Bill {
  id: string;
  code: string;
  name: string;
  total: number;
  currency: Currency;
  mode: BillMode | null;
  status: BillStatus;
  /** True once the chaos/split reveal has been shown. */
  revealed: boolean;
  createdAt: number;
  participants: Participant[];
}

export type Activity =
  | {
      id: string;
      kind: "bill";
      billId: string;
      name: string;
      amount: number;
      currency: Currency;
      at: number;
    }
  | {
      id: string;
      kind: "topup";
      amount: number;
      currency: Currency;
      at: number;
    };

/** An activity entry before it gets an id and timestamp (keeps the payment/top-up variants distinct). */
export type NewActivity = Activity extends infer A ? (A extends Activity ? Omit<A, "id" | "at"> : never) : never;
