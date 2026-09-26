/**
 * The single swap point. Pages only ever talk to `billService` / `userService`.
 * Later: export a MonadBillService (viem → GroupCheckout.sol) here instead.
 */
import { MockBillService, MockUserService } from "./mock/mock-services";
import { subscribe as mockSubscribe } from "./mock/store";
import type { BillService, Subscribe, UserService } from "./types";

export const billService: BillService = new MockBillService();
export const userService: UserService = new MockUserService();
export const subscribe: Subscribe = mockSubscribe;

export type { BillService, UserService } from "./types";
