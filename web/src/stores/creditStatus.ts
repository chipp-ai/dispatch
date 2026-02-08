/**
 * Credit Status Store
 *
 * Polls /api/billing/credits for current credit status.
 * Manages warning banner state with session-based dismissal.
 */

import { writable, derived } from "svelte/store";

interface CreditStatusState {
  creditBalanceCents: number;
  isExhausted: boolean;
  isLow: boolean;
  showWarning: boolean;
  warningSeverity: "none" | "low" | "exhausted";
  creditBalanceFormatted: string;
  hasDefaultPaymentMethod: boolean;
  isLoading: boolean;
  isDismissed: boolean;
  lastFetchedAt: number | null;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DISMISS_KEY = "chipp_credit_warning_dismissed";

const defaultState: CreditStatusState = {
  creditBalanceCents: -1,
  isExhausted: false,
  isLow: false,
  showWarning: false,
  warningSeverity: "none",
  creditBalanceFormatted: "Unknown",
  hasDefaultPaymentMethod: false,
  isLoading: true,
  isDismissed: false,
  lastFetchedAt: null,
};

export const creditStatusStore = writable<CreditStatusState>(defaultState);

// Derived stores for components
export const creditStatus = derived(creditStatusStore, ($s) => $s);

export const shouldShowWarning = derived(
  creditStatusStore,
  ($s) => $s.showWarning && !$s.isDismissed && !$s.isLoading
);

export const creditSeverity = derived(
  creditStatusStore,
  ($s) => $s.warningSeverity
);

let pollTimer: ReturnType<typeof setInterval> | null = null;

export async function fetchCreditStatus(): Promise<void> {
  // Check sessionStorage for dismissal
  try {
    const dismissed = sessionStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      creditStatusStore.update((s) => ({ ...s, isDismissed: true }));
    }
  } catch {
    // sessionStorage may not be available
  }

  try {
    // Support test mode via hash params (e.g. #/settings/billing/plan?_test=exhausted)
    let url = "/api/billing/credits";
    try {
      const hashQuery = window.location.hash.split("?")[1];
      if (hashQuery) {
        const params = new URLSearchParams(hashQuery);
        const testMode = params.get("_test");
        if (testMode) url += `?_test=${testMode}`;
      }
    } catch { /* ignore */ }

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch credit status");
    const json = await res.json();
    const data = json.data;

    creditStatusStore.update((s) => ({
      ...s,
      creditBalanceCents: data.creditBalanceCents ?? -1,
      isExhausted: data.isExhausted ?? false,
      isLow: data.isLow ?? false,
      showWarning: data.showWarning ?? false,
      warningSeverity: data.warningSeverity ?? "none",
      creditBalanceFormatted: data.creditBalanceFormatted ?? "Unknown",
      hasDefaultPaymentMethod: data.hasDefaultPaymentMethod ?? false,
      isLoading: false,
      lastFetchedAt: Date.now(),
    }));
  } catch {
    creditStatusStore.update((s) => ({ ...s, isLoading: false }));
  }
}

export function dismissCreditWarning(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, "true");
  } catch {
    // sessionStorage may not be available
  }
  creditStatusStore.update((s) => ({ ...s, isDismissed: true }));
}

export function startCreditStatusPolling(): void {
  fetchCreditStatus();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchCreditStatus, POLL_INTERVAL_MS);
}

export function stopCreditStatusPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
