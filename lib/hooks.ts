"use client";

import { useCallback, useEffect, useState } from "react";
import { billService, subscribe, userService } from "@/lib/services";
import type { Activity, Bill, User } from "@/lib/types";

/** Load async data, refresh on store changes and on an interval (live state). */
function useLive<T>(load: () => Promise<T>, pollMs?: number) {
  const [data, setData] = useState<T | undefined>(undefined);

  const refresh = useCallback(() => {
    load().then(setData, () => setData(undefined));
  }, [load]);

  useEffect(() => {
    refresh();
    const unsub = subscribe(refresh);
    const t = pollMs ? setInterval(refresh, pollMs) : undefined;
    return () => {
      unsub();
      if (t) clearInterval(t);
    };
  }, [refresh, pollMs]);

  return { data, loading: data === undefined, refresh };
}

export function useUser() {
  const load = useCallback(() => userService.getCurrentUser(), []);
  const { data, loading } = useLive<User | null>(load);
  return { user: data ?? null, loading };
}

export function useBill(id: string) {
  const load = useCallback(() => billService.getBill(id), [id]);
  const { data, loading } = useLive<Bill | null>(load, 300);
  return { bill: data ?? null, loading };
}

export function useActivity() {
  const load = useCallback(() => userService.listActivity(), []);
  const { data } = useLive<Activity[]>(load);
  return data ?? [];
}

export function useBills() {
  const load = useCallback(() => billService.listBills(), []);
  const { data } = useLive<Bill[]>(load);
  return data ?? [];
}
