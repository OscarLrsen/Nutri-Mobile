import { useEffect, useSyncExternalStore } from "react";

import {
  getIntroSeenCached,
  loadIntroSeenWithTimeout,
  subscribeIntroSeen,
} from "./introStorage";

/**
 * The first-run intro flag as React state. `null` until the read (or its
 * fail-open timeout) has resolved — never guess "false" from a pending
 * read, or the intro re-runs for someone who finished it long ago.
 *
 * Subscribes to introStorage's in-memory mirror, which is exactly what
 * that mirror was added for, and kicks the shared read when nothing has
 * populated it yet. Both are idempotent, so several consumers mounting at
 * once still produce one answer that every one of them agrees on.
 */
export function useIntroSeen(): boolean | null {
  const seen = useSyncExternalStore(subscribeIntroSeen, getIntroSeenCached, getIntroSeenCached);

  useEffect(() => {
    if (getIntroSeenCached() === null) void loadIntroSeenWithTimeout();
  }, []);

  return seen;
}
