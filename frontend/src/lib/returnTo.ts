/**
 * Interrupted-route memory for the login door (BRIEF_M5 D1: "clean re-login
 * return to the interrupted route").
 *
 * When a screen needs a session mid-flow it stores the route here; after a
 * successful re-login the login door returns the user to it. The store is
 * sessionStorage-scoped (per tab) and keeps the RAW href, so full-page
 * re-entry re-resolves through lib/route.ts (single source of truth, M3-7).
 */

const RETURN_TO_KEY = 'ndli.auth.returnTo';

/**
 * Open-redirect guard: local absolute paths only ("/x"), never "//host",
 * never backslashes, never absolute URLs.
 */
export function isSafeLocalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
}

/** Remember the route a login interrupted. Unsafe paths are dropped. */
export function rememberInterruptedRoute(href: string): void {
  if (typeof window === 'undefined') return;
  if (!isSafeLocalPath(href)) return;
  try {
    window.sessionStorage.setItem(RETURN_TO_KEY, href);
  } catch {
    // Storage unavailable — re-login falls back to the home route (P5: the
    // only auto-repair is user-visible; nothing is invented here).
  }
}

/** Read the remembered route without clearing it. */
export function peekInterruptedRoute(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(RETURN_TO_KEY);
  } catch {
    return null;
  }
}

/** Read and clear the remembered route (one-shot, used right before returning). */
export function consumeInterruptedRoute(): string | null {
  const href = peekInterruptedRoute();
  if (href !== null && typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(RETURN_TO_KEY);
    } catch {
      // Ignore: a stale value only means one extra harmless return later.
    }
  }
  return href;
}
