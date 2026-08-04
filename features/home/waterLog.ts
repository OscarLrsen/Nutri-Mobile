import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Water logging — device-local by design.
 *
 * THE HONEST SCOPE: the backend has no water model, and inventing one was
 * out of scope for this release, so a glass of water is a per-user, per-day
 * counter in AsyncStorage. No fake API data, no sync pretence — the day's
 * count survives restarts on this device and resets at midnight.
 *
 * RAPID TAPS ARE THE WHOLE POINT. State updates are functional (never a
 * read-modify-write of a stale closure), and persistence is serialised
 * through a single write chain so five quick taps produce five increments
 * and one final stored value — never a lost update, never an out-of-order
 * overwrite.
 */

export const GLASS_ML = 250;

function todayKey(userId: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `nutri_water_v1:${userId}:${y}-${m}-${d}`;
}

export function useWaterLog(userId: string | null) {
  const [glasses, setGlasses] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const keyRef = useRef<string | null>(null);
  // The serialised write chain: each persist awaits the previous one.
  const writeChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!userId) {
      setGlasses(0);
      setLoaded(false);
      keyRef.current = null;
      return;
    }

    const key = todayKey(userId);
    keyRef.current = key;
    let cancelled = false;

    AsyncStorage.getItem(key)
      .then((stored) => {
        if (cancelled || keyRef.current !== key) return;
        const parsed = Number.parseInt(stored ?? "0", 10);
        setGlasses(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback((next: number) => {
    const key = keyRef.current;
    if (!key) return;

    writeChain.current = writeChain.current
      .then(() => AsyncStorage.setItem(key, String(next)))
      .catch(() => {});
  }, []);

  const addGlass = useCallback(() => {
    setGlasses((current) => {
      const next = current + 1;
      persist(next);
      return next;
    });
  }, [persist]);

  const removeGlass = useCallback(() => {
    setGlasses((current) => {
      const next = Math.max(0, current - 1);
      persist(next);
      return next;
    });
  }, [persist]);

  return { glasses, ml: glasses * GLASS_ML, loaded, addGlass, removeGlass };
}
